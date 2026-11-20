// Bazi Quest — tiny local server.
//  * Serves the pixel UI from ./public and the shared modules from ./lib
//  * GET  /api/profile  → anonymized profile built from data/bazi.json (raw file never leaves the server)
//  * POST /api/chat     → streams Claude's project ideas as plain text
//
// Run:  npm install && npm start   (set ANTHROPIC_API_KEY, or log in with `ant auth login`)

import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { anonymizeBazi, sanitizeSkills } from "./public/lib/anonymize.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const MODEL = "claude-opus-5-5";

let client = null;
try { client = new Anthropic(); } catch { client = null; }
// Flipped to true the first time the API says we have no usable credentials → browser uses the offline Oracle.
let credsMissing = !client;

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

const SYSTEM_PROMPT = `You are "Oracle Owl", a wise, playful NPC in a cozy pixel-art RPG. You help one adventurer (a developer doing #100DaysOfCode) find genuinely cool things to build.

You receive an ANONYMIZED bazi (Chinese Four Pillars) profile — only the day-master element, five-element balance and derived traits — plus their self-rated skills (0-10). Use the bazi traits as creative inspiration and flavor, not as scientific fact: let the element balance shape the *kind* of project (e.g. Fire → visual/social, Water → adaptive/AI/research, Metal → precise tools, Earth → reliable utilities, Wood → things that grow), and suggest one "balancing" idea that leans on their weakest or favorable element.

Match ideas to their real skill levels: mostly buildable with their strongest skills, each stretching exactly one weaker skill. Prefer original, delightful, specific ideas over generic to-do apps.

Format every idea exactly like this so the game can turn it into a quest card:

### QUEST: <catchy title>
**Element:** <Wood|Fire|Earth|Metal|Water> · **Difficulty:** <★☆☆|★★☆|★★★>
**Why it fits you:** <1-2 sentences tying element + skills together>
**Build it with:** <stack, using their skills>
**Day-1 step:** <a concrete first hour of work>

Give 3 quests unless asked otherwise. Keep any intro/outro to one short in-character line. Never ask for or speculate about the person's name, birth date, birthplace or other personal details.`;

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req, limit = 200_000) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (data.length > limit) throw new Error("Body too large");
  }
  return data ? JSON.parse(data) : {};
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const base = path.join(ROOT, "public");
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base)) return send(res, 403, { error: "Forbidden" });
  try {
    const buf = await readFile(file);
    send(res, 200, buf, MIME[path.extname(file)] ?? "application/octet-stream");
  } catch {
    send(res, 404, { error: "Not found" });
  }
}

async function handleProfile(res) {
  const own = path.join(ROOT, "data", "bazi.json");
  const file = existsSync(own) ? own : path.join(ROOT, "data", "bazi.example.json");
  const raw = JSON.parse(await readFile(file, "utf8"));
  const skills = JSON.parse(await readFile(path.join(ROOT, "data", "skills.json"), "utf8"));
  // Only the anonymized result is ever sent to the browser.
  send(res, 200, {
    source: file === own ? "your data/bazi.json" : "sample profile (add data/bazi.json)",
    // Pillar characters stay on this machine; the browser's privacy toggle decides what reaches Claude.
    profile: anonymizeBazi(raw, { privacy: "pillars" }),
    skills: sanitizeSkills(skills),
    online: !credsMissing,
  });
}

async function handleChat(req, res) {
  if (credsMissing) return send(res, 503, { offline: true, error: "No Anthropic credentials configured" });
  const body = await readBody(req);
  // Defense in depth: re-anonymize whatever the browser sent (whitelist rebuild).
  const profile = anonymizeBazi(body.profile, { privacy: body.privacy === "pillars" ? "pillars" : "elements" });
  const skills = sanitizeSkills(body.skills);
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!history.length || history[0].role !== "user") return send(res, 400, { error: "Conversation must start with a user message" });

  const context = `ADVENTURER PROFILE (anonymized):\n${JSON.stringify(profile, null, 2)}\n\nSKILLS (0-10):\n${skills.map((s) => `- ${s.name} [${s.category}]: ${s.level}`).join("\n")}`;

  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: "medium" },
      // If a safety classifier declines, the API retries on a fallback model instead of failing.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM_PROMPT }, { type: "text", text: context }],
      messages: history,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") res.write("\n\n*(The Oracle can't answer that one — try asking differently.)*");
    if (final.stop_reason === "max_tokens") res.write("\n\n*(…the scroll ran out of space.)*");
  } catch (err) {
    let msg = "The Oracle's crystal ball flickered. Try again.";
    if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err?.message ?? "")) {
      credsMissing = true;
      console.warn("No usable Anthropic credentials — switching the browser to the offline Oracle.");
      return res.end("[[OFFLINE]]");
    }
    else if (err instanceof Anthropic.RateLimitError) msg = "Too many spells at once (rate limited). Wait a moment and retry.";
    else if (err instanceof Anthropic.APIConnectionError) msg = "Couldn't reach the Claude API (network).";
    else if (err instanceof Anthropic.APIError) msg = `Claude API error ${err.status ?? ""}: ${err.message}`;
    console.error(err);
    res.write(`\n\n[[ERROR]] ${msg}`);
  }
  res.end();
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/api/profile") return await handleProfile(res);
    if (req.method === "POST" && req.url === "/api/chat") return await handleChat(req, res);
    if (req.method === "GET") return await serveStatic(req, res);
    send(res, 405, { error: "Method not allowed" });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) send(res, 500, { error: err.message });
  }
}).listen(PORT, () => {
  console.log(`\n  ⚔  Bazi Quest running at http://localhost:${PORT}`);
  console.log(`  🦉 Oracle model: ${MODEL} (falls back to the offline Oracle if no API key is configured)`);
});

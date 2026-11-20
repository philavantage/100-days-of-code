import { anonymizeBazi, sanitizeSkills, ELEMENTS } from "./lib/anonymize.js";
import { offlineIdeas } from "./lib/ideas-offline.js";
import { Scene, paintPortrait, EL_COLORS } from "./sprites.js";

// ---------- tiny storage helpers (never required to work) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem("bq:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("bq:" + k, JSON.stringify(v)); } catch { /* private mode etc. */ } },
  del(k) { try { localStorage.removeItem("bq:" + k); } catch { /* ignore */ } },
};

// Fallbacks for static hosting (no server): sample chart + starter skills
const SAMPLE_RAW = { pillars: { year: "庚午", month: "辛巳", day: "甲子", hour: "辛未" }, strength: "weak", favorable: ["Water", "Wood"] };
const SAMPLE_SKILLS = [
  { name: "HTML", level: 5, category: "Frontend" }, { name: "CSS", level: 4, category: "Frontend" },
  { name: "JavaScript", level: 3, category: "Frontend" }, { name: "Problem Solving", level: 4, category: "Core" },
  { name: "Git & GitHub", level: 2, category: "Tools" }, { name: "UI Design", level: 3, category: "Design" },
  { name: "APIs", level: 1, category: "Backend" },
];
const CAT_COLORS = { Frontend: "#f0652c", Backend: "#3f8cf0", Design: "#d65cb0", Tools: "#7a7f8f", Data: "#2fa38a", Core: "#c99a3d", Other: "#8a5cd6" };

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const state = {
  profile: null,
  serverProfile: null,
  source: "",
  online: false,
  privacy: store.get("privacy", "elements"),
  rawImported: store.get("importedProfile", null), // stored ALREADY anonymized
  skills: store.get("skills", null),
  quests: store.get("quests", []),
  chat: store.get("chat", []),
  busy: false,
  lastLevel: null,
};

const scene = new Scene($("scene"), () => { $("input").focus(); if (!state.chat.length) ask("Give me 3 quests that fit my elements and skills."); });
scene.onFrame = (a) => {
  const box = $("scene-box");
  const place = (el, p) => { el.style.left = `${p.x * 100}%`; el.style.top = `${p.y * 100}%`; };
  place($("tag-hero"), a.hero); place($("tag-owl"), a.owl);
  box.dataset.ready = "1";
};

// ---------- derived RPG numbers ----------
function stats() {
  const p = state.profile, sk = state.skills ?? [];
  const skillExp = sk.reduce((s, x) => s + x.level * 100, 0);
  const questExp = state.quests.filter((q) => q.done).length * 250;
  const exp = skillExp + questExp;
  const perLevel = 400;
  const level = 1 + Math.floor(exp / perLevel);
  const b = p.elementBalance;
  return {
    level, exp, expInLevel: exp % perLevel, perLevel,
    hp: 120 + level * 18 + b.Earth * 3 + b.Wood * 2,
    mp: 60 + level * 12 + b.Water * 3 + b.Fire * 2,
    sp: sk.reduce((s, x) => s + x.level, 0),
  };
}

// ---------- rendering ----------
function renderCharacter() {
  const p = state.profile, st = stats();
  const el = p.dayMaster.element;
  $("char-name").textContent = p.alias;
  $("char-class").textContent = `${p.dayMaster.polarity} ${el} · ${p.archetype}`;
  $("char-src").textContent = state.source;
  $("char-chips").innerHTML = [
    `<span class="chip">Strongest: ${p.dominant}</span>`,
    `<span class="chip">Weakest: ${p.weakest}</span>`,
    p.strength ? `<span class="chip">Day master: ${p.strength}</span>` : "",
    ...(p.favorable ?? []).map((f) => `<span class="chip" style="background:${EL_COLORS[f]};color:#fff;text-shadow:1px 1px 0 #000">♥ ${f}</span>`),
  ].join("");
  paintPortrait($("portrait"), "hero", el);

  const bar = (label, val, max, color, txt) => `
    <span class="stat-label">${label}</span>
    <div class="bar"><i style="width:${Math.min(100, (val / max) * 100)}%;background:${color}"></i></div>
    <span class="stat-val">${txt}</span>`;
  $("vitals").innerHTML =
    bar("LV", st.level, Math.max(10, st.level + 1), "linear-gradient(90deg,#ffb02e,#ffe14a)", `${st.level}`) +
    bar("HP", st.hp, st.hp, "var(--hp)", `${st.hp}`) +
    bar("MP", st.mp, st.mp, "var(--mp)", `${st.mp}`) +
    bar("EXP", st.expInLevel, st.perLevel, "var(--exp)", `${Math.round((st.expInLevel / st.perLevel) * 100)}%`);
  $("elements").innerHTML = ELEMENTS.map((e) =>
    bar(e.toUpperCase(), p.elementBalance[e], 50, EL_COLORS[e], `${p.elementBalance[e]}%${e === el ? " ★" : ""}`)).join("");
  $("lore").innerHTML = `<b>Class lore:</b> ${esc(p.archetype)}s thrive on ${esc(p.archetypeVibe)}.` +
    (p.missing.length ? ` Missing element${p.missing.length > 1 ? "s" : ""}: <b>${p.missing.join(", ")}</b> — quests in ${p.missing.length > 1 ? "those realms" : "that realm"} grant bonus wisdom.` : "");

  // HUD
  $("hud-lv").textContent = `LV.${st.level}`;
  $("hud-name").textContent = p.alias;
  $("hud-hp").style.width = "100%"; $("hud-hp-t").textContent = `HP ${st.hp}/${st.hp}`;
  $("hud-mp").style.width = "100%"; $("hud-mp-t").textContent = `MP ${st.mp}/${st.mp}`;
  $("hud-exp").style.width = `${(st.expInLevel / st.perLevel) * 100}%`;
  $("hud-exp-t").textContent = `EXP ${st.expInLevel}/${st.perLevel}`;
  $("tag-hero").textContent = p.alias;
  $("sp").textContent = `SP ${st.sp}`;

  if (state.lastLevel != null && st.level > state.lastLevel) levelUp();
  state.lastLevel = st.level;
  scene.setProfile(p);
}

function renderSkills() {
  $("skill-list").innerHTML = state.skills.map((s, i) => `
    <div class="skill">
      <div class="sk-icon" style="background:${CAT_COLORS[s.category] ?? CAT_COLORS.Other}">${esc(s.name.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "?")}</div>
      <div>
        <div class="sk-name">${esc(s.name)}<small>${esc(s.category)}</small></div>
        <div class="pips">${Array.from({ length: 10 }, (_, k) => `<span class="${k < s.level ? "on" : ""}"></span>`).join("")}</div>
      </div>
      <div class="sk-ctrl">
        <button class="icon-btn" data-sk="${i}" data-d="-1" aria-label="Lower ${esc(s.name)}">−</button>
        <span class="lv">${s.level}/10</span>
        <button class="icon-btn" data-sk="${i}" data-d="1" aria-label="Raise ${esc(s.name)}">+</button>
        <button class="icon-btn" data-del="${i}" aria-label="Forget ${esc(s.name)}" title="Forget skill">×</button>
      </div>
    </div>`).join("") || `<div class="empty">No skills yet — learn one below!</div>`;
}

function renderQuests() {
  const done = state.quests.filter((q) => q.done).length;
  $("quest-count").textContent = `${done} / ${state.quests.length}`;
  $("quest-list").innerHTML = state.quests.map((q, i) => `
    <div class="quest ${q.done ? "done" : ""}">
      <span class="el-dot" style="background:${EL_COLORS[q.element] ?? "#999"}"></span>
      <div><div class="q-title">${esc(q.title)}</div><div class="q-meta">${esc(q.element)} · ${esc(q.difficulty)}${q.done ? " · COMPLETE +250 EXP" : ""}</div></div>
      <div>
        ${q.done ? "" : `<button class="btn sm" data-done="${i}">DONE</button>`}
        <button class="icon-btn" data-qdel="${i}" aria-label="Abandon quest">×</button>
      </div>
    </div>`).join("") || `<div class="empty">No quests yet. Talk to the Oracle Owl and accept one!</div>`;
}

// Minimal, safe markdown → HTML (escape first, then format)
function md(text) {
  const lines = esc(text).split("\n");
  let html = "", inList = false;
  for (let line of lines) {
    line = line
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<i>$2</i>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${line.replace(/^\s*[-*]\s+/, "")}</li>`; continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    if (/^#{1,4}\s/.test(line)) html += `<p><b>${line.replace(/^#+\s*/, "")}</b></p>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  return html + (inList ? "</ul>" : "");
}

// Split an Oracle reply into intro text + quest cards
function parseQuests(text) {
  const parts = text.split(/^###\s*QUEST:\s*/m);
  const intro = parts.shift();
  const quests = parts.map((p) => {
    const [titleLine, ...rest] = p.split("\n");
    let body = rest.join("\n").trim();
    // trailing outro after the last quest stays outside the card
    let outro = "";
    const blank = body.search(/\n\s*\n(?!\*\*)/);
    if (blank > -1) { outro = body.slice(blank).trim(); body = body.slice(0, blank).trim(); }
    const element = (body.match(/\*\*Element:\*\*\s*(Wood|Fire|Earth|Metal|Water)/i)?.[1] ?? "Wood").replace(/^./, (c) => c.toUpperCase());
    const difficulty = body.match(/Difficulty:\*\*\s*([★☆]+)/)?.[1] ?? "★★☆";
    return { title: titleLine.replace(/\*+/g, "").trim(), element, difficulty, body, outro };
  });
  return { intro, quests };
}

function renderMessage(m, idx, streaming = false) {
  const isUser = m.role === "user";
  let content;
  if (isUser) content = md(m.content);
  else if (m.error) content = `<p class="err">${esc(m.content)}</p>`;
  else if (streaming) content = md(m.content);
  else {
    const { intro, quests } = parseQuests(m.content);
    content = md(intro) + quests.map((q, qi) => {
      const accepted = state.quests.some((x) => x.title === q.title);
      return `
      <div class="quest-card">
        <header style="background:${EL_COLORS[q.element]}"><span>📜 ${esc(q.title)}</span><span>${esc(q.difficulty)}</span></header>
        <div class="qbody">${md(q.body)}</div>
        <footer><button class="btn sm" data-accept="${idx}:${qi}" ${accepted ? "disabled" : ""}>${accepted ? "ACCEPTED ✓" : "ACCEPT QUEST"}</button></footer>
      </div>${q.outro ? md(q.outro) : ""}`;
    }).join("");
  }
  return `
    <div class="msg ${isUser ? "user" : "npc"}">
      <canvas class="avatar" width="48" height="48" data-av="${isUser ? "hero" : "owl"}"></canvas>
      <div class="bubble ${streaming ? "caret" : ""}"><span class="who">${isUser ? esc(state.profile.alias) : "ORACLE OWL"}</span>${content}</div>
    </div>`;
}

function paintAvatars(root) {
  root.querySelectorAll("canvas[data-av]").forEach((c) => paintPortrait(c, c.dataset.av, state.profile.dayMaster.element));
}

function renderChat() {
  const log = $("chat-log");
  const greeting = {
    role: "assistant",
    content: `Hoo-hoo! Welcome, **${state.profile.alias}**. I sense a ${state.profile.dayMaster.polarity} ${state.profile.dayMaster.element} spirit, strongest in ${state.profile.dominant}. Tell me what excites you, or pick a scroll below and I'll reveal quests worthy of your skills.`,
  };
  const msgs = state.chat.length ? state.chat : [greeting];
  log.innerHTML = msgs.map((m, i) => renderMessage(m, state.chat.length ? i : -1)).join("");
  paintAvatars(log);
  log.scrollTop = log.scrollHeight;
}

function renderStatus() {
  $("status").innerHTML = state.online
    ? `<span class="online">● Oracle online (Claude)</span>`
    : `<span class="offline">● Offline Oracle (no API key on server)</span>`;
  $("privacy-note").textContent = state.privacy === "pillars"
    ? "Sharing: element balance + 8 pillar characters"
    : "Sharing: element balance only — no pillars, names or dates";
}

function renderAll() { renderCharacter(); renderSkills(); renderQuests(); renderChat(); renderStatus(); }

// ---------- effects ----------
let liveFloats = 0;
function floatText(text, color) {
  const box = $("scene-box");
  const slot = liveFloats++;
  const el = document.createElement("div");
  el.className = "float-text"; el.textContent = text;
  if (color) el.style.color = color;
  el.style.left = `${scene.anchors.hero.x * 100}%`; el.style.top = `${(scene.anchors.hero.y - 0.35 - slot * 0.13) * 100}%`;
  el.style.animationDelay = `${slot * 0.25}s`; el.style.opacity = "0";
  box.appendChild(el);
  setTimeout(() => { el.remove(); liveFloats--; }, 1700 + slot * 250);
}
function levelUp() { scene.burst("#ffc94a", 70); floatText("LEVEL UP!"); }

// ---------- profile selection ----------
function applyProfile() {
  const src = state.rawImported ?? state.serverProfile;
  state.profile = anonymizeBazi(src, { privacy: state.privacy });
  state.source = state.rawImported ? "imported (anonymized)" : state.sourceServer;
}

// ---------- chat ----------
async function ask(text) {
  text = text.trim();
  if (!text || state.busy) return;
  state.busy = true; $("btn-send").disabled = true;
  state.chat.push({ role: "user", content: text });
  const reply = { role: "assistant", content: "" };
  state.chat.push(reply);
  renderChat();
  const log = $("chat-log");
  const bubble = () => log.lastElementChild;
  let pending = false, finished = false;
  const repaint = () => {
    if (pending || finished) return; pending = true;
    requestAnimationFrame(() => {
      pending = false;
      if (finished) return;
      bubble().outerHTML = renderMessage(reply, state.chat.length - 1, true);
      paintAvatars(log.lastElementChild); log.scrollTop = log.scrollHeight;
    });
  };

  try {
    let usedOffline = !state.online;
    if (state.online) {
      const res = await fetch("api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privacy: state.privacy,
          profile: state.profile, // already anonymized
          skills: state.skills,
          messages: state.chat.slice(0, -1).filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (res.status === 503) { state.online = false; renderStatus(); usedOffline = true; }
      else if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);
      else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.content += dec.decode(value, { stream: true });
          repaint();
        }
        if (reply.content.includes("[[OFFLINE]]")) {
          reply.content = ""; state.online = false; usedOffline = true; renderStatus();
        }
        const errAt = reply.content.indexOf("[[ERROR]]");
        if (errAt > -1) {
          const errText = reply.content.slice(errAt + 9).trim();
          reply.content = reply.content.slice(0, errAt).trim();
          if (!reply.content) { reply.content = errText; reply.error = true; }
          else state.chat.push({ role: "assistant", content: errText, error: true });
        }
      }
    }
    if (usedOffline) {
      const round = state.chat.filter((m) => m.role === "user").length;
      const full = offlineIdeas(state.profile, state.skills, text, round);
      for (let i = 0; i < full.length; i += 6) { // typewriter effect
        reply.content = full.slice(0, i + 6); repaint();
        await new Promise((r) => setTimeout(r, 8));
      }
      reply.content = full;
    }
  } catch (err) {
    reply.content = `The crystal ball went dark: ${err.message}. Is the server running?`;
    reply.error = true;
  } finally {
    finished = true;
    state.busy = false; $("btn-send").disabled = false;
    // Drop a failed exchange's empty reply so the history stays valid
    if (!reply.content.trim()) { reply.content = "(no answer)"; reply.error = true; }
    store.set("chat", state.chat.slice(-40));
    renderChat();
  }
}

// ---------- import flow ----------
let pendingImport = null;
function topKeys(obj, prefix = "") {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix + k;
    return v && typeof v === "object" && !Array.isArray(v) && !/pillars|fourpillars|chart|bazi/i.test(k) ? topKeys(v, key + ".") : [key];
  });
}
async function handleFile(file) {
  const text = await file.text();
  let raw;
  try { raw = JSON.parse(text); } catch { raw = text; }
  try {
    const anon = anonymizeBazi(raw, { privacy: "pillars" }); // keep pillars locally; privacy toggle decides what's shared
    pendingImport = anon;
    const keptLike = /^(pillars|fourPillars|chart|bazi|elements|elementBalance|fiveElements|dayMaster|day_master|self|favorable|favorableElements|usefulGod|useful|strength|dayMasterStrength)$/i;
    const dropped = typeof raw === "object" ? topKeys(raw).filter((k) => !keptLike.test(k.split(".")[0])) : [];
    $("modal-dropped").innerHTML = dropped.length
      ? `<p class="dropped">🗑 Discarded fields: ${dropped.map(esc).join(", ")}</p>`
      : `<p class="kept">No personal fields found.</p>`;
    $("modal-json").textContent = JSON.stringify(anonymizeBazi(anon, { privacy: state.privacy }), null, 2);
    $("modal").classList.add("open");
  } catch (err) {
    alert(err.message);
  }
}

// ---------- events ----------
$("composer").addEventListener("submit", (e) => { e.preventDefault(); const v = $("input").value; $("input").value = ""; ask(v); });
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("composer").requestSubmit(); } });
$("chips").addEventListener("click", (e) => { const q = e.target.closest("button")?.dataset.q; if (q) ask(q); });
$("btn-clear").addEventListener("click", () => { state.chat = []; store.set("chat", []); renderChat(); });

$("chat-log").addEventListener("click", (e) => {
  const b = e.target.closest("[data-accept]"); if (!b) return;
  const [mi, qi] = b.dataset.accept.split(":").map(Number);
  const q = parseQuests(state.chat[mi].content).quests[qi];
  if (!q || state.quests.some((x) => x.title === q.title)) return;
  state.quests.push({ title: q.title, element: q.element, difficulty: q.difficulty, done: false });
  store.set("quests", state.quests);
  floatText("QUEST ACCEPTED", "#9fd0ff");
  renderQuests(); renderChat();
});

$("skill-list").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.del != null) state.skills.splice(Number(b.dataset.del), 1);
  else if (b.dataset.sk != null) {
    const s = state.skills[Number(b.dataset.sk)];
    const before = s.level;
    s.level = Math.max(0, Math.min(10, s.level + Number(b.dataset.d)));
    if (s.level > before) { scene.burst(CAT_COLORS[s.category] ?? "#fff", 14); floatText(`${s.name} +1`, "#fff"); }
  }
  store.set("skills", state.skills);
  renderSkills(); renderCharacter();
});
$("add-skill").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("sk-name").value.trim(); if (!name) return;
  state.skills.push({ name, level: 1, category: $("sk-cat").value });
  state.skills = sanitizeSkills(state.skills);
  $("sk-name").value = "";
  store.set("skills", state.skills);
  floatText(`NEW SKILL: ${name}`, "#fff");
  renderSkills(); renderCharacter();
});

$("quest-list").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.done != null) { state.quests[Number(b.dataset.done)].done = true; scene.burst("#ffe14a", 40); floatText("+250 EXP"); }
  if (b.dataset.qdel != null) state.quests.splice(Number(b.dataset.qdel), 1);
  store.set("quests", state.quests);
  renderQuests(); renderCharacter(); renderChat();
});

document.querySelectorAll('input[name="privacy"]').forEach((r) => {
  r.checked = r.value === state.privacy;
  r.addEventListener("change", () => { state.privacy = r.value; store.set("privacy", state.privacy); applyProfile(); renderAll(); });
});

$("btn-import").addEventListener("click", () => $("file-bazi").click());
$("file-bazi").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) handleFile(f); e.target.value = ""; });
const closeModal = () => { $("modal").classList.remove("open"); pendingImport = null; };
$("modal-x").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
$("modal-ok").addEventListener("click", () => {
  state.rawImported = pendingImport;
  store.set("importedProfile", pendingImport);
  closeModal(); applyProfile(); renderAll();
  scene.burst("#9fd0ff", 60); floatText("PROFILE LOADED", "#9fd0ff");
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

// ---------- boot ----------
(async function boot() {
  try {
    const res = await fetch("api/profile");
    if (!res.ok) throw new Error();
    const data = await res.json();
    state.serverProfile = data.profile;
    state.sourceServer = data.source;
    state.online = data.online;
    state.skills ??= data.skills;
  } catch {
    // static hosting / no server → sample profile + offline oracle
    state.serverProfile = anonymizeBazi(SAMPLE_RAW, { privacy: "pillars" });
    state.sourceServer = "sample profile (no server)";
    state.online = false;
  }
  state.skills = sanitizeSkills(state.skills ?? SAMPLE_SKILLS);
  applyProfile();
  renderAll();
})();

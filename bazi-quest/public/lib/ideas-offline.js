// Offline "Oracle" — a small rule-based idea generator used when no Claude API
// credential is configured. Mixes your element profile with your skills.

const THEMES = {
  Wood: ["a habit garden that grows pixel plants as you code daily", "a skill-tree planner for learning paths", "a mentorship matchmaker for beginner devs", "a community seed library tracker", "a 100-days-of-code streak forest"],
  Fire: ["a live 'show your build' wall with confetti reactions", "a pixel-art meme generator for dev wins", "a lightning-talk timer with audience hype meter", "an animated portfolio that plays like a game level", "a Twitch-style overlay for coding streams"],
  Earth: ["a pantry & recipe tracker for your household", "a budget dashboard that feels like an RPG inventory", "a neighborhood tool-lending board", "a study-group scheduler with zero friction", "a personal CRM for staying in touch with friends"],
  Metal: ["a CSS linter that roasts your stylesheet in pixel speech bubbles", "a password-strength forge visualizer", "a keyboard-shortcut trainer with speedrun timer", "a code kata arena with precision scoring", "a minimalist focus timer with strict rules"],
  Water: ["a mood-to-playlist journal", "a 'random rabbit hole' Wikipedia explorer", "an AI study buddy that quizzes you on your notes", "a chat-based choose-your-own-adventure engine", "a tide-like ambient soundscape generator for focus"],
};
const TWISTS = {
  Wood: "make it grow over time — progress should feel alive",
  Fire: "make it loud, visual, and shareable",
  Earth: "make it dependable — something you'd use every week",
  Metal: "keep it sharp and minimal; polish one feature to perfection",
  Water: "make it adaptive — let it react to what the user does",
};

function pick(arr, seed) { return arr[Math.abs(seed) % arr.length]; }
function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

export function offlineIdeas(profile, skills, userMsg = "", round = 0) {
  const top = [...skills].sort((a, b) => b.level - a.level);
  const s1 = top[0]?.name ?? "HTML";
  const s2 = top[1]?.name ?? "CSS";
  const growth = [...skills].sort((a, b) => a.level - b.level)[0]?.name ?? "JavaScript";
  const seed = hash(userMsg) + round * 3;
  const dm = profile.dayMaster.element;
  const weak = profile.weakest;
  const fav = profile.favorable?.[0] ?? weak;

  const quests = [
    { el: dm, why: `Your ${profile.dayMaster.polarity} ${dm} day master loves ${profile.archetypeVibe.split(",")[0]}.`, diff: "★★☆" },
    { el: fav, why: `${fav} is a balancing element for you — building in its spirit stretches you.`, diff: "★★★" },
    { el: profile.dominant, why: `${profile.dominant} is your strongest element (${profile.elementBalance[profile.dominant]}%) — play to it.`, diff: "★☆☆" },
  ];

  const body = quests.map((q, i) => {
    const idea = pick(THEMES[q.el], seed + i * 7);
    return `### QUEST: ${idea[0].toUpperCase() + idea.slice(1)}
**Element:** ${q.el} · **Difficulty:** ${q.diff}
**Why it fits you:** ${q.why} ${TWISTS[q.el][0].toUpperCase() + TWISTS[q.el].slice(1)}.
**Build it with:** ${s1} + ${s2}, and level up ${growth} along the way.
**Day-1 step:** Sketch the single screen it needs, then build it in plain ${s1}/${s2} within an hour.`;
  }).join("\n\n");

  return `*(Offline Oracle — add an Anthropic API key to the server for real Claude-powered ideas.)*\n\nGreetings, ${profile.alias}! The spirits of ${dm} whisper three quests for you:\n\n${body}\n\nAsk me for "more", or tell me a theme (games, music, money, health…) and I'll reroll.`;
}

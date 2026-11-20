// Bazi anonymizer — shared by the browser and the server (plain ES module, no deps).
//
// Strategy: WHITELIST, never blacklist. We read the raw bazi file, derive only
// abstract traits (day-master element, element balance, …) and build a brand-new
// object from them. Names, birth dates/times/places, gender, emails, notes and any
// field we don't explicitly recognise are simply never copied.
//
// Privacy levels:
//   "elements" (default) – day master + element balance + traits. The raw pillars
//                          are NOT included, because the four pillars can be
//                          reverse-engineered into a short list of birth dates.
//   "pillars"            – also includes the 8 characters (stems/branches only).

export const ELEMENTS = ["Wood", "Fire", "Earth", "Metal", "Water"];

const STEMS = [
  { zh: "甲", py: "jia", el: "Wood", yin: false },
  { zh: "乙", py: "yi", el: "Wood", yin: true },
  { zh: "丙", py: "bing", el: "Fire", yin: false },
  { zh: "丁", py: "ding", el: "Fire", yin: true },
  { zh: "戊", py: "wu", el: "Earth", yin: false },
  { zh: "己", py: "ji", el: "Earth", yin: true },
  { zh: "庚", py: "geng", el: "Metal", yin: false },
  { zh: "辛", py: "xin", el: "Metal", yin: true },
  { zh: "壬", py: "ren", el: "Water", yin: false },
  { zh: "癸", py: "gui", el: "Water", yin: true },
];
const BRANCHES = [
  { zh: "子", py: "zi", el: "Water" }, { zh: "丑", py: "chou", el: "Earth" },
  { zh: "寅", py: "yin", el: "Wood" }, { zh: "卯", py: "mao", el: "Wood" },
  { zh: "辰", py: "chen", el: "Earth" }, { zh: "巳", py: "si", el: "Fire" },
  { zh: "午", py: "wu", el: "Fire" }, { zh: "未", py: "wei", el: "Earth" },
  { zh: "申", py: "shen", el: "Metal" }, { zh: "酉", py: "you", el: "Metal" },
  { zh: "戌", py: "xu", el: "Earth" }, { zh: "亥", py: "hai", el: "Water" },
];

const strip = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function findStem(tok) {
  const t = strip(tok);
  return STEMS.find((s) => s.zh === tok || s.zh === t || s.py === t) ?? null;
}
function findBranch(tok) {
  const t = strip(tok);
  return BRANCHES.find((b) => b.zh === tok || b.zh === t || b.py === t) ?? null;
}

// Accepts "甲子", "Jia Zi", "jia-zi", "JiaZi", {stem, branch}, {heavenlyStem, earthlyBranch}, ["甲","子"]
export function parsePillar(p) {
  if (!p) return null;
  if (Array.isArray(p)) p = { stem: p[0], branch: p[1] };
  if (typeof p === "object") {
    const stem = findStem(p.stem ?? p.heavenlyStem ?? p.gan ?? p.tianGan);
    const branch = findBranch(p.branch ?? p.earthlyBranch ?? p.zhi ?? p.diZhi);
    return stem && branch ? { stem, branch } : null;
  }
  const s = String(p).trim();
  // Chinese characters
  const chars = [...s].filter((c) => /\p{Script=Han}/u.test(c));
  if (chars.length >= 2) {
    const stem = findStem(chars[0]);
    const branch = findBranch(chars[1]);
    if (stem && branch) return { stem, branch };
  }
  // Pinyin, separated or joined
  const parts = strip(s).split(/[\s\-_/,]+/).filter(Boolean);
  if (parts.length >= 2) {
    const stem = findStem(parts[0]);
    const branch = findBranch(parts[1]);
    if (stem && branch) return { stem, branch };
  }
  const joined = strip(s).replace(/[^a-z]/g, "");
  for (const st of STEMS) {
    if (joined.startsWith(st.py)) {
      const branch = findBranch(joined.slice(st.py.length));
      if (branch) return { stem: st, branch };
    }
  }
  return null;
}

function pickPillars(raw) {
  const src = raw?.pillars ?? raw?.fourPillars ?? raw?.chart ?? raw?.bazi ?? raw;
  if (!src) return [];
  const order = ["year", "month", "day", "hour"];
  if (Array.isArray(src)) return src.slice(0, 4).map(parsePillar);
  if (typeof src === "string") {
    // "甲子 乙丑 丙寅 丁卯" or "Jia Zi, Yi Chou, …"
    const han = [...src].filter((c) => /\p{Script=Han}/u.test(c));
    if (han.length >= 8) return [0, 2, 4, 6].map((i) => parsePillar(han[i] + han[i + 1]));
    const words = strip(src).split(/[^a-z]+/).filter(Boolean);
    const out = [];
    for (let i = 0; i + 1 < words.length && out.length < 4; i += 2) out.push(parsePillar(words[i] + " " + words[i + 1]));
    return out;
  }
  if (typeof src === "object") return order.map((k) => parsePillar(src[k] ?? src[k + "Pillar"]));
  return [];
}

function normElement(e) {
  const t = strip(e);
  const map = { wood: "Wood", 木: "Wood", fire: "Fire", 火: "Fire", earth: "Earth", 土: "Earth", metal: "Metal", 金: "Metal", water: "Water", 水: "Water" };
  return map[t] ?? map[String(e).trim()] ?? null;
}

const ARCHETYPES = {
  Wood: { cls: "Sprout Ranger", vibe: "growth, systems that scale, teaching, ecosystems, long-term projects" },
  Fire: { cls: "Flame Mage", vibe: "visual flair, performance, community, storytelling, things people share" },
  Earth: { cls: "Stone Guardian", vibe: "reliability, organizing, tools people depend on, data, trust" },
  Metal: { cls: "Blade Smith", vibe: "precision, optimization, rules engines, security, clean architecture" },
  Water: { cls: "Tide Rogue", vibe: "curiosity, research, adaptive UX, networks, communication, AI" },
};
const ALIAS_ADJ = { Wood: "Verdant", Fire: "Ember", Earth: "Granite", Metal: "Silver", Water: "Misty" };
const ALIAS_NOUN = ["Wanderer", "Tinkerer", "Builder", "Seeker", "Crafter"];

// Main entry. Returns a fresh object that contains ONLY whitelisted, abstract data.
export function anonymizeBazi(raw, { privacy = "elements" } = {}) {
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch { raw = { pillars: raw }; }
  }
  raw = raw ?? {};

  // Already anonymized? Re-sanitize from its own whitelisted fields (idempotent).
  const pillars = pickPillars(raw).filter(Boolean);
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e, 0]));
  let dayMaster = null;

  if (pillars.length === 4) {
    for (const p of pillars) { counts[p.stem.el]++; counts[p.branch.el]++; }
    dayMaster = { element: pillars[2].stem.el, polarity: pillars[2].stem.yin ? "Yin" : "Yang" };
  } else {
    // Fall back to element counts / percentages supplied by the file.
    const bal = raw.elementBalance ?? raw.elements ?? raw.fiveElements ?? {};
    for (const [k, v] of Object.entries(bal)) {
      const el = normElement(k);
      const n = Number(v);
      if (el && Number.isFinite(n) && n >= 0) counts[el] += n;
    }
    const dm = raw.dayMaster ?? raw.day_master ?? raw.self;
    const dmEl = normElement(typeof dm === "object" ? dm?.element : dm) ?? findStem(typeof dm === "object" ? dm?.stem : dm)?.el;
    if (dmEl) {
      const stem = findStem(typeof dm === "object" ? dm?.stem : dm);
      const pol = typeof dm === "object" && /^(yin|yang)$/i.test(dm?.polarity ?? "") ? dm.polarity : stem ? (stem.yin ? "Yin" : "Yang") : "Yang";
      dayMaster = { element: dmEl, polarity: pol[0].toUpperCase() + pol.slice(1).toLowerCase() };
    }
  }

  const total = ELEMENTS.reduce((s, e) => s + counts[e], 0);
  if (!dayMaster || total === 0) {
    throw new Error("Couldn't read this bazi file. It needs four pillars (e.g. 甲子 or 'Jia Zi') or a dayMaster + element counts.");
  }
  // Values that already look like percentages (e.g. our own output) are kept as-is.
  const isPct = pillars.length !== 4 && total >= 95 && total <= 105;
  const balance = Object.fromEntries(ELEMENTS.map((e) => [e, isPct ? Math.round(counts[e]) : Math.round((counts[e] / total) * 100)]));
  const sorted = [...ELEMENTS].sort((a, b) => balance[b] - balance[a]);

  const favorable = [].concat(raw.favorable ?? raw.favorableElements ?? raw.usefulGod ?? raw.useful ?? [])
    .map(normElement).filter(Boolean);
  const strengthRaw = strip(raw.strength ?? raw.dayMasterStrength ?? "");
  const strength = /strong|旺|强/.test(strengthRaw) ? "Strong" : /weak|弱/.test(strengthRaw) ? "Weak" : null;

  const arch = ARCHETYPES[dayMaster.element];
  const out = {
    alias: `${ALIAS_ADJ[dayMaster.element]} ${ALIAS_NOUN[(balance[sorted[0]] + balance[sorted[4]]) % ALIAS_NOUN.length]}`,
    dayMaster,
    elementBalance: balance,
    dominant: sorted[0],
    weakest: sorted[4],
    missing: ELEMENTS.filter((e) => balance[e] === 0),
    archetype: arch.cls,
    archetypeVibe: arch.vibe,
  };
  if (strength) out.strength = strength;
  if (favorable.length) out.favorable = [...new Set(favorable)];
  if (privacy === "pillars" && pillars.length === 4) {
    out.pillars = pillars.map((p, i) => ({ position: ["year", "month", "day", "hour"][i], stem: p.stem.zh, branch: p.branch.zh }));
  }
  return out;
}

// Skills are user-entered; keep only name / level / category, clamp levels.
export function sanitizeSkills(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.slice(0, 40).map((s) => ({
    name: String(s?.name ?? "").slice(0, 40),
    level: Math.max(0, Math.min(10, Math.round(Number(s?.level) || 0))),
    category: String(s?.category ?? "Other").slice(0, 24),
  })).filter((s) => s.name);
}

// Original pixel-art sprites + the animated side-scrolling scene.
// Every sprite is a string grid; one char = one pixel, "." = transparent.

export const EL_COLORS = { Wood: "#4fb24a", Fire: "#f0652c", Earth: "#c99a3d", Metal: "#a9b6c8", Water: "#3aa7e0" };

const HERO_TOP = [
  "....KKKKKK....",
  "...KHHHHHHK...",
  "..KHHHHHHHHK..",
  ".KHHHHHHHHHHK.",
  ".KHHSSSSSSHHK.",
  ".KHSSSSSSSSHK.",
  ".KHSEWSSEWSHK.",
  ".KHSEESSEESHK.",
  "..KSRSSSSRSK..",
  "...KSSMMSSK...",
  "....KKKKKK....",
  "...KCCCCCCK...",
  "..KSCCDDCCSK..",
  "..KSCCCCCCSK..",
  "...KDDYYDDK...",
];
const LEGS_A = ["...KCCKKCCK...", "...KBBK.KBBK..", "...KKKK.KKKK.."];
const LEGS_B = ["...KCCK.KCCK..", "..KBBK...KBBK.", "..KKKK...KKKK."];
const BLINK_ROWS = { 6: ".KHSKKSSKKSHK.", 7: ".KHSSSSSSSSHK." };

// Element accessory drawn above the head (rows -3..-1)
const ACCESSORY = {
  Wood: ["......LL......", ".....LLG......", "......G......."],
  Fire: ["......F.......", ".....FOF......", "......O......."],
  Earth: ["..............", "..............", "..ZZZZZZZZZZ.."],
  Metal: ["......Z.......", ".....ZZZ......", "....ZZZZZ....."],
  Water: ["......A.......", ".....AAA......", ".....AAA......"],
};

const HERO_PAL = {
  Wood: { H: "#6b4a2b", C: "#4fb24a", D: "#2f7a33", B: "#5a3a1e" },
  Fire: { H: "#c8352a", C: "#f0652c", D: "#a63a1b", B: "#4a2a1a" },
  Earth: { H: "#4a3322", C: "#c99a3d", D: "#8a6420", B: "#3a2a1a" },
  Metal: { H: "#d6dbe4", C: "#8a9bb3", D: "#5b6a82", B: "#2e3442" },
  Water: { H: "#22356b", C: "#3aa7e0", D: "#1f6a9a", B: "#1e2a44" },
};
const BASE_PAL = { K: "#1b1424", S: "#ffd9b8", E: "#2a1a3a", W: "#ffffff", M: "#d0606a", R: "#ffb3b3", Y: "#ffc94a", L: "#7ad35a", G: "#2f7a33", F: "#ffd34a", O: "#f0652c", Z: "#c9d2df", A: "#7fd0ff" };

const OWL = [
  "..K....K..",
  ".KBK..KBK.",
  ".KBBBBBBK.",
  "KBWWBBWWBK",
  "KBWEBBEWBK",
  "KBBBYYBBBK",
  "KBLLLLLLBK",
  ".KBLLLLBK.",
  "..KBBBBK..",
  "..Y.KK.Y..",
];
const OWL_BLINK = { 4: "KBWWBBWWBK" };
const OWL_PAL = { K: "#1b1424", B: "#8a5cd6", W: "#ffffff", E: "#1b1424", Y: "#ffb02e", L: "#e8d9ff" };

function drawGrid(ctx, rows, pal, x, y, s = 1, flip = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ".") continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      const cx = flip ? row.length - 1 - c : c;
      ctx.fillRect(Math.round(x + cx * s), Math.round(y + r * s), s, s);
    }
  }
}

export function heroRows(element, { walk = 0, blink = false } = {}) {
  const top = HERO_TOP.map((row, i) => (blink && BLINK_ROWS[i]) || row);
  return [...(ACCESSORY[element] ?? ACCESSORY.Wood), ...top, ...(walk ? LEGS_B : LEGS_A)];
}
export function heroPalette(element) { return { ...BASE_PAL, ...(HERO_PAL[element] ?? HERO_PAL.Wood) }; }

export function drawHero(ctx, element, x, y, s = 1, opts = {}) {
  drawGrid(ctx, heroRows(element, opts), heroPalette(element), x, y, s, opts.flip);
}
export function drawOwl(ctx, x, y, s = 1, blink = false) {
  drawGrid(ctx, OWL.map((r, i) => (blink && OWL_BLINK[i]) || r), OWL_PAL, x, y, s);
}

// Paint a sprite into a small <canvas> (portraits, avatars)
export function paintPortrait(canvas, kind, element) {
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (kind === "owl") {
    const s = Math.floor(canvas.width / 12);
    drawOwl(ctx, (canvas.width - 10 * s) / 2, (canvas.height - 10 * s) / 2, s);
  } else {
    const s = Math.floor(canvas.height / 21);
    drawHero(ctx, element, (canvas.width - 14 * s) / 2, (canvas.height - 21 * s) / 2, s);
  }
}

// ---------------- Scene ----------------
const SKIES = {
  Wood: ["#8fd3ff", "#b9e6ff", "#e2f6ff"],
  Fire: ["#ff8a5c", "#ffb36b", "#ffe1a1"],
  Earth: ["#f4c470", "#f9dc9a", "#fff0c9"],
  Metal: ["#7b86b8", "#a8b0d6", "#d9dcf0"],
  Water: ["#1c2a6b", "#34489a", "#5a6fc0"],
};

export class Scene {
  constructor(canvas, onOwlClick) {
    this.c = canvas; this.ctx = canvas.getContext("2d");
    this.W = 320; this.H = 168;
    canvas.width = this.W; canvas.height = this.H;
    this.ctx.imageSmoothingEnabled = false;
    this.element = "Wood"; this.dominant = "Wood"; this.balance = {};
    this.hero = { x: 90, y: 0, vx: 0, vy: 0, flip: false, onGround: true, target: null };
    this.owl = { x: 262, y: 54 };
    this.groundY = 136;
    this.keys = new Set();
    this.t = 0; this.particles = [];
    this.clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 75 + 10, y: 10 + (i * 13) % 34, w: 18 + (i * 7) % 16 }));
    this.stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 73) % 320, y: (i * 37) % 80 }));
    this.onOwlClick = onOwlClick;
    this.anchors = { hero: { x: 0, y: 0 }, owl: { x: 0, y: 0 } };

    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.W;
      const y = ((e.clientY - r.top) / r.height) * this.H;
      if (Math.abs(x - (this.owl.x + 10)) < 18 && Math.abs(y - (this.owl.y + 10)) < 20) { this.onOwlClick?.(); return; }
      this.hero.target = Math.max(8, Math.min(this.W - 24, x - 7));
    });
    window.addEventListener("keydown", (e) => {
      if (/input|textarea|select/i.test(document.activeElement?.tagName)) return;
      if (["ArrowLeft", "ArrowRight", "a", "d", "ArrowUp", " ", "w"].includes(e.key)) {
        this.keys.add(e.key); this.hero.target = null;
        if (e.key === " " || e.key === "ArrowUp") e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key));
    const loop = () => { this.update(); this.draw(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  setProfile(profile) {
    this.element = profile.dayMaster.element;
    this.dominant = profile.dominant;
    this.balance = profile.elementBalance;
  }

  burst(color = "#ffc94a", n = 40) {
    const h = this.hero;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 2.2;
      this.particles.push({ x: h.x + 7, y: h.y + 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 60 + Math.random() * 30, color });
    }
  }

  update() {
    this.t++;
    const h = this.hero, k = this.keys;
    let dir = 0;
    if (k.has("ArrowLeft") || k.has("a")) dir = -1;
    if (k.has("ArrowRight") || k.has("d")) dir = 1;
    if (dir === 0 && h.target != null) {
      if (Math.abs(h.target - h.x) < 1.5) h.target = null; else dir = Math.sign(h.target - h.x);
    }
    h.vx = dir * 1.1;
    if (dir) h.flip = dir < 0;
    if ((k.has(" ") || k.has("ArrowUp") || k.has("w")) && h.onGround) { h.vy = -3.6; h.onGround = false; }
    h.vy += 0.2;
    h.x = Math.max(4, Math.min(this.W - 18, h.x + h.vx));
    h.y += h.vy;
    const floor = this.groundY - 21;
    if (h.y >= floor) { h.y = floor; h.vy = 0; h.onGround = true; }
    this.walking = dir !== 0 && h.onGround;
    for (const c of this.clouds) { c.x += 0.08 + c.w * 0.002; if (c.x > this.W + 20) c.x = -c.w - 10; }
    this.particles = this.particles.filter((p) => { p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.life--; return p.life > 0; });
  }

  draw() {
    const { ctx, W, H, t } = this;
    const sky = SKIES[this.dominant] ?? SKIES.Wood;
    // banded sky (pixel-style gradient)
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      ctx.fillStyle = sky[Math.min(2, Math.floor((i / bands) * 3))];
      ctx.fillRect(0, i * 14, W, 14);
    }
    for (let i = 0; i < bands - 1; i++) { // dither between bands
      ctx.fillStyle = sky[Math.min(2, Math.floor(((i + 1) / bands) * 3))];
      for (let x = (i % 2) * 2; x < W; x += 4) ctx.fillRect(x, i * 14 + 13, 2, 1);
    }
    if (this.dominant === "Water") { ctx.fillStyle = "#ffffff"; for (const s of this.stars) if ((s.x + t / 20) % 7 > 1) ctx.fillRect(s.x, s.y, 1, 1); }
    // sun / moon
    ctx.fillStyle = this.dominant === "Water" ? "#f4f1d0" : "#fff3b0";
    this.circle(268, 24, 11);
    // clouds
    for (const c of this.clouds) this.cloud(c.x, c.y, c.w);
    // far hills
    this.hills(78, "#00000018", 0.03, 18, 0.04);
    this.hills(96, "#2b5d3a55", 0.06, 14, 0.07);
    // floating platform with rope
    this.platform(150, 82, 64);
    ctx.fillStyle = "#8a5a2b"; for (let y = 88; y < this.groundY; y += 4) { ctx.fillRect(176, y, 1, 3); ctx.fillRect(182, y, 1, 3); ctx.fillRect(176, y + 1, 7, 1); }
    // tree + owl
    this.tree(250, this.groundY);
    drawOwl(ctx, this.owl.x, this.owl.y + Math.round(Math.sin(t / 30)), 2, t % 180 < 6);
    // "!" bubble over owl
    const by = this.owl.y - 14 + Math.round(Math.sin(t / 12) * 2);
    ctx.fillStyle = "#1b1424"; ctx.fillRect(this.owl.x + 6, by - 1, 9, 12);
    ctx.fillStyle = "#ffc94a"; ctx.fillRect(this.owl.x + 7, by, 7, 10);
    ctx.fillStyle = "#1b1424"; ctx.fillRect(this.owl.x + 10, by + 2, 1, 4); ctx.fillRect(this.owl.x + 10, by + 7, 1, 1);
    // ground
    this.ground();
    // element orbs orbiting hero
    const h = this.hero;
    const els = Object.keys(EL_COLORS);
    els.forEach((el, i) => {
      const pct = this.balance[el] ?? 20;
      if (!pct) return;
      const a = t / 50 + (i / els.length) * Math.PI * 2;
      const ox = h.x + 7 + Math.cos(a) * 16, oy = h.y + 8 + Math.sin(a) * 5;
      const r = 1 + Math.round(pct / 18);
      ctx.fillStyle = "#1b1424"; this.circle(ox, oy, r + 1);
      ctx.fillStyle = EL_COLORS[el]; this.circle(ox, oy, r);
      ctx.fillStyle = "#ffffffaa"; ctx.fillRect(Math.round(ox - r / 2), Math.round(oy - r / 2), 1, 1);
    });
    // shadow + hero
    ctx.fillStyle = "#00000033"; ctx.fillRect(Math.round(h.x + 2), this.groundY - 1, 10, 2);
    const bob = h.onGround && !this.walking ? Math.round(Math.sin(t / 18)) : 0;
    drawHero(ctx, this.element, h.x, h.y + bob, 1, { walk: this.walking ? Math.floor(t / 8) % 2 : 0, blink: t % 200 < 6, flip: h.flip });
    // particles
    for (const p of this.particles) { ctx.fillStyle = p.color; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }

    this.anchors.hero = { x: (h.x + 7) / W, y: (this.groundY + 3) / H };
    this.anchors.owl = { x: (this.owl.x + 10) / W, y: (this.owl.y + 23) / H };
    this.onFrame?.(this.anchors);
  }

  circle(cx, cy, r) {
    const ctx = this.ctx;
    for (let y = -r; y <= r; y++) {
      const w = Math.round(Math.sqrt(r * r - y * y));
      ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
    }
  }
  cloud(x, y, w) {
    const ctx = this.ctx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(Math.round(x), y + 4, w, 5);
    ctx.fillRect(Math.round(x + 3), y + 1, w * 0.5, 4);
    ctx.fillRect(Math.round(x + w * 0.45), y, w * 0.35, 5);
    ctx.fillStyle = "#dbe9ff"; ctx.fillRect(Math.round(x), y + 8, w, 1);
  }
  hills(base, color, freq, amp, speed) {
    const ctx = this.ctx; ctx.fillStyle = color;
    for (let x = 0; x < this.W; x += 2) {
      const y = base - Math.abs(Math.sin(x * freq + speed)) * amp - Math.sin(x * freq * 2.3) * 4;
      ctx.fillRect(x, Math.round(y), 2, this.H - y);
    }
  }
  platform(x, y, w) {
    const ctx = this.ctx;
    ctx.fillStyle = "#1b1424"; ctx.fillRect(x - 1, y - 1, w + 2, 10);
    ctx.fillStyle = "#8a5a2b"; ctx.fillRect(x, y + 3, w, 5);
    ctx.fillStyle = "#6a4020"; for (let i = 0; i < w; i += 6) ctx.fillRect(x + i, y + 5, 3, 1);
    ctx.fillStyle = "#5fc24a"; ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = "#3f9a36"; for (let i = 0; i < w; i += 3) ctx.fillRect(x + i, y + 3, 2, 1);
    // little mushroom friend (original)
    ctx.fillStyle = "#1b1424"; ctx.fillRect(x + 12, y - 8, 9, 8);
    ctx.fillStyle = "#e85a8a"; ctx.fillRect(x + 13, y - 7, 7, 3);
    ctx.fillStyle = "#fff"; ctx.fillRect(x + 14, y - 7, 1, 1); ctx.fillRect(x + 18, y - 6, 1, 1);
    ctx.fillStyle = "#ffe9c9"; ctx.fillRect(x + 14, y - 4, 5, 3);
    ctx.fillStyle = "#1b1424"; ctx.fillRect(x + 15, y - 3, 1, 1); ctx.fillRect(x + 17, y - 3, 1, 1);
  }
  tree(x, gy) {
    const ctx = this.ctx;
    ctx.fillStyle = "#1b1424"; ctx.fillRect(x + 7, gy - 72, 12, 72);
    ctx.fillStyle = "#7a4a26"; ctx.fillRect(x + 8, gy - 72, 10, 72);
    ctx.fillStyle = "#5c3418"; for (let y = gy - 70; y < gy; y += 7) ctx.fillRect(x + 10, y, 2, 3);
    ctx.fillStyle = "#7a4a26"; ctx.fillRect(x - 6, gy - 79, 34, 4); // branch
    const leaf = (cx, cy, r, c) => { ctx.fillStyle = c; this.circle(cx, cy, r); };
    leaf(x + 13, gy - 100, 24, "#1b1424");
    leaf(x + 13, gy - 100, 23, "#2f8a3a");
    leaf(x + 3, gy - 106, 12, "#3fa646");
    leaf(x + 24, gy - 96, 11, "#3fa646");
    leaf(x + 12, gy - 112, 8, "#5cc25a");
    ctx.fillStyle = "#ff6a7a"; [[0, -92], [20, -110], [28, -88], [6, -118]].forEach(([dx, dy]) => ctx.fillRect(x + dx, gy + dy, 2, 2));
  }
  ground() {
    const { ctx, W, H, groundY: g } = this;
    ctx.fillStyle = "#1b1424"; ctx.fillRect(0, g - 1, W, 1);
    ctx.fillStyle = "#5fc24a"; ctx.fillRect(0, g, W, 5);
    ctx.fillStyle = "#3f9a36"; for (let x = 0; x < W; x += 4) ctx.fillRect(x, g + 5, 2, 1);
    ctx.fillStyle = "#a8743c"; ctx.fillRect(0, g + 6, W, H - g - 6);
    ctx.fillStyle = "#8a5a2b";
    for (let y = g + 9; y < H; y += 6) for (let x = (y % 12 ? 0 : 6); x < W; x += 12) ctx.fillRect(x, y, 6, 1);
    ctx.fillStyle = "#c48f52"; for (let x = 3; x < W; x += 17) ctx.fillRect(x, g + 12 + (x % 3) * 5, 2, 2);
    // grass tufts + flowers
    for (let x = 6; x < W; x += 23) {
      ctx.fillStyle = "#3f9a36"; ctx.fillRect(x, g - 3, 1, 3); ctx.fillRect(x + 2, g - 4, 1, 4); ctx.fillRect(x + 4, g - 2, 1, 2);
      if (x % 3 === 0) { ctx.fillStyle = "#fff176"; ctx.fillRect(x + 8, g - 3, 2, 2); }
    }
  }
}

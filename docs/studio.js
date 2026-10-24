// Animation Studio: frame-by-frame drawing with layers, a timeline, motion keyframes,
// and a spell book that links animations and built-in spells to spoken words and hand signals.

export const SIGNALS = ["open", "fist", "peace", "point", "ok", "up", "down"];
export const SIGNAL_NAMES = { open: "🖐 Open hand", fist: "✊ Fist", peace: "✌️ Peace", point: "☝️ Point", ok: "👌 OK", up: "👍 Thumbs up", down: "👎 Thumbs down" };
export const SOUNDS = { none: "No sound", whoosh: "Whoosh", boom: "Boom", chime: "Chime", zap: "Zap", magic: "Magic", pop: "Pop" };
const STYLES = { hand: "On my hand", shoot: "Shoot from my hand", burst: "Burst out of my hand", screen: "Fill the screen" };

const TOOLS = [["brush", "✏️", "Brush"], ["eraser", "🧽", "Eraser"], ["fill", "🪣", "Fill"], ["line", "📏", "Line"],
  ["rect", "⬜", "Rectangle"], ["ellipse", "⭕", "Ellipse"], ["picker", "💧", "Pick color"], ["move", "✋", "Move"]];
const BRUSHES = [["pen", "Pen"], ["marker", "Marker"], ["pencil", "Pencil"], ["spray", "Spray"], ["neon", "Neon"],
  ["calligraphy", "Calligraphy"], ["rainbow", "Rainbow"], ["sparkle", "Sparkle"]];
const PALETTE = ["#ffffff", "#c0c4cc", "#6b7280", "#111111", "#ff006e", "#e63946", "#fb5607", "#ff924c", "#ffbe0b", "#ffd60a",
  "#7ae582", "#2a9d8f", "#4cc9f0", "#3a86ff", "#4361ee", "#8338ec", "#b5179e", "#ff8fab", "#8d5524", "#f1c27d"];
const DURATIONS = [40, 80, 120, 160, 250, 400, 700, 1000, 2000];
const RES = 512;
const ID_TF = { x: 0, y: 0, s: 1, r: 0 };

let store = () => null;
let builtins = [];
let playSound = () => {};
let root = null;
export let anims = [];
export let book = {};
let recent = [];

const st = {
  anim: 0, frame: 0, layer: null, tool: "brush", brush: "pen",
  h: 330, s: 100, l: 50, alpha: 1, size: 0.02, smoothing: 0.4, shapeFill: false,
  live: null, sp: null, dragging: null,
  playing: false, playStart: 0, loop: true, speed: 1, onion: true, onionN: 1, bg: "dark", tab: "draw",
};
const undoStack = [], redoStack = [];

// ---------- data ----------

const uid = () => Math.random().toString(36).slice(2, 9);
const newLayer = (name) => ({ id: uid(), name, visible: true, opacity: 1 });
const defaultTrigger = () => ({ words: "", signal: "", style: "hand", size: 1, sound: "magic", repeat: 1 });

function newAnim(name) {
  const layer = newLayer("Layer 1");
  return { id: uid(), name, smooth: false, layers: [layer], frames: [{ dur: 120, cells: { [layer.id]: [] }, tf: null }], trigger: defaultTrigger() };
}

// Animations saved by the first studio stored plain strokes per frame
function migrate(a) {
  if (a.layers) { a.trigger = { ...defaultTrigger(), ...a.trigger }; return a; }
  const layer = newLayer("Layer 1");
  return {
    id: uid(), name: a.name || "Animation", smooth: !!a.smooth, layers: [layer],
    frames: (a.frames || []).map(f => ({ dur: f.dur || 120, tf: null, cells: { [layer.id]: (f.strokes || []).map(s => ({ t: "stroke", brush: s.e ? "eraser" : "pen", c: s.c, a: 1, s: s.s, p: s.p })) } })),
    trigger: { ...defaultTrigger(), signal: a.gesture || "" },
  };
}

function examples() {
  const heart = (sc) => {
    const p = [];
    for (let k = 0; k <= 48; k++) {
      const t = k / 48 * Math.PI * 2;
      p.push(0.5 + Math.pow(Math.sin(t), 3) * sc, 0.48 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16 * sc);
    }
    return p;
  };
  const a = newAnim("Heartbeat (example)");
  const L = a.layers[0].id;
  a.smooth = true;
  a.frames = [0.28, 0.36, 0.42, 0.34].map(sc => ({ dur: 160, tf: null, cells: { [L]: [{ t: "stroke", brush: "neon", c: "#ff006e", a: 1, s: 0.045, p: heart(sc), seed: 1 }] } }));
  a.trigger = { ...defaultTrigger(), signal: "peace", words: "love, heartbeat", sound: "chime" };

  const b = newAnim("Star shot (example)");
  const L2 = b.layers[0].id;
  const star = (rot) => {
    const p = [];
    for (let k = 0; k <= 10; k++) { const t = rot + k / 10 * Math.PI * 2, r = k % 2 ? 0.16 : 0.38; p.push(0.5 + Math.cos(t) * r, 0.5 + Math.sin(t) * r); }
    return p;
  };
  b.frames = [0, 1, 2, 3, 4, 5].map(k => ({ dur: 70, tf: null, cells: { [L2]: [
    { t: "stroke", brush: "rainbow", c: "#ffbe0b", a: 1, s: 0.04, p: star(k / 6 * Math.PI * 2 / 5), seed: k + 3 },
    { t: "stroke", brush: "sparkle", c: "#ffffff", a: 1, s: 0.03, p: star(k / 6 * Math.PI * 2 / 5 + 0.3), seed: k + 9 },
  ] } }));
  b.trigger = { ...defaultTrigger(), words: "star shot, shooting star", style: "shoot", sound: "zap", size: 0.8 };
  return [a, b];
}

function load() {
  try {
    const saved = JSON.parse(store("handAnims") || "null");
    anims = Array.isArray(saved) && saved.length ? saved.map(migrate) : examples();
  } catch { anims = examples(); }
  try { book = JSON.parse(store("spellBook") || "{}") || {}; } catch { book = {}; }
  try { recent = JSON.parse(store("recentColors") || "[]") || []; } catch { recent = []; }
}
function save() { store("handAnims", JSON.stringify(anims)); }
function saveBook() { store("spellBook", JSON.stringify(book)); }

const cur = () => anims[st.anim];
const curFrame = () => cur().frames[st.frame];

// ---------- what the main app asks for ----------

export const getAnims = () => anims;

export function builtinWords(name) {
  const b = builtins.find(x => x.name === name);
  return book[name]?.words ?? (b ? b.words.join(", ") : "");
}

const splitWords = (s) => (s || "").toLowerCase().split(",").map(w => w.trim()).filter(Boolean);

// Every spoken trigger, longest first so "fire ball" wins over "fire"
export function spellWords() {
  const out = [];
  for (const b of builtins) for (const w of splitWords(builtinWords(b.name))) out.push({ word: w, key: "b:" + b.name, builtin: b.name });
  for (const a of anims) for (const w of splitWords(a.trigger?.words)) out.push({ word: w, key: "a:" + a.id, anim: a });
  return out.sort((x, y) => y.word.length - x.word.length);
}

export function signalTarget(g) {
  if (!g) return null;
  const b = builtins.find(x => book[x.name]?.signal === g);
  if (b) return { builtin: b.name };
  const a = anims.find(x => x.trigger?.signal === g);
  return a ? { anim: a } : null;
}

function signalOwner(g) {
  const t = signalTarget(g);
  return t ? (t.builtin || t.anim.name) : "";
}

// A hand signal triggers one thing, so giving it to one spell or animation takes it from the others
function setSignal(target, g) {
  if (g) {
    for (const b of builtins) if (book[b.name]?.signal === g) book[b.name].signal = "";
    for (const a of anims) if (a.trigger?.signal === g) a.trigger.signal = "";
  }
  if (target.builtin) { book[target.builtin] = { ...(book[target.builtin] || {}), signal: g }; }
  else target.anim.trigger.signal = g;
  saveBook(); save();
}

// ---------- rendering ----------

function mk(size = RES) { const c = document.createElement("canvas"); c.width = c.height = size; return c; }

function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function toPts(p, S) { const out = []; for (let k = 0; k < p.length; k += 2) out.push({ x: p[k] * S, y: p[k + 1] * S }); return out; }

function smoothPath(c, pts) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length < 3) { for (const p of pts.slice(1)) c.lineTo(p.x, p.y); return; }
  for (let k = 1; k < pts.length - 1; k++) {
    const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
    c.quadraticCurveTo(pts[k].x, pts[k].y, mx, my);
  }
  const last = pts[pts.length - 1];
  c.lineTo(last.x, last.y);
}

function walk(pts, spacing, fn) {
  if (pts.length === 1) { fn(pts[0].x, pts[0].y, 0); return; }
  let carry = 0, dist = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], len = Math.hypot(b.x - a.x, b.y - a.y);
    let t = carry;
    while (t <= len) { const u = len ? t / len : 0; fn(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, dist + t); t += spacing; }
    carry = t - len; dist += len;
  }
}

function star4(c, x, y, r) {
  c.beginPath();
  for (let k = 0; k < 8; k++) { const t = k / 8 * Math.PI * 2, rr = k % 2 ? r * 0.28 : r; c.lineTo(x + Math.cos(t) * rr, y + Math.sin(t) * rr); }
  c.closePath(); c.fill();
}

function drawStroke(c, op, S) {
  const pts = toPts(op.p, S), w = Math.max(0.6, op.s * S), rand = rng(op.seed || 1);
  const line = (width) => {
    c.lineWidth = width;
    if (pts.length === 1) { c.beginPath(); c.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2); c.fill(); }
    else { smoothPath(c, pts); c.stroke(); }
  };
  switch (op.brush) {
    case "eraser": c.globalCompositeOperation = "destination-out"; line(w); break;
    case "marker": c.globalAlpha *= 0.45; line(w * 1.6); break;
    case "pencil": {
      c.globalAlpha *= 0.55; c.lineWidth = Math.max(1, w * 0.4);
      for (let pass = 0; pass < 3; pass++) {
        const j = pts.map(p => ({ x: p.x + (rand() - 0.5) * w * 0.5, y: p.y + (rand() - 0.5) * w * 0.5 }));
        if (j.length === 1) j.push({ x: j[0].x + 0.5, y: j[0].y });
        smoothPath(c, j); c.stroke();
      }
      break;
    }
    case "spray":
      walk(pts, Math.max(1, w * 0.25), (x, y) => {
        for (let k = 0; k < 7; k++) {
          const a = rand() * Math.PI * 2, r = w * 1.8 * Math.sqrt(rand());
          c.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, S / 400, S / 400);
        }
      });
      break;
    case "neon":
      c.shadowColor = op.c; c.shadowBlur = w * 2.5; line(w);
      c.shadowBlur = 0; c.strokeStyle = c.fillStyle = "#ffffff"; line(w * 0.35);
      break;
    case "calligraphy": {
      const nx = Math.cos(-Math.PI / 4) * w * 0.8, ny = Math.sin(-Math.PI / 4) * w * 0.8;
      const seg = pts.length === 1 ? [pts[0], { x: pts[0].x + 0.5, y: pts[0].y }] : pts;
      for (let k = 1; k < seg.length; k++) {
        const a = seg[k - 1], b = seg[k];
        c.beginPath(); c.moveTo(a.x + nx, a.y + ny); c.lineTo(b.x + nx, b.y + ny); c.lineTo(b.x - nx, b.y - ny); c.lineTo(a.x - nx, a.y - ny); c.closePath(); c.fill();
        c.lineWidth = 1; c.stroke();
      }
      break;
    }
    case "rainbow": {
      const hue0 = rand() * 360;
      c.lineWidth = w;
      if (pts.length === 1) { c.fillStyle = `hsl(${hue0} 100% 60%)`; c.beginPath(); c.arc(pts[0].x, pts[0].y, w / 2, 0, Math.PI * 2); c.fill(); break; }
      let dist = 0;
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1], b = pts[k];
        c.strokeStyle = `hsl(${(hue0 + dist * 360 / S * 1.5) % 360} 100% 60%)`;
        c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        dist += Math.hypot(b.x - a.x, b.y - a.y);
      }
      break;
    }
    case "sparkle":
      walk(pts, Math.max(2, w * 1.4), (x, y) => {
        star4(c, x + (rand() - 0.5) * w, y + (rand() - 0.5) * w, w * (0.4 + rand() * 0.8));
        if (rand() < 0.5) c.fillRect(x + (rand() - 0.5) * w * 3, y + (rand() - 0.5) * w * 3, S / 300, S / 300);
      });
      break;
    default: line(w);
  }
}

function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }

// Scanline flood fill on the layer's own pixels
function floodFill(c, x0, y0, color, alpha) {
  const S = c.canvas.width, img = c.getImageData(0, 0, S, S), d = img.data;
  x0 = Math.floor(x0); y0 = Math.floor(y0);
  if (x0 < 0 || y0 < 0 || x0 >= S || y0 >= S) return;
  const i0 = (y0 * S + x0) * 4, start = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]];
  const [r, g, b] = hexToRgb(color), a = Math.round(alpha * 255);
  const match = (i) => Math.abs(d[i] - start[0]) + Math.abs(d[i + 1] - start[1]) + Math.abs(d[i + 2] - start[2]) + Math.abs(d[i + 3] - start[3]) < 90;
  const seen = new Uint8Array(S * S), stack = [[x0, y0]];
  const paint = (i) => {
    const sa = a / 255, da = d[i + 3] / 255, oa = sa + da * (1 - sa) || 1;
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa; d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa; d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa; d[i + 3] = oa * 255;
  };
  while (stack.length) {
    let [x, y] = stack.pop();
    while (x > 0 && !seen[y * S + x - 1] && match((y * S + x - 1) * 4)) x--;
    let up = false, down = false;
    for (; x < S && !seen[y * S + x] && match((y * S + x) * 4); x++) {
      seen[y * S + x] = 1;
      if (y > 0) { const m = !seen[(y - 1) * S + x] && match(((y - 1) * S + x) * 4); if (m && !up) stack.push([x, y - 1]); up = m; }
      if (y < S - 1) { const m = !seen[(y + 1) * S + x] && match(((y + 1) * S + x) * 4); if (m && !down) stack.push([x, y + 1]); down = m; }
    }
  }
  // Paint the region plus a one-pixel rim so antialiased edges don't leave a halo
  const rim = new Uint8Array(seen);
  for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
    const k = y * S + x;
    if (!seen[k] && (seen[k - 1] || seen[k + 1] || seen[k - S] || seen[k + S])) rim[k] = 1;
  }
  for (let k = 0; k < rim.length; k++) if (rim[k]) paint(k * 4);
  c.putImageData(img, 0, 0);
}

function drawOp(c, op) {
  const S = c.canvas.width, P = op.p, w = Math.max(0.6, (op.s || 0.01) * S);
  c.save();
  c.globalAlpha = op.a ?? 1;
  c.lineCap = "round"; c.lineJoin = "round";
  c.strokeStyle = c.fillStyle = op.c;
  if (op.t === "fill") floodFill(c, P[0] * S, P[1] * S, op.c, op.a ?? 1);
  else if (op.t === "line") { c.lineWidth = w; c.beginPath(); c.moveTo(P[0] * S, P[1] * S); c.lineTo(P[2] * S, P[3] * S); c.stroke(); }
  else if (op.t === "rect") {
    const x = Math.min(P[0], P[2]) * S, y = Math.min(P[1], P[3]) * S, rw = Math.abs(P[2] - P[0]) * S, rh = Math.abs(P[3] - P[1]) * S;
    if (op.fill) c.fillRect(x, y, rw, rh); else { c.lineWidth = w; c.strokeRect(x, y, rw, rh); }
  } else if (op.t === "ellipse") {
    c.beginPath();
    c.ellipse((P[0] + P[2]) / 2 * S, (P[1] + P[3]) / 2 * S, Math.abs(P[2] - P[0]) / 2 * S, Math.abs(P[3] - P[1]) / 2 * S, 0, 0, Math.PI * 2);
    if (op.fill) c.fill(); else { c.lineWidth = w; c.stroke(); }
  } else drawStroke(c, op, S);
  c.restore();
}

// Each layer of each frame is rendered once and cached until it's edited
const cellCache = new WeakMap(), compCache = new WeakMap();
function cellCanvas(frame, layerId) {
  let m = cellCache.get(frame);
  if (!m) { m = new Map(); cellCache.set(frame, m); }
  let cv = m.get(layerId);
  if (!cv) {
    cv = mk();
    const c = cv.getContext("2d");
    for (const op of frame.cells[layerId] || []) drawOp(c, op);
    m.set(layerId, cv);
  }
  return cv;
}
function composite(anim, frame) {
  let cv = compCache.get(frame);
  if (cv) return cv;
  cv = mk();
  const c = cv.getContext("2d");
  for (const layer of anim.layers) {
    if (layer.visible === false) continue;
    c.globalAlpha = layer.opacity ?? 1;
    c.drawImage(cellCanvas(frame, layer.id), 0, 0);
  }
  compCache.set(frame, cv);
  return cv;
}
function dirty(frame, layerId) { cellCache.get(frame)?.delete(layerId); compCache.delete(frame); }
function dirtyComposites(anim) { for (const f of anim.frames) compCache.delete(f); }

export const duration = (anim) => anim.frames.reduce((s, f) => s + f.dur, 0) || 1;

function frameStarts(anim) { const s = []; let t = 0; for (const f of anim.frames) { s.push(t); t += f.dur; } return s; }

function lerpTf(a, b, u) { return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, s: a.s + (b.s - a.s) * u, r: a.r + (b.r - a.r) * u }; }

// Motion between keyframes: frames with a transform are keys, everything between is eased
function motionAt(anim, tt, starts) {
  const keys = [];
  anim.frames.forEach((f, i) => { if (f.tf) keys.push([starts[i], f.tf]); });
  if (!keys.length) return ID_TF;
  if (keys.length === 1 || tt <= keys[0][0]) return keys[0][1];
  for (let k = 1; k < keys.length; k++) {
    if (tt <= keys[k][0]) {
      let u = (tt - keys[k - 1][0]) / (keys[k][0] - keys[k - 1][0] || 1);
      u = u * u * (3 - 2 * u);
      return lerpTf(keys[k - 1][1], keys[k][1], u);
    }
  }
  return keys[keys.length - 1][1];
}

export function sample(anim, t, loop = true) {
  const starts = frameStarts(anim), total = duration(anim), n = anim.frames.length;
  const tt = loop ? ((t % total) + total) % total : Math.max(0, Math.min(t, total - 1));
  let k = 0;
  while (k < n - 1 && tt >= starts[k + 1]) k++;
  let blend = anim.smooth ? (tt - starts[k]) / anim.frames[k].dur : 0;
  if (!loop && k === n - 1) blend = 0;
  return { k, blend, tf: motionAt(anim, tt, starts) };
}

export function drawAnim(c, anim, t, x, y, size, { loop = true, alpha = 1 } = {}) {
  if (!anim?.frames?.length) return;
  const { k, blend, tf } = sample(anim, t, loop);
  c.save();
  c.translate(x + tf.x * size, y + tf.y * size);
  c.rotate(tf.r);
  c.scale(tf.s, tf.s);
  c.globalAlpha = alpha * (1 - blend);
  c.drawImage(composite(anim, anim.frames[k]), -size / 2, -size / 2, size, size);
  if (blend > 0) {
    c.globalAlpha = alpha * blend;
    c.drawImage(composite(anim, anim.frames[(k + 1) % anim.frames.length]), -size / 2, -size / 2, size, size);
  }
  c.restore();
}

// ---------- color ----------

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}
const color = () => hslToHex(st.h, st.s, st.l);

// ---------- UI ----------

const CSS = `
#studio { position: fixed; inset: 0; z-index: 4; background: var(--bg); color: var(--fg); overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: calc(10px + env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) calc(24px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); }
#studio * { box-sizing: border-box; }
.st-wrap { max-width: 1100px; margin: 0 auto; display: grid; gap: 10px; }
.st-head { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.st-head select { flex: 1; min-width: 120px; }
#studio button { appearance: none; border: 0; border-radius: 10px; padding: 8px 11px; font: inherit; font-size: 14px; font-weight: 600;
  color: var(--fg); background: rgba(255,255,255,.1); cursor: pointer; white-space: nowrap; }
#studio button.on { background: var(--fg); color: var(--bg); }
#studio button:disabled { opacity: .35; }
#studio .st-primary { background: var(--accent); color: var(--bg); }
#studio .st-danger { color: #ffb4a2; }
#studio select, #studio input[type=text] { font: inherit; font-size: 14px; color: var(--fg); background: rgba(255,255,255,.08);
  border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 8px 10px; min-width: 0; }
#studio input[type=range] { width: 100%; accent-color: var(--accent); }
#studio label { color: var(--muted); font-size: 13px; }
.st-tabs { display: flex; gap: 6px; }
.st-tabs button { flex: 1; }
.st-main { display: grid; gap: 10px; }
@media (min-width: 900px) { .st-main { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); align-items: start; } .st-left { position: sticky; top: 0; } }
.st-left, .st-right { display: grid; gap: 10px; min-width: 0; }
.st-tools { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
.st-tools::-webkit-scrollbar { display: none; }
.st-tools button { font-size: 20px !important; padding: 6px 10px !important; }
.st-tools .st-sep { flex: 1; }
#stStage { width: 100%; max-width: min(100%, 62vh); aspect-ratio: 1; justify-self: center; display: block; border-radius: 12px; touch-action: none; }
.st-panel { background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; padding: 12px; display: grid; gap: 10px; min-width: 0; }
.st-panel h3 { margin: 0; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.st-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.st-row > label { display: flex; gap: 6px; align-items: center; }
.st-field { display: grid; gap: 4px; }
.st-field span { color: var(--muted); font-size: 12px; display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }
.st-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.st-chips button { padding: 6px 10px !important; font-size: 13px !important; }
.st-swatches { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; }
.st-swatches button { aspect-ratio: 1; padding: 0 !important; border-radius: 50% !important; border: 2px solid rgba(255,255,255,.2) !important; }
.st-color-now { width: 44px; height: 44px; border-radius: 12px; border: 2px solid rgba(255,255,255,.3); flex: none; }
.st-track { height: 14px; border-radius: 8px; -webkit-appearance: none; appearance: none; }
.st-track::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fff; border: 3px solid #0b0f14; }
.st-transport { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.st-time { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; margin-left: auto; }
.st-grid { overflow-x: auto; padding-bottom: 6px; }
.st-grid table { border-collapse: separate; border-spacing: 4px; }
.st-grid th { position: sticky; left: 0; z-index: 1; background: #10151c; text-align: left; font-weight: 600; font-size: 12px; color: var(--fg);
  padding: 4px 6px; border-radius: 8px; min-width: 96px; max-width: 120px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; }
.st-grid th.on { outline: 2px solid var(--accent); }
.st-grid td { padding: 0; }
.st-thumb { position: relative; width: 58px; cursor: pointer; }
.st-thumb canvas { width: 58px; height: 58px; display: block; border-radius: 8px; background: #1a2129; border: 2px solid transparent; }
.st-thumb.on canvas { border-color: var(--accent); }
.st-thumb small { position: absolute; left: 4px; bottom: 3px; font-size: 10px; color: #fff; text-shadow: 0 1px 2px #000; font-variant-numeric: tabular-nums; }
.st-thumb b { position: absolute; right: 4px; top: 2px; font-size: 11px; color: #ffd60a; }
.st-cell { width: 58px; height: 24px; border-radius: 6px; background: rgba(255,255,255,.06); cursor: pointer; display: grid; place-items: center; }
.st-cell.full::after { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--fg); }
.st-cell.on { outline: 2px solid var(--accent); }
.st-cell.col { background: rgba(122,229,130,.12); }
.st-note { color: var(--muted); font-size: 13px; margin: 0; }
.st-spell { display: grid; gap: 8px; padding: 12px; border-radius: 12px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08); }
.st-spell header { display: flex; gap: 8px; align-items: baseline; justify-content: space-between; flex-wrap: wrap; }
.st-spell strong { font-size: 16px; }
.st-spell p { margin: 0; color: var(--muted); font-size: 13px; }
.st-spells { display: grid; gap: 8px; }
@media (min-width: 700px) { .st-spells { grid-template-columns: 1fr 1fr; } }
`;

const HTML = `
<div class="st-wrap">
  <header class="st-head">
    <button class="st-primary" id="stDone" type="button">Done</button>
    <select id="stAnim" aria-label="Animation"></select>
    <button id="stNew" type="button">+ New</button>
    <button id="stCopy" type="button">Copy</button>
    <button id="stDelete" class="st-danger" type="button">Delete</button>
  </header>
  <nav class="st-tabs">
    <button type="button" data-tab="draw" class="on">🎨 Draw</button>
    <button type="button" data-tab="book">📖 Spell book</button>
  </nav>

  <section id="stDraw" class="st-main">
    <div class="st-left">
      <div class="st-tools" id="stTools"></div>
      <canvas id="stStage"></canvas>
      <div class="st-panel">
        <div class="st-transport">
          <button id="stFirst" type="button" aria-label="First frame">⏮</button>
          <button id="stPrev" type="button" aria-label="Previous frame">◀</button>
          <button id="stPlay" class="st-primary" type="button">▶ Play</button>
          <button id="stNext" type="button" aria-label="Next frame">▶</button>
          <button id="stLast" type="button" aria-label="Last frame">⏭</button>
          <span class="st-time" id="stTime"></span>
        </div>
        <input type="range" id="stScrub" min="0" max="1000" value="0" aria-label="Scrub through the animation">
        <div class="st-grid" id="stGrid"></div>
        <div class="st-row">
          <button id="stAddFrame" type="button">+ Frame</button>
          <button id="stDupFrame" type="button">Copy frame</button>
          <button id="stMoveL" type="button" aria-label="Move frame left">⇠</button>
          <button id="stMoveR" type="button" aria-label="Move frame right">⇢</button>
          <button id="stDelFrame" class="st-danger" type="button">Delete frame</button>
        </div>
        <div class="st-row">
          <label>Hold <select id="stDur"></select></label>
          <label>Speed <select id="stSpeed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label>
          <label><input type="checkbox" id="stLoop" checked> Loop</label>
          <label><input type="checkbox" id="stSmooth"> Blend frames</label>
        </div>
        <div class="st-row">
          <label><input type="checkbox" id="stOnion" checked> Onion skin</label>
          <select id="stOnionN" aria-label="Onion skin frames"><option value="1">1 frame</option><option value="2">2 frames</option><option value="3">3 frames</option></select>
          <label>Background <select id="stBg"><option value="dark">Dark</option><option value="light">Light</option><option value="checker">Checker</option></select></label>
        </div>
      </div>
    </div>

    <div class="st-right">
      <div class="st-panel" id="stOpts"></div>

      <div class="st-panel">
        <h3>Color</h3>
        <div class="st-row">
          <div class="st-color-now" id="stNow"></div>
          <input type="text" id="stHex" aria-label="Hex color" maxlength="7" style="width:110px">
        </div>
        <div class="st-field"><span>Hue <b id="stHv"></b></span><input class="st-track" type="range" id="stH" min="0" max="360"></div>
        <div class="st-field"><span>Saturation <b id="stSv"></b></span><input class="st-track" type="range" id="stS" min="0" max="100"></div>
        <div class="st-field"><span>Lightness <b id="stLv"></b></span><input class="st-track" type="range" id="stL" min="0" max="100"></div>
        <div class="st-swatches" id="stPalette"></div>
        <div><label>Recent</label><div class="st-swatches" id="stRecent" style="margin-top:6px"></div></div>
      </div>

      <div class="st-panel">
        <h3>Layers</h3>
        <div class="st-row">
          <input type="text" id="stLayerName" aria-label="Layer name" style="flex:1">
          <button id="stLayerVis" type="button">👁 Shown</button>
        </div>
        <div class="st-field"><span>Layer opacity <b id="stLayerOpV"></b></span><input type="range" id="stLayerOp" min="0" max="100"></div>
        <div class="st-row">
          <button id="stAddLayer" type="button">+ Layer</button>
          <button id="stLayerUp" type="button">Move up</button>
          <button id="stLayerDown" type="button">Move down</button>
          <button id="stDelLayer" class="st-danger" type="button">Delete layer</button>
        </div>
      </div>

      <div class="st-panel">
        <h3>Spell &amp; signal</h3>
        <div class="st-field"><span>Spoken words (separate with commas)</span><input type="text" id="stWords" placeholder="e.g. kamehameha, power blast"></div>
        <div class="st-row">
          <label>Hand signal <select id="stSignal"></select></label>
        </div>
        <div class="st-row">
          <label>Plays <select id="stStyle"></select></label>
          <label>Repeat <select id="stRepeat"><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="5">5×</option></select></label>
        </div>
        <div class="st-field"><span>Size <b id="stSizeV"></b></span><input type="range" id="stTrigSize" min="30" max="300"></div>
        <div class="st-row">
          <label>Sound <select id="stSound"></select></label>
          <button id="stTestSound" type="button">▶ Hear it</button>
        </div>
        <p class="st-note">Say the words in Magic mode to cast this animation. Its hand signal casts it in Magic mode and plays it on your hand in My Animations mode.</p>
      </div>
    </div>
  </section>

  <section id="stBook" hidden>
    <div class="st-panel">
      <p class="st-note">Change the words that cast each spell and give spells a hand signal. Each hand signal can trigger one spell or animation. 🤘 is kept for switching modes.</p>
    </div>
    <h3 style="margin:14px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Your animations</h3>
    <div class="st-spells" id="stBookMine"></div>
    <h3 style="margin:14px 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Built-in spells</h3>
    <div class="st-spells" id="stBookBuiltin"></div>
  </section>
</div>`;

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };

function signalSelect(value, onChange, self) {
  const s = el("select");
  s.append(new Option("None", ""));
  for (const g of SIGNALS) {
    const owner = signalOwner(g);
    s.append(new Option(owner && owner !== self ? `${SIGNAL_NAMES[g]} (now: ${owner})` : SIGNAL_NAMES[g], g));
  }
  s.value = value || "";
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function pushUndo() {
  undoStack.push({ i: st.anim, json: JSON.stringify(cur()) });
  if (undoStack.length > 40) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}
function swapHistory(from, to) {
  const u = from.pop();
  if (!u || !anims[u.i]) return;
  to.push({ i: u.i, json: JSON.stringify(anims[u.i]) });
  anims[u.i] = JSON.parse(u.json);
  st.anim = u.i;
  fixSelection(); save(); refresh();
}
function updateUndoButtons() { $("stUndo").disabled = !undoStack.length; $("stRedo").disabled = !redoStack.length; }

function fixSelection() {
  const a = cur();
  st.frame = Math.max(0, Math.min(st.frame, a.frames.length - 1));
  if (!a.layers.some(l => l.id === st.layer)) st.layer = a.layers[a.layers.length - 1].id;
}

// ---------- stage ----------

const stage = () => $("stStage");
let sctx = null;

function stageSize() {
  const cv = stage(), r = cv.getBoundingClientRect();
  const px = Math.max(64, Math.round(r.width * Math.min(window.devicePixelRatio || 1, 2)));
  if (cv.width !== px) cv.width = cv.height = px;
  return px;
}

function paintBg(c, px) {
  if (st.bg === "checker") {
    const n = 16, q = px / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { c.fillStyle = (x + y) % 2 ? "#2a3240" : "#1f2631"; c.fillRect(x * q, y * q, q + 1, q + 1); }
  } else { c.fillStyle = st.bg === "light" ? "#eef1f5" : "#1a2129"; c.fillRect(0, 0, px, px); }
}

function tinted(img, color) {
  const t = mk(); const c = t.getContext("2d");
  c.drawImage(img, 0, 0);
  c.globalCompositeOperation = "source-atop"; c.globalAlpha = 0.65; c.fillStyle = color; c.fillRect(0, 0, RES, RES);
  return t;
}

function currentTf() {
  const a = cur();
  return curFrame().tf || motionAt(a, frameStarts(a)[st.frame], frameStarts(a));
}

function renderStage() {
  const px = stageSize(), c = sctx, a = cur(), f = curFrame();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, px, px);
  paintBg(c, px);
  if (st.playing) {
    const t = (performance.now() - st.playStart) * st.speed;
    const total = duration(a);
    if (!st.loop && t >= total) { stopPlay(); return; }
    drawAnim(c, a, t, px / 2, px / 2, px, { loop: st.loop });
    const tt = st.loop ? t % total : t;
    $("stScrub").value = Math.round(tt / total * 1000);
    $("stTime").textContent = `${(tt / 1000).toFixed(2)} s / ${(total / 1000).toFixed(2)} s`;
    return;
  }
  if (st.onion) {
    for (let dd = st.onionN; dd >= 1; dd--) {
      for (const sgn of [-1, 1]) {
        const g = a.frames[st.frame + sgn * dd];
        if (!g) continue;
        c.globalAlpha = 0.35 / dd;
        c.drawImage(tinted(composite(a, g), sgn < 0 ? "#ff4d6d" : "#4cc9f0"), 0, 0, px, px);
      }
    }
    c.globalAlpha = 1;
  }
  if (st.tool === "move") {
    const tf = currentTf();
    c.save();
    c.translate(px / 2 + tf.x * px, px / 2 + tf.y * px); c.rotate(tf.r); c.scale(tf.s, tf.s);
    c.drawImage(composite(a, f), -px / 2, -px / 2, px, px);
    c.setLineDash([8, 6]); c.strokeStyle = "#ffd60a"; c.lineWidth = 2 / tf.s;
    c.strokeRect(-px / 2, -px / 2, px, px);
    c.restore();
    return;
  }
  for (const layer of a.layers) {
    if (layer.visible === false) continue;
    let img = cellCanvas(f, layer.id);
    if (layer.id === st.layer && st.live) {
      const t = mk(); const tc = t.getContext("2d");
      tc.drawImage(img, 0, 0); drawOp(tc, st.live);
      img = t;
    }
    c.globalAlpha = layer.opacity ?? 1;
    c.drawImage(img, 0, 0, px, px);
  }
  c.globalAlpha = 1;
}

function stagePoint(e) {
  const r = stage().getBoundingClientRect();
  return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))];
}
const r4 = (v) => Math.round(v * 10000) / 10000;

function commitOp(op) {
  pushUndo();
  const f = curFrame();
  (f.cells[st.layer] ||= []).push(op);
  dirty(f, st.layer);
  if (op.c && op.brush !== "eraser") addRecent(op.c);
  save(); renderStage(); renderTimeline();
}

function onDown(e) {
  if (st.playing) return;
  stage().setPointerCapture(e.pointerId);
  const [x, y] = stagePoint(e);
  const base = { c: color(), a: st.alpha, s: st.size };
  if (st.tool === "brush" || st.tool === "eraser") {
    st.sp = [x, y];
    st.live = { t: "stroke", brush: st.tool === "eraser" ? "eraser" : st.brush, ...base, p: [r4(x), r4(y)], seed: Math.floor(Math.random() * 1e9) };
  } else if (["line", "rect", "ellipse"].includes(st.tool)) {
    st.live = { t: st.tool, ...base, fill: st.shapeFill && st.tool !== "line", p: [x, y, x, y] };
  } else if (st.tool === "fill") {
    commitOp({ t: "fill", c: color(), a: st.alpha, p: [x, y] });
  } else if (st.tool === "picker") {
    const img = composite(cur(), curFrame()).getContext("2d").getImageData(Math.min(RES - 1, x * RES) | 0, Math.min(RES - 1, y * RES) | 0, 1, 1).data;
    if (img[3] > 10) {
      setColor("#" + [img[0], img[1], img[2]].map(v => v.toString(16).padStart(2, "0")).join(""));
      setTool("brush");
    }
  } else if (st.tool === "move") {
    pushUndo();
    const f = curFrame();
    f.tf = { ...currentTf() };
    st.dragging = { x, y, tf: { ...f.tf } };
    renderTimeline();
  }
  renderStage();
}

function onMove(e) {
  const [x, y] = stagePoint(e);
  if (st.dragging) {
    const f = curFrame();
    f.tf.x = st.dragging.tf.x + (x - st.dragging.x);
    f.tf.y = st.dragging.tf.y + (y - st.dragging.y);
    renderStage();
    return;
  }
  if (!st.live) return;
  if (st.live.t === "stroke") {
    // Stabilizer: each new point only moves part of the way toward the finger
    const k = 1 - st.smoothing * 0.85;
    st.sp = [st.sp[0] + (x - st.sp[0]) * k, st.sp[1] + (y - st.sp[1]) * k];
    st.live.p.push(r4(st.sp[0]), r4(st.sp[1]));
  } else { st.live.p[2] = x; st.live.p[3] = y; }
  renderStage();
}

function onUp() {
  if (st.dragging) { st.dragging = null; save(); renderTimeline(); renderOpts(); return; }
  if (!st.live) return;
  const op = st.live;
  st.live = null;
  if (op.t !== "stroke") {
    if (Math.hypot(op.p[2] - op.p[0], op.p[3] - op.p[1]) < 0.005) { renderStage(); return; }
    op.p = op.p.map(r4);
  }
  commitOp(op);
}

// ---------- panels ----------

function setTool(t) {
  st.tool = t;
  document.querySelectorAll("#stTools [data-tool]").forEach(b => b.classList.toggle("on", b.dataset.tool === t));
  renderOpts(); renderStage();
}

function rangeField(label, min, max, value, fmt, onInput) {
  const v = el("b", { textContent: fmt(value) });
  const input = el("input", { type: "range", min, max, value });
  input.addEventListener("input", () => { v.textContent = fmt(+input.value); onInput(+input.value); });
  return el("div", { className: "st-field" }, el("span", {}, label, v), input);
}

function renderOpts() {
  const box = $("stOpts");
  box.replaceChildren(el("h3", { textContent: TOOLS.find(t => t[0] === st.tool)[2] }));
  const t = st.tool;
  if (t === "brush") {
    const chips = el("div", { className: "st-chips" });
    for (const [id, name] of BRUSHES) {
      const b = el("button", { type: "button", textContent: name, className: st.brush === id ? "on" : "" });
      b.addEventListener("click", () => { st.brush = id; renderOpts(); });
      chips.append(b);
    }
    box.append(chips);
  }
  if (["brush", "eraser", "line", "rect", "ellipse"].includes(t)) {
    box.append(rangeField("Size", 2, 200, Math.round(st.size * 1000), v => `${v}`, v => { st.size = v / 1000; }));
  }
  if (t !== "eraser" && t !== "picker" && t !== "move") {
    box.append(rangeField("Opacity", 5, 100, Math.round(st.alpha * 100), v => `${v}%`, v => { st.alpha = v / 100; }));
  }
  if (t === "brush" || t === "eraser") {
    box.append(rangeField("Smoothing", 0, 100, Math.round(st.smoothing * 100), v => `${v}%`, v => { st.smoothing = v / 100; }));
  }
  if (t === "rect" || t === "ellipse") {
    const b = el("button", { type: "button", textContent: st.shapeFill ? "Filled" : "Outline", className: st.shapeFill ? "on" : "" });
    b.addEventListener("click", () => { st.shapeFill = !st.shapeFill; renderOpts(); });
    box.append(el("div", { className: "st-row" }, b));
  }
  if (t === "fill") box.append(el("p", { className: "st-note", textContent: "Tap an area of the current layer to fill it." }));
  if (t === "picker") box.append(el("p", { className: "st-note", textContent: "Tap the drawing to pick up a color." }));
  if (t === "move") {
    const f = curFrame(), tf = currentTf();
    box.append(el("p", { className: "st-note", textContent: "Drag the drawing to set a motion keyframe (◆) on this frame. Frames between keyframes move smoothly." }));
    const edit = (fn) => { if (!f.tf) { pushUndo(); f.tf = { ...tf }; } fn(f.tf); save(); renderStage(); renderTimeline(); };
    box.append(rangeField("Scale", 10, 400, Math.round(tf.s * 100), v => `${v}%`, v => edit(o => { o.s = v / 100; })));
    box.append(rangeField("Rotate", -180, 180, Math.round(tf.r * 180 / Math.PI), v => `${v}°`, v => edit(o => { o.r = v * Math.PI / 180; })));
    const reset = el("button", { type: "button", textContent: "Reset position" });
    reset.addEventListener("click", () => { pushUndo(); f.tf = { ...ID_TF }; save(); refresh(); });
    const remove = el("button", { type: "button", className: "st-danger", textContent: "Remove keyframe", disabled: !f.tf });
    remove.addEventListener("click", () => { pushUndo(); f.tf = null; save(); refresh(); });
    box.append(el("div", { className: "st-row" }, reset, remove));
  }
}

function setColor(hex) {
  [st.h, st.s, st.l] = hexToHsl(hex);
  renderColor();
}

function addRecent(hex) {
  recent = [hex, ...recent.filter(c => c !== hex)].slice(0, 10);
  store("recentColors", JSON.stringify(recent));
  renderRecent();
}

function renderRecent() {
  const box = $("stRecent");
  box.replaceChildren(...recent.map(c => {
    const b = el("button", { type: "button", title: c });
    b.style.background = c;
    b.addEventListener("click", () => setColor(c));
    return b;
  }));
}

function renderColor() {
  const hex = color();
  $("stNow").style.background = hex;
  if (document.activeElement !== $("stHex")) $("stHex").value = hex;
  $("stH").value = st.h; $("stS").value = st.s; $("stL").value = st.l;
  $("stHv").textContent = `${st.h}°`; $("stSv").textContent = `${st.s}%`; $("stLv").textContent = `${st.l}%`;
  $("stH").style.background = "linear-gradient(90deg," + [0, 60, 120, 180, 240, 300, 360].map(h => hslToHex(h, st.s || 100, st.l === 0 || st.l === 100 ? 50 : st.l)).join(",") + ")";
  $("stS").style.background = `linear-gradient(90deg,${hslToHex(st.h, 0, st.l)},${hslToHex(st.h, 100, st.l)})`;
  $("stL").style.background = `linear-gradient(90deg,#000,${hslToHex(st.h, st.s, 50)},#fff)`;
}

function renderTimeline() {
  const a = cur(), box = $("stGrid");
  const table = el("table");
  const head = el("tr");
  head.append(el("th", { textContent: "Frames" }));
  a.frames.forEach((f, k) => {
    const cv = mk(116);
    cv.getContext("2d").drawImage(composite(a, f), 0, 0, 116, 116);
    const cell = el("div", { className: "st-thumb" + (k === st.frame ? " on" : "") }, cv,
      el("small", { textContent: `${k + 1} · ${f.dur}ms` }), el("b", { textContent: f.tf ? "◆" : "" }));
    cell.addEventListener("click", () => { stopPlay(); st.frame = k; refresh(); });
    head.append(el("td", {}, cell));
  });
  table.append(head);
  for (const layer of [...a.layers].reverse()) {
    const row = el("tr");
    const th = el("th", { textContent: `${layer.visible === false ? "🚫 " : ""}${layer.name}`, className: layer.id === st.layer ? "on" : "" });
    th.addEventListener("click", () => { st.layer = layer.id; refresh(); });
    row.append(th);
    a.frames.forEach((f, k) => {
      const full = (f.cells[layer.id] || []).length > 0;
      const c = el("div", { className: "st-cell" + (full ? " full" : "") + (k === st.frame && layer.id === st.layer ? " on" : k === st.frame ? " col" : "") });
      c.addEventListener("click", () => { stopPlay(); st.frame = k; st.layer = layer.id; refresh(); });
      row.append(el("td", {}, c));
    });
    table.append(row);
  }
  box.replaceChildren(table);
  box.querySelector(".st-thumb.on")?.scrollIntoView({ inline: "nearest", block: "nearest" });
  const total = duration(a), start = frameStarts(a)[st.frame];
  if (!st.playing) {
    $("stTime").textContent = `Frame ${st.frame + 1} of ${a.frames.length} · ${(total / 1000).toFixed(2)} s`;
    $("stScrub").value = Math.round(start / total * 1000);
  }
  $("stDur").value = String(curFrame().dur);
  $("stSmooth").checked = !!a.smooth;
}

function renderLayers() {
  const a = cur(), layer = a.layers.find(l => l.id === st.layer);
  $("stLayerName").value = layer.name;
  $("stLayerVis").textContent = layer.visible === false ? "🚫 Hidden" : "👁 Shown";
  $("stLayerOp").value = Math.round((layer.opacity ?? 1) * 100);
  $("stLayerOpV").textContent = `${Math.round((layer.opacity ?? 1) * 100)}%`;
  $("stDelLayer").disabled = a.layers.length < 2;
}

function renderTrigger() {
  const a = cur(), tr = a.trigger;
  $("stWords").value = tr.words || "";
  const sel = signalSelect(tr.signal, (g) => { setSignal({ anim: a }, g); renderTrigger(); }, a.name);
  sel.id = "stSignal";
  $("stSignal").replaceWith(sel);
  $("stStyle").value = tr.style || "hand";
  $("stRepeat").value = String(tr.repeat || 1);
  $("stTrigSize").value = Math.round((tr.size || 1) * 100);
  $("stSizeV").textContent = `${Math.round((tr.size || 1) * 100)}%`;
  $("stSound").value = tr.sound || "none";
}

function renderAnimList() {
  const sel = $("stAnim");
  sel.replaceChildren(...anims.map((a, k) => new Option(a.name || `Animation ${k + 1}`, k)));
  sel.value = st.anim;
}

function renderBook() {
  const mine = $("stBookMine"), built = $("stBookBuiltin");
  mine.replaceChildren(...anims.map((a, k) => {
    const words = el("input", { type: "text", value: a.trigger.words || "", placeholder: "Words that cast it" });
    words.addEventListener("input", () => { a.trigger.words = words.value; save(); });
    const edit = el("button", { type: "button", textContent: "✏️ Edit" });
    edit.addEventListener("click", () => { st.anim = k; st.frame = 0; fixSelection(); setTab("draw"); refresh(); });
    return el("div", { className: "st-spell" },
      el("header", {}, el("strong", { textContent: a.name }), edit),
      el("p", { textContent: `${STYLES[a.trigger.style] || STYLES.hand} · ${a.frames.length} frames` }),
      words,
      el("div", { className: "st-row" }, el("label", {}, "Hand signal "), signalSelect(a.trigger.signal, (g) => { setSignal({ anim: a }, g); renderBook(); }, a.name)));
  }));
  built.replaceChildren(...builtins.map(b => {
    const words = el("input", { type: "text", value: builtinWords(b.name) });
    words.addEventListener("input", () => { book[b.name] = { ...(book[b.name] || {}), words: words.value }; saveBook(); });
    const resetWords = el("button", { type: "button", textContent: "Reset words" });
    resetWords.addEventListener("click", () => { if (book[b.name]) delete book[b.name].words; saveBook(); renderBook(); });
    const name = el("strong", { textContent: b.name });
    name.style.color = b.color;
    return el("div", { className: "st-spell" },
      el("header", {}, name, resetWords),
      el("p", { textContent: b.desc }),
      words,
      el("div", { className: "st-row" }, el("label", {}, "Hand signal "), signalSelect(book[b.name]?.signal, (g) => { setSignal({ builtin: b.name }, g); renderBook(); }, b.name)));
  }));
}

function setTab(tab) {
  st.tab = tab;
  document.querySelectorAll("#studio [data-tab]").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("stDraw").hidden = tab !== "draw";
  $("stBook").hidden = tab !== "book";
  if (tab === "book") { stopPlay(); renderBook(); }
  else renderStage();
}

function refresh() {
  fixSelection();
  renderAnimList(); renderTimeline(); renderLayers(); renderTrigger(); renderOpts(); renderStage(); updateUndoButtons();
  if (st.tab === "book") renderBook();
}

function startPlay() {
  st.playing = true;
  st.playStart = performance.now() - frameStarts(cur())[st.frame] / st.speed;
  $("stPlay").textContent = "⏸ Pause";
  const tick = () => { if (!st.playing || root.hidden) return; renderStage(); requestAnimationFrame(tick); };
  tick();
}
function stopPlay() {
  if (!st.playing) return;
  // Stop on the frame that was showing
  const t = (performance.now() - st.playStart) * st.speed;
  st.frame = sample(cur(), t, st.loop).k;
  st.playing = false;
  $("stPlay").textContent = "▶ Play";
  renderTimeline(); renderStage();
}

function editAnim(fn) { pushUndo(); fn(cur()); save(); refresh(); }

function wire() {
  // Tools
  const tools = $("stTools");
  for (const [id, icon, name] of TOOLS) {
    const b = el("button", { type: "button", textContent: icon, title: name, className: id === st.tool ? "on" : "" });
    b.dataset.tool = id;
    b.setAttribute("aria-label", name);
    b.addEventListener("click", () => setTool(id));
    tools.append(b);
  }
  tools.append(el("span", { className: "st-sep" }));
  const undo = el("button", { type: "button", id: "stUndo", textContent: "↶", title: "Undo" });
  const redo = el("button", { type: "button", id: "stRedo", textContent: "↷", title: "Redo" });
  undo.addEventListener("click", () => swapHistory(undoStack, redoStack));
  redo.addEventListener("click", () => swapHistory(redoStack, undoStack));
  tools.append(undo, redo);

  sctx = stage().getContext("2d");
  stage().addEventListener("pointerdown", onDown);
  stage().addEventListener("pointermove", onMove);
  stage().addEventListener("pointerup", onUp);
  stage().addEventListener("pointercancel", onUp);
  addEventListener("resize", () => { if (!root.hidden) renderStage(); });

  // Color
  for (const [id, key] of [["stH", "h"], ["stS", "s"], ["stL", "l"]]) $(id).addEventListener("input", (e) => { st[key] = +e.target.value; renderColor(); });
  $("stHex").addEventListener("input", (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) setColor(e.target.value.toLowerCase()); });
  $("stPalette").append(...PALETTE.map(c => { const b = el("button", { type: "button", title: c }); b.style.background = c; b.addEventListener("click", () => setColor(c)); return b; }));

  // Header
  $("stDone").addEventListener("click", closeStudio);
  $("stAnim").addEventListener("change", (e) => { stopPlay(); st.anim = +e.target.value; st.frame = 0; st.layer = null; refresh(); });
  $("stNew").addEventListener("click", () => { stopPlay(); anims.push(newAnim(`Animation ${anims.length + 1}`)); st.anim = anims.length - 1; st.frame = 0; st.layer = null; save(); refresh(); });
  $("stCopy").addEventListener("click", () => {
    stopPlay();
    const copy = JSON.parse(JSON.stringify(cur()));
    copy.id = uid(); copy.name = `${cur().name} copy`; copy.trigger.signal = "";
    anims.push(copy); st.anim = anims.length - 1; save(); refresh();
  });
  $("stDelete").addEventListener("click", (e) => {
    const b = e.currentTarget;
    // Ask on the button itself, since the app can't show confirm dialogs
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap again to delete"; setTimeout(() => { b.dataset.armed = ""; b.textContent = "Delete"; }, 2500); return; }
    b.dataset.armed = ""; b.textContent = "Delete";
    stopPlay();
    anims.splice(st.anim, 1);
    if (!anims.length) anims.push(newAnim("Animation 1"));
    st.anim = Math.max(0, st.anim - 1); st.frame = 0; st.layer = null;
    undoStack.length = 0; redoStack.length = 0;
    save(); refresh();
  });
  document.querySelectorAll("#studio [data-tab]").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

  // Transport
  const go = (k) => { stopPlay(); st.frame = Math.max(0, Math.min(cur().frames.length - 1, k)); refresh(); };
  $("stFirst").addEventListener("click", () => go(0));
  $("stPrev").addEventListener("click", () => go(st.frame - 1));
  $("stNext").addEventListener("click", () => go(st.frame + 1));
  $("stLast").addEventListener("click", () => go(cur().frames.length - 1));
  $("stPlay").addEventListener("click", () => (st.playing ? stopPlay() : startPlay()));
  $("stScrub").addEventListener("input", (e) => {
    stopPlay();
    st.frame = sample(cur(), +e.target.value / 1000 * duration(cur()) - 0.01, false).k;
    renderTimeline(); renderStage(); renderOpts();
  });
  $("stSpeed").addEventListener("change", (e) => { const was = st.playing; stopPlay(); st.speed = +e.target.value; if (was) startPlay(); });
  $("stLoop").addEventListener("change", (e) => { st.loop = e.target.checked; });
  $("stSmooth").addEventListener("change", (e) => { editAnim(a => { a.smooth = e.target.checked; }); });
  $("stOnion").addEventListener("change", (e) => { st.onion = e.target.checked; renderStage(); });
  $("stOnionN").addEventListener("change", (e) => { st.onionN = +e.target.value; renderStage(); });
  $("stBg").addEventListener("change", (e) => { st.bg = e.target.value; renderStage(); });
  $("stDur").append(...DURATIONS.map(d => new Option(d >= 1000 ? `${d / 1000} s` : `${d} ms`, d)));
  $("stDur").addEventListener("change", (e) => editAnim(() => { curFrame().dur = +e.target.value; }));

  // Frames
  const blankCells = () => Object.fromEntries(cur().layers.map(l => [l.id, []]));
  $("stAddFrame").addEventListener("click", () => editAnim(a => { a.frames.splice(st.frame + 1, 0, { dur: curFrame().dur, cells: blankCells(), tf: null }); st.frame++; }));
  $("stDupFrame").addEventListener("click", () => editAnim(a => {
    const f = curFrame();
    a.frames.splice(st.frame + 1, 0, { dur: f.dur, cells: JSON.parse(JSON.stringify(f.cells)), tf: null });
    st.frame++;
  }));
  $("stMoveL").addEventListener("click", () => { if (st.frame > 0) editAnim(a => { const [f] = a.frames.splice(st.frame, 1); a.frames.splice(--st.frame, 0, f); }); });
  $("stMoveR").addEventListener("click", () => { if (st.frame < cur().frames.length - 1) editAnim(a => { const [f] = a.frames.splice(st.frame, 1); a.frames.splice(++st.frame, 0, f); }); });
  $("stDelFrame").addEventListener("click", () => editAnim(a => {
    if (a.frames.length > 1) a.frames.splice(st.frame, 1);
    else { a.frames[0].cells = blankCells(); a.frames[0].tf = null; }
  }));

  // Layers
  $("stLayerName").addEventListener("input", (e) => { cur().layers.find(l => l.id === st.layer).name = e.target.value; save(); renderTimeline(); });
  $("stLayerVis").addEventListener("click", () => { const l = cur().layers.find(x => x.id === st.layer); l.visible = l.visible === false; dirtyComposites(cur()); save(); refresh(); });
  $("stLayerOp").addEventListener("input", (e) => {
    cur().layers.find(l => l.id === st.layer).opacity = +e.target.value / 100;
    $("stLayerOpV").textContent = `${e.target.value}%`;
    dirtyComposites(cur()); renderStage();
  });
  $("stLayerOp").addEventListener("change", () => { save(); renderTimeline(); });
  $("stAddLayer").addEventListener("click", () => editAnim(a => {
    const idx = a.layers.findIndex(l => l.id === st.layer);
    const l = newLayer(`Layer ${a.layers.length + 1}`);
    a.layers.splice(idx + 1, 0, l);
    st.layer = l.id;
  }));
  const moveLayer = (dir) => editAnim(a => {
    const i = a.layers.findIndex(l => l.id === st.layer), j = i + dir;
    if (j < 0 || j >= a.layers.length) return;
    [a.layers[i], a.layers[j]] = [a.layers[j], a.layers[i]];
    dirtyComposites(a);
  });
  $("stLayerUp").addEventListener("click", () => moveLayer(1));
  $("stLayerDown").addEventListener("click", () => moveLayer(-1));
  $("stDelLayer").addEventListener("click", () => editAnim(a => {
    if (a.layers.length < 2) return;
    a.layers = a.layers.filter(l => l.id !== st.layer);
    for (const f of a.frames) delete f.cells[st.layer];
    st.layer = null;
  }));

  // Trigger
  $("stStyle").append(...Object.entries(STYLES).map(([v, t]) => new Option(t, v)));
  $("stSound").append(...Object.entries(SOUNDS).map(([v, t]) => new Option(t, v)));
  $("stWords").addEventListener("input", (e) => { cur().trigger.words = e.target.value; save(); });
  $("stStyle").addEventListener("change", (e) => { cur().trigger.style = e.target.value; save(); });
  $("stRepeat").addEventListener("change", (e) => { cur().trigger.repeat = +e.target.value; save(); });
  $("stTrigSize").addEventListener("input", (e) => { cur().trigger.size = +e.target.value / 100; $("stSizeV").textContent = `${e.target.value}%`; save(); });
  $("stSound").addEventListener("change", (e) => { cur().trigger.sound = e.target.value; save(); playSound(e.target.value); });
  $("stTestSound").addEventListener("click", () => playSound(cur().trigger.sound));
}

let onCloseFn = () => {};

export function initStudio(opts) {
  store = opts.store; builtins = opts.builtins; playSound = opts.playSound; onCloseFn = opts.onClose || onCloseFn;
  root = opts.root;
  load();
  document.head.append(el("style", { textContent: CSS }));
  root.innerHTML = HTML;
  wire();
  setColor("#ff006e");
  renderRecent();
}

export function openStudio() {
  root.hidden = false;
  st.layer = null;
  refresh();
  requestAnimationFrame(renderStage);
}

function closeStudio() {
  stopPlay();
  root.hidden = true;
  onCloseFn();
}

/* Ragdoll Lab — core: view, math helpers, world state and the Verlet solver. */
'use strict';

// ---------- canvas & view ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let dpr = 1, scale = 1, W = 1000, H = 600, GROUND = 560;
const resizeHooks = [];

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = window.innerWidth, ch = window.innerHeight;
  cvs.width = Math.round(cw * dpr);
  cvs.height = Math.round(ch * dpr);
  cvs.style.width = cw + 'px';
  cvs.style.height = ch + 'px';
  H = 600;
  scale = ch / H;
  W = cw / scale;
  GROUND = H - 40;
  for (const f of resizeHooks) f();
}
window.addEventListener('resize', resize);

// ---------- constants & helpers ----------
const STEP = 1 / 60;
const ITER = 12;
const GRAVITY = 1400;
const MAX_V = 48;          // px per step
const HIT_THRESHOLD = 11;  // velocity change (px/step) before impact damage
const HIT_SCALE = 2.5;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pick = a => a[(Math.random() * a.length) | 0];

function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgb(c, k = 1) { return `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function closestOnSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1);
  return [x1 + dx * t, y1 + dy * t, t];
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
  const den = rX * sY - rY * sX; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / den, u = ((cx - ax) * rY - (cy - ay) * rX) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

// closest points between segments p1-q1 and p2-q2 -> [s, t, dist]
function segSegClosest(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x, d1y = q1y - p1y, d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
  let s, t;
  const c = d1x * rx + d1y * ry, b = d1x * d2x + d1y * d2y, den = a * e - b * b;
  s = den > 1e-9 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / (e || 1);
  if (t < 0) { t = 0; s = clamp(-c / (a || 1), 0, 1); }
  else if (t > 1) { t = 1; s = clamp((b - c) / (a || 1), 0, 1); }
  const dx = p1x + d1x * s - (p2x + d2x * t), dy = p1y + d1y * s - (p2y + d2y * t);
  return [s, t, Math.hypot(dx, dy)];
}

// ---------- world state ----------
let particles = [], constraints = [], hinges = [], bodies = [], walls = [];
let paused = false, slow = false, gravityOn = true, shake = 0, simTime = 0;
let dirty = false;
let drag = null;

class Particle {
  constructor(x, y, r, mass, body) {
    this.x = this.px = this.lx = x; this.y = this.py = this.ly = y;
    this.r = r; this.im = mass > 0 ? 1 / mass : 0;
    this.body = body; this.pinned = false;
    this.ovx = 0; this.ovy = 0;
    this.dmg = 0; this.gore = 0; this.bleed = 0; this.stump = 0;
    this.ground = false; this.floor = false; this.removed = false;
    this.bounce = 0; this.fric = 1;
  }
  get w() { return this.pinned ? 0 : this.im; }
  get vx() { return this.x - this.px; }
  get vy() { return this.y - this.py; }
  push(ix, iy) { if (!this.pinned) { this.px -= ix; this.py -= iy; } }
}

class Constraint {
  constructor(a, b, o = {}) {
    this.a = a; this.b = b;
    this.len = o.len != null ? o.len : Math.hypot(b.x - a.x, b.y - a.y);
    this.stiff = o.stiff != null ? o.stiff : 1;
    this.min = !!o.min;           // only pushes apart (joint limit)
    this.brk = o.brk || 0;        // tears when stretched beyond len*brk
    this.cut = !!o.cut;           // blades can sever it
    this.bone = !!o.bone;         // part of the visible skeleton
    this.cr = o.cr || 0;          // capsule radius for collisions
    this.kind = o.kind || '';
    this.body = o.body || a.body;
    this.muscle = false;
    this.broken = false;
  }
}

// keeps joint a-b-c bent to one side only (knees, elbows)
class Hinge {
  constructor(a, b, c, sign) { this.a = a; this.b = b; this.c = c; this.sign = sign; this.body = b.body; }
}

function addBody(b) {
  bodies.push(b);
  for (const p of b.particles) particles.push(p);
  for (const c of b.constraints) constraints.push(c);
  if (b.hinges) for (const h of b.hinges) hinges.push(h);
  return b;
}

function removeBody(b) {
  if (b.removed) return;
  b.removed = true;
  for (const p of b.particles) p.removed = true;
  for (const c of b.constraints) c.broken = true;
  if (drag && drag.p.body === b) drag = null;
  dirty = true;
}

// delete a single particle (gibbing) and everything attached to it
function removeParticle(p) {
  p.removed = true;
  for (const c of constraints) if (c.a === p || c.b === p) c.broken = true;
  if (drag && drag.p === p) drag = null;
  dirty = true;
}

function cleanup() {
  if (!dirty) return;
  particles = particles.filter(p => !p.removed);
  constraints = constraints.filter(c => !c.broken && !c.a.removed && !c.b.removed);
  hinges = hinges.filter(h => !h.a.removed && !h.b.removed && !h.c.removed && !h.dead);
  bodies = bodies.filter(b => !b.removed);
  for (const b of bodies) {
    b.particles = b.particles.filter(p => !p.removed);
    b.constraints = b.constraints.filter(c => !c.broken);
  }
  dirty = false;
}

function rigid(body, stiff = 1) {
  const ps = body.particles;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) body.constraints.push(new Constraint(ps[i], ps[j], { stiff }));
}

// ---------- spatial hash ----------
const hash = new Map();
const CELL = 48;
const hkey = (cx, cy) => ((cx + 512) << 12) | (cy + 1024);
function buildHash() {
  hash.clear();
  for (const p of particles) {
    const k = hkey(Math.floor(p.x / CELL), Math.floor(p.y / CELL));
    let a = hash.get(k); if (!a) { a = []; hash.set(k, a); } a.push(p);
  }
}
function queryRect(x1, y1, x2, y2, fn) {
  const cx1 = Math.floor(x1 / CELL), cy1 = Math.floor(y1 / CELL), cx2 = Math.floor(x2 / CELL), cy2 = Math.floor(y2 / CELL);
  for (let cx = cx1; cx <= cx2; cx++) for (let cy = cy1; cy <= cy2; cy++) {
    const a = hash.get(hkey(cx, cy)); if (a) for (const p of a) fn(p);
  }
}

// ---------- solver ----------
function collidePairs(friction) {
  for (const p of particles) {
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const a = hash.get(hkey(cx + ox, cy + oy)); if (!a) continue;
      for (const q of a) {
        if (q === p || q.body === p.body || q.removed || q.ghost || p.ghost) continue;
        if (q.x < p.x || (q.x === p.x && q.y < p.y)) continue; // each pair once
        const dx = q.x - p.x, dy = q.y - p.y, rr = p.r + q.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), wp = p.w, wq = q.w, sw = wp + wq; if (!sw) continue;
        const o = (rr - d) / d;
        p.x -= dx * o * wp / sw; p.y -= dy * o * wp / sw;
        q.x += dx * o * wq / sw; q.y += dy * o * wq / sw;
        if (friction) {
          // damp relative sliding along the contact
          const nx = dx / d, ny = dy / d, tx = -ny, ty = nx;
          const rv = (q.vx - p.vx) * tx + (q.vy - p.vy) * ty;
          const f = rv * 0.12 * Math.min(p.fric, q.fric);
          p.px -= tx * f * wp / sw; p.py -= ty * f * wp / sw;
          q.px += tx * f * wq / sw; q.py += ty * f * wq / sw;
        }
      }
    }
  }
}

// particles against the capsule-shaped bones of other bodies (solid limbs)
function collideCapsules() {
  for (const c of constraints) {
    if (!c.cr || c.broken) continue;
    const a = c.a, b = c.b, R = c.cr + 24;
    queryRect(Math.min(a.x, b.x) - R, Math.min(a.y, b.y) - R, Math.max(a.x, b.x) + R, Math.max(a.y, b.y) + R, q => {
      if (q.body === c.body || q.removed || q.ghost) return;
      const [cx, cy, t] = closestOnSeg(q.x, q.y, a.x, a.y, b.x, b.y);
      if (t <= 0.02 || t >= 0.98) return; // endpoints are handled by particle pairs
      const dx = q.x - cx, dy = q.y - cy, rr = q.r + c.cr, d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) return;
      const d = Math.sqrt(d2), o = (rr - d) / d;
      const ws = a.w * (1 - t) + b.w * t, wq = q.w, sw = ws + wq; if (!sw) return;
      q.x += dx * o * wq / sw; q.y += dy * o * wq / sw;
      const k = o * ws / sw;
      a.x -= dx * k * (1 - t) * (a.w ? 1 : 0); a.y -= dy * k * (1 - t) * (a.w ? 1 : 0);
      b.x -= dx * k * t * (b.w ? 1 : 0); b.y -= dy * k * t * (b.w ? 1 : 0);
    });
  }
}

function solveConstraints() {
  for (const c of constraints) {
    if (c.broken || (c.muscle && !c.body.awake)) continue;
    const a = c.a, b = c.b, dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    if (c.min && d >= c.len) continue;
    const wa = a.w, wb = b.w, sw = wa + wb; if (!sw) continue;
    const k = (d - c.len) / d * c.stiff / sw;
    a.x += dx * k * wa; a.y += dy * k * wa;
    b.x -= dx * k * wb; b.y -= dy * k * wb;
  }
}

function solveHinges() {
  for (const h of hinges) {
    const a = h.a, b = h.b, c = h.c;
    const ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    const cross = ux * vy - uy * vx;
    if (cross * h.sign >= 0) continue;
    // bent the wrong way: pull the middle joint back onto the a-c line
    const [px, py] = closestOnSeg(b.x, b.y, a.x, a.y, c.x, c.y);
    const ex = (px - b.x) * 0.6, ey = (py - b.y) * 0.6;
    if (b.w) { b.x += ex; b.y += ey; }
    if (a.w) { a.x -= ex * 0.3; a.y -= ey * 0.3; }
    if (c.w) { c.x -= ex * 0.3; c.y -= ey * 0.3; }
  }
}

const WALL_T = 5;
function bounds(p) {
  if (p.y + p.r > GROUND) { p.y = GROUND - p.r; p.ground = p.floor = true; }
  if (p.x - p.r < 0) { p.x = p.r; p.ground = true; }
  if (p.x + p.r > W) { p.x = W - p.r; p.ground = true; }
  if (p.y < -1500) p.y = -1500;
  for (const w of walls) {
    const [cx, cy] = closestOnSeg(p.x, p.y, w.x1, w.y1, w.x2, w.y2);
    const dx = p.x - cx, dy = p.y - cy, rr = p.r + WALL_T, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-6;
      p.x = cx + dx / d * rr; p.y = cy + dy / d * rr; p.ground = true;
    }
  }
}

const postStepHooks = [];

function step(dt) {
  simTime += dt;
  const g = gravityOn ? GRAVITY * dt * dt : 0;
  for (const b of bodies) if (!b.removed) b.update(dt);
  cleanup();

  for (const p of particles) {
    p.lx = p.x; p.ly = p.y;
    if (p.pinned) { p.px = p.x; p.py = p.y; p.ovx = p.ovy = 0; continue; }
    let vx = (p.x - p.px) * 0.996, vy = (p.y - p.py) * 0.996 + g * (p.grav != null ? p.grav : 1);
    const v = Math.hypot(vx, vy); if (v > MAX_V) { vx *= MAX_V / v; vy *= MAX_V / v; }
    p.px = p.x; p.py = p.y; p.x += vx; p.y += vy; p.ovx = vx; p.ovy = vy; p.ground = p.floor = false;
    for (const w of walls) { // no tunnelling through drawn walls
      const t = segIntersect(p.px, p.py, p.x, p.y, w.x1, w.y1, w.x2, w.y2);
      if (t !== null) { p.x = p.px + (p.x - p.px) * t * 0.5; p.y = p.py + (p.y - p.py) * t * 0.5; }
    }
  }

  if (drag) {
    const p = drag.p;
    if (p.body.static) {
      const dx = drag.x - drag.ax, dy = drag.y - drag.ay;
      for (const q of p.body.particles) { q.x += dx; q.y += dy; q.px = q.x; q.py = q.y; }
      drag.ax = drag.x; drag.ay = drag.y;
    } else if (p.pinned) { p.x = p.px = drag.x; p.y = p.py = drag.y; }
    else { p.x += (drag.x - p.x) * 0.35; p.y += (drag.y - p.y) * 0.35; }
  }

  buildHash();
  for (let i = 0; i < ITER; i++) {
    solveConstraints();
    solveHinges();
    if (i % 3 === 0) { collidePairs(i === 0); collideCapsules(); }
    for (const p of particles) bounds(p);
  }

  // floor & wall friction, bouncy things
  for (const p of particles) if (p.ground && !p.pinned) {
    const vx = p.x - p.px;
    if (p.bounce && p.floor && p.ovy > 2) { p.py = p.y + p.ovy * p.bounce; p.px += vx * 0.03; continue; }
    if (Math.abs(vx) < 0.6 * p.fric) p.px = p.x; else p.px += vx * 0.22 * p.fric;
    p.py += (p.y - p.py) * 0.05;
  }

  // stretched joints tear apart
  for (const c of constraints) {
    if (c.broken || !c.brk) continue;
    const d = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y);
    if (d > c.len * c.brk) breakConstraint(c);
  }

  // impact damage
  for (const p of particles) {
    if (p.pinned || (drag && drag.p === p) || p.body.static) continue;
    const dv = Math.hypot((p.x - p.px) - p.ovx, (p.y - p.py) - p.ovy);
    if (dv > HIT_THRESHOLD) p.body.hit(p, (dv - HIT_THRESHOLD) * HIT_SCALE, 'impact');
  }
  cleanup();
  for (const f of postStepHooks) f(dt, g);
  shake *= 0.88;
}

function breakConstraint(c) {
  if (c.broken) return;
  c.broken = true; dirty = true;
  if (c.body.onBreak) c.body.onBreak(c);
}

function nearest(x, y, maxD = 34, filter) {
  let best = null, bd = Infinity;
  for (const p of particles) {
    if (filter && !filter(p)) continue;
    const d = Math.hypot(p.x - x, p.y - y) - p.r;
    if (d < bd) { bd = d; best = p; }
  }
  return bd <= maxD ? best : null;
}

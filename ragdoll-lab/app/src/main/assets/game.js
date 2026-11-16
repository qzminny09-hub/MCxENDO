/* Ragdoll Lab — a small Verlet-physics ragdoll sandbox. */
'use strict';

// ---------- canvas & view ----------
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
let dpr = 1, scale = 1, W = 1000, H = 600, GROUND = 560;

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
}
window.addEventListener('resize', resize);
resize();

// ---------- constants ----------
const STEP = 1 / 60;
const ITER = 10;
const GRAVITY = 1400;
const MAX_V = 45;          // px per step
const HIT_THRESHOLD = 11;  // velocity change (px/step) before damage
const HIT_SCALE = 2.5;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------- world state ----------
let particles = [], constraints = [], bodies = [], walls = [];
let blood = [], decals = [], fx = [];
let paused = false, slow = false, gravityOn = true, shake = 0;
let dirty = false; // constraints / particles need filtering

class Particle {
  constructor(x, y, r, mass, body) {
    this.x = this.px = x; this.y = this.py = y;
    this.r = r; this.im = mass > 0 ? 1 / mass : 0;
    this.body = body; this.pinned = false;
    this.ovx = 0; this.ovy = 0; this.dmg = 0; this.bleed = 0; this.stump = false;
    this.ground = false; this.removed = false;
  }
  get w() { return this.pinned ? 0 : this.im; }
}

class Constraint {
  constructor(a, b, o = {}) {
    this.a = a; this.b = b;
    this.len = o.len != null ? o.len : Math.hypot(b.x - a.x, b.y - a.y);
    this.stiff = o.stiff != null ? o.stiff : 1;
    this.min = !!o.min;           // only pushes apart (joint limit)
    this.brk = o.brk || 0;        // break when stretched beyond len*brk
    this.cut = !!o.cut;           // knife can sever it
    this.bone = !!o.bone;         // part of the visible skeleton
    this.kind = o.kind || '';
    this.body = a.body;
    this.muscle = false;
    this.broken = false;
  }
}

function addBody(b) {
  bodies.push(b);
  for (const p of b.particles) particles.push(p);
  for (const c of b.constraints) constraints.push(c);
  return b;
}

function removeBody(b) {
  b.removed = true;
  for (const p of b.particles) p.removed = true;
  for (const c of b.constraints) c.broken = true;
  if (drag && drag.p.body === b) drag = null;
  dirty = true;
}

function cleanup() {
  if (!dirty) return;
  particles = particles.filter(p => !p.removed);
  constraints = constraints.filter(c => !c.broken);
  bodies = bodies.filter(b => !b.removed);
  for (const b of bodies) b.constraints = b.constraints.filter(c => !c.broken);
  dirty = false;
}

// ---------- colors ----------
function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function rgb(c, k = 1) { return `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const BRUISE = hex('#5a1f2a');
const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a23', '#ffdbb8'].map(hex);
const SHIRTS = ['#3d7bd9', '#d94848', '#3fa45b', '#e0a43a', '#8a5bd1', '#e8e8e8', '#2c9aa0', '#d4618f'].map(hex);
const PANTS = ['#2f3d5c', '#3b3b3b', '#5a4632', '#2f4f3a', '#6b6f78'].map(hex);
const pick = a => a[(Math.random() * a.length) | 0];

// ---------- bodies ----------
class Human {
  constructor(x, y) {
    this.type = 'human';
    this.health = 100; this.alive = true; this.stun = 0; this.canStand = true;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.skin = pick(SKINS); this.shirt = pick(SHIRTS); this.pants = pick(PANTS);
    const P = (dx, dy, r, m) => new Particle(x + dx, y + dy, r, m, this);
    // y is the feet position; build upward
    const s = this.parts = {
      head: P(0, -162, 14, 1.2),
      chest: P(0, -128, 12, 1.6),
      belly: P(0, -102, 11, 1.5),
      pelvis: P(0, -78, 11, 1.5),
      lElbow: P(-3, -104, 6, 0.6), lHand: P(-3, -80, 6, 0.5),
      rElbow: P(3, -104, 6, 0.6), rHand: P(3, -80, 6, 0.5),
      lKnee: P(-4, -42, 7, 0.9), lFoot: P(-4, -7, 7, 1.0),
      rKnee: P(4, -42, 7, 0.9), rFoot: P(4, -7, 7, 1.0),
    };
    this.particles = Object.values(s);
    const C = (a, b, o) => { const c = new Constraint(s[a], s[b], o); this.constraints.push(c); return c; };
    this.constraints = [];
    const bone = (a, b, kind, brk = 2.0) => C(a, b, { bone: true, cut: true, brk, kind });
    this.bones = {
      neck: bone('head', 'chest', 'neck', 2.2),
      upper: bone('chest', 'belly', 'torso', 3),
      lower: bone('belly', 'pelvis', 'torso', 3),
      lUpperArm: bone('chest', 'lElbow', 'arm'), lForearm: bone('lElbow', 'lHand', 'arm'),
      rUpperArm: bone('chest', 'rElbow', 'arm'), rForearm: bone('rElbow', 'rHand', 'arm'),
      lThigh: bone('pelvis', 'lKnee', 'leg'), lShin: bone('lKnee', 'lFoot', 'leg'),
      rThigh: bone('pelvis', 'rKnee', 'leg'), rShin: bone('rKnee', 'rFoot', 'leg'),
    };
    // stiffeners & joint limits (hidden)
    C('head', 'belly', { stiff: 0.6 });
    C('chest', 'pelvis', { stiff: 0.9 });
    C('head', 'pelvis', { stiff: 0.15, min: true });
    C('chest', 'lHand', { min: true, len: 22 });
    C('chest', 'rHand', { min: true, len: 22 });
    C('pelvis', 'lFoot', { min: true, len: 40 });
    C('pelvis', 'rFoot', { min: true, len: 40 });
    C('belly', 'lKnee', { min: true, len: 40 });
    C('belly', 'rKnee', { min: true, len: 40 });
    C('lKnee', 'rKnee', { min: true, len: 8, stiff: 0.3 });
    // muscles: only active while the ragdoll is conscious, they keep it upright
    const M = (a, b, k) => { const c = C(a, b, { min: true, stiff: k }); c.len *= 0.99; c.muscle = true; };
    M('pelvis', 'lFoot', 0.5); M('pelvis', 'rFoot', 0.5);
    M('chest', 'lKnee', 0.4); M('chest', 'rKnee', 0.4);
    M('head', 'pelvis', 0.5);
  }

  hit(p, amt) {
    if (amt <= 0) return;
    p.dmg = Math.min(100, p.dmg + amt);
    if (!this.alive) return;
    const mult = p === this.parts.head ? 2 : p === this.parts.chest ? 1.3 : 1;
    this.health -= amt * mult * 0.5;
    this.stun = Math.max(this.stun, Math.min(3, amt * 0.025));
    if (amt > 14) spray(p.x, p.y, Math.min(14, amt / 4), 2 + amt / 12);
    if (this.health <= 0) this.die();
  }

  die() { if (this.alive) { this.alive = false; this.health = 0; } }

  heal() {
    this.health = 100; this.stun = 0;
    for (const p of this.particles) { p.dmg = 0; p.bleed = 0; }
    this.refreshTopology();
    if (this.connected(this.parts.head, this.parts.pelvis)) this.alive = true;
  }

  // union-find over intact bones
  roots() {
    const parent = new Map(this.particles.map(p => [p, p]));
    const find = p => { while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); } return p; };
    for (const c of this.constraints) if (c.bone && !c.broken) parent.set(find(c.a), find(c.b));
    return find;
  }
  connected(a, b) { const f = this.roots(); return f(a) === f(b); }

  refreshTopology() {
    const f = this.roots();
    for (const c of this.constraints) if (!c.bone && !c.broken && f(c.a) !== f(c.b)) { c.broken = true; dirty = true; }
    const s = this.parts;
    const core = f(s.pelvis);
    this.canStand = f(s.head) === core && f(s.lFoot) === core && f(s.rFoot) === core;
    if (f(s.head) !== f(s.chest) || f(s.chest) !== core) this.die();
  }

  onBreak(c) {
    c.a.stump = c.b.stump = true;
    c.a.bleed = c.b.bleed = 6;
    spray((c.a.x + c.b.x) / 2, (c.a.y + c.b.y) / 2, 18, 4);
    if (this.alive) { this.health -= 25; this.stun = 2; if (this.health <= 0) this.die(); }
    this.refreshTopology();
  }

  get awake() { return this.alive && this.stun <= 0 && this.canStand; }

  update(dt) {
    let bleeding = 0;
    for (const p of this.particles) {
      if (p.bleed > 0) {
        p.bleed -= dt; bleeding++;
        if (Math.random() < 0.5) spray(p.x, p.y, 1, 1.5);
      }
    }
    if (!this.alive) return;
    this.health -= bleeding * 2 * dt;
    if (this.health <= 0) { this.die(); return; }
    if (this.stun > 0) { this.stun -= dt; return; }
    if (!this.canStand) return;
    // muscles: pull head up, push feet down -> tries to stand upright
    const s = this.parts, k = 0.25 + 0.45 * clamp(this.health / 100, 0, 1);
    s.head.y -= 0.55 * k; s.chest.y -= 0.3 * k;
    s.lFoot.y += 0.35 * k; s.rFoot.y += 0.35 * k;
    // keep stance roughly under the hips
    // feet act as anchors: keep them ~18px apart without moving their centre
    const spread = (s.rFoot.x - s.lFoot.x) - 18;
    s.lFoot.x += spread * 0.06 * k; s.rFoot.x -= spread * 0.06 * k;
    const fx = (s.lFoot.x + s.rFoot.x) / 2;
    s.pelvis.x += (fx - s.pelvis.x) * 0.06 * k;
    s.head.x += (fx - s.head.x) * 0.06 * k;
    s.chest.x += (fx - s.chest.x) * 0.04 * k;
  }

  draw() {
    const s = this.parts, b = this.bones;
    const col = (base, a, c2, shade = 1) => rgb(mix(base, BRUISE, clamp((a.dmg + c2.dmg) / 160, 0, 0.8)), shade);
    const bone = (c, base, w, shade = 1) => {
      if (c.broken) return;
      line(c.a.x, c.a.y, c.b.x, c.b.y, w, col(base, c.a, c.b, shade));
    };
    const foot = (knee, f, shade) => {
      const ux = f.x - knee.x, uy = f.y - knee.y, l = Math.hypot(ux, uy) || 1;
      const nx = -uy / l * this.facing, ny = ux / l * this.facing;
      line(f.x, f.y, f.x - nx * 9, f.y - ny * 9, 9, rgb([40, 40, 44], shade));
    };
    // back limbs (darker)
    bone(b.lThigh, this.pants, 13, 0.78); bone(b.lShin, this.pants, 11, 0.78); foot(s.lKnee, s.lFoot, 0.78);
    bone(b.lUpperArm, this.shirt, 10, 0.75); bone(b.lForearm, this.skin, 8, 0.75);
    // torso
    bone(b.neck, this.skin, 9);
    bone(b.lower, this.pants, 22);
    bone(b.upper, this.shirt, 24);
    // front limbs
    bone(b.rThigh, this.pants, 13); bone(b.rShin, this.pants, 11); foot(s.rKnee, s.rFoot, 1);
    bone(b.rUpperArm, this.shirt, 10); bone(b.rForearm, this.skin, 8);
    // head
    const h = s.head;
    ctx.fillStyle = rgb(mix(this.skin, BRUISE, clamp(h.dmg / 90, 0, 0.8)));
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    // face
    let ux = h.x - s.chest.x, uy = h.y - s.chest.y; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
    const rx = -uy * this.facing, ry = ux * this.facing;
    const ex = h.x + rx * 6 + ux * 3, ey = h.y + ry * 6 + uy * 3;
    ctx.strokeStyle = '#1b1b1b'; ctx.fillStyle = '#1b1b1b'; ctx.lineWidth = 1.8;
    if (!this.alive) {
      ctx.beginPath(); ctx.moveTo(ex - 2.5, ey - 2.5); ctx.lineTo(ex + 2.5, ey + 2.5);
      ctx.moveTo(ex + 2.5, ey - 2.5); ctx.lineTo(ex - 2.5, ey + 2.5); ctx.stroke();
    } else if (this.stun > 0) {
      ctx.beginPath(); ctx.moveTo(ex - rx * 3, ey - ry * 3); ctx.lineTo(ex + rx * 2, ey + ry * 2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    }
    // stumps
    ctx.fillStyle = '#8a0f14';
    for (const p of this.particles) if (p.stump) { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
    // health bar while hurt
    if (this.alive && this.health < 100) {
      const w = 30, x = h.x - w / 2, y = h.y - 26;
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(x, y, w, 4);
      ctx.fillStyle = this.health > 50 ? '#4cc36a' : this.health > 25 ? '#e0b43a' : '#e04848';
      ctx.fillRect(x, y, w * clamp(this.health / 100, 0, 1), 4);
    }
  }
}

class Crate {
  constructor(x, y) {
    this.type = 'crate'; this.particles = []; this.constraints = [];
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++)
      this.particles.push(new Particle(x + i * 20, y + j * 20, 10, 0.8, this));
    rigid(this);
  }
  hit() {}
  update() {}
  draw() {
    const g = this.particles, c = g[4];
    const a = Math.atan2(g[5].y - g[3].y, g[5].x - g[3].x);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
    ctx.fillStyle = '#b07a40'; ctx.fillRect(-30, -30, 60, 60);
    ctx.strokeStyle = '#7a4f24'; ctx.lineWidth = 4; ctx.strokeRect(-28, -28, 56, 56);
    ctx.beginPath(); ctx.moveTo(-26, -26); ctx.lineTo(26, 26); ctx.moveTo(26, -26); ctx.lineTo(-26, 26); ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
}

class Plank {
  constructor(x, y) {
    this.type = 'plank'; this.particles = []; this.constraints = [];
    const n = 11;
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x + (i - (n - 1) / 2) * 15, y, 8, 0.5, this));
    rigid(this);
  }
  hit() {}
  update() {}
  draw() {
    const a = this.particles[0], b = this.particles[this.particles.length - 1];
    line(a.x, a.y, b.x, b.y, 17, '#6b4524');
    line(a.x, a.y, b.x, b.y, 12, '#a8763f');
  }
}

class Ball {
  constructor(x, y) {
    this.type = 'ball'; this.angle = 0;
    this.particles = [new Particle(x, y, 22, 3, this)];
    this.constraints = [];
  }
  hit() {}
  update() { const p = this.particles[0]; this.angle += (p.x - p.px) / p.r; }
  draw() {
    const p = this.particles[0];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.angle);
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d64545'; ctx.beginPath(); ctx.arc(0, 0, p.r, -0.5, 0.5); ctx.lineTo(0, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, p.r, Math.PI - 0.5, Math.PI + 0.5); ctx.lineTo(0, 0); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

class Bomb {
  constructor(x, y) {
    this.type = 'bomb'; this.fuse = 3;
    this.particles = [new Particle(x, y, 14, 2, this)];
    this.constraints = [];
  }
  hit() {}
  update(dt) {
    this.fuse -= dt;
    if (this.fuse <= 0) { const p = this.particles[0]; removeBody(this); explode(p.x, p.y, 1); }
  }
  draw() {
    const p = this.particles[0];
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#444'; ctx.fillRect(p.x - 4, p.y - p.r - 5, 8, 6);
    const blink = (this.fuse * (this.fuse < 1 ? 8 : 3)) % 1 < 0.5;
    ctx.fillStyle = blink ? '#ff3b3b' : '#5a1010';
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(this.fuse), p.x, p.y - p.r - 9);
  }
}

class Barrel {
  constructor(x, y) {
    this.type = 'barrel'; this.armed = 0.4; // short grace period after spawning
    this.particles = [new Particle(x, y - 12, 16, 1.5, this), new Particle(x, y + 12, 16, 1.5, this)];
    this.constraints = [];
    rigid(this);
  }
  hit(p, amt) { if (this.armed <= 0 && amt > 6) this.blow(); }
  blow() {
    if (this.removed) return;
    const a = this.particles[0], b = this.particles[1];
    removeBody(this);
    explode((a.x + b.x) / 2, (a.y + b.y) / 2, 1.4);
  }
  update(dt) { this.armed -= dt; }
  draw() {
    const a = this.particles[0], b = this.particles[1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(ang);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(-16, -27, 32, 54);
    ctx.fillStyle = '#922b21'; ctx.fillRect(-16, -14, 32, 4); ctx.fillRect(-16, 10, 32, 4);
    ctx.fillStyle = '#f5d142'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(7, 5); ctx.lineTo(-7, 5); ctx.fill();
    ctx.restore();
  }
}

function rigid(body) {
  const ps = body.particles;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) body.constraints.push(new Constraint(ps[i], ps[j], { stiff: 1 }));
}

const SPAWN = { human: Human, crate: Crate, ball: Ball, plank: Plank, bomb: Bomb, barrel: Barrel };

function spawn(kind, x, y) {
  if (kind === 'human') y = Math.min(y + 80, GROUND - 1);
  else y = Math.min(y, GROUND - 32);
  x = clamp(x, 40, W - 40);
  return addBody(new SPAWN[kind](x, y));
}

// ---------- effects ----------
function spray(x, y, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(0.3, 1) * speed;
    blood.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.4, r: rand(1.2, 3) });
  }
  if (blood.length > 1500) blood.splice(0, blood.length - 1500);
}

function addDecal(x, y, r, color) {
  decals.push({ x, y, r, color });
  if (decals.length > 2500) decals.splice(0, decals.length - 2500);
}

function explode(x, y, power) {
  const R = 170 * power;
  for (const p of particles) {
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d > R) continue;
    const f = 1 - d / R, nx = dx / (d || 1), ny = dy / (d || 1) - 0.25;
    const imp = 28 * power * f * (p.im > 0 ? Math.min(1.5, p.im * 1.2) : 0);
    if (!p.pinned) { p.px -= nx * imp; p.py -= ny * imp; }
    const body = p.body;
    if (body.type === 'human') {
      body.hit(p, 70 * power * f);
      if (f > 0.55 && Math.random() < f * 0.5) {
        const cand = body.constraints.filter(c => c.bone && !c.broken && (c.a === p || c.b === p) && c.kind !== 'torso');
        if (cand.length) breakConstraint(pick(cand));
      }
    } else if (body.type === 'barrel') {
      body.armed = Math.min(body.armed, 0); setTimeout(() => body.blow(), 60 + Math.random() * 120);
    }
  }
  fx.push({ kind: 'flash', x, y, t: 0, R });
  for (let i = 0; i < 14; i++) fx.push({ kind: 'smoke', x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-1.5, 1.5), vy: rand(-2.5, -0.5), t: 0, life: rand(0.8, 1.6), r: rand(10, 24) });
  if (y > GROUND - 40) addDecal(x, GROUND + 1, 22 * power, 'rgba(20,18,16,.4)');
  shake = Math.max(shake, 14 * power);
}

function breakConstraint(c) {
  if (c.broken) return;
  c.broken = true; dirty = true;
  if (drag && drag.p.body === c.body) { /* keep dragging the piece you hold */ }
  if (c.body.onBreak) c.body.onBreak(c);
}

// ---------- physics ----------
let hash = new Map();
const CELL = 48;
function buildHash() {
  hash.clear();
  for (const p of particles) {
    const k = ((Math.floor(p.x / CELL) + 512) << 12) | (Math.floor(p.y / CELL) + 1024);
    let a = hash.get(k); if (!a) { a = []; hash.set(k, a); } a.push(p);
  }
}

function collidePairs() {
  for (const p of particles) {
    const cx = Math.floor(p.x / CELL) + 512, cy = Math.floor(p.y / CELL) + 1024;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const a = hash.get(((cx + ox) << 12) | (cy + oy)); if (!a) continue;
      for (const q of a) {
        if (q === p || q.body === p.body || q.removed) continue;
        // handle each pair once
        if (q.x < p.x || (q.x === p.x && q.y < p.y)) continue;
        const dx = q.x - p.x, dy = q.y - p.y, rr = p.r + q.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        const d = Math.sqrt(d2), wp = p.w, wq = q.w, sw = wp + wq; if (!sw) continue;
        const o = (rr - d) / d;
        p.x -= dx * o * wp / sw; p.y -= dy * o * wp / sw;
        q.x += dx * o * wq / sw; q.y += dy * o * wq / sw;
      }
    }
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

function closestOnSeg(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - w.x1) * dx + (py - w.y1) * dy) / l2, 0, 1);
  return [w.x1 + dx * t, w.y1 + dy * t];
}

function segIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const rX = bx - ax, rY = by - ay, sX = dx - cx, sY = dy - cy;
  const den = rX * sY - rY * sX; if (Math.abs(den) < 1e-9) return null;
  const t = ((cx - ax) * sY - (cy - ay) * sX) / den, u = ((cx - ax) * rY - (cy - ay) * rX) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

const WALL_T = 5;
function bounds(p) {
  if (p.y + p.r > GROUND) { p.y = GROUND - p.r; p.ground = true; }
  if (p.x - p.r < 0) { p.x = p.r; p.ground = true; }
  if (p.x + p.r > W) { p.x = W - p.r; p.ground = true; }
  if (p.y < -1500) p.y = -1500;
  for (const w of walls) {
    const [cx, cy] = closestOnSeg(p.x, p.y, w);
    const dx = p.x - cx, dy = p.y - cy, rr = p.r + WALL_T, d2 = dx * dx + dy * dy;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 1e-6;
      p.x = cx + dx / d * rr; p.y = cy + dy / d * rr; p.ground = true;
    }
  }
}

function step(dt) {
  const g = gravityOn ? GRAVITY * dt * dt : 0;
  for (const b of bodies) if (!b.removed) b.update(dt);
  cleanup();

  for (const p of particles) {
    if (p.pinned) { p.px = p.x; p.py = p.y; p.ovx = p.ovy = 0; continue; }
    let vx = (p.x - p.px) * 0.996, vy = (p.y - p.py) * 0.996 + g;
    const v = Math.hypot(vx, vy); if (v > MAX_V) { vx *= MAX_V / v; vy *= MAX_V / v; }
    p.px = p.x; p.py = p.y; p.x += vx; p.y += vy; p.ovx = vx; p.ovy = vy; p.ground = false;
    // stop fast particles tunnelling through drawn walls
    for (const w of walls) {
      const t = segIntersect(p.px, p.py, p.x, p.y, w.x1, w.y1, w.x2, w.y2);
      if (t !== null) { p.x = p.px + (p.x - p.px) * t * 0.5; p.y = p.py + (p.y - p.py) * t * 0.5; }
    }
  }

  if (drag) {
    const p = drag.p;
    if (p.pinned) { p.x = p.px = drag.x; p.y = p.py = drag.y; }
    else { p.x += (drag.x - p.x) * 0.35; p.y += (drag.y - p.y) * 0.35; }
  }

  buildHash();
  for (let i = 0; i < ITER; i++) {
    solveConstraints();
    if (i % 2 === 0) collidePairs();
    for (const p of particles) bounds(p);
  }

  // friction against floor/walls
  for (const p of particles) if (p.ground && !p.pinned) {
    const vx = p.x - p.px;
    if (Math.abs(vx) < 0.6) p.px = p.x; else p.px += vx * 0.22;   // static, then sliding friction
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
    if (p.pinned || (drag && drag.p === p)) continue;
    const dv = Math.hypot((p.x - p.px) - p.ovx, (p.y - p.py) - p.ovy);
    if (dv > HIT_THRESHOLD) p.body.hit(p, (dv - HIT_THRESHOLD) * HIT_SCALE);
  }
  cleanup();

  // blood droplets
  for (let i = blood.length - 1; i >= 0; i--) {
    const d = blood[i];
    d.vy += g; d.x += d.vx; d.y += d.vy;
    let stuck = d.y >= GROUND || d.x < 0 || d.x > W;
    if (!stuck) for (const w of walls) {
      const [cx, cy] = closestOnSeg(d.x, d.y, w);
      if ((d.x - cx) ** 2 + (d.y - cy) ** 2 < (WALL_T + 1) ** 2) { stuck = true; break; }
    }
    if (stuck) {
      addDecal(clamp(d.x, 0, W), Math.min(d.y, GROUND + 1), d.r * rand(1, 1.8), d.y >= GROUND ? '#7a0c12' : '#8a1018');
      blood.splice(i, 1);
    }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.kind === 'smoke') { f.x += f.vx; f.y += f.vy; f.vy *= 0.97; if (f.t > f.life) fx.splice(i, 1); }
    else if (f.t > 0.35) fx.splice(i, 1);
  }
  shake *= 0.88;
}

// ---------- drawing ----------
function line(x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function render() {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  // background
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a3340'); sky.addColorStop(1, '#3b4757');
  ctx.fillStyle = sky; ctx.fillRect(-50, -50, W + 100, H + 100);
  ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, GROUND); }
  for (let y = GROUND; y > 0; y -= 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.fillStyle = '#4b4f55'; ctx.fillRect(-50, GROUND, W + 100, H - GROUND + 50);
  ctx.fillStyle = '#5d6168'; ctx.fillRect(-50, GROUND, W + 100, 5);

  // walls
  for (const w of walls) { line(w.x1, w.y1, w.x2, w.y2, WALL_T * 2 + 2, '#23272d'); line(w.x1, w.y1, w.x2, w.y2, WALL_T * 2 - 2, '#8b929c'); }
  // decals
  for (const d of decals) { ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 1.6, d.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }

  for (const b of bodies) b.draw();

  // pins
  for (const p of particles) if (p.pinned) {
    ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // blood
  ctx.fillStyle = '#a0141c';
  for (const d of blood) { ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2); ctx.fill(); }
  // fx
  for (const f of fx) {
    if (f.kind === 'flash') {
      const k = f.t / 0.35;
      ctx.fillStyle = `rgba(255,${(200 - k * 120) | 0},80,${0.8 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (0.3 + k * 0.7), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = `rgba(60,60,60,${0.5 * (1 - f.t / f.life)})`;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + f.t), 0, Math.PI * 2); ctx.fill();
    }
  }
  // tool overlays
  if (drag) {
    ctx.setLineDash([4, 4]); line(drag.p.x, drag.p.y, drag.x, drag.y, 1.5, 'rgba(255,255,255,.7)'); ctx.setLineDash([]);
  }
  if (wallDraft) line(wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2, WALL_T * 2, 'rgba(180,190,200,.5)');
  if (cutTrail.length > 1) {
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(cutTrail[0].x, cutTrail[0].y); for (const c of cutTrail) ctx.lineTo(c.x, c.y); ctx.stroke();
  }
}

// ---------- input ----------
let tool = 'drag', item = 'human', drag = null, wallDraft = null, cutTrail = [], activePointer = null, lastCut = null;
const toWorld = e => ({ x: e.clientX / scale, y: e.clientY / scale });

function nearest(x, y, maxD = 34) {
  let best = null, bd = Infinity;
  for (const p of particles) {
    const d = Math.hypot(p.x - x, p.y - y) - p.r;
    if (d < bd) { bd = d; best = p; }
  }
  return bd <= maxD ? best : null;
}

cvs.addEventListener('pointerdown', e => {
  if (activePointer !== null) return;
  activePointer = e.pointerId; cvs.setPointerCapture(e.pointerId);
  const { x, y } = toWorld(e);
  switch (tool) {
    case 'drag': { const p = nearest(x, y); if (p) drag = { p, x, y }; break; }
    case 'spawn': spawn(item, x, y); break;
    case 'boom': explode(x, y, 1); break;
    case 'pin': { const p = nearest(x, y, 20); if (p) p.pinned = !p.pinned; break; }
    case 'wall': wallDraft = { x1: x, y1: y, x2: x, y2: y }; break;
    case 'cut': lastCut = { x, y }; cutTrail = [{ x, y }]; break;
    case 'heal': { const p = nearest(x, y); if (p && p.body.heal) { p.body.heal(); hint('Patched up!'); } break; }
    case 'erase': {
      const p = nearest(x, y, 12);
      if (p) { removeBody(p.body); break; }
      const i = walls.findIndex(w => { const [cx, cy] = closestOnSeg(x, y, w); return Math.hypot(x - cx, y - cy) < 20; });
      if (i >= 0) walls.splice(i, 1);
      break;
    }
  }
});

cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer) return;
  const { x, y } = toWorld(e);
  if (drag) { drag.x = x; drag.y = y; }
  if (wallDraft) { wallDraft.x2 = x; wallDraft.y2 = y; }
  if (tool === 'cut' && lastCut) {
    for (const c of constraints) {
      if (!c.cut || c.broken) continue;
      if (segIntersect(lastCut.x, lastCut.y, x, y, c.a.x, c.a.y, c.b.x, c.b.y) !== null) {
        breakConstraint(c); c.body.hit(c.a, 20);
      }
    }
    lastCut = { x, y }; cutTrail.push({ x, y }); if (cutTrail.length > 12) cutTrail.shift();
  }
});

function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  activePointer = null; drag = null; lastCut = null; cutTrail = [];
  if (wallDraft) {
    const w = wallDraft; wallDraft = null;
    if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) > 15) walls.push(w);
  }
}
cvs.addEventListener('pointerup', endPointer);
cvs.addEventListener('pointercancel', endPointer);

// ---------- UI ----------
const HINTS = {
  drag: 'Grab anything and fling it.',
  spawn: 'Tap the scene to spawn the selected item.',
  cut: 'Swipe across limbs to slice them.',
  boom: 'Tap anywhere to cause an explosion.',
  pin: 'Tap a body part to pin / unpin it in place.',
  wall: 'Drag to draw a solid wall or ramp.',
  heal: 'Tap a ragdoll to heal it.',
  erase: 'Tap an object or wall to delete it.',
};
let hintTimer = 0;
function hint(t) {
  const el = document.getElementById('hint'); el.textContent = t; el.style.opacity = 1;
  clearTimeout(hintTimer); hintTimer = setTimeout(() => (el.style.opacity = 0), 2500);
}

document.querySelectorAll('#tools button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#tools button').forEach(x => x.classList.toggle('on', x === b));
  tool = b.dataset.tool;
  document.getElementById('spawnbar').classList.toggle('hidden', tool !== 'spawn');
  hint(HINTS[tool]);
}));
document.querySelectorAll('#spawnbar button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#spawnbar button').forEach(x => x.classList.toggle('on', x === b));
  item = b.dataset.item;
}));
const toggle = (id, fn) => document.getElementById(id).addEventListener('click', e => { const on = fn(); e.currentTarget.classList.toggle('on', on); });
toggle('bPause', () => (paused = !paused));
toggle('bSlow', () => (slow = !slow));
toggle('bGrav', () => { gravityOn = !gravityOn; hint(gravityOn ? 'Gravity on' : 'Zero gravity!'); return !gravityOn; });
document.getElementById('bClean').addEventListener('click', () => { decals = []; blood = []; hint('Cleaned up the mess'); });
document.getElementById('bClear').addEventListener('click', () => {
  for (const b of bodies) removeBody(b); cleanup();
  walls = []; decals = []; blood = []; fx = []; drag = null;
  setup(); hint('Fresh lab');
});

// ---------- loop ----------
function setup() {
  spawn('human', W * 0.45, GROUND - 100);
  spawn('human', W * 0.6, GROUND - 100);
  spawn('crate', W * 0.78, GROUND - 31);
}

let last = performance.now(), acc = 0, slowTick = 0, fpsT = 0, frames = 0;
const statsEl = document.getElementById('stats');
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  if (!paused) {
    if (slow) { slowTick += dt * 60 * 0.3; if (slowTick >= 1) { slowTick -= 1; step(STEP); } }
    else {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 3) { step(STEP); acc -= STEP; n++; }
      if (n === 3) acc = 0;
    }
  }
  render();
  frames++; fpsT += dt;
  if (fpsT > 1) { statsEl.textContent = `${frames} fps · ${bodies.length} objects`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}

setup();
hint('Drag ragdolls around. Pick a tool on the left.');
requestAnimationFrame(frame);

// small hook for automated tests
window.__lab = { get bodies() { return bodies; }, spawn, explode, step, get particles() { return particles; } };

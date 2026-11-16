/* Ragdoll Lab — weapons, explosives and traps. Tap a weapon (Drag or Use tool) to fire it. */
'use strict';

// ---------- firearms ----------
const GUNS = {
  pistol:  { len: 26, mass: 0.8, cd: 0.22, dmg: 42, pellets: 1, spread: 0.01, recoil: 3, shell: true },
  rifle:   { len: 58, mass: 1.6, cd: 0.085, dmg: 30, pellets: 1, spread: 0.035, recoil: 1.8, auto: true, shell: true },
  shotgun: { len: 60, mass: 1.8, cd: 0.75, dmg: 17, pellets: 9, spread: 0.22, recoil: 8, shell: true },
  rpg:     { len: 66, mass: 2.2, cd: 1.1, recoil: 6, rocket: true },
};

class Gun extends Prop {
  constructor(x, y, kind, facing) {
    super();
    this.type = 'gun'; this.kind = kind; this.cfg = GUNS[kind]; this.cd = 0; this.firing = false; this.flash = 0;
    const L = this.cfg.len, m = this.cfg.mass / 3;
    this.particles = [-0.5, 0, 0.5].map(f => new Particle(x + f * L * facing, y, kind === 'pistol' ? 5 : 6, m, this));
    for (const p of this.particles) p.fric = 0.8;
    this.constraints = []; rigid(this);
  }
  get grip() { return this.particles[0]; }
  get muzzle() { return this.particles[this.particles.length - 1]; }
  dir() { const a = this.grip, b = this.muzzle, dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }

  activate() {
    if (this.cfg.auto) { this.firing = !this.firing; hint(this.firing ? 'Rifle: full auto ON' : 'Rifle: ceasefire'); }
    else if (this.cd <= 0) this.fire();
  }
  update(dt) {
    this.cd -= dt; this.flash -= dt;
    if (this.firing && this.cd <= 0) this.fire();
  }
  fire() {
    if (this.particles.length < 3) return;
    const c = this.cfg, [dx, dy] = this.dir(), m = this.muzzle, nx = -dy, ny = dx;
    const ox = m.x + dx * 8, oy = m.y + dy * 8;
    this.cd = c.cd; this.flash = 0.06;
    if (c.rocket) {
      addBody(new Rocket(ox + dx * 10, oy + dy * 10, dx, dy, this));
      smoke(this.grip.x - dx * 20, this.grip.y - dy * 20, 6, 14, 0.35);
    } else {
      for (let i = 0; i < c.pellets; i++) {
        const a = Math.atan2(dy, dx) + rand(-c.spread, c.spread);
        fireBullet(ox, oy, Math.cos(a), Math.sin(a), c.dmg * rand(0.85, 1.15), { ignore: this, pen: c.pellets > 1 ? 0 : 1 });
      }
      if (c.shell) fx.push({ kind: 'shell', x: this.particles[1].x, y: this.particles[1].y, vx: -dx * 1.5 + rand(-1, 1) - ny * 2, vy: -dy * 1.5 - 3, rot: 0, vr: rand(-0.5, 0.5), t: 0, life: 2.5 });
      smoke(ox, oy, 1, 7, 0.25);
    }
    fx.push({ kind: 'muzzle', x: ox, y: oy, ang: Math.atan2(dy, dx), t: 0, life: 0.05, s: c.rocket ? 1.6 : c.pellets > 1 ? 1.4 : 1 });
    light(ox, oy, 120, 0.06, '255,200,120');
    // recoil: kick back and up
    const r = c.recoil, up = this.muzzle.x > this.grip.x ? -1 : 1;
    this.grip.push(-dx * r, -dy * r); this.muzzle.push(-dx * r * 0.7 + nx * r * 0.5 * up, -dy * r * 0.7 + ny * r * 0.5 * up);
    shake = Math.max(shake, c.recoil * 0.5);
  }
  draw() {
    if (this.particles.length < 3) return;
    const g = this.grip, [dx, dy] = this.dir();
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(Math.atan2(dy, dx));
    if (dx < 0) ctx.scale(1, -1); // keep the gun upright
    const L = this.cfg.len, k = this.kind;
    ctx.lineJoin = 'round';
    const shape = (fill, path) => { ctx.beginPath(); path(); ctx.closePath(); ctx.fillStyle = OUTLINE; ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke(); ctx.fillStyle = fill; ctx.fill(); };
    if (k === 'pistol') {
      shape('#2c2f35', () => { ctx.moveTo(-4, 2); ctx.lineTo(3, 2); ctx.lineTo(1, 12); ctx.lineTo(-6, 12); });
      shape('#3b3f47', () => { ctx.rect(-6, -5, L + 8, 7); });
      ctx.strokeStyle = '#2c2f35'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(7, 3, 4, 0, Math.PI); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-5, -4.5, L + 6, 1.5);
    } else if (k === 'rifle') {
      shape('#4a3a2a', () => { ctx.moveTo(-18, -3); ctx.lineTo(-2, -3); ctx.lineTo(-2, 4); ctx.lineTo(-18, 8); });
      shape('#30343b', () => { ctx.rect(-2, -5, 36, 9); });
      shape('#22252a', () => { ctx.rect(34, -2.5, L - 30, 4); });
      shape('#26292e', () => { ctx.moveTo(14, 4); ctx.lineTo(22, 4); ctx.lineTo(25, 16); ctx.lineTo(17, 17); });
      shape('#26292e', () => { ctx.moveTo(2, 4); ctx.lineTo(8, 4); ctx.lineTo(5, 12); ctx.lineTo(0, 12); });
      ctx.fillStyle = '#1b1d21'; ctx.fillRect(8, -9, 12, 3);
      if (this.firing) { ctx.fillStyle = '#ff4a3a'; ctx.beginPath(); ctx.arc(-14, 1, 2, 0, TAU); ctx.fill(); }
    } else if (k === 'shotgun') {
      shape('#6b4423', () => { ctx.moveTo(-22, -3); ctx.lineTo(0, -3); ctx.lineTo(2, 4); ctx.lineTo(-22, 9); });
      shape('#30343b', () => { ctx.rect(0, -5, 18, 9); });
      shape('#22252a', () => { ctx.rect(18, -4, L - 14, 4); });
      shape('#8a5a2e', () => { ctx.rect(26, 0, 16, 5); });
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(18, -3.5, L - 14, 1.2);
    } else if (k === 'rpg') {
      shape('#4d5a35', () => { ctx.rect(-10, -6, L + 6, 12); });
      shape('#2b2f25', () => { ctx.moveTo(14, 6); ctx.lineTo(20, 6); ctx.lineTo(18, 16); ctx.lineTo(12, 16); });
      shape('#2b2f25', () => { ctx.rect(26, -12, 6, 6); });
      ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(-9, -5, L + 4, 2);
      ctx.fillStyle = '#1a1c18'; ctx.fillRect(L - 6, -5, 3, 10);
    }
    ctx.restore();
  }
}

class Rocket extends Prop {
  constructor(x, y, dx, dy, launcher) {
    super();
    this.type = 'rocket'; this.dx = dx; this.dy = dy; this.age = 0; this.launcher = launcher;
    const p = new Particle(x, y, 6, 1, this); p.grav = 0; p.px = x - dx * 18; p.py = y - dy * 18;
    this.particles = [p]; this.constraints = [];
  }
  update(dt) {
    const p = this.particles[0];
    this.age += dt;
    p.px = p.x - this.dx * 20; p.py = p.y - this.dy * 20; // constant thrust
    smoke(p.x - this.dx * 10, p.y - this.dy * 10, 1, 7, 0.35);
    if (Math.random() < 0.6) sparks(p.x - this.dx * 10, p.y - this.dy * 10, 1, 3, '#ffb347', -this.dx, -this.dy);
    let boom = this.age > 3 || (this.age > 0.05 && p.ground);
    if (!boom) for (const q of particles) {
      if (q.body === this || (q.body === this.launcher && this.age < 0.3) || q.ghost) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r + 2) { boom = true; break; }
    }
    if (!boom) for (const c of constraints) {
      if (!c.cr || c.broken) continue;
      const [cx, cy] = closestOnSeg(p.x, p.y, c.a.x, c.a.y, c.b.x, c.b.y);
      if (Math.hypot(cx - p.x, cy - p.y) < c.cr + p.r) { boom = true; break; }
    }
    if (boom) { removeBody(this); explode(p.x, p.y, 1.25, this); }
  }
  shot() { this.age = 99; return 'stop'; }
  draw() {
    const p = this.particles[0];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(this.dy, this.dx));
    ctx.fillStyle = `rgba(255,${(150 + Math.random() * 80) | 0},60,.9)`;
    ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(-24 - Math.random() * 10, 0); ctx.lineTo(-12, 4); ctx.fill();
    ctx.fillStyle = '#556040'; ctx.fillRect(-12, -3.5, 18, 7);
    ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(13, 0); ctx.lineTo(6, 3.5); ctx.fill();
    ctx.fillStyle = '#3b4430'; ctx.beginPath(); ctx.moveTo(-12, -3.5); ctx.lineTo(-15, -7); ctx.lineTo(-8, -3.5); ctx.moveTo(-12, 3.5); ctx.lineTo(-15, 7); ctx.lineTo(-8, 3.5); ctx.fill();
    ctx.restore();
  }
}

// ---------- melee ----------
class Sword extends Prop {
  constructor(x, y, facing) {
    super();
    this.type = 'sword'; this.spark = '#ffffff';
    const pts = [[-40, 5, 0.7], [-10, 4, 0.35], [40, 3, 0.25]];
    this.particles = pts.map(([dx, r, m]) => new Particle(x + dx * facing, y, r, m, this));
    this.constraints = []; rigid(this);
  }
  activate() { // swing!
    const [h, , t] = this.particles; if (!t) return;
    const dx = t.x - h.x, dy = t.y - h.y, l = Math.hypot(dx, dy) || 1;
    t.push(-dy / l * 26, dx / l * 26 - 6); this.particles[1].push(-dy / l * 10, dx / l * 10);
  }
  update() {
    if (this.particles.length < 3) return;
    const [h, m, t] = this.particles;
    const speed = (Math.hypot(t.vx, t.vy) + Math.hypot(m.vx, m.vy)) / 2;
    if (speed < 3.5) return;
    const dx = t.x - h.x, dy = t.y - h.y, l = Math.hypot(dx, dy) || 1;
    const gx = h.x + dx / l * 18, gy = h.y + dy / l * 18; // blade starts after the hilt
    for (const c of constraints) {
      if (!c.cut || c.broken || c.body === this) continue;
      const [, s, d] = segSegClosest(gx, gy, t.x, t.y, c.a.x, c.a.y, c.b.x, c.b.y);
      if (d > c.cr * 0.8) continue;
      if (c.nextCut > simTime) continue;
      c.nextCut = simTime + 0.15;
      const x = c.a.x + (c.b.x - c.a.x) * s, y = c.a.y + (c.b.y - c.a.y) * s;
      if (speed > 7 || (speed > 5 && Math.random() < 0.5)) {
        breakConstraint(c); c.body.hit(s < 0.5 ? c.a : c.b, 15, 'cut');
        spray(x, y, 18, 6, t.vx, t.vy, 1);
      } else {
        c.body.hit(s < 0.5 ? c.a : c.b, speed * 4, 'cut');
        c.body.addWound && c.body.addWound(c, s, 2.5);
        spray(x, y, 8, 4, t.vx, t.vy, 1);
      }
      this.bloody = Math.min(1, (this.bloody || 0) + 0.25);
    }
  }
  draw() {
    if (this.particles.length < 3) return;
    const [h, , t] = this.particles, dx = t.x - h.x, dy = t.y - h.y;
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(Math.atan2(dy, dx));
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(14, -4.5); ctx.lineTo(82, -2.5); ctx.lineTo(90, 0); ctx.lineTo(82, 2.5); ctx.lineTo(14, 4.5); ctx.closePath();
    ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.fillStyle = '#c9d1d9'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillRect(16, -1, 66, 1);
    if (this.bloody) { ctx.fillStyle = `rgba(140,10,18,${this.bloody * 0.8})`; ctx.fillRect(45, -3.5, 40, 7); }
    ctx.fillStyle = OUTLINE; ctx.fillRect(9, -10, 7, 20); ctx.fillRect(-4, -4, 15, 8);
    ctx.fillStyle = '#c9a13b'; ctx.fillRect(10, -9, 5, 18);
    ctx.fillStyle = '#4b2c1a'; ctx.fillRect(-3, -3, 13, 6);
    ctx.fillStyle = '#c9a13b'; ctx.beginPath(); ctx.arc(-5, 0, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---------- explosives ----------
class Explosive extends Prop {
  constructor(x, y, r, mass, fuse) {
    super();
    this.fuse = fuse; this.particles = [new Particle(x, y, r, mass, this)]; this.constraints = [];
  }
  activate() { this.detonate(); }
  shot() { this.detonate(); return 'stop'; }
  blast() { if (this.fuse > 0.1 || this.fuse == null) this.fuse = rand(0.05, 0.15); }
  update(dt) { if (this.fuse != null) { this.fuse -= dt; if (this.fuse <= 0) this.detonate(); } }
  detonate() {
    if (this.removed) return;
    const p = this.particles[0]; removeBody(this); this.boom(p.x, p.y);
  }
}

class Bomb extends Explosive {
  constructor(x, y) { super(x, y, 14, 2, 3); this.type = 'bomb'; }
  boom(x, y) { explode(x, y, 1.3, this); }
  draw() {
    const p = this.particles[0];
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#26282c'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(p.x - 4, p.y - 5, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#444'; ctx.fillRect(p.x - 4, p.y - p.r - 5, 8, 6);
    const blink = (this.fuse * (this.fuse < 1 ? 8 : 3)) % 1 < 0.5;
    ctx.fillStyle = blink ? '#ff3b3b' : '#5a1010'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(Math.max(0, Math.ceil(this.fuse)), p.x, p.y - p.r - 9);
  }
}

class Grenade extends Explosive {
  constructor(x, y) { super(x, y, 8, 1.2, 3); this.type = 'grenade'; this.particles[0].bounce = 0.35; this.rot = 0; }
  update(dt) { super.update(dt); const p = this.particles[0]; this.rot += (p.x - p.px) / p.r; }
  boom(x, y) {
    explode(x, y, 0.85, this);
    for (let i = 0; i < 22; i++) { // shrapnel
      const a = rand(0, TAU);
      fireBullet(x, y, Math.cos(a), Math.sin(a), 16, { range: 300, pen: 0, ignore: this, tracerW: 1, tracerLife: 0.05 });
    }
  }
  draw() {
    const p = this.particles[0];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(this.rot);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(0, 1, 9.5, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4e5d32'; ctx.beginPath(); ctx.ellipse(0, 1, 7.5, 9, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-7, 1); ctx.lineTo(7, 1); ctx.moveTo(0, -8); ctx.lineTo(0, 10); ctx.stroke();
    ctx.fillStyle = '#8a8f96'; ctx.fillRect(-3, -12, 6, 5);
    ctx.strokeStyle = '#c9ccd1'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(5, -11, 3, 0, TAU); ctx.stroke();
    ctx.restore();
    if ((this.fuse * 4) % 1 < 0.5) { ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(p.x, p.y - 16, 2, 0, TAU); ctx.fill(); }
  }
}

class Mine extends Explosive {
  constructor(x, y) { super(x, y, 9, 3, null); this.type = 'mine'; this.arm = 1.2; this.particles[0].fric = 2; }
  update(dt) {
    this.arm -= dt;
    if (this.fuse != null) { super.update(dt); return; }
    if (this.arm > 0) return;
    const p = this.particles[0];
    for (const q of particles) {
      if (q.body === this || q.body.static || q.ghost) continue;
      if (Math.hypot(q.x - p.x, q.y - p.y) < q.r + p.r + 6) { this.fuse = 0.12; break; }
    }
  }
  boom(x, y) { explode(x, y - 8, 1.2, this); }
  draw() {
    const p = this.particles[0];
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 15, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a4f45'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, 13, 6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5d6356'; ctx.beginPath(); ctx.ellipse(p.x, p.y - 1, 7, 3.5, 0, 0, TAU); ctx.fill();
    const on = this.arm <= 0 ? (simTime * 2) % 1 < 0.5 : true;
    ctx.fillStyle = this.arm > 0 ? '#46d36a' : on ? '#ff3b3b' : '#5a1010';
    ctx.beginPath(); ctx.arc(p.x, p.y - 3, 2, 0, TAU); ctx.fill();
  }
}

// ---------- static traps (drag them around, they don't fall) ----------
class Spikes extends Prop {
  constructor(x, y) {
    super();
    this.type = 'spikes'; this.static = true; this.impaled = [];
    y = Math.min(y, GROUND);
    this.particles = []; this.tips = [];
    for (let i = 0; i < 4; i++) { const p = new Particle(x - 33 + i * 22, y - 6, 7, 0, this); p.pinned = true; this.particles.push(p); }
    for (let i = 0; i < 6; i++) { const p = new Particle(x - 40 + i * 16, y - 34, 2, 0, this); p.pinned = true; p.ghost = true; this.particles.push(p); this.tips.push(p); }
    this.constraints = [];
  }
  onBreak() {}
  shot(b) { sparks(b.x, b.y, 5, 4, '#ffffff', -b.dx, -b.dy); return 'stop'; }
  update() {
    for (let i = this.impaled.length - 1; i >= 0; i--) {
      const m = this.impaled[i];
      if (m.c.broken || m.q.removed) { this.impaled.splice(i, 1); continue; }
      if (Math.hypot(m.q.x - m.tip.x, m.q.y - m.tip.y) > 30) { // ripped off
        m.c.broken = true; dirty = true; spray(m.q.x, m.q.y, 12, 4); this.impaled.splice(i, 1);
      } else if (Math.random() < 0.04) spray(m.tip.x, m.tip.y, 1, 1);
    }
    for (const tip of this.tips) {
      if (this.impaled.filter(m => m.tip === tip).length >= 2) continue;
      for (const q of particles) {
        if (q.body.type !== 'human' || this.impaled.some(m => m.q === q)) continue;
        const d = Math.hypot(q.x - tip.x, q.y - tip.y);
        if (d < q.r + 2 && (q.vy > 1.5 || d < q.r * 0.5)) {
          const c = new Constraint(tip, q, { len: 0, stiff: 0.35, body: this });
          this.constraints.push(c); constraints.push(c);
          this.impaled.push({ c, q, tip });
          q.body.hit(q, 30, 'stab'); q.gore = Math.min(1, q.gore + 0.5);
          const bone = q.body.boneAt && q.body.boneAt(q); if (bone) q.body.addWound(bone, bone.a === q ? 0.1 : 0.9, 3.5);
          spray(tip.x, tip.y, 16, 4, 0, -1, 1.4);
          this.bloody = Math.min(1, (this.bloody || 0) + 0.3);
          break;
        }
      }
    }
  }
  draw() {
    const base = this.particles.slice(0, 4), bx = (base[0].x + base[3].x) / 2, by = base[0].y + 6;
    for (const tip of this.tips) {
      ctx.beginPath(); ctx.moveTo(tip.x - 6, by - 6); ctx.lineTo(tip.x, tip.y - 2); ctx.lineTo(tip.x + 6, by - 6); ctx.closePath();
      ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
      const g = ctx.createLinearGradient(tip.x - 6, 0, tip.x + 6, 0); g.addColorStop(0, '#8d949c'); g.addColorStop(0.5, '#e3e7eb'); g.addColorStop(1, '#6b7178');
      ctx.fillStyle = g; ctx.fill();
      if (this.bloody) { ctx.fillStyle = `rgba(140,10,18,${this.bloody * 0.85})`; ctx.beginPath(); ctx.moveTo(tip.x - 3, tip.y + 12); ctx.lineTo(tip.x, tip.y - 1); ctx.lineTo(tip.x + 3, tip.y + 12); ctx.fill(); }
    }
    ctx.fillStyle = OUTLINE; ctx.fillRect(bx - 50, by - 9, 100, 11);
    ctx.fillStyle = '#5b6168'; ctx.fillRect(bx - 48, by - 7, 96, 7);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fillRect(bx - 48, by - 7, 96, 2);
  }
}

class Saw extends Prop {
  constructor(x, y) {
    super();
    this.type = 'saw'; this.static = true; this.rot = 0; this.R = 32; this.bloody = 0;
    const p = new Particle(x, Math.min(y, GROUND - 40), 4, 0, this); p.pinned = true; p.ghost = true;
    this.particles = [p]; this.constraints = [];
  }
  get c() { return this.particles[0]; }
  shot(b) { sparks(b.x, b.y, 6, 5, '#ffffff', -b.dx, -b.dy); return 'stop'; }
  update(dt) {
    this.rot += dt * 30; this.bloody = Math.max(0, this.bloody - dt * 0.02);
    const c = this.c, R = this.R;
    for (const q of particles) {
      if (q.body === this || q.body.static) continue;
      const dx = q.x - c.x, dy = q.y - c.y, d = Math.hypot(dx, dy), rr = R + q.r;
      if (d >= rr || d === 0) continue;
      const nx = dx / d, ny = dy / d;
      q.x = c.x + nx * rr; q.y = c.y + ny * rr;           // solid disc
      q.push(-ny * 2.2 + nx * 1, nx * 2.2 + ny * 1);      // fling along the spin
      if (q.body.type === 'human') {
        q.body.hit(q, 5, 'saw'); q.gore = Math.min(1, q.gore + 0.05); this.bloody = Math.min(1, this.bloody + 0.02);
        spray(q.x, q.y, 3, 5, -ny, nx, 1);
      } else if (Math.random() < 0.4) sparks(c.x + nx * R, c.y + ny * R, 2, 5, '#ffd890', -ny, nx);
    }
    for (const k of constraints) {
      if (!k.cut || k.broken) continue;
      const [cx, cy] = closestOnSeg(c.x, c.y, k.a.x, k.a.y, k.b.x, k.b.y);
      if (Math.hypot(cx - c.x, cy - c.y) < R + k.cr * 0.3 && Math.random() < 0.12) {
        breakConstraint(k); gib(cx, cy, 3, 0.8, ['meat', 'bone']); spray(cx, cy, 20, 6);
      }
    }
  }
  draw() {
    const c = this.c, R = this.R;
    line(c.x, c.y, c.x, GROUND, 9, OUTLINE); line(c.x, c.y, c.x, GROUND, 6, '#4a5059');
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(this.rot);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * TAU, a2 = (i + 0.5) / 24 * TAU;
      ctx.lineTo(Math.cos(a) * (R + 5), Math.sin(a) * (R + 5)); ctx.lineTo(Math.cos(a2) * (R - 2), Math.sin(a2) * (R - 2));
    }
    ctx.closePath(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.fillStyle = '#b9c0c8'; ctx.fill();
    if (this.bloody > 0.02) { ctx.fillStyle = `rgba(140,10,18,${this.bloody * 0.8})`; ctx.fill(); }
    ctx.fillStyle = '#8b939c'; ctx.beginPath(); ctx.arc(0, 0, R * 0.65, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * 0.45, 0.3, 2); ctx.stroke();
    ctx.fillStyle = '#3a3f46'; for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; ctx.beginPath(); ctx.arc(Math.cos(a) * 12, Math.sin(a) * 12, 3.5, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#23262b'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

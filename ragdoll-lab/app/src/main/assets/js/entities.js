/* Ragdoll Lab — ragdoll humans and physical props. */
'use strict';

const BRUISE = hex('#4f1a26');
const GORE = hex('#7a0a10');
const OUTLINE = 'rgba(16,12,14,.9)';
const SKINS = ['#f1c9a5', '#e0ac85', '#c68863', '#8d5a3b', '#5c3a23', '#ffdbb8'].map(hex);
const SHIRTS = ['#3d7bd9', '#d94848', '#3fa45b', '#e0a43a', '#8a5bd1', '#e8e8e8', '#2c9aa0', '#d4618f', '#40464f'].map(hex);
const PANTS = ['#2f3d5c', '#3b3b3b', '#5a4632', '#2f4f3a', '#6b6f78', '#1f2a44'].map(hex);
const HAIR = ['#2b1d14', '#5a3a1e', '#c9a25a', '#151515', '#8a3b1d', '#d9d4cc'];

function line(x1, y1, x2, y2, w, color, c = ctx) {
  c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}

// ======================================================================
class Human {
  constructor(x, y) {
    this.type = 'human';
    this.health = 100; this.alive = true; this.stun = 0; this.pain = 0; this.canStand = true;
    this.facing = Math.random() < 0.5 ? -1 : 1;
    this.skin = pick(SKINS); this.shirt = pick(SHIRTS); this.pants = pick(PANTS);
    this.hair = pick(HAIR); this.hairStyle = (Math.random() * 4) | 0;
    this.wounds = []; this.up = [0, -1];
    const P = (dx, dy, r, m) => new Particle(x + dx, y + dy, r, m, this);
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
    this.constraints = [];
    const C = (a, b, o) => { const c = new Constraint(s[a], s[b], o); this.constraints.push(c); return c; };
    const bone = (a, b, kind, cr, w, brk = 2.0) => { const c = C(a, b, { bone: true, cut: true, brk, kind, cr }); c.w = w; return c; };
    this.bones = {
      neck: bone('head', 'chest', 'neck', 4.5, 9, 2.2),
      upper: bone('chest', 'belly', 'torso', 12, 24, 3),
      lower: bone('belly', 'pelvis', 'torso', 11, 22, 3),
      lUpperArm: bone('chest', 'lElbow', 'arm', 5, 10), lForearm: bone('lElbow', 'lHand', 'arm', 4.5, 8),
      rUpperArm: bone('chest', 'rElbow', 'arm', 5, 10), rForearm: bone('rElbow', 'rHand', 'arm', 4.5, 8),
      lThigh: bone('pelvis', 'lKnee', 'leg', 6.5, 13), lShin: bone('lKnee', 'lFoot', 'leg', 5.5, 11),
      rThigh: bone('pelvis', 'rKnee', 'leg', 6.5, 13), rShin: bone('rKnee', 'rFoot', 'leg', 5.5, 11),
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
    // muscles: only active while conscious, they keep the ragdoll upright
    const M = (a, b, k) => { const c = C(a, b, { min: true, stiff: k }); c.len *= 0.99; c.muscle = true; };
    M('pelvis', 'lFoot', 0.5); M('pelvis', 'rFoot', 0.5);
    M('chest', 'lKnee', 0.4); M('chest', 'rKnee', 0.4);
    M('head', 'pelvis', 0.5);
    // knees bend backwards, elbows bend forwards
    const f = this.facing;
    this.hinges = [
      new Hinge(s.pelvis, s.lKnee, s.lFoot, f), new Hinge(s.pelvis, s.rKnee, s.rFoot, f),
      new Hinge(s.chest, s.lElbow, s.lHand, -f), new Hinge(s.chest, s.rElbow, s.rHand, -f),
    ];
  }

  get awake() { return this.alive && this.stun <= 0 && this.canStand; }

  // ---- damage ----
  hit(p, amt, kind) {
    if (amt <= 0 || p.removed) return;
    p.dmg = Math.min(120, p.dmg + amt);
    if (kind !== 'impact' || amt > 30) p.gore = Math.min(1, p.gore + amt / (kind === 'impact' ? 400 : 220));
    if (kind === 'impact' && p === this.parts.head && amt > 75) { this.gibPart(p); return; }
    if (!this.alive) return;
    const mult = p === this.parts.head ? 2.2 : p === this.parts.chest ? 1.3 : 1;
    this.health -= amt * mult * 0.5;
    this.pain = Math.min(2, this.pain + amt / 30);
    this.stun = Math.max(this.stun, Math.min(3, amt * 0.025));
    if (amt > 14) spray(p.x, p.y, Math.min(14, amt / 4), 2 + amt / 12);
    if (this.health <= 0) this.die();
  }

  die() { if (this.alive) { this.alive = false; this.health = 0; } }

  boneAt(p) { return Object.values(this.bones).find(c => !c.broken && (c.a === p || c.b === p)); }

  addWound(c, t, size = 2.6) {
    if (!c || c.broken) return;
    this.wounds.push({ c, t: clamp(t, 0.05, 0.95), side: rand(-0.5, 0.5), r: size, bleed: 14 });
    if (this.wounds.length > 40) this.wounds.shift();
  }

  blast(p, f, power, nx, ny) {
    if (p.removed) return;
    this.hit(p, 75 * power * f, 'blast');
    p.gore = Math.min(1, p.gore + f * 0.35);
    const s = this.parts;
    if (f > 0.75 && power >= 0.9 && Math.random() < 0.45 && p !== s.chest && p !== s.belly && p !== s.pelvis) { this.gibPart(p); return; }
    if (f > 0.5 && Math.random() < f * 0.55) {
      const cand = this.constraints.filter(c => c.bone && !c.broken && (c.a === p || c.b === p) && c.kind !== 'torso');
      if (cand.length) breakConstraint(pick(cand));
    }
  }

  shot(b) {
    const s = this.parts;
    const head = b.p === s.head || (b.c === this.bones.neck && b.t < 0.4);
    const dmg = b.dmg * (head ? 3 : 1);
    this.hit(b.p, dmg, 'shot');
    const c = b.c || this.boneAt(b.p);
    if (c) this.addWound(c, b.c ? b.t : (c.a === b.p ? 0.1 : 0.9), 2 + b.dmg / 25);
    // knock the limb along the bullet
    const imp = Math.min(9, b.dmg * 0.13);
    if (b.c) { b.c.a.push(b.dx * imp * (1 - b.t), b.dy * imp * (1 - b.t)); b.c.b.push(b.dx * imp * b.t, b.dy * imp * b.t); }
    else b.p.push(b.dx * imp, b.dy * imp);
    spray(b.x, b.y, 3, 2.5, -b.dx, -b.dy, 1.2);                   // entry
    spray(b.x, b.y, 8 + b.dmg / 4, 5 + b.dmg / 12, b.dx, b.dy, 0.7); // exit
    if (head && s.head.dmg > 150 && !s.head.removed) this.gibPart(s.head);
    else if (b.c && (b.c.kind === 'arm' || b.c.kind === 'leg') && Math.random() < b.dmg / 160) breakConstraint(b.c);
    return 'flesh';
  }

  // blow a body part apart
  gibPart(p) {
    if (p.removed) return;
    const s = this.parts, isHead = p === s.head;
    for (const c of this.constraints) if (c.bone && !c.broken && (c.a === p || c.b === p)) {
      const o = c.a === p ? c.b : c.a; o.stump = c.cr; o.bleed = 10; o.gore = 1;
    }
    gib(p.x, p.y, isHead ? 16 : 8, isHead ? 1.2 : 0.9, isHead ? ['meat', 'meat', 'bone', 'brain', 'skin'] : ['meat', 'meat', 'bone']);
    spray(p.x, p.y, isHead ? 45 : 22, 7);
    removeParticle(p);
    if (isHead) this.die();
    this.refreshTopology();
    if (this.alive) { this.health -= 35; this.stun = 2.5; if (this.health <= 0) this.die(); }
  }

  heal() {
    this.health = 100; this.stun = 0; this.pain = 0; this.wounds = [];
    for (const p of this.particles) { p.dmg = 0; p.bleed = 0; p.gore = 0; }
    this.refreshTopology();
    const s = this.parts;
    if (!s.head.removed && this.connected(s.head, s.pelvis)) this.alive = true;
  }

  roots() {
    const parent = new Map(this.particles.map(p => [p, p]));
    for (const p of Object.values(this.parts)) if (!parent.has(p)) parent.set(p, p);
    const find = p => { while (parent.get(p) !== p) { parent.set(p, parent.get(parent.get(p))); p = parent.get(p); } return p; };
    for (const c of this.constraints) if (c.bone && !c.broken) parent.set(find(c.a), find(c.b));
    return find;
  }
  connected(a, b) { const f = this.roots(); return f(a) === f(b); }

  refreshTopology() {
    const f = this.roots();
    for (const c of this.constraints) if (!c.bone && !c.broken && f(c.a) !== f(c.b)) { c.broken = true; dirty = true; }
    for (const h of this.hinges) if (f(h.a) !== f(h.b) || f(h.b) !== f(h.c)) h.dead = true;
    const s = this.parts, core = f(s.pelvis);
    this.canStand = !s.head.removed && f(s.head) === core && f(s.lFoot) === core && f(s.rFoot) === core && !s.lFoot.removed && !s.rFoot.removed;
    if (s.head.removed || f(s.head) !== f(s.chest) || f(s.chest) !== core) this.die();
  }

  onBreak(c) {
    if (!c.a.removed) { c.a.stump = c.cr; c.a.bleed = 8; c.a.gore = Math.min(1, c.a.gore + 0.5); }
    if (!c.b.removed) { c.b.stump = c.cr; c.b.bleed = 8; c.b.gore = Math.min(1, c.b.gore + 0.5); }
    const mx = (c.a.x + c.b.x) / 2, my = (c.a.y + c.b.y) / 2;
    spray(mx, my, 22, 5);
    if (Math.random() < 0.6) gib(mx, my, 2, 0.6, ['meat', 'bone']);
    if (this.alive) { this.health -= 25; this.stun = 2; this.pain = 2; if (this.health <= 0) this.die(); }
    this.refreshTopology();
  }

  update(dt) {
    const beat = this.alive ? Math.max(0, Math.sin(simTime * 8)) ** 6 : 0; // heartbeat pulse
    let loss = 0;
    for (const p of this.particles) {
      if (p.bleed > 0) {
        p.bleed -= dt * (this.alive ? 1 : 2); loss += 2.5;
        const up = -1;
        if (this.alive && beat > 0.6 && Math.random() < 0.8) spray(p.x, p.y, 2, 3.5, rand(-1, 1), up, 1.6);
        else if (Math.random() < 0.25) spray(p.x, p.y, 1, 0.8);
        if (p.floor && Math.random() < 0.05) addPool(p.x, 1.5);
      }
    }
    for (let i = this.wounds.length - 1; i >= 0; i--) {
      const w = this.wounds[i];
      if (w.c.broken) { this.wounds.splice(i, 1); continue; }
      if (w.bleed > 0) {
        w.bleed -= dt * (this.alive ? 1 : 1.5); loss += 1.2;
        const x = w.c.a.x + (w.c.b.x - w.c.a.x) * w.t, y = w.c.a.y + (w.c.b.y - w.c.a.y) * w.t;
        if ((beat > 0.7 && Math.random() < 0.5) || Math.random() < 0.06) spray(x, y, 1, this.alive ? 2 : 0.6);
        if (Math.random() < 0.01 && y > GROUND - 30) addPool(x, 1);
      }
    }
    this.pain = Math.max(0, this.pain - dt);
    if (!this.alive) return;
    this.health -= loss * dt;
    if (this.health <= 0) { this.die(); return; }
    if (this.stun > 0) { this.stun -= dt; return; }
    if (!this.canStand) return;
    // balance: pull head up, push feet down
    const s = this.parts, k = 0.25 + 0.45 * clamp(this.health / 100, 0, 1);
    s.head.y -= 0.55 * k; s.chest.y -= 0.3 * k;
    s.lFoot.y += 0.35 * k; s.rFoot.y += 0.35 * k;
    const spread = (s.rFoot.x - s.lFoot.x) - 18;
    s.lFoot.x += spread * 0.06 * k; s.rFoot.x -= spread * 0.06 * k;
    const fx = (s.lFoot.x + s.rFoot.x) / 2;
    s.pelvis.x += (fx - s.pelvis.x) * 0.06 * k;
    s.head.x += (fx - s.head.x) * 0.06 * k;
    s.chest.x += (fx - s.chest.x) * 0.04 * k;
  }

  // ---- drawing ----
  limbColor(base, c, shade) {
    const dmg = (c.a.dmg + c.b.dmg) / 2, gore = (c.a.gore + c.b.gore) / 2;
    let col = mix(base, BRUISE, clamp(dmg / 140, 0, 0.7));
    col = mix(col, GORE, clamp(gore * 0.45, 0, 0.45));
    return rgb(col, shade);
  }

  drawLayer(list, shade) {
    for (const [c, , w] of list) if (!c.broken) line(c.a.x, c.a.y, c.b.x, c.b.y, w + 3.5, OUTLINE);
    for (const [c, base, w] of list) if (!c.broken) line(c.a.x, c.a.y, c.b.x, c.b.y, w, this.limbColor(base, c, shade));
    for (const [c, , w] of list) if (!c.broken) line(c.a.x - w * 0.12, c.a.y - w * 0.15, c.b.x - w * 0.12, c.b.y - w * 0.15, w * 0.3, 'rgba(255,255,255,.13)');
  }

  drawFoot(knee, foot, shade) {
    if (foot.removed) return;
    let ux = foot.x - knee.x, uy = foot.y - knee.y;
    if (knee.removed) { ux = 0; uy = 1; }
    const l = Math.hypot(ux, uy) || 1, nx = -uy / l * this.facing, ny = ux / l * this.facing;
    const tx = foot.x - nx * 9, ty = foot.y - ny * 9;
    line(foot.x, foot.y, tx, ty, 11.5, OUTLINE);
    line(foot.x, foot.y, tx, ty, 8, rgb([44, 40, 40], shade));
  }

  drawHand(h, shade) {
    if (h.removed) return;
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(h.x, h.y, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(mix(mix(this.skin, BRUISE, clamp(h.dmg / 140, 0, 0.7)), GORE, h.gore * 0.6), shade);
    ctx.beginPath(); ctx.arc(h.x, h.y, 4.4, 0, TAU); ctx.fill();
  }

  draw() {
    const s = this.parts, b = this.bones;
    // back side
    this.drawLayer([[b.lThigh, this.pants, 13], [b.lShin, this.pants, 11]], 0.75);
    this.drawFoot(s.lKnee, s.lFoot, 0.75);
    this.drawLayer([[b.lUpperArm, this.shirt, 10], [b.lForearm, this.skin, 8]], 0.72);
    this.drawHand(s.lHand, 0.72);
    // torso
    this.drawLayer([[b.neck, this.skin, 9], [b.lower, this.pants, 22], [b.upper, this.shirt, 24]], 1);
    if (!b.lower.broken) { // belt
      const p = s.pelvis, q = s.belly, ux = q.x - p.x, uy = q.y - p.y, l = Math.hypot(ux, uy) || 1;
      const bx = p.x + ux / l * 7, by = p.y + uy / l * 7, nx = -uy / l * 10, ny = ux / l * 10;
      line(bx - nx, by - ny, bx + nx, by + ny, 3, 'rgba(20,16,14,.75)');
    }
    // front side
    this.drawLayer([[b.rThigh, this.pants, 13], [b.rShin, this.pants, 11]], 1);
    this.drawFoot(s.rKnee, s.rFoot, 1);
    this.drawLayer([[b.rUpperArm, this.shirt, 10], [b.rForearm, this.skin, 8]], 1);
    this.drawHand(s.rHand, 1);
    // wounds
    for (const w of this.wounds) {
      const c = w.c, x = c.a.x + (c.b.x - c.a.x) * w.t, y = c.a.y + (c.b.y - c.a.y) * w.t;
      ctx.fillStyle = '#8f1119'; ctx.beginPath(); ctx.arc(x, y, w.r + 1.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a0205'; ctx.beginPath(); ctx.arc(x, y, w.r * 0.6, 0, TAU); ctx.fill();
    }
    // stumps: raw flesh with bone
    for (const p of this.particles) if (p.stump && p !== s.head) {
      const r = Math.max(3.5, p.stump);
      ctx.fillStyle = '#9b1219'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c94a4f'; ctx.beginPath(); ctx.arc(p.x - r * 0.2, p.y - r * 0.2, r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#efe6d6'; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1.6, r * 0.32), 0, TAU); ctx.fill();
    }
    this.drawHead();
  }

  drawHead() {
    const s = this.parts, h = s.head;
    if (h.removed) return;
    if (!this.bones.neck.broken) {
      const ux = h.x - s.chest.x, uy = h.y - s.chest.y, l = Math.hypot(ux, uy) || 1;
      this.up = [ux / l, uy / l];
    }
    const [ux, uy] = this.up, r = h.r;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(Math.atan2(ux, -uy));
    ctx.scale(this.facing, 1);
    const skin = mix(mix(this.skin, BRUISE, clamp(h.dmg / 120, 0, 0.7)), GORE, h.gore * 0.5);
    // long hair hangs behind the head
    if (this.hairStyle === 2) { ctx.fillStyle = this.hair; ctx.beginPath(); ctx.ellipse(-6, 3, 9, 14, 0.2, 0, TAU); ctx.fill(); }
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, 0, r + 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(skin); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.arc(-3, 3, r * 0.85, 0.3, 2.6); ctx.fill();
    // nose & ear
    ctx.fillStyle = rgb(skin, 0.95); ctx.beginPath(); ctx.arc(r - 0.5, 1.5, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = rgb(skin, 0.8); ctx.beginPath(); ctx.arc(-2, 1, 3, 0, TAU); ctx.fill();
    // hair
    ctx.fillStyle = this.hair;
    if (this.hairStyle === 1 || this.hairStyle === 2) {
      ctx.beginPath(); ctx.arc(0, -1, r + 1.5, Math.PI * 0.95, Math.PI * 2.02); ctx.arc(1, 2, r - 3, Math.PI * 1.95, Math.PI * 1.08, true); ctx.fill();
    } else if (this.hairStyle === 3) {
      ctx.fillStyle = rgb(this.shirt, 0.8);
      ctx.beginPath(); ctx.arc(0, -2, r + 1.5, Math.PI, TAU); ctx.fill();
      ctx.fillRect(0, -4, r + 8, 3.5);
    }
    // eye
    const ex = 6, ey = -3;
    ctx.strokeStyle = '#141414'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    if (!this.alive) {
      ctx.beginPath(); ctx.moveTo(ex - 2.5, ey - 2.5); ctx.lineTo(ex + 2.5, ey + 2.5); ctx.moveTo(ex + 2.5, ey - 2.5); ctx.lineTo(ex - 2.5, ey + 2.5); ctx.stroke();
    } else if (this.stun > 0) {
      ctx.beginPath(); ctx.moveTo(ex - 3, ey); ctx.lineTo(ex + 3, ey + 0.5); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, ey, 3.3, 3.8, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#141414'; ctx.beginPath(); ctx.arc(ex + 1.2, ey + (this.pain > 0 ? -0.8 : 0), 1.8, 0, TAU); ctx.fill();
    }
    if (this.alive && (this.pain > 0 || this.health < 50)) { ctx.beginPath(); ctx.moveTo(ex - 3, ey - 6.5); ctx.lineTo(ex + 3, ey - 5); ctx.stroke(); }
    // mouth
    if (!this.alive || this.pain > 0.3) {
      ctx.fillStyle = '#3a0b0e'; ctx.beginPath(); ctx.ellipse(8, 7, 2.6, this.alive ? 2.4 : 1.4, 0, 0, TAU); ctx.fill();
    } else { ctx.beginPath(); ctx.moveTo(6, 7); ctx.lineTo(10.5, 6.5); ctx.stroke(); }
    // blood on the face
    if (h.gore > 0.15) {
      ctx.fillStyle = `rgba(130,8,16,${Math.min(0.85, h.gore)})`;
      ctx.beginPath(); ctx.ellipse(3, -6, 4, 2.5, 0.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(9, 3, 1.4, 5, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (h.stump) { // headless? no — head detached from neck: show neck stump under head
      const [x, y] = [h.x - ux * r * 0.9, h.y - uy * r * 0.9];
      ctx.fillStyle = '#9b1219'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, TAU); ctx.fill();
    }
    if (this.alive && this.health < 100) {
      const w = 30, x = h.x - w / 2, y = h.y - 28;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 1, y - 1, w + 2, 6);
      ctx.fillStyle = this.health > 50 ? '#4cc36a' : this.health > 25 ? '#e0b43a' : '#e04848';
      ctx.fillRect(x, y, w * clamp(this.health / 100, 0, 1), 4);
    }
  }
}

// ======================================================================
class Prop {
  hit() {}
  update() {}
  blast() {}
  shot(b) {
    b.p.push(b.dx * 4, b.dy * 4);
    sparks(b.x, b.y, 5, 4, this.spark || '#ffd890', -b.dx, -b.dy);
    return 'stop';
  }
}

class Crate extends Prop {
  constructor(x, y) {
    super(); this.type = 'crate'; this.particles = []; this.constraints = []; this.spark = '#c8955a';
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) this.particles.push(new Particle(x + i * 20, y + j * 20, 10, 0.8, this));
    rigid(this);
  }
  draw() {
    const g = this.particles, c = g[4];
    if (g.length < 9) return;
    const a = Math.atan2(g[5].y - g[3].y, g[5].x - g[3].x);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(-31.5, -31.5, 63, 63);
    ctx.fillStyle = '#b8834a'; ctx.fillRect(-30, -30, 60, 60);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 4; i++) ctx.fillRect(-30, -30 + i * 15 + 13, 60, 2);
    ctx.strokeStyle = '#7a4f24'; ctx.lineWidth = 5; ctx.strokeRect(-26.5, -26.5, 53, 53);
    ctx.beginPath(); ctx.moveTo(-24, 24); ctx.lineTo(24, -24); ctx.lineWidth = 6; ctx.stroke();
    ctx.fillStyle = '#3b2a1a'; for (const [x, y] of [[-26, -26], [26, -26], [-26, 26], [26, 26]]) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(-30, -30, 60, 4);
    ctx.restore();
  }
}

class Plank extends Prop {
  constructor(x, y) {
    super(); this.type = 'plank'; this.particles = []; this.constraints = []; this.spark = '#c8955a';
    const n = 11;
    for (let i = 0; i < n; i++) this.particles.push(new Particle(x + (i - (n - 1) / 2) * 15, y, 8, 0.5, this));
    rigid(this);
  }
  draw() {
    const a = this.particles[0], b = this.particles[this.particles.length - 1];
    line(a.x, a.y, b.x, b.y, 19, '#2a1a0c');
    line(a.x, a.y, b.x, b.y, 15, '#a8763f');
    line(a.x, a.y - 3, b.x, b.y - 3, 3, 'rgba(255,255,255,.15)');
    line(a.x, a.y + 3, b.x, b.y + 3, 1.5, 'rgba(0,0,0,.2)');
  }
}

class Ball extends Prop {
  constructor(x, y) {
    super(); this.type = 'ball'; this.angle = 0; this.spark = '#ffffff';
    const p = new Particle(x, y, 22, 3, this); p.bounce = 0.7; p.fric = 0.4;
    this.particles = [p]; this.constraints = [];
  }
  update() { const p = this.particles[0]; this.angle += (p.x - p.px) / p.r; }
  draw() {
    const p = this.particles[0];
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = OUTLINE; ctx.beginPath(); ctx.arc(0, 0, p.r + 2, 0, TAU); ctx.fill();
    ctx.rotate(this.angle);
    ctx.fillStyle = '#f2f2f2'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d64545';
    ctx.beginPath(); ctx.arc(0, 0, p.r, -0.5, 0.5); ctx.lineTo(0, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, p.r, Math.PI - 0.5, Math.PI + 0.5); ctx.lineTo(0, 0); ctx.fill();
    ctx.rotate(-this.angle);
    const g = ctx.createRadialGradient(-7, -8, 2, 0, 0, p.r);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.3)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

class Barrel extends Prop {
  constructor(x, y) {
    super(); this.type = 'barrel'; this.armed = 0.4; this.fuseT = -1;
    this.particles = [new Particle(x, y - 12, 16, 1.5, this), new Particle(x, y + 12, 16, 1.5, this)];
    this.constraints = []; rigid(this);
  }
  hit(p, amt) { if (this.armed <= 0 && amt > 6) this.blow(); }
  blast() { if (this.fuseT < 0) this.fuseT = rand(0.05, 0.2); }
  shot(b) { sparks(b.x, b.y, 6, 4); this.blow(); return 'stop'; }
  activate() { this.blow(); }
  blow() {
    if (this.removed) return;
    const a = this.particles[0], b = this.particles[1];
    removeBody(this);
    explode((a.x + b.x) / 2, (a.y + b.y) / 2, 1.4, this);
  }
  update(dt) { this.armed -= dt; if (this.fuseT >= 0) { this.fuseT -= dt; if (this.fuseT < 0) this.blow(); } }
  draw() {
    const a = this.particles[0], b = this.particles[1];
    const ang = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(ang);
    ctx.fillStyle = OUTLINE; ctx.fillRect(-18, -29, 36, 58);
    const g = ctx.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, '#8e2219'); g.addColorStop(0.35, '#e0473a'); g.addColorStop(1, '#7a1c14');
    ctx.fillStyle = g; ctx.fillRect(-16, -27, 32, 54);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-16, -15, 32, 4); ctx.fillRect(-16, 11, 32, 4);
    ctx.fillStyle = '#f5d142'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8, 6); ctx.lineTo(-8, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(-1, -4, 2, 5); ctx.fillRect(-1, 2.5, 2, 2);
    ctx.restore();
  }
}

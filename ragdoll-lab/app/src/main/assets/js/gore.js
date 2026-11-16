/* Ragdoll Lab — blood, stains, gibs, visual effects, explosions and bullets. */
'use strict';

let blood = [], pools = [], drips = [], gibs = [], fx = [], lights = [];

// ---------- persistent stain layer (blood, scorch marks, bullet holes) ----------
let stain = document.createElement('canvas'), sctx = stain.getContext('2d'), stainK = 1;
resizeHooks.push(() => {
  const old = stain, k = dpr * scale;
  const c = document.createElement('canvas');
  c.width = Math.ceil(W * k); c.height = Math.ceil(H * k);
  const x = c.getContext('2d');
  if (old.width > 1) x.drawImage(old, 0, 0, old.width, old.height, 0, 0, old.width * k / stainK, old.height * k / stainK);
  stain = c; sctx = x; stainK = k;
  sctx.setTransform(k, 0, 0, k, 0, 0);
});
function clearStains() { sctx.save(); sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, stain.width, stain.height); sctx.restore(); pools = []; drips = []; }

const BLOOD = ['#9e0f17', '#8a0c13', '#b3141d', '#760a10'];

function splat(x, y, r, onFloor) {
  sctx.fillStyle = pick(BLOOD);
  sctx.globalAlpha = 0.9;
  sctx.beginPath();
  if (onFloor) sctx.ellipse(x, y, r * 1.8, r * 0.55, 0, 0, TAU);
  else sctx.arc(x, y, r, 0, TAU);
  sctx.fill();
  // satellite droplets
  for (let i = 0; i < 2; i++) {
    const a = rand(0, TAU), d = r * rand(1.2, 2.6);
    sctx.beginPath();
    sctx.arc(x + Math.cos(a) * d * (onFloor ? 1.8 : 1), y + Math.sin(a) * d * (onFloor ? 0.4 : 1), r * rand(0.15, 0.4), 0, TAU);
    sctx.fill();
  }
  sctx.globalAlpha = 1;
}

function scorch(x, y, r) {
  const g = sctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(10,8,6,.75)'); g.addColorStop(0.6, 'rgba(20,16,12,.35)'); g.addColorStop(1, 'rgba(20,16,12,0)');
  sctx.fillStyle = g; sctx.beginPath(); sctx.ellipse(x, y, r, r * 0.35, 0, 0, TAU); sctx.fill();
}

function bulletHole(x, y) {
  sctx.fillStyle = 'rgba(15,15,18,.85)'; sctx.beginPath(); sctx.arc(x, y, 2.2, 0, TAU); sctx.fill();
  sctx.strokeStyle = 'rgba(255,255,255,.15)'; sctx.lineWidth = 0.8; sctx.beginPath(); sctx.arc(x, y, 3.2, 0, TAU); sctx.stroke();
}

// ---------- blood particles ----------
function spray(x, y, n, speed, dirX = 0, dirY = 0, spread = Math.PI) {
  const base = dirX || dirY ? Math.atan2(dirY, dirX) : 0;
  for (let i = 0; i < n; i++) {
    const a = dirX || dirY ? base + rand(-spread, spread) * 0.5 : rand(0, TAU);
    const v = rand(0.25, 1) * speed;
    blood.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (dirX || dirY ? 0 : speed * 0.35), r: rand(1, 2.8) });
  }
  if (blood.length > 1800) blood.splice(0, blood.length - 1800);
}

function addPool(x, amount) {
  for (const p of pools) if (Math.abs(p.x - x) < p.r) { p.max = Math.min(70, p.max + amount); return; }
  pools.push({ x, r: 2, max: 6 + amount });
  if (pools.length > 50) { const p = pools.shift(); poolToStain(p); }
}
function poolToStain(p) {
  sctx.fillStyle = '#6e0a10'; sctx.globalAlpha = 0.9;
  sctx.beginPath(); sctx.ellipse(p.x, GROUND + 1, p.r, p.r * 0.18, 0, 0, TAU); sctx.fill(); sctx.globalAlpha = 1;
}

// ---------- gibs: chunks of flesh and bone that bounce around ----------
function gib(x, y, n, power, kinds = ['meat']) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(2, 7) * power;
    const kind = pick(kinds);
    gibs.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4 * power, rot: rand(0, TAU), vr: rand(-0.4, 0.4),
      r: kind === 'bone' ? rand(2, 3.5) : rand(3, 6.5), kind, life: 25, rest: 0,
      color: kind === 'bone' ? '#ece3cf' : kind === 'brain' ? '#d98c95' : kind === 'skin' ? '#c9876b' : pick(['#8c1219', '#a3242b', '#6f0d12']),
    });
  }
  if (gibs.length > 260) gibs.splice(0, gibs.length - 260);
}

// ---------- generic effects ----------
function sparks(x, y, n, speed, color = '#ffd27a', dirX = 0, dirY = 0) {
  for (let i = 0; i < n; i++) {
    const a = dirX || dirY ? Math.atan2(dirY, dirX) + rand(-1.1, 1.1) : rand(0, TAU), v = rand(0.4, 1) * speed;
    fx.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.15, 0.45), color });
  }
}
function smoke(x, y, n, size = 16, dark = 0.45) {
  for (let i = 0; i < n; i++)
    fx.push({ kind: 'smoke', x: x + rand(-8, 8), y: y + rand(-8, 8), vx: rand(-1, 1), vy: rand(-1.6, -0.3), t: 0, life: rand(0.8, 1.8), r: size * rand(0.5, 1.2), a: dark });
}
function light(x, y, r, life, color) { lights.push({ x, y, r, t: 0, life, color }); }

// ---------- explosions ----------
function explode(x, y, power, source) {
  const R = 170 * power;
  for (const p of particles) {
    if (p.body === source) continue;
    const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy);
    if (d > R) continue;
    const f = 1 - d / R, nx = dx / (d || 1), ny = dy / (d || 1) - 0.3;
    if (!p.body.static) p.push(nx * 30 * power * f * Math.min(1.5, p.im * 1.2), ny * 30 * power * f * Math.min(1.5, p.im * 1.2));
    p.body.blast && p.body.blast(p, f, power, nx, ny);
  }
  fx.push({ kind: 'fireball', x, y, t: 0, life: 0.45, R: R * 0.55 });
  fx.push({ kind: 'ring', x, y, t: 0, life: 0.35, R: R * 1.1 });
  sparks(x, y, 26 * power, 14 * power, '#ffcf6b');
  smoke(x, y - 10, 12 * power, 22 * power);
  for (let i = 0; i < 8 * power; i++) {
    const a = rand(Math.PI * 1.05, Math.PI * 1.95), v = rand(6, 14);
    fx.push({ kind: 'debris', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 2, r: rand(1.5, 3.5), rot: rand(0, TAU) });
  }
  light(x, y, R * 2.2, 0.5, '255,170,80');
  if (y > GROUND - 60) scorch(x, GROUND + 2, 60 * power);
  for (const w of walls) {
    const [cx, cy] = closestOnSeg(x, y, w.x1, w.y1, w.x2, w.y2);
    if (Math.hypot(cx - x, cy - y) < R * 0.4) { sctx.save(); scorch(cx, cy, 40 * power); sctx.restore(); }
  }
  shake = Math.max(shake, 14 * power);
}

// ---------- bullets (hitscan) ----------
// Walks a ray, hitting ragdoll limbs, props, walls and the floor. Penetrates soft targets.
function fireBullet(ox, oy, dx, dy, dmg, opts = {}) {
  const maxLen = opts.range || 2200, ignore = opts.ignore;
  let pen = opts.pen != null ? opts.pen : 1, x = ox, y = oy, skip = new Set();
  for (let hop = 0; hop < 4; hop++) {
    const ex = x + dx * maxLen, ey = y + dy * maxLen;
    let best = maxLen, hit = null;
    // ragdoll bones
    for (const c of constraints) {
      if (!c.cr || c.broken || c.body === ignore || skip.has(c)) continue;
      const [s, t, d] = segSegClosest(x, y, ex, ey, c.a.x, c.a.y, c.b.x, c.b.y);
      if (d < c.cr + 1 && s * maxLen < best) { best = s * maxLen; hit = { kind: 'bone', c, t }; }
    }
    // loose particles (props, heads, hands ...)
    for (const p of particles) {
      if (p.body === ignore || skip.has(p) || p.ghost) continue;
      const fx_ = p.x - x, fy = p.y - y, proj = fx_ * dx + fy * dy;
      if (proj < 0 || proj > best) continue;
      const perp2 = fx_ * fx_ + fy * fy - proj * proj;
      if (perp2 > p.r * p.r) continue;
      const along = proj - Math.sqrt(p.r * p.r - perp2);
      if (along < best) { best = Math.max(0, along); hit = { kind: 'particle', p }; }
    }
    for (const w of walls) {
      const t = segIntersect(x, y, ex, ey, w.x1, w.y1, w.x2, w.y2);
      if (t !== null && t * maxLen < best) { best = t * maxLen; hit = { kind: 'wall' }; }
    }
    if (dy > 0) { const t = (GROUND - y) / dy; if (t >= 0 && t < best) { best = t; hit = { kind: 'floor' }; } }
    const hx = x + dx * best, hy = y + dy * best;
    fx.push({ kind: 'tracer', x1: x, y1: y, x2: hx, y2: hy, t: 0, life: opts.tracerLife || 0.07, w: opts.tracerW || 1.6 });
    if (!hit) return;

    if (hit.kind === 'wall' || hit.kind === 'floor') {
      sparks(hx, hy, 6, 5, '#ffe2a0', -dx, -dy); smoke(hx, hy, 1, 6, 0.3); bulletHole(hx, hy); return;
    }
    let body, p;
    if (hit.kind === 'bone') { body = hit.c.body; p = hit.t < 0.5 ? hit.c.a : hit.c.b; skip.add(hit.c); }
    else { p = hit.p; body = p.body; skip.add(p); }
    const res = body.shot ? body.shot({ x: hx, y: hy, dx, dy, dmg, p, c: hit.c, t: hit.t }) : 'stop';
    if (hit.kind === 'bone') { // also skip the bone's end particles so we don't double hit
      skip.add(hit.c.a); skip.add(hit.c.b);
      for (const c of constraints) if (c.body === body && (c.a === p || c.b === p)) skip.add(c);
    } else for (const c of constraints) if (c.cr && (c.a === p || c.b === p)) skip.add(c);
    if (res !== 'flesh' || pen <= 0) return;
    pen--; dmg *= 0.6; x = hx + dx * 2; y = hy + dy * 2;
  }
}

// ---------- per-step update of effects ----------
postStepHooks.push((dt, g) => {
  // blood
  for (let i = blood.length - 1; i >= 0; i--) {
    const d = blood[i];
    d.vy += g; d.vx *= 0.995; d.x += d.vx; d.y += d.vy;
    let hitFloor = d.y >= GROUND, stuck = hitFloor || d.x < 0 || d.x > W;
    let wall = null;
    if (!stuck) for (const w of walls) {
      const [cx, cy] = closestOnSeg(d.x, d.y, w.x1, w.y1, w.x2, w.y2);
      if ((d.x - cx) ** 2 + (d.y - cy) ** 2 < (WALL_T + 1) ** 2) { stuck = true; wall = w; break; }
    }
    if (stuck) {
      const x = clamp(d.x, 0, W), y = Math.min(d.y, GROUND + 1);
      splat(x, y, d.r * rand(1, 1.6), hitFloor);
      if (hitFloor && Math.random() < 0.25) addPool(x, d.r * 0.6);
      if (!hitFloor && Math.random() < 0.18 && drips.length < 80) drips.push({ x, y, len: 0, max: rand(15, 70), w: d.r * 0.7 });
      blood.splice(i, 1);
    }
  }
  // blood pools spread slowly
  for (const p of pools) if (p.r < p.max) p.r += (p.max - p.r) * 0.01 + 0.02;
  // drips run down walls
  for (let i = drips.length - 1; i >= 0; i--) {
    const d = drips[i], s = rand(0.1, 0.45);
    sctx.fillStyle = '#7d0b12'; sctx.fillRect(d.x - d.w / 2, d.y + d.len, d.w, s + 0.6);
    d.len += s; if (d.len > d.max || d.y + d.len >= GROUND) { sctx.beginPath(); sctx.arc(d.x, d.y + d.len, d.w * 0.9, 0, TAU); sctx.fill(); drips.splice(i, 1); }
  }
  // gibs
  for (let i = gibs.length - 1; i >= 0; i--) {
    const k = gibs[i];
    if (k.rest > 1.2) { // settled: bake into stain layer
      drawGib(sctx, k); gibs.splice(i, 1); continue;
    }
    k.vy += g; k.x += k.vx; k.y += k.vy; k.rot += k.vr;
    if (k.y + k.r > GROUND) {
      k.y = GROUND - k.r;
      if (Math.abs(k.vy) > 2 && k.kind !== 'bone') splat(k.x, GROUND + 1, k.r * 0.6, true);
      k.vy *= -0.3; k.vx *= 0.7; k.vr *= 0.6;
    }
    if (k.x < k.r || k.x > W - k.r) { k.vx *= -0.5; k.x = clamp(k.x, k.r, W - k.r); }
    for (const w of walls) {
      const [cx, cy] = closestOnSeg(k.x, k.y, w.x1, w.y1, w.x2, w.y2);
      const ddx = k.x - cx, ddy = k.y - cy, dd = Math.hypot(ddx, ddy);
      if (dd < k.r + WALL_T) { const nx = ddx / (dd || 1), ny = ddy / (dd || 1); k.x = cx + nx * (k.r + WALL_T); k.y = cy + ny * (k.r + WALL_T); const vn = k.vx * nx + k.vy * ny; k.vx -= 1.4 * vn * nx; k.vy -= 1.4 * vn * ny; k.vx *= 0.7; k.vy *= 0.7; }
    }
    if (k.kind !== 'bone' && Math.hypot(k.vx, k.vy) > 3 && Math.random() < 0.3) blood.push({ x: k.x, y: k.y, vx: k.vx * 0.2, vy: k.vy * 0.2, r: 1.2 });
    if (Math.hypot(k.vx, k.vy) < 0.4 && k.y + k.r >= GROUND - 0.5) k.rest += dt; else k.rest = 0;
  }
  // fx
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt;
    if (f.kind === 'smoke') { f.x += f.vx; f.y += f.vy; f.vy *= 0.97; }
    else if (f.kind === 'spark') { f.vy += g * 0.6; f.x += f.vx; f.y += f.vy; if (f.y > GROUND) { f.y = GROUND; f.vy *= -0.4; } }
    else if (f.kind === 'debris') { f.vy += g; f.x += f.vx; f.y += f.vy; f.rot += 0.2; if (f.y > GROUND) { f.y = GROUND; f.vy *= -0.3; f.vx *= 0.6; } }
    else if (f.kind === 'shell') { f.vy += g; f.x += f.vx; f.y += f.vy; f.rot += f.vr; if (f.y > GROUND - 1) { f.y = GROUND - 1; f.vy *= -0.4; f.vx *= 0.6; f.vr *= 0.5; } }
    if (f.t > f.life) fx.splice(i, 1);
  }
  if (fx.length > 600) fx.splice(0, fx.length - 600);
  for (let i = lights.length - 1; i >= 0; i--) { lights[i].t += dt; if (lights[i].t > lights[i].life) lights.splice(i, 1); }
});

function drawGib(c, k) {
  c.save(); c.translate(k.x, k.y); c.rotate(k.rot);
  c.fillStyle = k.color;
  if (k.kind === 'bone') { c.fillRect(-k.r * 1.8, -k.r * 0.45, k.r * 3.6, k.r * 0.9); c.beginPath(); c.arc(-k.r * 1.8, 0, k.r * 0.6, 0, TAU); c.arc(k.r * 1.8, 0, k.r * 0.6, 0, TAU); c.fill(); }
  else { c.beginPath(); c.ellipse(0, 0, k.r, k.r * 0.7, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(-k.r * 0.3, -k.r * 0.25, k.r * 0.35, k.r * 0.2, 0, 0, TAU); c.fill(); }
  c.restore();
}

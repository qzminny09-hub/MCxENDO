/* Ragdoll Lab — rendering, input, UI and the main loop. */
'use strict';

const SPAWN = {
  human: Human, crate: Crate, ball: Ball, plank: Plank, barrel: Barrel,
  pistol: (x, y, f) => new Gun(x, y, 'pistol', f), rifle: (x, y, f) => new Gun(x, y, 'rifle', f),
  shotgun: (x, y, f) => new Gun(x, y, 'shotgun', f), rpg: (x, y, f) => new Gun(x, y, 'rpg', f),
  sword: (x, y, f) => new Sword(x, y, f),
  grenade: Grenade, bomb: Bomb, mine: Mine, spikes: Spikes, saw: Saw,
};
const ARMED = new Set(['pistol', 'rifle', 'shotgun', 'rpg', 'sword']);

function spawn(kind, x, y) {
  x = clamp(x, 40, W - 40);
  if (kind === 'human') y = Math.min(y + 80, GROUND - 1);
  else if (kind !== 'spikes' && kind !== 'saw') y = Math.min(y, GROUND - 32);
  const facing = x > W / 2 ? -1 : 1;
  const C = SPAWN[kind];
  const body = C.prototype ? new C(x, y, facing) : C(x, y, facing);
  return addBody(body);
}

// ---------- pre-rendered backdrop ----------
let bg = document.createElement('canvas'), vig = document.createElement('canvas');
resizeHooks.push(() => {
  const k = dpr * scale;
  for (const c of [bg, vig]) { c.width = Math.ceil(W * k); c.height = Math.ceil(H * k); }
  const b = bg.getContext('2d'); b.setTransform(k, 0, 0, k, 0, 0);
  let g = b.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#222a35'); g.addColorStop(1, '#353f4d');
  b.fillStyle = g; b.fillRect(0, 0, W, GROUND);
  // ceiling lights
  for (let x = 160; x < W; x += 420) {
    const r = b.createRadialGradient(x, -20, 10, x, 40, 360);
    r.addColorStop(0, 'rgba(210,225,255,.16)'); r.addColorStop(1, 'rgba(210,225,255,0)');
    b.fillStyle = r; b.fillRect(x - 380, 0, 760, GROUND);
    b.fillStyle = '#c9d6e8'; b.fillRect(x - 50, 0, 100, 5); b.fillStyle = '#1a1f27'; b.fillRect(x - 54, 5, 108, 2);
  }
  // wall panels
  b.lineWidth = 1;
  for (let x = 0; x < W; x += 180) {
    b.strokeStyle = 'rgba(0,0,0,.28)'; b.beginPath(); b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, GROUND); b.stroke();
    b.strokeStyle = 'rgba(255,255,255,.04)'; b.beginPath(); b.moveTo(x + 1.5, 0); b.lineTo(x + 1.5, GROUND); b.stroke();
    for (let y = 40; y < GROUND - 100; y += 140) { b.fillStyle = 'rgba(0,0,0,.25)'; b.beginPath(); b.arc(x + 12, y, 2, 0, TAU); b.arc(x + 168, y, 2, 0, TAU); b.fill(); }
  }
  b.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = 0; y < GROUND; y += 30) b.fillRect(0, y, W, 1);
  // lower wall band + hazard stripe
  b.fillStyle = '#29303a'; b.fillRect(0, GROUND - 95, W, 95);
  b.fillStyle = 'rgba(255,255,255,.07)'; b.fillRect(0, GROUND - 95, W, 2);
  b.fillStyle = '#1a1e24'; b.fillRect(0, GROUND - 14, W, 14);
  b.save(); b.beginPath(); b.rect(0, GROUND - 12, W, 8); b.clip();
  b.fillStyle = '#c9a227'; b.fillRect(0, GROUND - 12, W, 8);
  b.fillStyle = '#1d1d1d'; for (let x = -20; x < W + 20; x += 20) { b.beginPath(); b.moveTo(x, GROUND - 4); b.lineTo(x + 8, GROUND - 12); b.lineTo(x + 18, GROUND - 12); b.lineTo(x + 10, GROUND - 4); b.fill(); }
  b.restore();
  // lab label
  b.font = 'bold 44px system-ui, sans-serif'; b.fillStyle = 'rgba(255,255,255,.035)'; b.textAlign = 'right';
  b.fillText('RAGDOLL LAB  ·  TEST CHAMBER 01', W - 30, GROUND - 120);
  // floor
  g = b.createLinearGradient(0, GROUND, 0, H);
  g.addColorStop(0, '#585e67'); g.addColorStop(1, '#2c3036');
  b.fillStyle = g; b.fillRect(0, GROUND, W, H - GROUND);
  b.fillStyle = '#80868f'; b.fillRect(0, GROUND, W, 2);
  b.strokeStyle = 'rgba(0,0,0,.25)';
  for (let x = 0; x < W; x += 90) { b.beginPath(); b.moveTo(x, GROUND + 2); b.lineTo(x - (x - W / 2) * 0.15, H); b.stroke(); }
  b.beginPath(); b.moveTo(0, GROUND + 16); b.lineTo(W, GROUND + 16); b.stroke();
  // vignette
  const v = vig.getContext('2d'); v.setTransform(k, 0, 0, k, 0, 0);
  const rg = v.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,0,.5)');
  v.fillStyle = rg; v.fillRect(0, 0, W, H);
});

// ---------- rendering ----------
function render() {
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  if (shake > 0.3) ctx.translate(rand(-shake, shake), rand(-shake, shake));
  ctx.drawImage(bg, -1, 0, W + 2, H);

  for (const w of walls) {
    line(w.x1, w.y1, w.x2, w.y2, WALL_T * 2 + 3, OUTLINE);
    line(w.x1, w.y1, w.x2, w.y2, WALL_T * 2 - 1, '#7d858f');
    line(w.x1, w.y1 - 1.5, w.x2, w.y2 - 1.5, 2, 'rgba(255,255,255,.25)');
  }
  ctx.drawImage(stain, 0, 0, W, H);

  // blood pools
  for (const p of pools) {
    ctx.fillStyle = '#6a0910'; ctx.beginPath(); ctx.ellipse(p.x, GROUND + 1, p.r, p.r * 0.17, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(p.x - p.r * 0.2, GROUND, p.r * 0.4, p.r * 0.04, 0, 0, TAU); ctx.fill();
  }

  // contact shadows
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath();
  for (const p of particles) {
    if (p.ghost) continue;
    const h = GROUND - (p.y + p.r); if (h < -2 || h > 160) continue;
    const k = 1 - Math.max(0, h) / 160, r = p.r * (0.6 + k * 0.9);
    ctx.moveTo(p.x + r, GROUND + 1); ctx.ellipse(p.x, GROUND + 1, r, r * 0.22 * k + 0.5, 0, 0, TAU);
  }
  ctx.fill();

  for (const b of bodies) if (b.static) b.draw();
  for (const b of bodies) if (!b.static && b.type === 'human') b.draw();
  for (const b of bodies) if (!b.static && b.type !== 'human') b.draw();

  for (const k of gibs) drawGib(ctx, k);

  for (const p of particles) if (p.pinned && !p.body.static) {
    ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // blood in flight (drawn as streaks)
  ctx.strokeStyle = '#a3111a'; ctx.lineCap = 'round';
  for (const d of blood) {
    ctx.lineWidth = d.r * 1.6; ctx.beginPath(); ctx.moveTo(d.x - d.vx * 0.8, d.y - d.vy * 0.8); ctx.lineTo(d.x, d.y); ctx.stroke();
  }

  drawFx();

  // light flashes
  if (lights.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const a = (1 - l.t / l.life) * 0.5, g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(${l.color},${a})`); g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(vig, 0, 0, W, H);

  // tool overlays
  if (drag) { ctx.setLineDash([4, 4]); line(drag.p.x, drag.p.y, drag.x, drag.y, 1.5, 'rgba(255,255,255,.7)'); ctx.setLineDash([]); }
  if (wallDraft) line(wallDraft.x1, wallDraft.y1, wallDraft.x2, wallDraft.y2, WALL_T * 2, 'rgba(180,190,200,.5)');
  if (cutTrail.length > 1) {
    ctx.lineCap = 'round';
    for (let i = 1; i < cutTrail.length; i++) line(cutTrail[i - 1].x, cutTrail[i - 1].y, cutTrail[i].x, cutTrail[i].y, i * 0.4, `rgba(255,255,255,${i / cutTrail.length})`);
  }
}

function drawFx() {
  for (const f of fx) {
    const k = f.t / f.life;
    switch (f.kind) {
      case 'smoke':
        ctx.fillStyle = `rgba(70,70,74,${f.a * (1 - k)})`;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + k * 1.3), 0, TAU); ctx.fill(); break;
      case 'spark':
        ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - k; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(f.x - f.vx * 1.4, f.y - f.vy * 1.4); ctx.lineTo(f.x, f.y); ctx.stroke(); ctx.globalAlpha = 1; break;
      case 'fireball': {
        const r = f.R * (0.35 + 0.65 * Math.sqrt(k)), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,250,220,${1 - k})`); g.addColorStop(0.35, `rgba(255,190,70,${0.9 * (1 - k)})`);
        g.addColorStop(0.75, `rgba(220,70,20,${0.6 * (1 - k)})`); g.addColorStop(1, 'rgba(120,30,10,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill(); break;
      }
      case 'ring':
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - k)})`; ctx.lineWidth = 3 * (1 - k) + 0.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, f.R * k, 0, TAU); ctx.stroke(); break;
      case 'debris':
        ctx.fillStyle = '#2b2b2b'; ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillRect(-f.r, -f.r * 0.6, f.r * 2, f.r * 1.2); ctx.restore(); break;
      case 'tracer':
        ctx.strokeStyle = `rgba(255,232,170,${0.9 * (1 - k)})`; ctx.lineWidth = f.w;
        ctx.beginPath(); ctx.moveTo(f.x1 + (f.x2 - f.x1) * k * 0.6, f.y1 + (f.y2 - f.y1) * k * 0.6); ctx.lineTo(f.x2, f.y2); ctx.stroke(); break;
      case 'muzzle': {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.ang); ctx.scale(f.s, f.s);
        ctx.fillStyle = 'rgba(255,220,120,.95)';
        ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(22, 0); ctx.lineTo(-2, 5); ctx.lineTo(6, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, 0); ctx.lineTo(8, -10); ctx.lineTo(10, 0); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2, 0, 4, 0, TAU); ctx.fill();
        ctx.restore(); break;
      }
      case 'shell':
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.fillStyle = '#d9a640'; ctx.fillRect(-3, -1.3, 6, 2.6); ctx.restore(); break;
    }
  }
}

// ---------- input ----------
let tool = 'drag', item = 'human', wallDraft = null, cutTrail = [], activePointer = null, lastCut = null;
const toWorld = e => ({ x: e.clientX / scale, y: e.clientY / scale });
const usable = p => !!p.body.activate;

function activateAt(x, y) {
  const p = nearest(x, y, 40, usable);
  if (p) { p.body.activate(); return true; }
  return false;
}

cvs.addEventListener('pointerdown', e => {
  if (activePointer !== null) return;
  activePointer = e.pointerId; cvs.setPointerCapture(e.pointerId);
  const { x, y } = toWorld(e);
  switch (tool) {
    case 'drag': {
      const p = nearest(x, y);
      if (p) drag = { p, x, y, ax: x, ay: y, sx: x, sy: y, t0: performance.now(), moved: false };
      break;
    }
    case 'use': if (!activateAt(x, y)) hint('Tap a weapon or explosive to use it'); break;
    case 'spawn': spawn(item, x, y); break;
    case 'boom': explode(x, y, 1); break;
    case 'pin': { const p = nearest(x, y, 20, q => !q.body.static); if (p) p.pinned = !p.pinned; break; }
    case 'wall': wallDraft = { x1: x, y1: y, x2: x, y2: y }; break;
    case 'cut': lastCut = { x, y }; cutTrail = [{ x, y }]; break;
    case 'heal': { const p = nearest(x, y, 34, q => !!q.body.heal); if (p) { p.body.heal(); hint('Patched up!'); } break; }
    case 'erase': {
      const p = nearest(x, y, 14);
      if (p) { if (p.body.impaled) for (const m of p.body.impaled) m.c.broken = true; removeBody(p.body); break; }
      const i = walls.findIndex(w => { const [cx, cy] = closestOnSeg(x, y, w.x1, w.y1, w.x2, w.y2); return Math.hypot(x - cx, y - cy) < 20; });
      if (i >= 0) walls.splice(i, 1);
      break;
    }
  }
});

cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== activePointer) return;
  const { x, y } = toWorld(e);
  if (drag) { drag.x = x; drag.y = y; if (Math.hypot(x - drag.sx, y - drag.sy) > 8) drag.moved = true; }
  if (wallDraft) { wallDraft.x2 = x; wallDraft.y2 = y; }
  if (tool === 'cut' && lastCut) {
    const sx = x - lastCut.x, sy = y - lastCut.y;
    for (const c of constraints) {
      if (!c.cut || c.broken) continue;
      const t = segIntersect(lastCut.x, lastCut.y, x, y, c.a.x, c.a.y, c.b.x, c.b.y);
      if (t !== null) {
        breakConstraint(c); c.body.hit(c.a, 20, 'cut');
        spray(lastCut.x + sx * t, lastCut.y + sy * t, 14, 5, sx, sy, 1.2);
      }
    }
    lastCut = { x, y }; cutTrail.push({ x, y }); if (cutTrail.length > 14) cutTrail.shift();
  }
});

function endPointer(e) {
  if (e.pointerId !== activePointer) return;
  if (drag && !drag.moved && performance.now() - drag.t0 < 300 && usable(drag.p)) drag.p.body.activate();
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
  drag: 'Grab and fling things. Quick-tap a weapon to fire it.',
  use: 'Tap a weapon or explosive to fire / trigger it.',
  spawn: 'Pick an item below, then tap the scene.',
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
  clearTimeout(hintTimer); hintTimer = setTimeout(() => (el.style.opacity = 0), 2600);
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
  if (ARMED.has(item)) hint('Spawned weapons fire when you tap them');
}));
const toggle = (id, fn) => document.getElementById(id).addEventListener('click', e => { const on = fn(); e.currentTarget.classList.toggle('on', on); });
toggle('bPause', () => (paused = !paused));
toggle('bSlow', () => (slow = !slow));
toggle('bGrav', () => { gravityOn = !gravityOn; hint(gravityOn ? 'Gravity on' : 'Zero gravity!'); return !gravityOn; });
document.getElementById('bClean').addEventListener('click', () => { clearStains(); blood = []; gibs = []; hint('Mopped the floor'); });
document.getElementById('bClear').addEventListener('click', () => {
  for (const b of bodies) removeBody(b); cleanup();
  walls = []; blood = []; fx = []; gibs = []; lights = []; drag = null; clearStains();
  setup(); hint('Fresh lab');
});

// ---------- loop ----------
function setup() {
  spawn('human', W * 0.42, GROUND - 100);
  spawn('human', W * 0.58, GROUND - 100);
  spawn('crate', W * 0.8, GROUND - 31);
  spawn('pistol', W * 0.22, GROUND - 40);
}

let last = performance.now(), acc = 0, slowTick = 0, fpsT = 0, frames = 0;
const statsEl = document.getElementById('stats');
function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000); last = t;
  let alpha = 1;
  if (!paused) {
    if (slow) { slowTick += dt * 60 * 0.25; while (slowTick >= 1) { slowTick -= 1; step(STEP); } alpha = slowTick; }
    else {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 3) { step(STEP); acc -= STEP; n++; }
      if (n === 3) acc = 0;
      alpha = acc / STEP;
    }
  }
  // draw positions interpolated between physics steps (smooth slow motion)
  for (const p of particles) { p.sx = p.x; p.sy = p.y; p.x = p.lx + (p.x - p.lx) * alpha; p.y = p.ly + (p.y - p.ly) * alpha; }
  render();
  for (const p of particles) { p.x = p.sx; p.y = p.sy; }
  frames++; fpsT += dt;
  if (fpsT > 1) { statsEl.textContent = `${frames} fps · ${bodies.length} objects`; frames = 0; fpsT = 0; }
  requestAnimationFrame(frame);
}

resize();
setup();
hint('Drag ragdolls around. Tap the pistol to fire it!');
requestAnimationFrame(frame);

// hook for automated tests
window.__lab = {
  get bodies() { return bodies; }, get particles() { return particles; }, get gibs() { return gibs; },
  spawn, explode, step, fireBullet, activateAt,
};

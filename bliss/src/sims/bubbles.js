import simPage from './shell';

// Soap bubbles. Hold on empty space to blow one (it grows until you let go and floats off with your
// finger's motion); tap a bubble to pop it into droplets. Bubbles drift, wobble and nudge each
// other aside, and their film shimmers through the colours of thin-film interference.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var MAX_RADIUS = 70;
  var GROW = 0.45;
  var MAX_BUBBLES = 40;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, backdrop;
  var bubbles = [];
  var drops = [];
  var rings = [];
  var pointers = {};
  var auto = false, nextAuto = 0;
  var popped = 0, t = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    backdrop = ctx.createLinearGradient(0, 0, W, H);
    backdrop.addColorStop(0, '#1f3d4f');
    backdrop.addColorStop(1, '#0d1b26');
  }

  function makeBubble(x, y, r, vx, vy) {
    var b = { x: x, y: y, r: r, vx: vx, vy: vy, phase: Math.random() * Math.PI * 2, life: 600 + Math.random() * 900, age: 0, growing: false };
    bubbles.push(b);
    // Over the limit, pop the oldest bubble that is not still being blown.
    if (bubbles.length > MAX_BUBBLES) {
      for (var k = 0; k < bubbles.length; k++) if (!bubbles[k].growing) { pop(k); break; }
    }
    return b;
  }

  function reset() {
    bubbles = []; drops = []; rings = [];
    popped = 0;
    for (var i = 0; i < 6; i++) makeBubble(W * (0.15 + Math.random() * 0.7), TOP + (H - TOP) * (0.2 + Math.random() * 0.6), 18 + Math.random() * 40, (Math.random() - 0.5) * 0.4, -0.2 - Math.random() * 0.2);
    statusEl.textContent = 'Hold to blow a bubble. Tap one to pop it.';
  }

  function pop(index) {
    var b = bubbles[index];
    bubbles.splice(index, 1);
    var n = 8 + Math.round(b.r / 4);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      drops.push({ x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a) * b.r, vx: Math.cos(a) * (1 + Math.random() * 2), vy: Math.sin(a) * (1 + Math.random() * 2) - 1, life: 40 + Math.random() * 30, age: 0 });
    }
    rings.push({ x: b.x, y: b.y, r: b.r, age: 0 });
    popped++;
    statusEl.textContent = popped + (popped === 1 ? ' bubble' : ' bubbles') + ' popped';
    buzz();
  }

  function step() {
    t++;
    for (var id in pointers) {
      var p = pointers[id];
      if (p.bubble) {
        p.bubble.x = p.x; p.bubble.y = p.y - p.bubble.r * 0.2;
        p.bubble.r = Math.min(MAX_RADIUS, p.bubble.r + GROW);
      }
    }
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (b.growing) continue;
      b.age++;
      b.vy -= 0.006 * (1 - b.r / 120);
      b.vx += Math.sin(t * 0.02 + b.phase) * 0.008;
      b.vx *= 0.992; b.vy *= 0.992;
      b.x += b.vx; b.y += b.vy;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
      if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.6; }
      if (b.y < TOP + b.r || b.age > b.life) { pop(i); continue; }
    }
    // Bubbles nudge each other apart instead of merging.
    for (i = 0; i < bubbles.length; i++) {
      for (var j = i + 1; j < bubbles.length; j++) {
        var a = bubbles[i], c = bubbles[j];
        var dx = c.x - a.x, dy = c.y - a.y, rr = a.r + c.r, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        var d = Math.sqrt(d2), push = ((rr - d) / d) * 0.04;
        if (!a.growing) { a.vx -= dx * push; a.vy -= dy * push; }
        if (!c.growing) { c.vx += dx * push; c.vy += dy * push; }
      }
    }
    for (i = drops.length - 1; i >= 0; i--) {
      var dr = drops[i];
      dr.vy += 0.15; dr.x += dr.vx; dr.y += dr.vy; dr.age++;
      if (dr.age > dr.life) drops.splice(i, 1);
    }
    for (i = rings.length - 1; i >= 0; i--) if (++rings[i].age > 14) rings.splice(i, 1);
    if (auto && t > nextAuto) {
      makeBubble(30, H - 80, 10 + Math.random() * 26, 1.2 + Math.random() * 1.4, -0.6 - Math.random() * 0.8);
      nextAuto = t + 12 + Math.random() * 20;
    }
  }

  // Thin-film colour: a ring of hues that slowly turns, brighter at the rim where the film is seen edge-on.
  function film(b) {
    var sx = 1 + Math.sin(t * 0.08 + b.phase) * 0.03, sy = 2 - sx;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(sx, sy);
    var body = ctx.createRadialGradient(0, 0, b.r * 0.6, 0, 0, b.r);
    body.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
    body.addColorStop(1, 'rgba(255, 255, 255, 0.14)');
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill();
    var spin = t * 0.01 + b.phase, rim;
    if (ctx.createConicGradient) {
      rim = ctx.createConicGradient(spin, 0, 0);
      for (var k = 0; k <= 6; k++) rim.addColorStop(k / 6, 'hsla(' + ((k * 60 + b.phase * 57) % 360) + ', 90%, 70%, 0.55)');
    } else {
      rim = 'rgba(200, 220, 255, 0.5)';
    }
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.5, b.r * 0.07);
    ctx.beginPath(); ctx.arc(0, 0, b.r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, b.r * 0.12);
    ctx.beginPath(); ctx.arc(0, 0, b.r * 0.78, spin, spin + 2.2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath(); ctx.ellipse(-b.r * 0.38, -b.r * 0.42, b.r * 0.2, b.r * 0.1, -0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath(); ctx.arc(b.r * 0.45, b.r * 0.4, b.r * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, W, H);
    if (auto) {
      ctx.fillStyle = '#3b4a55';
      ctx.fillRect(4, H - 92, 36, 26);
      ctx.fillStyle = '#56697a';
      ctx.beginPath(); ctx.arc(30, H - 80, 9, 0, Math.PI * 2); ctx.fill();
    }
    for (var i = 0; i < bubbles.length; i++) film(bubbles[i]);
    ctx.fillStyle = 'rgba(210, 235, 255, 0.8)';
    for (i = 0; i < drops.length; i++) {
      ctx.globalAlpha = 1 - drops[i].age / drops[i].life;
      ctx.fillRect(drops[i].x - 1, drops[i].y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < rings.length; i++) {
      var rg = rings[i];
      ctx.strokeStyle = 'rgba(255, 255, 255,' + (0.5 * (1 - rg.age / 14)).toFixed(2) + ')';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rg.x, rg.y, rg.r * (1 + rg.age * 0.04), 0, Math.PI * 2); ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    for (var i = bubbles.length - 1; i >= 0; i--) {
      var b = bubbles[i];
      if (!b.growing && Math.hypot(b.x - e.clientX, b.y - e.clientY) < b.r) { pop(i); return; }
    }
    var nb = makeBubble(e.clientX, e.clientY, 4, 0, 0);
    nb.growing = true;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, bubble: nb };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.vx = (e.clientX - p.x) * 0.5; p.vy = (e.clientY - p.y) * 0.5;
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    if (p.bubble) { p.bubble.growing = false; p.bubble.vx = p.vx; p.bubble.vy = p.vy - 0.3; }
    delete pointers[e.pointerId];
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  toggle('auto', function (on) { auto = on; });
  document.getElementById('reset').onclick = reset;

  window.addEventListener('resize', resize);
  resize();
  reset();
  var last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100);
    last = now;
    var steps = 0;
    while (acc >= STEP_MS && steps < 2) { step(); acc -= STEP_MS; steps++; }
    if (steps === 2) acc = 0;
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="grow"></div>
  <button id="auto">Auto</button>
  <button id="reset">Reset</button>`,
  status: 'Hold to blow a bubble. Tap one to pop it.',
  script,
});

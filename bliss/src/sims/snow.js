import simPage from './shell';

// Snow falling on a small town at night. Every 2px column remembers how much snow lies on its
// surface (ground or roof); landing flakes add to it, and snow piled steeper than it can hold
// slides to the lower neighbour, so drifts form and snow spills off roof edges.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var COL = 2;
  var MAX_DEPTH = 90;
  var GUST_RADIUS = 90;
  var SWEEP_RADIUS = 26;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, GROUND, NC;
  var base, depth, houses, scenery;
  var fx = [], fy = [], fvx = [], fsize = [], fphase = [];
  var mode = 'light', sweep = false;
  var pointers = {};
  var t = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    GROUND = H - 70;
    NC = Math.ceil(W / COL);
    // Three houses with pitched roofs; the surface of each column is its roof or the ground.
    var hw = Math.min(110, W * 0.26);
    houses = [
      { x: W * 0.06, w: hw, h: 70, roof: 42 },
      { x: W * 0.5 - hw * 0.55, w: hw * 1.1, h: 95, roof: 50 },
      { x: W * 0.94 - hw * 0.9, w: hw * 0.9, h: 60, roof: 36 },
    ];
    base = new Float32Array(NC);
    for (var c = 0; c < NC; c++) {
      var x = c * COL + COL / 2, y = GROUND + Math.sin(x * 0.02) * 4;
      for (var i = 0; i < houses.length; i++) {
        var hs = houses[i], over = 8;
        if (x < hs.x - over || x > hs.x + hs.w + over) continue;
        var mid = hs.x + hs.w / 2, half = hs.w / 2 + over;
        y = Math.min(y, GROUND - hs.h - hs.roof * (1 - Math.abs(x - mid) / half));
      }
      base[c] = y;
    }
    depth = new Float32Array(NC);
    drawScenery();
    setCount();
  }

  // Sky, moon, distant trees and the houses with lit windows, drawn once.
  function drawScenery() {
    scenery = document.createElement('canvas');
    scenery.width = canvas.width;
    scenery.height = canvas.height;
    var s = scenery.getContext('2d');
    s.scale(DPR, DPR);
    var g = s.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1024');
    g.addColorStop(1, '#2a3554');
    s.fillStyle = g;
    s.fillRect(0, 0, W, H);
    var mg = s.createRadialGradient(W * 0.78, TOP + 70, 4, W * 0.78, TOP + 70, 70);
    mg.addColorStop(0, 'rgba(255, 250, 230, 1)');
    mg.addColorStop(0.3, 'rgba(255, 250, 230, 0.9)');
    mg.addColorStop(0.32, 'rgba(255, 250, 230, 0.15)');
    mg.addColorStop(1, 'rgba(255, 250, 230, 0)');
    s.fillStyle = mg;
    s.fillRect(W * 0.78 - 70, TOP, 140, 140);
    s.fillStyle = '#1a2340';
    for (var x = -10; x < W; x += 22) {
      var th = 40 + ((x * 7919) % 37);
      s.beginPath(); s.moveTo(x, GROUND - 6); s.lineTo(x + 12, GROUND - 6 - th); s.lineTo(x + 24, GROUND - 6); s.fill();
    }
    s.fillStyle = '#d9e2f2';
    s.fillRect(0, GROUND, W, H - GROUND);
    houses.forEach(function (hs) {
      s.fillStyle = '#3a2c2a';
      s.fillRect(hs.x, GROUND - hs.h, hs.w, hs.h);
      s.fillStyle = '#5a2f2a';
      s.beginPath();
      s.moveTo(hs.x - 8, GROUND - hs.h); s.lineTo(hs.x + hs.w / 2, GROUND - hs.h - hs.roof); s.lineTo(hs.x + hs.w + 8, GROUND - hs.h);
      s.fill();
      var ww = hs.w * 0.2, wh = 16;
      [0.22, 0.58].forEach(function (f) {
        var wx = hs.x + hs.w * f, wy = GROUND - hs.h * 0.62;
        var wg = s.createRadialGradient(wx + ww / 2, wy + wh / 2, 2, wx + ww / 2, wy + wh / 2, 40);
        wg.addColorStop(0, 'rgba(255, 190, 90, 0.35)');
        wg.addColorStop(1, 'rgba(255, 190, 90, 0)');
        s.fillStyle = wg;
        s.fillRect(wx - 30, wy - 30, ww + 60, wh + 60);
        s.fillStyle = '#ffc770';
        s.fillRect(wx, wy, ww, wh);
        s.fillStyle = '#3a2c2a';
        s.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      });
      s.fillStyle = '#2a1f1d';
      s.fillRect(hs.x + hs.w * 0.42, GROUND - 34, hs.w * 0.16, 34);
    });
  }

  function spawn(i, anywhere) {
    fx[i] = Math.random() * (W + 80) - 40;
    fy[i] = anywhere ? TOP + Math.random() * (GROUND - TOP) : TOP - Math.random() * 40;
    fsize[i] = 0.8 + Math.random() * 2.2;
    fvx[i] = 0;
    fphase[i] = Math.random() * Math.PI * 2;
  }

  function setCount() {
    var n = mode === 'light' ? 260 : 950;
    fx.length = fy.length = fvx.length = fsize.length = fphase.length = n;
    for (var i = 0; i < n; i++) if (fx[i] === undefined) spawn(i, true);
  }

  function surfaceAt(x) {
    var c = Math.max(0, Math.min(NC - 1, (x / COL) | 0));
    return base[c] - depth[c];
  }

  function step() {
    t++;
    var wind = mode === 'blizzard' ? 1.6 + Math.sin(t * 0.01) * 1.2 : 0.25 * Math.sin(t * 0.004);
    for (var i = 0; i < fx.length; i++) {
      var s = fsize[i];
      fvx[i] *= 0.96;
      fx[i] += wind * (0.4 + s * 0.3) + Math.sin(t * 0.02 + fphase[i]) * 0.35 + fvx[i];
      fy[i] += 0.35 + s * 0.38;
      for (var id in pointers) {
        var p = pointers[id];
        if (sweep) continue;
        var dx = fx[i] - p.x, dy = fy[i] - p.y;
        if (dx * dx + dy * dy < GUST_RADIUS * GUST_RADIUS) { fvx[i] += p.vx * 0.08; fy[i] += p.vy * 0.08; }
      }
      if (fx[i] < -40) fx[i] += W + 80; else if (fx[i] > W + 40) fx[i] -= W + 80;
      if (fx[i] >= 0 && fx[i] < W && fy[i] >= surfaceAt(fx[i])) {
        var c = (fx[i] / COL) | 0;
        if (depth[c] < MAX_DEPTH) depth[c] += s * 1.1;
        spawn(i, false);
      } else if (fy[i] > H) spawn(i, false);
    }
    // Snow piled steeper than it can hold slides to the lower side, a little at a time.
    for (var pass = 0; pass < 2; pass++) {
      for (var c2 = 0; c2 < NC - 1; c2++) {
        var a = base[c2] - depth[c2], b = base[c2 + 1] - depth[c2 + 1];
        var diff = a - b;
        if (diff > 2.2 && depth[c2 + 1] > 0) { var m = Math.min(depth[c2 + 1], (diff - 2.2) * 0.25, 0.6); depth[c2 + 1] -= m; depth[c2] += m; }
        else if (diff < -2.2 && depth[c2] > 0) { var m2 = Math.min(depth[c2], (-diff - 2.2) * 0.25, 0.6); depth[c2] -= m2; depth[c2 + 1] += m2; }
      }
    }
    if (sweep) {
      for (var id2 in pointers) {
        var q = pointers[id2];
        var from = Math.max(0, ((q.x - SWEEP_RADIUS) / COL) | 0), to = Math.min(NC - 1, ((q.x + SWEEP_RADIUS) / COL) | 0);
        for (var k = from; k <= to; k++) {
          var top = base[k] - depth[k];
          if (q.y > top - SWEEP_RADIUS && depth[k] > 0) depth[k] = Math.max(0, depth[k] - 1.5);
        }
      }
    }
    for (id in pointers) { pointers[id].vx *= 0.7; pointers[id].vy *= 0.7; }
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scenery, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // Settled snow: a shape from the snow surface down to whatever it rests on.
    ctx.beginPath();
    ctx.moveTo(0, base[0]);
    for (var c = 0; c < NC; c++) ctx.lineTo(c * COL + COL / 2, base[c] - depth[c]);
    for (c = NC - 1; c >= 0; c--) ctx.lineTo(c * COL + COL / 2, base[c] + 1);
    ctx.closePath();
    var sg = ctx.createLinearGradient(0, TOP, 0, H);
    sg.addColorStop(0, '#ffffff');
    sg.addColorStop(1, '#c9d6ee');
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (var i = 0; i < fx.length; i++) {
      var s = fsize[i];
      ctx.globalAlpha = 0.45 + s * 0.2;
      ctx.beginPath();
      ctx.arc(fx[i], fy[i], s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, vx: 0, vy: 0 };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.vx = e.clientX - p.x; p.vy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['mLight', 'mBlizzard'], function (id) { mode = id === 'mLight' ? 'light' : 'blizzard'; setCount(); });
  toggle('sweep', function (on) {
    sweep = on;
    statusEl.textContent = on ? 'Drag across the snow to sweep it away.' : 'Swipe to blow gusts through the snow.';
  });
  document.getElementById('reset').onclick = function () { depth.fill(0); };

  window.addEventListener('resize', resize);
  resize();
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
  <div class="seg" role="group" aria-label="Snowfall">
    <button id="mLight" class="on">Light</button>
    <button id="mBlizzard">Blizzard</button>
  </div>
  <div class="grow"></div>
  <button id="sweep">Sweep</button>
  <button id="reset">Reset</button>`,
  status: 'Swipe to blow gusts through the snow.',
  script,
});

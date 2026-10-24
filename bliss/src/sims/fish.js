import simPage from './shell';

// A school of fish (boids): each fish keeps a little space from its neighbours, matches their
// heading and drifts toward their middle, which together makes the school move as one. A finger
// is either a lure they swim to or a shark they scatter from.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var COUNT = 220;
  var SEE = 34;
  var CROWD = 12;
  var MAX_SPEED = 2.6;
  var MIN_SPEED = 1.1;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, water;
  var x = [], y = [], vx = [], vy = [], hue = [], size = [], phase = [];
  var mode = 'lure';
  var pointers = {};
  var cell = SEE, gw, gh, head, next;
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
    gw = Math.ceil(W / cell) + 1;
    gh = Math.ceil(H / cell) + 1;
    head = new Int32Array(gw * gh);
    next = new Int32Array(COUNT);
    water = ctx.createLinearGradient(0, 0, 0, H);
    water.addColorStop(0, '#0f5470');
    water.addColorStop(1, '#04192a');
  }

  function reset() {
    for (var i = 0; i < COUNT; i++) {
      x[i] = W * (0.3 + Math.random() * 0.4); y[i] = TOP + (H - TOP) * (0.3 + Math.random() * 0.4);
      var a = Math.random() * Math.PI * 2;
      vx[i] = Math.cos(a) * 1.5; vy[i] = Math.sin(a) * 1.5;
      hue[i] = Math.random() < 0.12 ? 18 + Math.random() * 20 : 190 + Math.random() * 30;
      size[i] = 0.8 + Math.random() * 0.5;
      phase[i] = Math.random() * Math.PI * 2;
    }
  }

  function step() {
    t++;
    head.fill(-1);
    for (var i = 0; i < COUNT; i++) {
      var c = Math.min(gh - 1, Math.max(0, (y[i] / cell) | 0)) * gw + Math.min(gw - 1, Math.max(0, (x[i] / cell) | 0));
      next[i] = head[c]; head[c] = i;
    }
    var touches = [];
    for (var id in pointers) touches.push(pointers[id]);
    for (i = 0; i < COUNT; i++) {
      var sx = 0, sy = 0, ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
      var gx = (x[i] / cell) | 0, gy = (y[i] / cell) | 0;
      for (var oy = -1; oy <= 1; oy++) {
        for (var ox = -1; ox <= 1; ox++) {
          var col = gx + ox, row = gy + oy;
          if (col < 0 || row < 0 || col >= gw || row >= gh) continue;
          for (var j = head[row * gw + col]; j !== -1; j = next[j]) {
            if (j === i) continue;
            var dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy;
            if (d2 > SEE * SEE) continue;
            n++;
            ax += vx[j]; ay += vy[j]; cx += x[j]; cy += y[j];
            if (d2 < CROWD * CROWD) { var d = Math.sqrt(d2) || 0.1; sx -= dx / d; sy -= dy / d; }
          }
        }
      }
      if (n) {
        vx[i] += (ax / n - vx[i]) * 0.05 + (cx / n - x[i]) * 0.0015 + sx * 0.09;
        vy[i] += (ay / n - vy[i]) * 0.05 + (cy / n - y[i]) * 0.0015 + sy * 0.09;
      }
      vx[i] += Math.sin(t * 0.01 + phase[i]) * 0.02;
      vy[i] += Math.cos(t * 0.013 + phase[i]) * 0.02;
      for (var k = 0; k < touches.length; k++) {
        var tx = touches[k].x - x[i], ty = touches[k].y - y[i], td = Math.sqrt(tx * tx + ty * ty) || 1;
        if (mode === 'lure') { vx[i] += (tx / td) * 0.07; vy[i] += (ty / td) * 0.07; }
        else if (td < 140) { var f = (1 - td / 140) * 0.6; vx[i] -= (tx / td) * f; vy[i] -= (ty / td) * f; }
      }
      // Turn away from the edges of the tank.
      var m = 40;
      if (x[i] < m) vx[i] += 0.08; if (x[i] > W - m) vx[i] -= 0.08;
      if (y[i] < TOP + m) vy[i] += 0.08; if (y[i] > H - m) vy[i] -= 0.08;
      var sp = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) || 1;
      var limit = mode === 'shark' && touches.length ? MAX_SPEED * 1.8 : MAX_SPEED;
      if (sp > limit) { vx[i] *= limit / sp; vy[i] *= limit / sp; }
      else if (sp < MIN_SPEED) { vx[i] *= MIN_SPEED / sp; vy[i] *= MIN_SPEED / sp; }
      x[i] += vx[i]; y[i] += vy[i];
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, W, H);
    // Shafts of light from the surface.
    ctx.globalCompositeOperation = 'lighter';
    for (var r = 0; r < 5; r++) {
      var rx = (W * (r + 0.5)) / 5 + Math.sin(t * 0.004 + r) * 30;
      var g = ctx.createLinearGradient(rx, TOP, rx + 60, H);
      g.addColorStop(0, 'rgba(160, 230, 255, 0.08)');
      g.addColorStop(1, 'rgba(160, 230, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(rx - 20, TOP); ctx.lineTo(rx + 20, TOP); ctx.lineTo(rx + 120, H); ctx.lineTo(rx + 40, H);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    for (var i = 0; i < COUNT; i++) {
      var ang = Math.atan2(vy[i], vx[i]), s = size[i] * 6;
      var wag = Math.sin(t * 0.35 + phase[i]) * 0.35;
      ctx.save();
      ctx.translate(x[i], y[i]);
      ctx.rotate(ang);
      ctx.fillStyle = 'hsl(' + hue[i] + ', 70%, 62%)';
      ctx.beginPath();
      ctx.moveTo(s * 1.4, 0);
      ctx.quadraticCurveTo(0, -s * 0.6, -s, 0);
      ctx.quadraticCurveTo(0, s * 0.6, s * 1.4, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, 0);
      ctx.lineTo(-s * 1.7, -s * 0.55 + wag * s);
      ctx.lineTo(-s * 1.7, s * 0.55 + wag * s);
      ctx.fill();
      ctx.restore();
    }
    for (var id in pointers) {
      var p = pointers[id];
      if (mode === 'lure') {
        ctx.fillStyle = '#ffd36b';
        ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, TOP); ctx.stroke();
      } else {
        ctx.fillStyle = '#5d6f7d';
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.beginPath();
        ctx.moveTo(30, 0); ctx.quadraticCurveTo(0, -14, -28, 0); ctx.quadraticCurveTo(0, 12, 30, 0);
        ctx.moveTo(-6, -10); ctx.lineTo(4, -26); ctx.lineTo(10, -8);
        ctx.moveTo(-24, 0); ctx.lineTo(-40, -14); ctx.lineTo(-36, 0); ctx.lineTo(-40, 14);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['mLure', 'mShark'], function (id) {
    mode = id === 'mLure' ? 'lure' : 'shark';
    statusEl.textContent = mode === 'lure' ? 'Hold a finger down and the fish come to the lure.' : 'Chase the school with the shark.';
  });
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
  <div class="seg" role="group" aria-label="Finger">
    <button id="mLure" class="on">Lure</button>
    <button id="mShark">Shark</button>
  </div>
  <div class="grow"></div>
  <button id="reset">Reset</button>`,
  status: 'Hold a finger down and the fish come to the lure.',
  script,
});

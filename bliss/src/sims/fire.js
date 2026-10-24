import simPage from './shell';

// A campfire from a heat grid: each cell takes the average heat of the cells just below it (shifted
// by the wind), minus a random amount of cooling, so heat rises in soft, licking tongues that break
// up as they climb. Logs feed heat along the bottom while there is fuel; a finger paints extra heat.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var CELL = 3;
  var MAX_HEAT = 64;
  var BRUSH = 4;
  var COOLING = 1.05;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, GW, GH, LOG_Y;
  var heat, image, gridCanvas, gridCtx, palette;
  var wind = 0, windOn = false, fuel = true;
  var pointers = {};
  var sparks = [];

  // Black through deep red, orange and yellow to white, with alpha rising out of the dark.
  (function () {
    palette = [];
    for (var i = 0; i <= MAX_HEAT; i++) {
      var t = i / MAX_HEAT;
      var r = Math.min(255, t * 3 * 255), g = Math.min(255, Math.max(0, (t - 0.33) * 2.4 * 255)), b = Math.min(255, Math.max(0, (t - 0.75) * 4 * 255));
      palette.push([r, g, b, Math.min(255, t * 4 * 255)]);
    }
  })();

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    GW = Math.ceil(W / CELL);
    GH = Math.ceil((H - TOP) / CELL);
    heat = new Float32Array(GW * GH);
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = GW;
    gridCanvas.height = GH;
    gridCtx = gridCanvas.getContext('2d');
    image = gridCtx.createImageData(GW, GH);
    LOG_Y = H - 70;
  }

  function step() {
    var i, x, y;
    // Embers along the logs.
    var logRow = Math.floor((LOG_Y - TOP) / CELL);
    var from = Math.floor(GW * 0.3), to = Math.ceil(GW * 0.7), now = performance.now() * 0.001;
    for (x = from; x < to; x++) {
      // Embers flicker in drifting patches, which splits the fire into separate tongues.
      var flicker = 0.55 + 0.45 * Math.sin(x * 0.45 + now * 7) * Math.sin(x * 0.17 - now * 4.3);
      var edge = (Math.min(x - from, to - x) / ((to - from) / 2)) * flicker;
      for (y = logRow; y < Math.min(GH, logRow + 3); y++) {
        heat[y * GW + x] = fuel ? Math.max(heat[y * GW + x], MAX_HEAT * (0.55 + 0.45 * edge) * (0.75 + Math.random() * 0.25)) : heat[y * GW + x] * 0.97;
      }
    }
    for (var id in pointers) {
      var p = pointers[id], cx = p.x / CELL, cy = (p.y - TOP) / CELL;
      for (y = Math.max(0, (cy - BRUSH) | 0); y < Math.min(GH, cy + BRUSH); y++) {
        for (x = Math.max(0, (cx - BRUSH) | 0); x < Math.min(GW, cx + BRUSH); x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < BRUSH * BRUSH) heat[y * GW + x] = MAX_HEAT;
        }
      }
    }
    // Spread upward: each cell averages the cells below it, shifted by the wind, then cools.
    var drift = windOn ? Math.round(wind) : 0;
    for (y = 0; y < GH - 2; y++) {
      for (x = 0; x < GW; x++) {
        var sx = x - drift + ((Math.random() * 3) | 0) - 1;
        if (sx < 1) sx = 1; else if (sx > GW - 2) sx = GW - 2;
        var b = (y + 1) * GW + sx;
        var v = (heat[b - 1] + heat[b] + heat[b + 1] + heat[b + GW]) * 0.25 - Math.random() * COOLING;
        heat[y * GW + x] = v > 0 ? v : 0;
      }
    }
    if (windOn) wind = 1 + Math.sin(performance.now() * 0.0015) * 0.6;
    // Sparks fly up out of the hottest parts.
    if (fuel && Math.random() < 0.5 && sparks.length < 160) {
      sparks.push({ x: W * (0.35 + Math.random() * 0.3), y: LOG_Y - 30, vx: (Math.random() - 0.5) * 1.2 + (windOn ? 1 : 0), vy: -2 - Math.random() * 2.5, life: 50 + Math.random() * 60, age: 0 });
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.015; s.vx += (Math.random() - 0.5) * 0.25; s.age++;
      if (s.age > s.life) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); }
    }
  }

  function draw() {
    var data = image.data;
    for (var i = 0, o = 0; i < heat.length; i++, o += 4) {
      var c = palette[heat[i] < MAX_HEAT ? heat[i] | 0 : MAX_HEAT];
      data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = c[3];
    }
    gridCtx.putImageData(image, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05060a');
    g.addColorStop(1, '#130b08');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Firelight on the ground.
    var glow = ctx.createRadialGradient(W / 2, LOG_Y, 10, W / 2, LOG_Y, W * 0.7);
    glow.addColorStop(0, fuel ? 'rgba(255, 120, 40, 0.28)' : 'rgba(255, 90, 30, 0.08)');
    glow.addColorStop(1, 'rgba(255, 90, 30, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#120c09';
    ctx.fillRect(0, LOG_Y + 22, W, H - LOG_Y - 22);

    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(gridCanvas, 0, TOP, GW * CELL, GH * CELL);
    for (i = 0; i < sparks.length; i++) {
      var s = sparks[i], a = 1 - s.age / s.life;
      ctx.fillStyle = 'rgba(255, ' + (150 + 80 * a | 0) + ', 60,' + a.toFixed(2) + ')';
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Crossed logs in front of the embers.
    ctx.lineCap = 'round';
    [[-1, '#3b2416'], [1, '#4a2e1c']].forEach(function (l) {
      ctx.strokeStyle = l[1];
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(W / 2 - l[0] * W * 0.22, LOG_Y + 24);
      ctx.lineTo(W / 2 + l[0] * W * 0.2, LOG_Y + 6);
      ctx.stroke();
    });
    ctx.strokeStyle = fuel ? 'rgba(255, 110, 30, 0.6)' : 'rgba(120, 60, 30, 0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W * 0.36, LOG_Y + 10); ctx.lineTo(W * 0.64, LOG_Y + 10);
    ctx.stroke();
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

  toggle('wind', function (on) { windOn = on; });
  toggle('fuel', function (on) {
    fuel = on;
    statusEl.textContent = fuel ? 'Drag to paint flames.' : 'Out of fuel. The fire is dying down.';
  });
  document.getElementById('fuel').className = 'toggle on';
  document.getElementById('fuel').setAttribute('aria-pressed', 'true');

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
  <div class="grow"></div>
  <button id="wind">Wind</button>
  <button id="fuel">Fuel</button>`,
  status: 'Drag to paint flames.',
  script,
});

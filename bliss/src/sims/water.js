import simPage from './shell';

// A tank of water: particles with double density relaxation (Clavet et al. 2005), drawn as one
// smooth surface by splatting each particle into a low-resolution field and shading it.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var RADIUS = 16;
  var REST_DENSITY = 3.2;
  var STIFFNESS = 0.9;
  var NEAR_STIFFNESS = 2.2;
  var GRAVITY = 0.16;
  var DAMPING = 0.998;
  var MAX = 3200;
  var STIR_RADIUS = 52;
  var FIELD_SCALE = 3;
  var SPLAT = 11;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP;
  var x = new Float32Array(MAX), y = new Float32Array(MAX);
  var vx = new Float32Array(MAX), vy = new Float32Array(MAX);
  var prevX = new Float32Array(MAX), prevY = new Float32Array(MAX);
  var count = 0;
  var gx = 0, gy = GRAVITY;
  var mode = 'stir';
  var pointers = {};
  var cellSize = RADIUS, gridW, gridH, cellStart, cellNext;
  var field, foam, fieldW, fieldH, fieldCanvas, fieldCtx, image;
  var tiles;

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 8;

    gridW = Math.ceil(W / cellSize) + 1;
    gridH = Math.ceil(H / cellSize) + 1;
    cellStart = new Int32Array(gridW * gridH);
    cellNext = new Int32Array(MAX);

    fieldW = Math.ceil(W / FIELD_SCALE);
    fieldH = Math.ceil(H / FIELD_SCALE);
    field = new Float32Array(fieldW * fieldH);
    foam = new Float32Array(fieldW * fieldH);
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = fieldW;
    fieldCanvas.height = fieldH;
    fieldCtx = fieldCanvas.getContext('2d');
    image = fieldCtx.createImageData(fieldW, fieldH);

    drawTiles();
    fill();
  }

  // Pool tiles behind the water, drawn once.
  function drawTiles() {
    tiles = document.createElement('canvas');
    tiles.width = canvas.width;
    tiles.height = canvas.height;
    var t = tiles.getContext('2d');
    t.scale(DPR, DPR);
    var g = t.createLinearGradient(0, TOP, 0, H);
    g.addColorStop(0, '#14201f');
    g.addColorStop(1, '#0c1414');
    t.fillStyle = g;
    t.fillRect(0, 0, W, H);
    t.strokeStyle = 'rgba(160, 200, 200, 0.07)';
    t.lineWidth = 1;
    var size = 28;
    t.beginPath();
    for (var tx = 0; tx <= W; tx += size) { t.moveTo(tx + 0.5, TOP); t.lineTo(tx + 0.5, H); }
    for (var ty = TOP; ty <= H; ty += size) { t.moveTo(0, ty + 0.5); t.lineTo(W, ty + 0.5); }
    t.stroke();
  }

  function fill() {
    count = 0;
    var spacing = RADIUS * 0.5;
    var depth = (H - TOP) * 0.36;
    for (var py = H - spacing; py > H - depth && count < MAX; py -= spacing) {
      for (var px = spacing; px < W - spacing && count < MAX; px += spacing) {
        add(px + (Math.random() - 0.5), py + (Math.random() - 0.5), 0, 0);
      }
    }
    updateStatus();
  }

  function add(px, py, ivx, ivy) {
    if (count >= MAX) return false;
    x[count] = px; y[count] = py; vx[count] = ivx; vy[count] = ivy;
    count++;
    return true;
  }

  function updateStatus() {
    statusEl.textContent = count >= MAX ? 'Tank full' : count.toLocaleString() + ' drops';
  }

  function buildGrid() {
    cellStart.fill(-1);
    for (var i = 0; i < count; i++) {
      var cx = Math.min(gridW - 1, Math.max(0, (x[i] / cellSize) | 0));
      var cy = Math.min(gridH - 1, Math.max(0, (y[i] / cellSize) | 0));
      var c = cy * gridW + cx;
      cellNext[i] = cellStart[c];
      cellStart[c] = i;
    }
  }

  function relax() {
    var r2 = RADIUS * RADIUS;
    for (var i = 0; i < count; i++) {
      var xi = x[i], yi = y[i];
      var cx = (xi / cellSize) | 0, cy = (yi / cellSize) | 0;
      var density = 0, near = 0;
      for (var oy = -1; oy <= 1; oy++) {
        var row = cy + oy;
        if (row < 0 || row >= gridH) continue;
        for (var ox = -1; ox <= 1; ox++) {
          var col = cx + ox;
          if (col < 0 || col >= gridW) continue;
          for (var j = cellStart[row * gridW + col]; j !== -1; j = cellNext[j]) {
            if (j === i) continue;
            var dx = x[j] - xi, dy = y[j] - yi, d2 = dx * dx + dy * dy;
            if (d2 >= r2) continue;
            var q = 1 - Math.sqrt(d2) / RADIUS;
            density += q * q;
            near += q * q * q;
          }
        }
      }
      var pressure = STIFFNESS * (density - REST_DENSITY);
      var nearPressure = NEAR_STIFFNESS * near;
      var mx = 0, my = 0;
      for (oy = -1; oy <= 1; oy++) {
        row = cy + oy;
        if (row < 0 || row >= gridH) continue;
        for (ox = -1; ox <= 1; ox++) {
          col = cx + ox;
          if (col < 0 || col >= gridW) continue;
          for (j = cellStart[row * gridW + col]; j !== -1; j = cellNext[j]) {
            if (j === i) continue;
            dx = x[j] - xi; dy = y[j] - yi; d2 = dx * dx + dy * dy;
            if (d2 >= r2 || d2 === 0) continue;
            var d = Math.sqrt(d2);
            q = 1 - d / RADIUS;
            var push = (pressure * q + nearPressure * q * q) * 0.5 / d;
            dx *= push; dy *= push;
            x[j] += dx; y[j] += dy;
            mx -= dx; my -= dy;
          }
        }
      }
      x[i] = xi + mx;
      y[i] = yi + my;
    }
  }

  function step() {
    var i, id, p;
    for (id in pointers) {
      p = pointers[id];
      if (mode === 'pour') {
        for (var n = 0; n < 3; n++) {
          if (!add(p.x + (Math.random() - 0.5) * 10, p.y + (Math.random() - 0.5) * 10, p.vx * 0.5, p.vy * 0.5 + 1)) break;
        }
        updateStatus();
      }
    }

    for (i = 0; i < count; i++) {
      vx[i] = vx[i] * DAMPING + gx;
      vy[i] = vy[i] * DAMPING + gy;
    }
    if (mode === 'stir') {
      for (id in pointers) {
        p = pointers[id];
        var r2 = STIR_RADIUS * STIR_RADIUS;
        for (i = 0; i < count; i++) {
          var dx = x[i] - p.x, dy = y[i] - p.y, d2 = dx * dx + dy * dy;
          if (d2 > r2) continue;
          var w = 1 - Math.sqrt(d2) / STIR_RADIUS;
          vx[i] += (p.vx - vx[i]) * 0.55 * w;
          vy[i] += (p.vy - vy[i]) * 0.55 * w;
        }
      }
    }
    for (i = 0; i < count; i++) {
      prevX[i] = x[i]; prevY[i] = y[i];
      x[i] += vx[i]; y[i] += vy[i];
    }
    buildGrid();
    relax();

    var left = 3, right = W - 3, top = TOP + 3, bottom = H - 3;
    for (i = 0; i < count; i++) {
      if (x[i] < left) x[i] = left + Math.random() * 0.5;
      else if (x[i] > right) x[i] = right - Math.random() * 0.5;
      if (y[i] < top) y[i] = top + Math.random() * 0.5;
      else if (y[i] > bottom) y[i] = bottom - Math.random() * 0.5;
      vx[i] = x[i] - prevX[i];
      vy[i] = y[i] - prevY[i];
    }
    for (id in pointers) { pointers[id].vx *= 0.8; pointers[id].vy *= 0.8; }
  }

  function draw(now) {
    var t = now * 0.0012;
    // Splat every particle into a coarse density field (and a foam field weighted by speed).
    field.fill(0);
    foam.fill(0);
    var rCells = SPLAT / FIELD_SCALE, rc = Math.ceil(rCells), r2 = rCells * rCells;
    for (var i = 0; i < count; i++) {
      var fx = x[i] / FIELD_SCALE, fy = y[i] / FIELD_SCALE;
      var speed = vx[i] * vx[i] + vy[i] * vy[i];
      var froth = speed > 49 ? Math.min(1, (speed - 49) / 80) : 0;
      var cx = fx | 0, cy = fy | 0;
      for (var oy = -rc; oy <= rc; oy++) {
        var yy = cy + oy;
        if (yy < 0 || yy >= fieldH) continue;
        for (var ox = -rc; ox <= rc; ox++) {
          var xx = cx + ox;
          if (xx < 0 || xx >= fieldW) continue;
          var dx = xx + 0.5 - fx, dy = yy + 0.5 - fy, d2 = dx * dx + dy * dy;
          if (d2 >= r2) continue;
          var k = 1 - d2 / r2;
          k *= k;
          field[yy * fieldW + xx] += k;
          if (froth) foam[yy * fieldW + xx] += k * froth;
        }
      }
    }

    // Shade: transparent outside, a bright meniscus at the surface, deeper blue lower down.
    var data = image.data;
    var tankTop = TOP / FIELD_SCALE, tankDepth = fieldH - tankTop;
    for (var yy2 = 0; yy2 < fieldH; yy2++) {
      var depth = Math.max(0, Math.min(1, (yy2 - tankTop) / tankDepth));
      for (var xx2 = 0; xx2 < fieldW; xx2++) {
        var f = yy2 * fieldW + xx2, v = field[f], o = f * 4;
        if (v < 0.35) { data[o + 3] = 0; continue; }
        var alpha = v < 0.75 ? (v - 0.35) / 0.4 : 1;
        var edge = v < 1.4 ? 1 - (v - 0.35) / 1.05 : 0;
        var fm = Math.min(1, foam[f] * 0.8);
        // Drifting caustic ripples, strongest near the surface.
        var caustic = Math.sin(xx2 * 0.21 + t) * Math.sin(yy2 * 0.17 - t * 0.8) + Math.sin((xx2 + yy2) * 0.11 + t * 1.3);
        var lift = 1 + 0.07 * caustic * (1 - depth * 0.7);
        var r = (28 + 40 * (1 - depth)) * lift + 150 * edge;
        var g = (96 + 50 * (1 - depth)) * lift + 120 * edge;
        var b = (150 + 50 * (1 - depth)) * lift + 70 * edge;
        data[o] = r + (235 - r) * fm;
        data[o + 1] = g + (245 - g) * fm;
        data[o + 2] = b + (250 - b) * fm;
        data[o + 3] = 255 * alpha * (0.82 + 0.18 * Math.max(edge, fm));
      }
    }
    fieldCtx.putImageData(image, 0, 0);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tiles, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas, 0, 0, fieldW * FIELD_SCALE, fieldH * FIELD_SCALE);

    for (var id in pointers) {
      var p = pointers[id];
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, mode === 'stir' ? STIR_RADIUS : 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now() };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    var now = performance.now(), dt = Math.max(1, now - p.t) / STEP_MS;
    p.vx = Math.max(-25, Math.min(25, (e.clientX - p.x) / dt));
    p.vy = Math.max(-25, Math.min(25, (e.clientY - p.y) / dt));
    p.x = e.clientX; p.y = e.clientY; p.t = now;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  window.onTilt = function (tx, ty) {
    gx = GRAVITY * tx;
    gy = GRAVITY * ty;
  };
  segment(['mStir', 'mPour'], function (id) { mode = id === 'mStir' ? 'stir' : 'pour'; });
  toggle('tilt', function (on) {
    post({ type: 'tilt', on: on });
    if (!on) { gx = 0; gy = GRAVITY; }
  });
  document.getElementById('reset').onclick = fill;

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  build();
  var last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100);
    last = now;
    var steps = 0;
    while (acc >= STEP_MS && steps < 2) { step(); acc -= STEP_MS; steps++; }
    if (steps === 2) acc = 0;
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="seg" role="group" aria-label="Touch mode">
    <button id="mStir" class="on">Stir</button>
    <button id="mPour">Pour</button>
  </div>
  <div class="grow"></div>
  <button id="tilt">Tilt</button>
  <button id="reset">Reset</button>`,
  status: 'Stir the water, or switch to Pour.',
  script,
});

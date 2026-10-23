// Cloth simulation page rendered inside a WebView. Plain canvas + Verlet physics.
// Messages to the app: {type: 'back'} and {type: 'tear'}.
// Keep backticks and dollar-brace sequences out of this string.
const clothHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  :root {
    --bg: #111917;
    --bg-deep: #0a0f0e;
    --fg: #e4ece8;
    --muted: #8fa39c;
    --chip: #1c2825;
    --chip-on: #3f7366;
  }
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, Roboto, sans-serif; -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent; }
  canvas { position: fixed; inset: 0; touch-action: none; display: block; }
  #bar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; z-index: 2; }
  button { font: inherit; color: var(--fg); background: var(--chip); border: 0; border-radius: 999px;
    height: 38px; padding: 0 14px; font-size: 14px; font-weight: 600; letter-spacing: 0.02em; }
  button:focus-visible { outline: 2px solid var(--chip-on); outline-offset: 2px; }
  #back { width: 38px; padding: 0; font-size: 20px; line-height: 38px; }
  .seg { display: flex; background: var(--chip); border-radius: 999px; padding: 3px; gap: 2px; }
  .seg button { height: 32px; background: transparent; padding: 0 14px; }
  .seg button.on, #wind.on { background: var(--chip-on); }
  .grow { flex: 1; }
  #status { position: fixed; left: 0; right: 0; bottom: 18px; text-align: center; font-size: 13px;
    color: var(--muted); letter-spacing: 0.04em; pointer-events: none; z-index: 2;
    font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="bar">
  <button id="back" aria-label="Back">&#8592;</button>
  <div class="seg" role="group" aria-label="Touch mode">
    <button id="mPull" class="on">Pull</button>
    <button id="mRip">Rip</button>
  </div>
  <div class="grow"></div>
  <button id="wind" aria-pressed="false">Wind</button>
  <button id="reset">Reset</button>
</div>
<div id="status">Drag the cloth. Pull hard and it tears.</div>
<script>
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRAVITY = 0.24;
  var DAMPING = 0.991;
  var ITERATIONS = 10;
  var TEAR_RATIO = 2.2;
  var GRIP_TEAR_RATIO = 1.8;
  var HEM_TEAR_RATIO = 3.4;
  var HEM_ROWS = 2;
  var STEP_MS = 1000 / 60;
  var SHADES = 22;

  var W, H, DPR, TOP, LEFT, CLOTH_W;
  var COLS, ROWS, N, REST, HC, CC;
  var px, py, ox, oy, pinned, held;
  var ca, cb, alive, quadOn;
  var torn = 0;
  var mode = 'pull';
  var wind = false;
  var pointers = {};
  var trails = [];
  var bgGrad;
  var lastBuzz = 0;

  var fills = [];
  (function makeShades() {
    for (var band = 0; band < 2; band++) {
      for (var s = 0; s < SHADES; s++) {
        var t = s / (SHADES - 1);
        var light = 22 + t * 36 + (band ? 3 : 0);
        var sat = band ? 26 : 34;
        fills.push('hsl(166,' + sat + '%,' + light.toFixed(1) + '%)');
      }
    }
  })();

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    bgGrad = ctx.createRadialGradient(W / 2, H * 0.4, 10, W / 2, H * 0.4, Math.max(W, H) * 0.8);
    bgGrad.addColorStop(0, '#16211e');
    bgGrad.addColorStop(1, '#0a0f0e');

    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 30;
    CLOTH_W = Math.min(W - 40, 560);
    COLS = Math.max(22, Math.min(44, Math.round(CLOTH_W / 11)));
    REST = CLOTH_W / (COLS - 1);
    var clothH = Math.min(H - TOP - 80, CLOTH_W * 1.2);
    ROWS = Math.max(14, Math.round(clothH / REST) + 1);
    LEFT = (W - CLOTH_W) / 2;
    N = COLS * ROWS;

    px = new Float32Array(N); py = new Float32Array(N);
    ox = new Float32Array(N); oy = new Float32Array(N);
    pinned = new Uint8Array(N); held = new Uint8Array(N);
    for (var j = 0; j < ROWS; j++) {
      for (var i = 0; i < COLS; i++) {
        var k = j * COLS + i;
        px[k] = ox[k] = LEFT + i * REST;
        py[k] = oy[k] = TOP + j * REST;
        if (j === 0 && (i % 4 === 0 || i === COLS - 1)) pinned[k] = 1;
      }
    }

    // Horizontal threads first, then vertical: h(i,j) = j*(COLS-1)+i, v(i,j) = HC + j*COLS+i.
    HC = (COLS - 1) * ROWS;
    CC = HC + COLS * (ROWS - 1);
    ca = new Int32Array(CC); cb = new Int32Array(CC);
    alive = new Uint8Array(CC).fill(1);
    var c = 0;
    for (j = 0; j < ROWS; j++) for (i = 0; i < COLS - 1; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + 1; c++; }
    for (j = 0; j < ROWS - 1; j++) for (i = 0; i < COLS; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + COLS; c++; }
    quadOn = new Uint8Array((COLS - 1) * (ROWS - 1));

    torn = 0;
    pointers = {};
    trails = [];
    statusEl.textContent = 'Drag the cloth. Pull hard and it tears.';
  }

  function tore(n) {
    torn += n;
    statusEl.textContent = torn.toLocaleString() + (torn === 1 ? ' thread' : ' threads') + ' torn';
    var now = performance.now();
    if (now - lastBuzz > 45) { lastBuzz = now; post({ type: 'tear' }); }
  }

  function step(t) {
    var gust = wind ? 0.07 + 0.04 * Math.sin(t * 0.0009) : 0;
    for (var k = 0; k < N; k++) {
      if (pinned[k] || held[k]) continue;
      if (py[k] > H + 400) continue;
      var vx = (px[k] - ox[k]) * DAMPING;
      var vy = (py[k] - oy[k]) * DAMPING;
      ox[k] = px[k]; oy[k] = py[k];
      var fx = 0, fy = GRAVITY;
      if (wind) {
        var col = k % COLS, row = (k / COLS) | 0;
        fx = gust * (0.35 + 0.65 * Math.sin(t * 0.004 + row * 0.3 + col * 0.12));
        fy += gust * 0.5 * Math.sin(t * 0.003 + col * 0.4);
      }
      px[k] += vx + fx;
      py[k] += vy + fy;
    }

    for (var id in pointers) {
      var p = pointers[id];
      for (var g = 0; g < p.pts.length; g++) {
        var h = p.pts[g];
        ox[h] = px[h]; oy[h] = py[h];
        px[h] += (p.x + p.dx[g] - px[h]) * 0.55;
        py[h] += (p.y + p.dy[g] - py[h]) * 0.55;
      }
    }

    // Fabric gives way at the fingers, where the stress concentrates; the hem on the rail is reinforced.
    var limit = REST * TEAR_RATIO, gripLimit = REST * GRIP_TEAR_RATIO, hemLimit = REST * HEM_TEAR_RATIO;
    var hemEnd = HEM_ROWS * COLS;
    var broke = 0;
    for (var it = 0; it < ITERATIONS; it++) {
      for (var c = 0; c < CC; c++) {
        if (!alive[c]) continue;
        var a = ca[c], b = cb[c];
        var dx = px[b] - px[a], dy = py[b] - py[a];
        var d = Math.sqrt(dx * dx + dy * dy);
        var max = a < hemEnd ? hemLimit : held[a] !== held[b] ? gripLimit : limit;
        if (d > max) { alive[c] = 0; broke++; continue; }
        if (d === 0) continue;
        var diff = (d - REST) / d;
        var fa = pinned[a] || held[a], fb = pinned[b] || held[b];
        if (fa && fb) continue;
        if (fa) { px[b] -= dx * diff; py[b] -= dy * diff; }
        else if (fb) { px[a] += dx * diff; py[a] += dy * diff; }
        else {
          dx *= diff * 0.5; dy *= diff * 0.5;
          px[a] += dx; py[a] += dy; px[b] -= dx; py[b] -= dy;
        }
      }
    }
    if (broke) tore(broke);
  }

  function cross(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }

  function cut(x1, y1, x2, y2) {
    var minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
    var n = 0;
    for (var c = 0; c < CC; c++) {
      if (!alive[c]) continue;
      var a = ca[c], b = cb[c];
      var ax = px[a], ay = py[a], bx = px[b], by = py[b];
      if (Math.max(ax, bx) < minX || Math.min(ax, bx) > maxX || Math.max(ay, by) < minY || Math.min(ay, by) > maxY) continue;
      var d1 = cross(x1, y1, x2, y2, ax, ay), d2 = cross(x1, y1, x2, y2, bx, by);
      var d3 = cross(ax, ay, bx, by, x1, y1), d4 = cross(ax, ay, bx, by, x2, y2);
      if (d1 * d2 < 0 && d3 * d4 < 0) { alive[c] = 0; n++; }
    }
    if (n) tore(n);
  }

  function nearest(x, y, radius) {
    var best = -1, bestD = radius * radius;
    for (var k = 0; k < N; k++) {
      var dx = px[k] - x, dy = py[k] - y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    // Curtain rail.
    ctx.strokeStyle = '#3a4a45';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(LEFT - 14, TOP);
    ctx.lineTo(LEFT + CLOTH_W + 14, TOP);
    ctx.stroke();

    var QC = COLS - 1;
    var restArea = REST * REST;
    var paths = [];
    for (var s = 0; s < SHADES * 2; s++) paths.push(new Path2D());

    for (var j = 0; j < ROWS - 1; j++) {
      for (var i = 0; i < QC; i++) {
        var q = j * QC + i;
        var on = alive[j * QC + i] && alive[(j + 1) * QC + i] && alive[HC + j * COLS + i] && alive[HC + j * COLS + i + 1];
        quadOn[q] = on;
        if (!on) continue;
        var p0 = j * COLS + i, p1 = p0 + 1, p2 = p0 + COLS + 1, p3 = p0 + COLS;
        var area = 0.5 * ((px[p2] - px[p0]) * (py[p3] - py[p1]) - (px[p3] - px[p1]) * (py[p2] - py[p0]));
        // Squashed or flipped cells read as folds and shadow; stretched cells catch the light.
        var shade = area <= 0 ? 0 : Math.min(1, Math.max(0, (area / restArea - 0.3) / 0.95));
        var path = paths[(((j / 3) | 0) % 2) * SHADES + ((shade * (SHADES - 1)) | 0)];
        path.moveTo(px[p0], py[p0]);
        path.lineTo(px[p1], py[p1]);
        path.lineTo(px[p2], py[p2]);
        path.lineTo(px[p3], py[p3]);
        path.closePath();
      }
    }
    ctx.lineWidth = 0.8;
    ctx.lineJoin = 'round';
    for (s = 0; s < paths.length; s++) {
      ctx.fillStyle = fills[s];
      ctx.strokeStyle = fills[s];
      ctx.fill(paths[s]);
      ctx.stroke(paths[s]);
    }

    // Loose threads: any thread whose neighbouring cell has gone, including the hem.
    ctx.strokeStyle = 'rgba(214, 232, 224, 0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var c = 0; c < CC; c++) {
      if (!alive[c]) continue;
      var loose;
      if (c < HC) {
        var hj = (c / QC) | 0, hi = c % QC;
        loose = hj === 0 || hj === ROWS - 1 || !quadOn[(hj - 1) * QC + hi] || !quadOn[hj * QC + hi];
      } else {
        var v = c - HC, vj = (v / COLS) | 0, vi = v % COLS;
        loose = vi === 0 || vi === COLS - 1 || !quadOn[vj * QC + vi - 1] || !quadOn[vj * QC + vi];
      }
      if (!loose) continue;
      ctx.moveTo(px[ca[c]], py[ca[c]]);
      ctx.lineTo(px[cb[c]], py[cb[c]]);
    }
    ctx.stroke();

    // Pins.
    ctx.fillStyle = '#d8c79f';
    for (var k = 0; k < COLS; k++) {
      if (!pinned[k]) continue;
      ctx.beginPath();
      ctx.arc(px[k], py[k], 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Finger feedback.
    for (var id in pointers) {
      var p = pointers[id];
      if (p.pts.length) {
        ctx.strokeStyle = 'rgba(228, 236, 232, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, REST * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    trails = trails.filter(function (t) { return now - t.t < 220; });
    ctx.lineCap = 'round';
    for (var n = 0; n < trails.length; n++) {
      var tr = trails[n];
      ctx.strokeStyle = 'rgba(240, 190, 160,' + (1 - (now - tr.t) / 220).toFixed(2) + ')';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(tr.x1, tr.y1);
      ctx.lineTo(tr.x2, tr.y2);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var p = { x: e.clientX, y: e.clientY, pts: [], dx: [], dy: [] };
    if (mode === 'pull') {
      // Pinch a small patch around the nearest point so the pull spreads like a real grip.
      var centre = nearest(e.clientX, e.clientY, Math.max(36, REST * 3));
      if (centre >= 0) {
        var r2 = REST * REST * 2.6;
        for (var k = 0; k < N; k++) {
          var ddx = px[k] - px[centre], ddy = py[k] - py[centre];
          if (held[k] || ddx * ddx + ddy * ddy > r2) continue;
          held[k] = 1; pinned[k] = 0;
          p.pts.push(k); p.dx.push(ddx); p.dy.push(ddy);
        }
        p.x = px[centre]; p.y = py[centre];
        p.offX = p.x - e.clientX; p.offY = p.y - e.clientY;
      }
    }
    pointers[e.pointerId] = p;
  });

  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    if (mode === 'rip') {
      cut(p.x, p.y, e.clientX, e.clientY);
      trails.push({ x1: p.x, y1: p.y, x2: e.clientX, y2: e.clientY, t: performance.now() });
    }
    p.x = e.clientX + (p.offX || 0);
    p.y = e.clientY + (p.offY || 0);
  });

  function release(e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    for (var g = 0; g < p.pts.length; g++) held[p.pts[g]] = 0;
    delete pointers[e.pointerId];
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  function setMode(m) {
    mode = m;
    document.getElementById('mPull').className = m === 'pull' ? 'on' : '';
    document.getElementById('mRip').className = m === 'rip' ? 'on' : '';
  }
  document.getElementById('mPull').onclick = function () { setMode('pull'); };
  document.getElementById('mRip').onclick = function () { setMode('rip'); };
  document.getElementById('wind').onclick = function () {
    wind = !wind;
    this.className = wind ? 'on' : '';
    this.setAttribute('aria-pressed', String(wind));
  };
  document.getElementById('reset').onclick = build;
  document.getElementById('back').onclick = function () { post({ type: 'back' }); };

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
    while (acc >= STEP_MS && steps < 3) { step(now); acc -= STEP_MS; steps++; }
    if (steps === 3) acc = 0;
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;

export default clothHtml;

import simPage from './shell';

// Curtain on a rail, simulated with Verlet integration on a grid of points joined by threads.
// Threads vary slightly in strength so tears wander like real fabric instead of running straight.
// The fabric is drawn with WebGL (smooth shading and a woven texture that moves with the cloth);
// the rail, pins, loose threads and finger feedback go on a 2D canvas layered above it.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var statusEl = document.getElementById('status');
  var gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) { statusEl.textContent = 'This phone cannot draw the cloth (WebGL is unavailable).'; return; }
  document.body.style.background = 'radial-gradient(ellipse at 50% 40%, #16211e, #0a0f0e 80%)';
  var overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1';
  document.body.appendChild(overlay);
  var ctx = overlay.getContext('2d');

  var SPACING = 6.5;
  var GRAVITY = 0.2;
  var DAMPING = 0.992;
  var ITERATIONS = 24;
  var TEAR_RATIO = 2.1;
  var GRIP_TEAR_RATIO = 1.75;
  var HEM_TEAR_RATIO = 3.4;
  var STRENGTH_SPREAD = 0.36;
  var GRIP_RADIUS = 18;
  var FRAY = 2.5;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, LEFT, CLOTH_W;
  var COLS, ROWS, N, REST, HC, CC, HEM_END;
  var px, py, ox, oy, pinned, held;
  var ca, cb, alive, strength, quadOn;
  var posData, uvData, shadeData, ratio, indexData, indexCount, frayData, meshDirty;
  var torn = 0;
  var mode = 'pull';
  var wind = false;
  var pointers = {};
  var trails = [];

  // Fabric: sage-teal with 24px stripes, a fine crosshatch weave, and light that follows the folds.
  // Flipped cells (shade < 0) show the dimmer back of the cloth.
  var FABRIC_VS = 'attribute vec2 aPos; attribute vec2 aUV; attribute float aShade; uniform vec2 uRes;' +
    'varying vec2 vUV; varying float vShade;' +
    'void main() { vUV = aUV; vShade = aShade; vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }';
  var FABRIC_FS = 'precision mediump float; varying vec2 vUV; varying float vShade;' +
    'void main() {' +
    '  float stripe = step(0.5, fract(vUV.y / 48.0));' +
    '  vec3 base = mix(vec3(0.25, 0.56, 0.49), vec3(0.33, 0.6, 0.55), stripe);' +
    '  float weave = 0.9 + 0.1 * (0.5 + 0.5 * sin(vUV.x * 2.6)) * (0.5 + 0.5 * sin(vUV.y * 2.6));' +
    '  float light = vShade < 0.0 ? 0.3 : 0.32 + 0.85 * vShade;' +
    '  gl_FragColor = vec4(base * light * weave, 1.0);' +
    '}';
  var LINE_VS = 'attribute vec2 aPos; uniform vec2 uRes;' +
    'void main() { vec2 c = aPos / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }';
  var LINE_FS = 'precision mediump float; uniform vec4 uColor; void main() { gl_FragColor = uColor; }';

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  }
  function program(vs, fs) {
    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    return prog;
  }
  var fabric = program(FABRIC_VS, FABRIC_FS);
  var lines = program(LINE_VS, LINE_FS);
  var fabricPos = gl.getAttribLocation(fabric, 'aPos');
  var fabricUV = gl.getAttribLocation(fabric, 'aUV');
  var fabricShade = gl.getAttribLocation(fabric, 'aShade');
  var fabricRes = gl.getUniformLocation(fabric, 'uRes');
  var linePos = gl.getAttribLocation(lines, 'aPos');
  var lineRes = gl.getUniformLocation(lines, 'uRes');
  var lineColor = gl.getUniformLocation(lines, 'uColor');
  var posBuf = gl.createBuffer(), uvBuf = gl.createBuffer(), shadeBuf = gl.createBuffer();
  var indexBuf = gl.createBuffer(), frayBuf = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    [canvas, overlay].forEach(function (cv) {
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
    });
    gl.viewport(0, 0, canvas.width, canvas.height);

    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 30;
    CLOTH_W = Math.min(W - 40, 560);
    COLS = Math.max(30, Math.min(80, Math.round(CLOTH_W / SPACING) + 1));
    REST = CLOTH_W / (COLS - 1);
    var clothH = Math.min(H - TOP - 80, CLOTH_W * 1.2);
    ROWS = Math.max(24, Math.round(clothH / REST) + 1);
    LEFT = (W - CLOTH_W) / 2;
    N = COLS * ROWS;
    var pinEvery = Math.max(2, Math.round(42 / REST));
    HEM_END = Math.max(2, Math.ceil(14 / REST)) * COLS;

    px = new Float32Array(N); py = new Float32Array(N);
    ox = new Float32Array(N); oy = new Float32Array(N);
    pinned = new Uint8Array(N); held = new Uint8Array(N);
    for (var j = 0; j < ROWS; j++) {
      for (var i = 0; i < COLS; i++) {
        var k = j * COLS + i;
        px[k] = ox[k] = LEFT + i * REST;
        py[k] = oy[k] = TOP + j * REST;
        if (j === 0 && (i % pinEvery === 0 || i === COLS - 1)) pinned[k] = 1;
      }
    }

    // Horizontal threads first, then vertical: h(i,j) = j*(COLS-1)+i, v(i,j) = HC + j*COLS+i.
    HC = (COLS - 1) * ROWS;
    CC = HC + COLS * (ROWS - 1);
    ca = new Int32Array(CC); cb = new Int32Array(CC);
    alive = new Uint8Array(CC).fill(1);
    strength = new Float32Array(CC);
    var c = 0;
    for (j = 0; j < ROWS; j++) for (i = 0; i < COLS - 1; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + 1; c++; }
    for (j = 0; j < ROWS - 1; j++) for (i = 0; i < COLS; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + COLS; c++; }
    for (c = 0; c < CC; c++) strength[c] = 1 - STRENGTH_SPREAD / 2 + Math.random() * STRENGTH_SPREAD;
    quadOn = new Uint8Array((COLS - 1) * (ROWS - 1));

    posData = new Float32Array(N * 2);
    uvData = new Float32Array(N * 2);
    shadeData = new Float32Array(N);
    ratio = new Float32Array(N);
    indexData = new Uint16Array((COLS - 1) * (ROWS - 1) * 6);
    frayData = new Float32Array(CC * 8);
    for (k = 0; k < N; k++) { uvData[k * 2] = (k % COLS) * REST; uvData[k * 2 + 1] = ((k / COLS) | 0) * REST; }
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
    meshDirty = true;

    torn = 0;
    pointers = {};
    trails = [];
    statusEl.textContent = 'Drag the cloth. Pull hard and it tears.';
  }

  function tore(n) {
    torn += n;
    meshDirty = true;
    statusEl.textContent = torn.toLocaleString() + (torn === 1 ? ' thread' : ' threads') + ' torn';
    buzz();
  }

  function step(t) {
    var gust = wind ? 0.06 + 0.035 * Math.sin(t * 0.0009) : 0;
    for (var k = 0; k < N; k++) {
      if (pinned[k] || held[k]) continue;
      if (py[k] > H + 400) continue;
      var vx = (px[k] - ox[k]) * DAMPING;
      var vy = (py[k] - oy[k]) * DAMPING;
      ox[k] = px[k]; oy[k] = py[k];
      var fx = 0, fy = GRAVITY;
      if (wind) {
        var col = k % COLS, row = (k / COLS) | 0;
        fx = gust * (0.35 + 0.65 * Math.sin(t * 0.004 + row * 0.18 + col * 0.07));
        fy += gust * 0.5 * Math.sin(t * 0.003 + col * 0.25);
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
    var broke = 0;
    for (var it = 0; it < ITERATIONS; it++) {
      for (var c = 0; c < CC; c++) {
        if (!alive[c]) continue;
        var a = ca[c], b = cb[c];
        var dx = px[b] - px[a], dy = py[b] - py[a];
        var d = Math.sqrt(dx * dx + dy * dy);
        var max = (a < HEM_END ? hemLimit : held[a] !== held[b] ? gripLimit : limit) * strength[c];
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

  // Rebuild the triangle list from the cells whose four threads are all intact.
  function rebuildMesh() {
    var QC = COLS - 1, n = 0;
    for (var j = 0; j < ROWS - 1; j++) {
      for (var i = 0; i < QC; i++) {
        var on = alive[j * QC + i] && alive[(j + 1) * QC + i] && alive[HC + j * COLS + i] && alive[HC + j * COLS + i + 1];
        quadOn[j * QC + i] = on;
        if (!on) continue;
        var p0 = j * COLS + i, p1 = p0 + 1, p2 = p0 + COLS + 1, p3 = p0 + COLS;
        indexData[n++] = p0; indexData[n++] = p1; indexData[n++] = p2;
        indexData[n++] = p0; indexData[n++] = p2; indexData[n++] = p3;
      }
    }
    indexCount = n;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData.subarray(0, n), gl.DYNAMIC_DRAW);
    meshDirty = false;
  }

  // Light each point from how much the cloth around it is stretched or bunched up, plus a sideways
  // term from how that changes across the fold, so folds get a lit side and a shadowed side.
  function computeShading() {
    for (var k = 0; k < N; k++) {
      var i = k % COLS, j = (k / COLS) | 0;
      var l = i > 0 ? k - 1 : k, r = i < COLS - 1 ? k + 1 : k;
      var u = j > 0 ? k - COLS : k, d = j < ROWS - 1 ? k + COLS : k;
      var ax = px[r] - px[l], ay = py[r] - py[l], bx = px[d] - px[u], by = py[d] - py[u];
      ratio[k] = (ax * by - ay * bx) / ((r - l) * ((d - u) / COLS) * REST * REST);
      posData[k * 2] = px[k];
      posData[k * 2 + 1] = py[k];
    }
    for (k = 0; k < N; k++) {
      var rt = ratio[k];
      if (rt <= 0) { shadeData[k] = -1; continue; }
      i = k % COLS;
      var side = (i < COLS - 1 ? ratio[k + 1] : rt) - (i > 0 ? ratio[k - 1] : rt);
      var sh = (rt - 0.3) / 0.95 + side * 0.45;
      shadeData[k] = sh < 0 ? 0 : sh > 1 ? 1 : sh;
    }
  }

  function drawFabric() {
    if (meshDirty) rebuildMesh();
    computeShading();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(fabric);
    gl.uniform2f(fabricRes, W, H);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, posData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(fabricPos);
    gl.vertexAttribPointer(fabricPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.enableVertexAttribArray(fabricUV);
    gl.vertexAttribPointer(fabricUV, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, shadeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, shadeData, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(fabricShade);
    gl.vertexAttribPointer(fabricShade, 1, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    gl.disableVertexAttribArray(fabricUV);
    gl.disableVertexAttribArray(fabricShade);

    // Short frayed fibres where threads snapped.
    var n = 0;
    for (var c = 0; c < CC; c++) {
      if (alive[c]) continue;
      var a = ca[c], b = cb[c];
      var dx = px[b] - px[a], dy = py[b] - py[a];
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      dx *= FRAY / len; dy *= FRAY / len;
      frayData[n++] = px[a]; frayData[n++] = py[a]; frayData[n++] = px[a] + dx; frayData[n++] = py[a] + dy;
      frayData[n++] = px[b]; frayData[n++] = py[b]; frayData[n++] = px[b] - dx; frayData[n++] = py[b] - dy;
    }
    if (n) {
      gl.useProgram(lines);
      gl.uniform2f(lineRes, W, H);
      gl.uniform4f(lineColor, 0.84 * 0.55, 0.91 * 0.55, 0.88 * 0.55, 0.55);
      gl.bindBuffer(gl.ARRAY_BUFFER, frayBuf);
      gl.bufferData(gl.ARRAY_BUFFER, frayData.subarray(0, n), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(linePos);
      gl.vertexAttribPointer(linePos, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINES, 0, n / 2);
    }
  }

  function draw(now) {
    drawFabric();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Curtain rail.
    ctx.strokeStyle = '#3a4a45';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(LEFT - 14, TOP);
    ctx.lineTo(LEFT + CLOTH_W + 14, TOP);
    ctx.stroke();

    // Loose threads along every edge that has lost its neighbouring cell, including the hem.
    var QC = COLS - 1;
    ctx.strokeStyle = 'rgba(214, 232, 224, 0.75)';
    ctx.lineWidth = 0.9;
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
        ctx.arc(p.x, p.y, GRIP_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    trails = trails.filter(function (tr) { return now - tr.t < 220; });
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
      var centre = nearest(e.clientX, e.clientY, 36);
      if (centre >= 0) {
        var r2 = GRIP_RADIUS * GRIP_RADIUS;
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

  segment(['mPull', 'mRip'], function (id) { mode = id === 'mPull' ? 'pull' : 'rip'; });
  toggle('wind', function (on) { wind = on; });
  document.getElementById('reset').onclick = build;

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
    while (acc >= STEP_MS && steps < 2) { step(now); acc -= STEP_MS; steps++; }
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
    <button id="mPull" class="on">Pull</button>
    <button id="mRip">Rip</button>
  </div>
  <div class="grow"></div>
  <button id="wind">Wind</button>
  <button id="reset">Reset</button>`,
  status: 'Drag the cloth. Pull hard and it tears.',
  script,
});

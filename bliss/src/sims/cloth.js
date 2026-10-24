import simPage from './shell';

// A heavy denim curtain on a rail, simulated with Verlet integration on a grid of points joined by
// threads, plus skip-one links that stop it stretching while still letting it gather into folds.
// Threads vary in strength so tears wander like real fabric.
// The fabric is drawn with WebGL on a mesh refined from the physics grid: every cell is split 4x4,
// with new points on Catmull-Rom curves through their neighbours, and shaded as indigo twill with
// topstitched seams, a pocket and a leather patch. A drop shadow sells the thickness.
// The rail, pins, edges, frayed threads, flames and finger feedback go on a 2D canvas above it.
// Tools: Pull (grab), Cut (slice), Burn (fire that spreads), Pin (tack it anywhere), Blow (gust).
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var statusEl = document.getElementById('status');
  // The refined mesh has well over 65,536 points, so it needs 32-bit indices (WebGL 2, or the WebGL 1 extension).
  var gl = canvas.getContext('webgl2', { antialias: true, alpha: true });
  if (!gl) {
    gl = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (gl && !gl.getExtension('OES_element_index_uint')) gl = null;
  }
  if (!gl) { statusEl.textContent = 'This phone cannot draw the cloth (WebGL is unavailable).'; return; }
  document.body.style.background = 'radial-gradient(ellipse at 50% 40%, #1a1f24, #0b0d10 80%)';
  var overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1';
  document.body.appendChild(overlay);
  var ctx = overlay.getContext('2d');

  var SPACING = 3.5;
  var MAX_POINTS = 40000;
  var SUB = 4;
  var GRAVITY = 0.24;
  var DAMPING = 0.985;
  // Several small sub-steps per frame keep a dense cloth far stiffer than extra solver passes would.
  var SUBSTEPS = 4;
  var ITERATIONS = 8;
  var BRACE = 0.5;
  var SUB_GRAVITY = GRAVITY / (SUBSTEPS * SUBSTEPS);
  var SUB_DAMPING = Math.pow(DAMPING, 1 / SUBSTEPS);
  var GRIP_FOLLOW = 1 - Math.pow(0.45, 1 / SUBSTEPS);
  // The grip drags the cloth at most this far per sub-step, so how easily it tears depends on how
  // hard you pull rather than on how many frames the phone manages between finger movements.
  var GRIP_MAX_MOVE = 1;
  var TEAR_RATIO = 4.2;
  var GRIP_TEAR_RATIO = 3.9;
  var HEM_TEAR_RATIO = 6.5;
  var STRENGTH_SPREAD = 0.36;
  var GRIP_RADIUS = 18;
  var FRAY = 2.6;
  var BURN_RATE = 0.011;
  var SPREAD_CHANCE = 0.15;
  var BLOW_RADIUS = 120;
  var BLOW_FORCE = 1.1;
  var PIN_RADIUS = 30;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, LEFT, CLOTH_W;
  var COLS, ROWS, QC, N, REST, HC, CC, HEM_END;
  var FC, FR, FN, fx, fy, fh;
  var px, py, ox, oy, pinned, held, heat;
  var ca, cb, alive, strength, quadOn;
  var posData, uvData, shadeData, charData, ratio, indexData, indexCount, wireData, wireCount, meshDirty;
  var embers = [];
  var torn = 0, burnt = 0;
  var tool = 'pull';
  var wind = false;
  var showMesh = false;
  var pointers = {};
  var trails = [];

  // Catmull-Rom weights for the in-between points of each refined cell.
  var CR = [];
  for (var s = 1; s < SUB; s++) {
    var t = s / SUB, t2 = t * t, t3 = t2 * t;
    CR.push([0.5 * (-t + 2 * t2 - t3), 0.5 * (2 - 5 * t2 + 3 * t3), 0.5 * (t + 4 * t2 - 3 * t3), 0.5 * (t3 - t2), t]);
  }

  var FABRIC_VS = 'attribute vec2 aPos; attribute vec2 aUV; attribute float aShade; attribute float aChar;' +
    'uniform vec2 uRes; uniform vec2 uOffset;' +
    'varying vec2 vUV; varying float vShade; varying float vChar;' +
    'void main() { vUV = aUV; vShade = aShade; vChar = aChar;' +
    '  vec2 c = (aPos + uOffset) / uRes * 2.0 - 1.0; gl_Position = vec4(c.x, -c.y, 0.0, 1.0); }';
  // Denim: indigo twill with white weft flecks and a faded wash; double orange topstitching round the
  // hem, a back pocket with copper rivets and a leather patch; the paler inside shows on folded-over
  // cells (shade < 0); burning cloth chars to black with a glowing front.
  var FABRIC_FS = 'precision highp float;' +
    'varying vec2 vUV; varying float vShade; varying float vChar;' +
    'uniform float uShadow; uniform vec2 uSize;' +
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }' +
    'float stitch(float d, float along) { return (1.0 - smoothstep(0.3, 0.75, abs(d))) * step(0.38, fract(along / 3.4)); }' +
    'vec2 seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);' +
    '  return vec2(length(pa - ba * h), h * length(ba)); }' +
    'void main() {' +
    '  if (uShadow > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.3); return; }' +
    '  vec2 uv = vUV;' +
    '  float rib = 0.5 + 0.5 * sin((uv.x + uv.y * 0.62) * 4.4);' +
    '  float weft = step(0.84, hash(floor(uv * 1.7)));' +
    '  float wash = 0.5 + 0.5 * sin(uv.x * 0.029 + sin(uv.y * 0.021) * 2.2) * sin(uv.y * 0.025 + 1.3);' +
    '  vec3 indigo = mix(vec3(0.06, 0.11, 0.27), vec3(0.2, 0.31, 0.53), wash * 0.8);' +
    '  vec3 col = indigo * (0.8 + 0.3 * rib) + vec3(0.32, 0.34, 0.38) * weft * 0.3;' +
    '  float dl = uv.x, dr = uSize.x - uv.x, db = uSize.y - uv.y;' +
    '  float s = stitch(dl - 5.0, uv.y) + stitch(dl - 8.0, uv.y) + stitch(dr - 5.0, uv.y) + stitch(dr - 8.0, uv.y)' +
    '    + stitch(db - 6.0, uv.x) + stitch(db - 9.0, uv.x);' +
    '  col *= 0.7 + 0.3 * smoothstep(0.0, 3.5, min(min(dl, dr), db));' +
    '  vec2 pc = vec2(uSize.x * 0.5, uSize.y * 0.5);' +
    '  float hw = uSize.x * 0.18, ph = uSize.y * 0.2, pv = uSize.y * 0.05;' +
    '  vec2 a = pc + vec2(-hw, 0.0), b = pc + vec2(hw, 0.0), c = pc + vec2(hw, ph), d = pc + vec2(0.0, ph + pv), e = pc + vec2(-hw, ph);' +
    '  bool inPocket = uv.x > a.x && uv.x < b.x && uv.y > a.y && uv.y < ph + a.y + pv * (1.0 - abs(uv.x - pc.x) / hw);' +
    '  if (inPocket) {' +
    '    vec2 r1 = seg(uv, a, b), r2 = seg(uv, b, c), r3 = seg(uv, c, d), r4 = seg(uv, d, e), r5 = seg(uv, e, a);' +
    '    float pd = min(min(min(r1.x, r2.x), min(r3.x, r4.x)), r5.x);' +
    '    col *= 1.06 - 0.25 * (1.0 - smoothstep(0.0, 2.5, pd));' +
    '    s += stitch(r2.x - 2.5, r2.y) + stitch(r3.x - 2.5, r3.y) + stitch(r4.x - 2.5, r4.y) + stitch(r5.x - 2.5, r5.y)' +
    '      + stitch(r2.x - 5.0, r2.y) + stitch(r3.x - 5.0, r3.y) + stitch(r4.x - 5.0, r4.y) + stitch(r5.x - 5.0, r5.y)' +
    '      + stitch(r1.x - 3.0, r1.y);' +
    '  }' +
    '  vec2 lp = vec2(uSize.x * 0.72, uSize.y * 0.06), ls = vec2(uSize.x * 0.17, uSize.y * 0.07);' +
    '  vec2 lq = abs(uv - lp - ls * 0.5) - ls * 0.5;' +
    '  if (lq.x < 0.0 && lq.y < 0.0) {' +
    '    float grain = hash(floor(uv * 2.3)) * 0.08;' +
    '    col = vec3(0.5, 0.31, 0.17) * (0.92 + grain) * (0.75 + 0.25 * smoothstep(0.0, 2.0, -max(lq.x, lq.y)));' +
    '    s += stitch(-max(lq.x, lq.y) - 2.0, lq.x > lq.y ? uv.y : uv.x);' +
    '  }' +
    '  col = mix(col, vec3(0.88, 0.6, 0.24), clamp(s, 0.0, 1.0));' +
    '  float rv = min(length(uv - a - vec2(3.5, 3.5)), length(uv - b - vec2(-3.5, 3.5)));' +
    '  if (rv < 2.4) col = mix(vec3(0.98, 0.8, 0.55), vec3(0.6, 0.36, 0.17), smoothstep(0.0, 2.4, rv));' +
    '  float light = 0.34 + 0.8 * clamp(vShade, 0.0, 1.0);' +
    '  if (vShade < 0.0) { col = vec3(0.5, 0.57, 0.7) * (0.8 + 0.2 * rib); light = 0.55; }' +
    '  col *= light;' +
    '  float ch = clamp(vChar, 0.0, 1.0);' +
    '  col = mix(col, vec3(0.05, 0.035, 0.03), smoothstep(0.05, 0.55, ch));' +
    '  col += vec3(1.0, 0.42, 0.06) * 1.5 * smoothstep(0.35, 0.7, ch) * (1.0 - smoothstep(0.8, 0.98, ch));' +
    '  gl_FragColor = vec4(col, 1.0);' +
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
  var fabricChar = gl.getAttribLocation(fabric, 'aChar');
  var fabricRes = gl.getUniformLocation(fabric, 'uRes');
  var fabricOffset = gl.getUniformLocation(fabric, 'uOffset');
  var fabricShadow = gl.getUniformLocation(fabric, 'uShadow');
  var fabricSize = gl.getUniformLocation(fabric, 'uSize');
  var linePos = gl.getAttribLocation(lines, 'aPos');
  var lineRes = gl.getUniformLocation(lines, 'uRes');
  var lineColor = gl.getUniformLocation(lines, 'uColor');
  var posBuf = gl.createBuffer(), uvBuf = gl.createBuffer(), shadeBuf = gl.createBuffer(), charBuf = gl.createBuffer();
  var indexBuf = gl.createBuffer(), wireBuf = gl.createBuffer();
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // A soft flame sprite, drawn once and stamped wherever the cloth is burning.
  var flame = document.createElement('canvas');
  flame.width = flame.height = 64;
  (function () {
    var f = flame.getContext('2d');
    var g = f.createRadialGradient(32, 40, 2, 32, 34, 30);
    g.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
    g.addColorStop(0.3, 'rgba(255, 160, 40, 0.7)');
    g.addColorStop(0.7, 'rgba(220, 60, 10, 0.25)');
    g.addColorStop(1, 'rgba(160, 30, 0, 0)');
    f.fillStyle = g;
    f.fillRect(0, 0, 64, 64);
  })();

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
    var clothH = Math.min(H - TOP - 80, CLOTH_W * 1.2);
    // Big screens get a slightly wider spacing so the physics stays quick enough to feel real.
    var spacing = Math.max(SPACING, Math.sqrt((CLOTH_W * clothH) / MAX_POINTS) * 1.03);
    COLS = Math.max(40, Math.round(CLOTH_W / spacing) + 1);
    REST = CLOTH_W / (COLS - 1);
    ROWS = Math.max(36, Math.round(clothH / REST) + 1);
    QC = COLS - 1;
    LEFT = (W - CLOTH_W) / 2;
    N = COLS * ROWS;
    var pinEvery = Math.max(2, Math.round(42 / REST));
    HEM_END = Math.max(2, Math.ceil(14 / REST)) * COLS;

    px = new Float32Array(N); py = new Float32Array(N);
    ox = new Float32Array(N); oy = new Float32Array(N);
    pinned = new Uint8Array(N); held = new Uint8Array(N);
    heat = new Float32Array(N);
    for (var j = 0; j < ROWS; j++) {
      for (var i = 0; i < COLS; i++) {
        var k = j * COLS + i;
        px[k] = ox[k] = LEFT + i * REST;
        py[k] = oy[k] = TOP + j * REST;
        if (j === 0 && (i % pinEvery === 0 || i === COLS - 1)) pinned[k] = 1;
      }
    }

    // Horizontal threads first, then vertical: h(i,j) = j*QC+i, v(i,j) = HC + j*COLS+i.
    HC = QC * ROWS;
    CC = HC + COLS * (ROWS - 1);
    ca = new Int32Array(CC); cb = new Int32Array(CC);
    alive = new Uint8Array(CC).fill(1);
    strength = new Float32Array(CC);
    var c = 0;
    for (j = 0; j < ROWS; j++) for (i = 0; i < QC; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + 1; c++; }
    for (j = 0; j < ROWS - 1; j++) for (i = 0; i < COLS; i++) { ca[c] = j * COLS + i; cb[c] = ca[c] + COLS; c++; }
    for (c = 0; c < CC; c++) strength[c] = 1 - STRENGTH_SPREAD / 2 + Math.random() * STRENGTH_SPREAD;
    quadOn = new Uint8Array(QC * (ROWS - 1));

    FC = QC * SUB + 1;
    FR = (ROWS - 1) * SUB + 1;
    FN = FC * FR;
    fx = new Float32Array(FN); fy = new Float32Array(FN); fh = new Float32Array(FN);
    posData = new Float32Array(FN * 2);
    uvData = new Float32Array(FN * 2);
    shadeData = new Float32Array(FN);
    charData = fh;
    ratio = new Float32Array(FN);
    indexData = new Uint32Array(QC * (ROWS - 1) * SUB * SUB * 6);
    wireData = new Uint32Array(QC * (ROWS - 1) * (SUB * SUB * 4 + SUB * 4));
    for (k = 0; k < FN; k++) { uvData[k * 2] = (k % FC) * REST / SUB; uvData[k * 2 + 1] = ((k / FC) | 0) * REST / SUB; }
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
    gl.bufferData(gl.ARRAY_BUFFER, uvData, gl.STATIC_DRAW);
    meshDirty = true;

    torn = 0;
    burnt = 0;
    embers = [];
    pointers = {};
    trails = [];
    statusEl.textContent = 'Heavy denim. Pull hard to tear it, or pick another tool.';
  }

  function updateStatus() {
    var parts = [];
    if (torn) parts.push(torn.toLocaleString() + (torn === 1 ? ' thread' : ' threads') + ' torn');
    if (burnt) parts.push(burnt.toLocaleString() + ' points burnt');
    if (parts.length) statusEl.textContent = parts.join(' \\u00b7 ');
  }

  function tore(n) {
    torn += n;
    meshDirty = true;
    updateStatus();
    buzz();
  }

  function step(t) {
    for (var s = 0; s < SUBSTEPS; s++) substep(t);
    burn();
  }

  function substep(t) {
    var gust = wind ? (0.06 + 0.035 * Math.sin(t * 0.0009)) / (SUBSTEPS * SUBSTEPS) : 0;
    for (var k = 0; k < N; k++) {
      if (pinned[k] || held[k]) continue;
      if (py[k] > H + 400) continue;
      var vx = (px[k] - ox[k]) * SUB_DAMPING;
      var vy = (py[k] - oy[k]) * SUB_DAMPING;
      ox[k] = px[k]; oy[k] = py[k];
      var fx0 = 0, fy0 = SUB_GRAVITY;
      if (wind) {
        var col = k % COLS, row = (k / COLS) | 0;
        fx0 = gust * (0.35 + 0.65 * Math.sin(t * 0.004 + row * 0.18 + col * 0.07));
        fy0 += gust * 0.5 * Math.sin(t * 0.003 + col * 0.25);
      }
      // Hot cloth rises a little on its own updraft.
      if (heat[k] > 0 && heat[k] < 1) fy0 -= SUB_GRAVITY * 0.6;
      px[k] += vx + fx0;
      py[k] += vy + fy0;
    }

    for (var id in pointers) {
      var p = pointers[id];
      if (tool === 'blow') {
        var r2 = BLOW_RADIUS * BLOW_RADIUS, force = BLOW_FORCE / (SUBSTEPS * SUBSTEPS);
        for (k = 0; k < N; k++) {
          if (pinned[k]) continue;
          var bx = px[k] - p.x, by = py[k] - p.y, bd = bx * bx + by * by;
          if (bd > r2 || bd < 1) continue;
          var dist = Math.sqrt(bd), fall = 1 - dist / BLOW_RADIUS;
          px[k] += (bx / dist) * force * fall;
          py[k] += (by / dist) * force * fall;
        }
        continue;
      }
      for (var g = 0; g < p.pts.length; g++) {
        var h = p.pts[g];
        ox[h] = px[h]; oy[h] = py[h];
        var mx = (p.x + p.dx[g] - px[h]) * GRIP_FOLLOW, my = (p.y + p.dy[g] - py[h]) * GRIP_FOLLOW;
        var m = Math.sqrt(mx * mx + my * my);
        if (m > GRIP_MAX_MOVE) { mx *= GRIP_MAX_MOVE / m; my *= GRIP_MAX_MOVE / m; }
        px[h] += mx;
        py[h] += my;
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
    brace();
    if (broke) tore(broke);
  }

  // Denim barely stretches: points two apart along a row or column are kept from drifting further
  // than twice the spacing, as long as both threads between them are intact. The links only pull,
  // never push, because in this flat view a fold looks like the cloth squashing together, and
  // resisting that would stop the fabric gathering when it is pulled.
  function brace() {
    var rest = REST * 2;
    for (var j = 0; j < ROWS; j++) {
      for (var i = 0; i < COLS - 2; i++) {
        var h = j * QC + i;
        if (alive[h] && alive[h + 1]) link(j * COLS + i, j * COLS + i + 2, rest);
      }
    }
    for (j = 0; j < ROWS - 2; j++) {
      for (i = 0; i < COLS; i++) {
        var v = HC + j * COLS + i;
        if (alive[v] && alive[v + COLS]) link(j * COLS + i, (j + 2) * COLS + i, rest);
      }
    }
  }
  function link(a, b, rest) {
    var dx = px[b] - px[a], dy = py[b] - py[a];
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= rest) return;
    var diff = ((d - rest) / d) * BRACE;
    var fa = pinned[a] || held[a], fb = pinned[b] || held[b];
    if (fa && fb) return;
    if (fa) { px[b] -= dx * diff; py[b] -= dy * diff; }
    else if (fb) { px[a] += dx * diff; py[a] += dy * diff; }
    else { dx *= diff * 0.5; dy *= diff * 0.5; px[a] += dx; py[a] += dy; px[b] -= dx; py[b] -= dy; }
  }

  // Fire creeps from each burning point to its connected neighbours; a point that burns through
  // loses all its threads and leaves a hole with a charred, glowing rim.
  function ignite(x, y) {
    var k = nearest(x, y, PIN_RADIUS);
    if (k < 0) return;
    for (var n = 0; n < N; n++) {
      var dx = px[n] - px[k], dy = py[n] - py[k];
      if (heat[n] === 0 && dx * dx + dy * dy < 64) heat[n] = 0.02;
    }
  }

  function burn() {
    var broke = 0, any = false;
    for (var k = 0; k < N; k++) {
      var hk = heat[k];
      if (hk <= 0 || hk >= 1) continue;
      any = true;
      hk += BURN_RATE * (0.5 + Math.random());
      var i = k % COLS, j = (k / COLS) | 0;
      // Spread to one of the eight neighbours; diagonals need the cell between them intact.
      // Using diagonals too keeps the burn round instead of diamond-shaped.
      if (hk > 0.08 && Math.random() < SPREAD_CHANCE * 6) {
        var di = ((Math.random() * 3) | 0) - 1, dj = ((Math.random() * 3) | 0) - 1;
        var ni = i + di, nj = j + dj, link = false;
        if ((di || dj) && ni >= 0 && ni < COLS && nj >= 0 && nj < ROWS) {
          if (!dj) link = alive[j * QC + Math.min(i, ni)];
          else if (!di) link = alive[HC + Math.min(j, nj) * COLS + i];
          else link = quadOn[Math.min(j, nj) * QC + Math.min(i, ni)];
        }
        var nb = nj * COLS + ni;
        if (link && heat[nb] === 0) heat[nb] = 0.02;
      }
      if (Math.random() < 0.012 && embers.length < 400) {
        embers.push({ x: px[k], y: py[k], vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.8, life: 40 + Math.random() * 40, age: 0 });
      }
      if (hk >= 1) {
        hk = 1;
        burnt++;
        if (i > 0 && alive[j * QC + i - 1]) { alive[j * QC + i - 1] = 0; broke++; }
        if (i < QC && alive[j * QC + i]) { alive[j * QC + i] = 0; broke++; }
        if (j > 0 && alive[HC + (j - 1) * COLS + i]) { alive[HC + (j - 1) * COLS + i] = 0; broke++; }
        if (j < ROWS - 1 && alive[HC + j * COLS + i]) { alive[HC + j * COLS + i] = 0; broke++; }
        pinned[k] = 0;
      }
      heat[k] = hk;
    }
    if (broke) { meshDirty = true; updateStatus(); }
    for (var e = embers.length - 1; e >= 0; e--) {
      var em = embers[e];
      em.x += em.vx; em.y += em.vy; em.vy -= 0.01; em.vx += (Math.random() - 0.5) * 0.1; em.age++;
      if (em.age > em.life) { embers[e] = embers[embers.length - 1]; embers.pop(); }
    }
    return any;
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

  // Rebuild the triangle list (and wireframe) from the cells whose four threads are all intact.
  // Each intact cell becomes SUB x SUB faces of the refined mesh.
  function rebuildMesh() {
    var n = 0, w = 0;
    for (var j = 0; j < ROWS - 1; j++) {
      for (var i = 0; i < QC; i++) {
        var on = alive[j * QC + i] && alive[(j + 1) * QC + i] && alive[HC + j * COLS + i] && alive[HC + j * COLS + i + 1];
        quadOn[j * QC + i] = on;
        if (!on) continue;
        for (var t = 0; t < SUB; t++) {
          for (var u = 0; u < SUB; u++) {
            var q0 = (j * SUB + t) * FC + i * SUB + u, q1 = q0 + 1, q2 = q0 + FC + 1, q3 = q0 + FC;
            indexData[n++] = q0; indexData[n++] = q1; indexData[n++] = q2;
            indexData[n++] = q0; indexData[n++] = q2; indexData[n++] = q3;
            wireData[w++] = q0; wireData[w++] = q1; wireData[w++] = q0; wireData[w++] = q3;
          }
        }
        // Close the cell's right and bottom sides.
        var r0 = j * SUB * FC + (i + 1) * SUB, b0 = (j + 1) * SUB * FC + i * SUB;
        for (t = 0; t < SUB; t++) {
          wireData[w++] = r0 + t * FC; wireData[w++] = r0 + (t + 1) * FC;
          wireData[w++] = b0 + t; wireData[w++] = b0 + t + 1;
        }
      }
    }
    indexCount = n;
    wireCount = w;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indexData.subarray(0, n), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, wireData.subarray(0, w), gl.DYNAMIC_DRAW);
    meshDirty = false;
  }

  // Fill the refined grid. First along each physics row, then down each refined column, placing the
  // in-between points on Catmull-Rom curves through four neighbours (straight lines next to a tear,
  // so torn edges do not bulge). Heat for the burn colouring is blended linearly.
  function refine() {
    var i, j, k, f, s, w, cubic;
    for (j = 0; j < ROWS; j++) {
      var row = j * SUB * FC;
      for (i = 0; i < COLS; i++) {
        k = j * COLS + i; f = row + i * SUB;
        fx[f] = px[k]; fy[f] = py[k]; fh[f] = heat[k];
        if (i === QC) continue;
        var h = j * QC + i;
        cubic = i > 0 && i < QC - 1 && alive[h - 1] && alive[h] && alive[h + 1];
        for (s = 1; s < SUB; s++) {
          w = CR[s - 1];
          if (cubic) {
            fx[f + s] = w[0] * px[k - 1] + w[1] * px[k] + w[2] * px[k + 1] + w[3] * px[k + 2];
            fy[f + s] = w[0] * py[k - 1] + w[1] * py[k] + w[2] * py[k + 1] + w[3] * py[k + 2];
          } else {
            fx[f + s] = px[k] + (px[k + 1] - px[k]) * w[4];
            fy[f + s] = py[k] + (py[k + 1] - py[k]) * w[4];
          }
          fh[f + s] = heat[k] + (heat[k + 1] - heat[k]) * w[4];
        }
      }
    }
    var span = SUB * FC;
    for (var c = 0; c < FC; c++) {
      var i0 = (c / SUB) | 0, i1 = c % SUB === 0 ? i0 : Math.min(i0 + 1, QC);
      for (j = 0; j < ROWS - 1; j++) {
        var top = j * span + c;
        cubic = j > 0 && j < ROWS - 2;
        if (cubic) {
          var v0 = HC + j * COLS + i0, v1 = HC + j * COLS + i1;
          cubic = alive[v0 - COLS] && alive[v0] && alive[v0 + COLS] && alive[v1 - COLS] && alive[v1] && alive[v1 + COLS];
        }
        for (s = 1; s < SUB; s++) {
          w = CR[s - 1];
          f = top + s * FC;
          if (cubic) {
            fx[f] = w[0] * fx[top - span] + w[1] * fx[top] + w[2] * fx[top + span] + w[3] * fx[top + span * 2];
            fy[f] = w[0] * fy[top - span] + w[1] * fy[top] + w[2] * fy[top + span] + w[3] * fy[top + span * 2];
          } else {
            fx[f] = fx[top] + (fx[top + span] - fx[top]) * w[4];
            fy[f] = fy[top] + (fy[top + span] - fy[top]) * w[4];
          }
          fh[f] = fh[top] + (fh[top + span] - fh[top]) * w[4];
        }
      }
    }
  }

  // Light each point from how much the cloth around it is stretched or bunched up, plus a sideways
  // term from how that changes across the fold, so folds get a lit side and a shadowed side.
  function computeShading() {
    refine();
    var step = REST / SUB;
    for (var k = 0; k < FN; k++) {
      var i = k % FC, j = (k / FC) | 0;
      var l = i > 0 ? k - 1 : k, r = i < FC - 1 ? k + 1 : k;
      var u = j > 0 ? k - FC : k, d = j < FR - 1 ? k + FC : k;
      var ax = fx[r] - fx[l], ay = fy[r] - fy[l], bx = fx[d] - fx[u], by = fy[d] - fy[u];
      ratio[k] = (ax * by - ay * bx) / ((r - l) * ((d - u) / FC) * step * step);
      posData[k * 2] = fx[k];
      posData[k * 2 + 1] = fy[k];
    }
    for (k = 0; k < FN; k++) {
      var rt = ratio[k];
      if (rt <= 0) { shadeData[k] = -1; continue; }
      i = k % FC;
      var side = (i < FC - 1 ? ratio[k + 1] : rt) - (i > 0 ? ratio[k - 1] : rt);
      var sh = (rt - 0.3) / 0.95 + side * 0.9;
      shadeData[k] = sh < 0 ? 0 : sh > 1 ? 1 : sh;
    }
  }

  function bindAttr(loc, buf, data, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }

  function drawFabric() {
    if (meshDirty) rebuildMesh();
    computeShading();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(fabric);
    gl.uniform2f(fabricRes, W, H);
    gl.uniform2f(fabricSize, QC * REST, (ROWS - 1) * REST);
    bindAttr(fabricPos, posBuf, posData, 2);
    bindAttr(fabricUV, uvBuf, null, 2);
    bindAttr(fabricShade, shadeBuf, shadeData, 1);
    bindAttr(fabricChar, charBuf, charData, 1);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuf);
    // Drop shadow first, offset down and right, then the cloth itself.
    gl.uniform2f(fabricOffset, 4, 7);
    gl.uniform1f(fabricShadow, 1);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    gl.uniform2f(fabricOffset, 0, 0);
    gl.uniform1f(fabricShadow, 0);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_INT, 0);
    gl.disableVertexAttribArray(fabricUV);
    gl.disableVertexAttribArray(fabricShade);
    gl.disableVertexAttribArray(fabricChar);

    if (showMesh) {
      gl.useProgram(lines);
      gl.uniform2f(lineRes, W, H);
      gl.uniform4f(lineColor, 0.55 * 0.35, 0.7 * 0.35, 0.95 * 0.35, 0.35);
      bindAttr(linePos, posBuf, null, 2);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, wireBuf);
      gl.drawElements(gl.LINES, wireCount, gl.UNSIGNED_INT, 0);
    }
  }

  function draw(now) {
    drawFabric();

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Curtain rail.
    ctx.strokeStyle = '#4a4f55';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(LEFT - 14, TOP);
    ctx.lineTo(LEFT + CLOTH_W + 14, TOP);
    ctx.stroke();

    // Cut and hem edges show the cloth's thickness as a dark rim; snapped threads leave white
    // fibres, as denim's weft is undyed.
    var edges = new Path2D(), frays = new Path2D();
    for (var c = 0; c < CC; c++) {
      var a = ca[c], b = cb[c];
      if (!alive[c]) {
        if (heat[a] > 0 || heat[b] > 0) continue;
        var dx = px[b] - px[a], dy = py[b] - py[a];
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        dx *= FRAY / len; dy *= FRAY / len;
        frays.moveTo(px[a], py[a]); frays.lineTo(px[a] + dx, py[a] + dy);
        frays.moveTo(px[b], py[b]); frays.lineTo(px[b] - dx, py[b] - dy);
        continue;
      }
      var loose;
      if (c < HC) {
        var hj = (c / QC) | 0, hi = c % QC;
        loose = hj === 0 || hj === ROWS - 1 || !quadOn[(hj - 1) * QC + hi] || !quadOn[hj * QC + hi];
      } else {
        var v = c - HC, vj = (v / COLS) | 0, vi = v % COLS;
        loose = vi === 0 || vi === COLS - 1 || !quadOn[vj * QC + vi - 1] || !quadOn[vj * QC + vi];
      }
      if (!loose) continue;
      edges.moveTo(px[a], py[a]);
      edges.lineTo(px[b], py[b]);
    }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14, 22, 44, 0.95)';
    ctx.lineWidth = 2;
    ctx.stroke(edges);
    ctx.strokeStyle = 'rgba(236, 232, 220, 0.75)';
    ctx.lineWidth = 0.8;
    ctx.stroke(frays);

    // Flames over the burning front, and embers drifting up.
    ctx.globalCompositeOperation = 'lighter';
    var drawn = 0, stride = 1;
    for (var k = 0; k < N; k++) if (heat[k] > 0 && heat[k] < 1) drawn++;
    stride = Math.max(1, Math.ceil(drawn / 260));
    drawn = 0;
    for (k = 0; k < N; k++) {
      var hk = heat[k];
      if (hk <= 0.1 || hk >= 1 || drawn++ % stride) continue;
      var size = (8 + 8 * Math.sin(hk * Math.PI)) * (0.75 + Math.random() * 0.5);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(flame, px[k] - size / 2, py[k] - size * 0.85, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255, 170, 60, 0.9)';
    for (var e = 0; e < embers.length; e++) {
      var em = embers[e];
      ctx.globalAlpha = 1 - em.age / em.life;
      ctx.fillRect(em.x - 0.8, em.y - 0.8, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Pins: brass on the rail, red-headed tacks elsewhere.
    for (k = 0; k < N; k++) {
      if (!pinned[k]) continue;
      var onRail = k < COLS;
      ctx.fillStyle = onRail ? '#d8c79f' : '#d2453b';
      ctx.beginPath();
      ctx.arc(px[k], py[k], onRail ? 3.5 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (!onRail) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(px[k] - 1.3, py[k] - 1.3, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Finger feedback.
    for (var id in pointers) {
      var p = pointers[id];
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.6)';
      ctx.lineWidth = 1.5;
      if (tool === 'pull' && p.pts.length) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, GRIP_RADIUS + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tool === 'blow') {
        for (var ring = 0; ring < 3; ring++) {
          var rr = ((now / 6 + ring * 40) % BLOW_RADIUS);
          ctx.globalAlpha = 0.5 * (1 - rr / BLOW_RADIUS);
          ctx.beginPath();
          ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
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
    if (tool === 'pull') {
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
    } else if (tool === 'pin') {
      var pk = nearest(e.clientX, e.clientY, PIN_RADIUS);
      if (pk >= 0) { pinned[pk] = pinned[pk] ? 0 : 1; buzz(); }
    } else if (tool === 'burn') {
      ignite(e.clientX, e.clientY);
    }
    pointers[e.pointerId] = p;
  });

  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    if (tool === 'cut') {
      cut(p.x, p.y, e.clientX, e.clientY);
      trails.push({ x1: p.x, y1: p.y, x2: e.clientX, y2: e.clientY, t: performance.now() });
    } else if (tool === 'burn') {
      ignite(e.clientX, e.clientY);
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

  var TOOLS = { tPull: 'pull', tCut: 'cut', tBurn: 'burn', tPin: 'pin', tBlow: 'blow' };
  segment(Object.keys(TOOLS), function (id) { tool = TOOLS[id]; });
  toggle('wind', function (on) { wind = on; });
  toggle('mesh', function (on) { showMesh = on; });
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
  <div class="grow"></div>
  <button id="wind">Wind</button>
  <button id="mesh">Mesh</button>
  <button id="reset">Reset</button>
  <div class="break"></div>
  <div class="seg" role="group" aria-label="Tool">
    <button id="tPull" class="on">Pull</button>
    <button id="tCut">Cut</button>
    <button id="tBurn">Burn</button>
    <button id="tPin">Pin</button>
    <button id="tBlow">Blow</button>
  </div>`,
  status: 'Heavy denim. Pull hard to tear it, or pick another tool.',
  script,
});

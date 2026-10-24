import simPage from './shell';

// Ink swirling in liquid: a stable-fluids solver (Stam 1999) on a 4px grid. Each step adds the
// finger's push and dye, adds back small swirls the grid would smooth away (vorticity confinement),
// keeps the flow incompressible, and carries velocity and dye along with it.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var CELL = 4;
  var PRESSURE_ITERATIONS = 20;
  var SWIRL = 0.35;
  var BRUSH = 5;
  var DYE_FADE = 0.997;
  var VELOCITY_FADE = 0.999;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, GW, GH, SW, SIZE;
  var u, v, u0, v0, p, div, curl, dr, dg, db, tmp;
  var image, gridCanvas, gridCtx;
  var palette = 'rainbow';
  var swirl = true;
  var pointers = {};
  var hue = 0;
  var jets = [];

  function build() {
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
    SW = GW + 2;
    SIZE = SW * (GH + 2);
    u = new Float32Array(SIZE); v = new Float32Array(SIZE);
    u0 = new Float32Array(SIZE); v0 = new Float32Array(SIZE);
    p = new Float32Array(SIZE); div = new Float32Array(SIZE); curl = new Float32Array(SIZE);
    dr = new Float32Array(SIZE); dg = new Float32Array(SIZE); db = new Float32Array(SIZE); tmp = new Float32Array(SIZE);
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = GW;
    gridCanvas.height = GH;
    gridCtx = gridCanvas.getContext('2d');
    image = gridCtx.createImageData(GW, GH);
    // Three jets of colour so the first screen already shows the ink moving.
    jets = [
      { x: GW * 0.15, y: GH * 0.75, vx: 1.4, vy: -1.1, hue: 330, life: 50 },
      { x: GW * 0.85, y: GH * 0.7, vx: -1.3, vy: -1.2, hue: 190, life: 50 },
      { x: GW * 0.5, y: GH * 0.15, vx: 0.1, vy: 1.5, hue: 50, life: 45 },
    ];
    pointers = {};
  }

  function hsv(h) {
    var c = 1, x = 1 - Math.abs(((h / 60) % 2) - 1);
    var k = (h / 60) | 0;
    return [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k % 6];
  }

  // Boundary cells mirror their neighbours; b = 1 or 2 flips horizontal or vertical velocity so
  // the walls are solid.
  function bounds(b, x) {
    var i, j;
    for (i = 1; i <= GW; i++) {
      x[i] = b === 2 ? -x[i + SW] : x[i + SW];
      x[i + SW * (GH + 1)] = b === 2 ? -x[i + SW * GH] : x[i + SW * GH];
    }
    for (j = 1; j <= GH; j++) {
      x[SW * j] = b === 1 ? -x[1 + SW * j] : x[1 + SW * j];
      x[GW + 1 + SW * j] = b === 1 ? -x[GW + SW * j] : x[GW + SW * j];
    }
    x[0] = 0.5 * (x[1] + x[SW]);
    x[GW + 1] = 0.5 * (x[GW] + x[GW + 1 + SW]);
    x[SW * (GH + 1)] = 0.5 * (x[1 + SW * (GH + 1)] + x[SW * GH]);
    x[GW + 1 + SW * (GH + 1)] = 0.5 * (x[GW + SW * (GH + 1)] + x[GW + 1 + SW * GH]);
  }

  // Remove the part of the flow that would compress the liquid, leaving swirls.
  function project() {
    var i, j, k, n;
    for (j = 1; j <= GH; j++) {
      for (i = 1; i <= GW; i++) {
        k = i + SW * j;
        div[k] = -0.5 * (u[k + 1] - u[k - 1] + v[k + SW] - v[k - SW]);
        p[k] = 0;
      }
    }
    bounds(0, div); bounds(0, p);
    for (n = 0; n < PRESSURE_ITERATIONS; n++) {
      for (j = 1; j <= GH; j++) {
        for (i = 1; i <= GW; i++) {
          k = i + SW * j;
          p[k] = (div[k] + p[k - 1] + p[k + 1] + p[k - SW] + p[k + SW]) * 0.25;
        }
      }
      bounds(0, p);
    }
    for (j = 1; j <= GH; j++) {
      for (i = 1; i <= GW; i++) {
        k = i + SW * j;
        u[k] -= 0.5 * (p[k + 1] - p[k - 1]);
        v[k] -= 0.5 * (p[k + SW] - p[k - SW]);
      }
    }
    bounds(1, u); bounds(2, v);
  }

  // Carry field d0 along the flow (looking back along each cell's velocity) into d.
  function advect(b, d, d0, fu, fv) {
    for (var j = 1; j <= GH; j++) {
      for (var i = 1; i <= GW; i++) {
        var k = i + SW * j;
        var x = i - fu[k], y = j - fv[k];
        if (x < 0.5) x = 0.5; else if (x > GW + 0.5) x = GW + 0.5;
        if (y < 0.5) y = 0.5; else if (y > GH + 0.5) y = GH + 0.5;
        var i0 = x | 0, j0 = y | 0, s1 = x - i0, t1 = y - j0, s0 = 1 - s1, t0 = 1 - t1;
        var a = i0 + SW * j0;
        d[k] = s0 * (t0 * d0[a] + t1 * d0[a + SW]) + s1 * (t0 * d0[a + 1] + t1 * d0[a + 1 + SW]);
      }
    }
    bounds(b, d);
  }

  function splat(cx, cy, fx, fy, color, amount) {
    var r2 = BRUSH * BRUSH;
    for (var j = Math.max(1, (cy - BRUSH) | 0); j <= Math.min(GH, (cy + BRUSH) | 0); j++) {
      for (var i = Math.max(1, (cx - BRUSH) | 0); i <= Math.min(GW, (cx + BRUSH) | 0); i++) {
        var dx = i - cx, dy = j - cy, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        var w = Math.exp(-d2 / (r2 * 0.35));
        var k = i + SW * j;
        u[k] += fx * w; v[k] += fy * w;
        dr[k] += color[0] * w * amount; dg[k] += color[1] * w * amount; db[k] += color[2] * w * amount;
      }
    }
  }

  function addSwirl() {
    var i, j, k;
    for (j = 1; j <= GH; j++) {
      for (i = 1; i <= GW; i++) {
        k = i + SW * j;
        curl[k] = 0.5 * (v[k + 1] - v[k - 1] - (u[k + SW] - u[k - SW]));
      }
    }
    for (j = 2; j < GH; j++) {
      for (i = 2; i < GW; i++) {
        k = i + SW * j;
        var nx = 0.5 * (Math.abs(curl[k + 1]) - Math.abs(curl[k - 1]));
        var ny = 0.5 * (Math.abs(curl[k + SW]) - Math.abs(curl[k - SW]));
        var len = Math.sqrt(nx * nx + ny * ny) + 1e-5;
        nx /= len; ny /= len;
        u[k] += SWIRL * ny * curl[k];
        v[k] -= SWIRL * nx * curl[k];
      }
    }
  }

  function step() {
    hue = (hue + 1.6) % 360;
    for (var id in pointers) {
      var q = pointers[id];
      var color = palette === 'smoke' ? [0.75, 0.78, 0.82] : hsv((hue + q.hueOffset) % 360);
      splat(q.x / CELL, (q.y - TOP) / CELL, q.vx / CELL, q.vy / CELL, color, 0.34);
      q.vx *= 0.6; q.vy *= 0.6;
    }
    for (var n = jets.length - 1; n >= 0; n--) {
      var jt = jets[n];
      var jc = palette === 'smoke' ? [0.75, 0.78, 0.82] : hsv(jt.hue);
      splat(jt.x, jt.y, jt.vx, jt.vy, jc, 0.12);
      if (--jt.life <= 0) jets.splice(n, 1);
    }
    if (swirl) addSwirl();
    project();
    u0.set(u); v0.set(v);
    advect(1, u, u0, u0, v0);
    advect(2, v, v0, u0, v0);
    project();
    tmp.set(dr); advect(0, dr, tmp, u, v);
    tmp.set(dg); advect(0, dg, tmp, u, v);
    tmp.set(db); advect(0, db, tmp, u, v);
    for (var k = 0; k < SIZE; k++) {
      dr[k] *= DYE_FADE; dg[k] *= DYE_FADE; db[k] *= DYE_FADE;
      u[k] *= VELOCITY_FADE; v[k] *= VELOCITY_FADE;
    }
  }

  function draw() {
    var data = image.data, o = 0;
    for (var j = 1; j <= GH; j++) {
      for (var i = 1; i <= GW; i++, o += 4) {
        var k = i + SW * j;
        // Soft tone curve so dense ink saturates instead of clipping.
        data[o] = 9 + 246 * (1 - Math.exp(-dr[k] * 2.1));
        data[o + 1] = 12 + 243 * (1 - Math.exp(-dg[k] * 2.1));
        data[o + 2] = 18 + 237 * (1 - Math.exp(-db[k] * 2.1));
        data[o + 3] = 255;
      }
    }
    gridCtx.putImageData(image, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#090c12';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(gridCanvas, 0, TOP, GW * CELL, GH * CELL);
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now(), hueOffset: Math.random() * 120 };
  });
  canvas.addEventListener('pointermove', function (e) {
    var q = pointers[e.pointerId];
    if (!q) return;
    e.preventDefault();
    var now = performance.now(), dt = Math.max(1, now - q.t) / STEP_MS;
    q.vx = Math.max(-60, Math.min(60, (e.clientX - q.x) / dt));
    q.vy = Math.max(-60, Math.min(60, (e.clientY - q.y) / dt));
    q.x = e.clientX; q.y = e.clientY; q.t = now;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['pRainbow', 'pSmoke'], function (id) { palette = id === 'pRainbow' ? 'rainbow' : 'smoke'; });
  toggle('swirl', function (on) { swirl = on; });
  document.getElementById('swirl').className = 'toggle on';
  document.getElementById('swirl').setAttribute('aria-pressed', 'true');
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
  <div class="seg" role="group" aria-label="Colour">
    <button id="pRainbow" class="on">Rainbow</button>
    <button id="pSmoke">Smoke</button>
  </div>
  <div class="grow"></div>
  <button id="swirl">Swirl</button>
  <button id="reset">Reset</button>`,
  status: 'Drag to stir the ink.',
  script,
});

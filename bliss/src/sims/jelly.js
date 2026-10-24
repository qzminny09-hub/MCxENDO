import simPage from './shell';

// Soft-body jellies: each is a ring of Verlet points held together by its skin (edge and bending
// constraints) and by internal pressure that pushes the enclosed area back to its rest size.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var POINTS = 28;
  var GRAVITY = 0.28;
  var DAMPING = 0.994;
  var ITERATIONS = 8;
  var PRESSURE = 0.35;
  var BEND = 0.25;
  var FLOOR_FRICTION = 0.6;
  var GRAB_RADIUS = 60;
  var MAX_JELLIES = 10;
  var HUES = [345, 160, 42, 205, 275, 18];
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP;
  var jellies = [];
  var gx = 0, gy = GRAVITY;
  var pointers = {};
  var bgGrad;
  var hueIndex = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 8;
    bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#141d1b');
    bgGrad.addColorStop(1, '#0c1211');
  }

  function makeJelly(cx, cy, r) {
    var j = { n: POINTS, r: r, hue: HUES[hueIndex++ % HUES.length],
      x: new Float32Array(POINTS), y: new Float32Array(POINTS),
      ox: new Float32Array(POINTS), oy: new Float32Array(POINTS) };
    for (var i = 0; i < POINTS; i++) {
      var a = (i / POINTS) * Math.PI * 2;
      j.x[i] = j.ox[i] = cx + Math.cos(a) * r;
      j.y[i] = j.oy[i] = cy + Math.sin(a) * r;
    }
    j.edge = 2 * r * Math.sin(Math.PI / POINTS);
    j.bend = 2 * r * Math.sin((2 * Math.PI) / POINTS);
    j.area = area(j);
    jellies.push(j);
    return j;
  }

  function area(j) {
    var a = 0;
    for (var i = 0, k = j.n - 1; i < j.n; k = i++) a += j.x[k] * j.y[i] - j.x[i] * j.y[k];
    return a * 0.5;
  }

  function reset() {
    jellies = [];
    hueIndex = 0;
    var base = H - 90;
    makeJelly(W * 0.3, base - 40, Math.min(70, W * 0.17));
    makeJelly(W * 0.72, base - 30, Math.min(55, W * 0.14));
    makeJelly(W * 0.5, base - 220, Math.min(48, W * 0.12));
    updateStatus();
  }

  function addJelly() {
    if (jellies.length >= MAX_JELLIES) jellies.shift();
    var r = 34 + Math.random() * 34;
    makeJelly(r + Math.random() * (W - 2 * r), TOP + r + 10, r);
    updateStatus();
  }

  function updateStatus() {
    statusEl.textContent = jellies.length + (jellies.length === 1 ? ' jelly' : ' jellies') + '. Grab one and throw it.';
  }

  function constrain(j, a, b, rest, stiffness) {
    var dx = j.x[b] - j.x[a], dy = j.y[b] - j.y[a];
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d === 0) return;
    var diff = ((d - rest) / d) * 0.5 * stiffness;
    dx *= diff; dy *= diff;
    j.x[a] += dx; j.y[a] += dy;
    j.x[b] -= dx; j.y[b] -= dy;
  }

  function inflate(j) {
    var n = j.n, perimeter = 0;
    for (var i = 0; i < n; i++) {
      var k = (i + 1) % n;
      perimeter += Math.hypot(j.x[k] - j.x[i], j.y[k] - j.y[i]);
    }
    var push = ((j.area - area(j)) / perimeter) * PRESSURE;
    for (i = 0; i < n; i++) {
      var prev = (i + n - 1) % n, next = (i + 1) % n;
      var tx = j.x[next] - j.x[prev], ty = j.y[next] - j.y[prev];
      var len = Math.sqrt(tx * tx + ty * ty) || 1;
      // Points go round in the order that gives a positive area, so (ty, -tx) faces outward.
      j.x[i] += (ty / len) * push;
      j.y[i] += (-tx / len) * push;
    }
  }

  function inside(j, px, py) {
    var hit = false;
    for (var i = 0, k = j.n - 1; i < j.n; k = i++) {
      if ((j.y[i] > py) !== (j.y[k] > py) && px < ((j.x[k] - j.x[i]) * (py - j.y[i])) / (j.y[k] - j.y[i]) + j.x[i]) hit = !hit;
    }
    return hit;
  }

  // Push any point of jelly a that has sunk into jelly b back out through b's nearest edge.
  function collide(a, b) {
    for (var i = 0; i < a.n; i++) {
      var px = a.x[i], py = a.y[i];
      if (!inside(b, px, py)) continue;
      var best = Infinity, bk = 0, bt = 0, bx = 0, by = 0;
      for (var k = 0; k < b.n; k++) {
        var k2 = (k + 1) % b.n;
        var ex = b.x[k2] - b.x[k], ey = b.y[k2] - b.y[k];
        var t = ((px - b.x[k]) * ex + (py - b.y[k]) * ey) / (ex * ex + ey * ey || 1);
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var cx = b.x[k] + ex * t, cy = b.y[k] + ey * t;
        var d = (cx - px) * (cx - px) + (cy - py) * (cy - py);
        if (d < best) { best = d; bk = k; bt = t; bx = cx; by = cy; }
      }
      var mx = (bx - px) * 0.5, my = (by - py) * 0.5;
      a.x[i] += mx; a.y[i] += my;
      var k3 = (bk + 1) % b.n;
      b.x[bk] -= mx * (1 - bt); b.y[bk] -= my * (1 - bt);
      b.x[k3] -= mx * bt; b.y[k3] -= my * bt;
    }
  }

  function step() {
    var i, j, n;
    for (n = 0; n < jellies.length; n++) {
      j = jellies[n];
      for (i = 0; i < j.n; i++) {
        var vx = (j.x[i] - j.ox[i]) * DAMPING, vy = (j.y[i] - j.oy[i]) * DAMPING;
        j.ox[i] = j.x[i]; j.oy[i] = j.y[i];
        j.x[i] += vx + gx;
        j.y[i] += vy + gy;
      }
    }
    for (var id in pointers) {
      var p = pointers[id];
      if (!p.jelly) continue;
      var pj = p.jelly, pi = p.index;
      pj.x[pi] += (p.x - pj.x[pi]) * 0.5;
      pj.y[pi] += (p.y - pj.y[pi]) * 0.5;
    }

    for (var it = 0; it < ITERATIONS; it++) {
      for (n = 0; n < jellies.length; n++) {
        j = jellies[n];
        inflate(j);
        for (i = 0; i < j.n; i++) {
          constrain(j, i, (i + 1) % j.n, j.edge, 1);
          constrain(j, i, (i + 2) % j.n, j.bend, BEND);
        }
      }
      for (n = 0; n < jellies.length; n++) {
        for (var m = n + 1; m < jellies.length; m++) {
          collide(jellies[n], jellies[m]);
          collide(jellies[m], jellies[n]);
        }
      }
      for (n = 0; n < jellies.length; n++) walls(jellies[n]);
    }
  }

  function walls(j) {
    var left = 2, right = W - 2, top = TOP, bottom = H - 2;
    for (var i = 0; i < j.n; i++) {
      var vx = j.x[i] - j.ox[i], vy = j.y[i] - j.oy[i];
      if (j.y[i] > bottom) {
        if (vy > 6) buzz();
        j.y[i] = bottom;
        j.ox[i] = j.x[i] - vx * FLOOR_FRICTION;
      } else if (j.y[i] < top) {
        j.y[i] = top;
      }
      if (j.x[i] < left) { j.x[i] = left; j.oy[i] = j.y[i] - vy * FLOOR_FRICTION; }
      else if (j.x[i] > right) { j.x[i] = right; j.oy[i] = j.y[i] - vy * FLOOR_FRICTION; }
    }
  }

  function centroid(j) {
    var cx = 0, cy = 0;
    for (var i = 0; i < j.n; i++) { cx += j.x[i]; cy += j.y[i]; }
    return [cx / j.n, cy / j.n];
  }

  function outline(j) {
    var n = j.n;
    ctx.beginPath();
    ctx.moveTo((j.x[n - 1] + j.x[0]) / 2, (j.y[n - 1] + j.y[0]) / 2);
    for (var i = 0; i < n; i++) {
      var k = (i + 1) % n;
      ctx.quadraticCurveTo(j.x[i], j.y[i], (j.x[i] + j.x[k]) / 2, (j.y[i] + j.y[k]) / 2);
    }
    ctx.closePath();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(160, 200, 190, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, H - 1);
    ctx.lineTo(W, H - 1);
    ctx.stroke();

    for (var n = 0; n < jellies.length; n++) {
      var j = jellies[n];
      var c = centroid(j), r = j.r;
      // Soft contact shadow on the floor.
      var lift = Math.max(0, H - 2 - (c[1] + r));
      ctx.fillStyle = 'rgba(0, 0, 0,' + (0.35 * Math.max(0, 1 - lift / 200)).toFixed(3) + ')';
      ctx.beginPath();
      ctx.ellipse(c[0], H - 3, r * 0.9, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      var g = ctx.createRadialGradient(c[0] - r * 0.35, c[1] - r * 0.4, r * 0.1, c[0], c[1], r * 1.3);
      g.addColorStop(0, 'hsla(' + j.hue + ', 90%, 78%, 0.95)');
      g.addColorStop(0.55, 'hsla(' + j.hue + ', 75%, 58%, 0.9)');
      g.addColorStop(1, 'hsla(' + j.hue + ', 70%, 36%, 0.92)');
      outline(j);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'hsla(' + j.hue + ', 70%, 28%, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Glossy highlight and a face that follows the body.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.ellipse(c[0] - r * 0.38, c[1] - r * 0.45, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'hsla(' + j.hue + ', 60%, 14%, 0.9)';
      ctx.beginPath();
      ctx.ellipse(c[0] - r * 0.22, c[1] - r * 0.05, r * 0.07, r * 0.11, 0, 0, Math.PI * 2);
      ctx.ellipse(c[0] + r * 0.22, c[1] - r * 0.05, r * 0.07, r * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (var id in pointers) {
      var p = pointers[id];
      if (!p.jelly) continue;
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    // A touch inside a jelly grabs its nearest skin point; otherwise the nearest point within reach.
    var x = e.clientX, y = e.clientY, best = null, bestIndex = 0, bestD = GRAB_RADIUS * GRAB_RADIUS;
    for (var n = jellies.length - 1; n >= 0; n--) {
      var j = jellies[n], within = inside(j, x, y);
      if (within) { best = null; bestD = Infinity; }
      for (var i = 0; i < j.n; i++) {
        var d = (j.x[i] - x) * (j.x[i] - x) + (j.y[i] - y) * (j.y[i] - y);
        if (d < bestD) { bestD = d; best = j; bestIndex = i; }
      }
      if (within) break;
    }
    pointers[e.pointerId] = { x: x, y: y, jelly: best, index: bestIndex };
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

  window.onTilt = function (tx, ty) { gx = GRAVITY * tx; gy = GRAVITY * ty; };
  document.getElementById('add').onclick = addJelly;
  toggle('tilt', function (on) {
    post({ type: 'tilt', on: on });
    if (!on) { gx = 0; gy = GRAVITY; }
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
  <button id="add">Add</button>
  <div class="grow"></div>
  <button id="tilt">Tilt</button>
  <button id="reset">Reset</button>`,
  status: 'Grab a jelly and throw it.',
  script,
});

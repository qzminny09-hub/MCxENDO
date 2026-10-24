import simPage from './shell';

// Ropes hanging from pegs with heavy balls on the ends: Verlet chains whose last point is weighted
// so it barely gives to the rope. Grab to swing them, or switch to Cut and swipe across a rope.
// Balls knock into each other and roll on the floor.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var LINK = 9;
  var GRAVITY = 0.4;
  var DAMPING = 0.996;
  var ITERATIONS = 14;
  var BALL_RADIUS = 15;
  var BALL_WEIGHT = 12;
  var GRAB_RADIUS = 40;
  var MAX_ROPES = 8;
  var COLORS = ['#e2574c', '#f0b44c', '#4cb3e2', '#6fd17d', '#b57be8'];
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, FLOOR;
  var ropes = [];
  var tool = 'grab';
  var pointers = {};
  var trails = [];
  var colorIndex = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    FLOOR = H - 50;
  }

  // A rope is a chain of points; the first is nailed to a peg and the last carries a ball.
  function makeRope(ax, ay, length, swing) {
    var n = Math.max(6, Math.round(length / LINK));
    var r = { x: [], y: [], ox: [], oy: [], alive: [], color: COLORS[colorIndex++ % COLORS.length] };
    for (var i = 0; i <= n; i++) {
      var x = ax + swing * i * LINK * 0.7, y = ay + i * LINK * 0.7;
      r.x.push(x); r.y.push(y); r.ox.push(x); r.oy.push(y);
      if (i < n) r.alive.push(true);
    }
    ropes.push(r);
  }

  function reset() {
    ropes = [];
    colorIndex = 0;
    var span = FLOOR - TOP;
    makeRope(W * 0.2, TOP + 30, span * 0.55, 1);
    makeRope(W * 0.5, TOP + 30, span * 0.45, 0);
    makeRope(W * 0.8, TOP + 30, span * 0.6, -1);
    statusEl.textContent = 'Swing the balls, or pick Cut and swipe across a rope.';
  }

  function addRope() {
    if (ropes.length >= MAX_ROPES) ropes.shift();
    makeRope(W * (0.12 + Math.random() * 0.76), TOP + 30, (FLOOR - TOP) * (0.3 + Math.random() * 0.35), Math.random() < 0.5 ? -1 : 1);
  }

  // How much a point resists being moved: pegs not at all, balls a lot, rope links normally.
  function weight(r, i) { return i === 0 ? 0 : i === r.x.length - 1 ? 1 / BALL_WEIGHT : 1; }

  function step() {
    var i, n, r;
    for (n = 0; n < ropes.length; n++) {
      r = ropes[n];
      for (i = 1; i < r.x.length; i++) {
        var vx = (r.x[i] - r.ox[i]) * DAMPING, vy = (r.y[i] - r.oy[i]) * DAMPING;
        r.ox[i] = r.x[i]; r.oy[i] = r.y[i];
        r.x[i] += vx; r.y[i] += vy + GRAVITY;
      }
    }
    for (var id in pointers) {
      var p = pointers[id];
      if (!p.rope) continue;
      p.rope.x[p.index] += (p.x - p.rope.x[p.index]) * 0.4;
      p.rope.y[p.index] += (p.y - p.rope.y[p.index]) * 0.4;
    }
    for (var it = 0; it < ITERATIONS; it++) {
      for (n = 0; n < ropes.length; n++) {
        r = ropes[n];
        for (i = 0; i < r.alive.length; i++) {
          if (!r.alive[i]) continue;
          var dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i];
          var d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          var wa = weight(r, i), wb = weight(r, i + 1), total = wa + wb;
          if (total === 0) continue;
          var diff = (d - LINK) / d / total;
          r.x[i] += dx * diff * wa; r.y[i] += dy * diff * wa;
          r.x[i + 1] -= dx * diff * wb; r.y[i + 1] -= dy * diff * wb;
        }
      }
      collide();
    }
  }

  // Balls bump each other and every point stays above the floor and inside the walls.
  function collide() {
    for (var n = 0; n < ropes.length; n++) {
      var a = ropes[n], ai = a.x.length - 1;
      for (var m = n + 1; m < ropes.length; m++) {
        var b = ropes[m], bi = b.x.length - 1;
        var dx = b.x[bi] - a.x[ai], dy = b.y[bi] - a.y[ai], rr = BALL_RADIUS * 2, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        var d = Math.sqrt(d2), push = (rr - d) / d / 2;
        a.x[ai] -= dx * push; a.y[ai] -= dy * push; b.x[bi] += dx * push; b.y[bi] += dy * push;
        if (d < rr - 3) buzz();
      }
      for (var i = 1; i < a.x.length; i++) {
        var rad = i === ai ? BALL_RADIUS : 2;
        if (a.y[i] > FLOOR - rad) { a.y[i] = FLOOR - rad; a.ox[i] = a.x[i] - (a.x[i] - a.ox[i]) * 0.9; }
        if (a.x[i] < rad) a.x[i] = rad;
        if (a.x[i] > W - rad) a.x[i] = W - rad;
      }
    }
  }

  function cross(ax, ay, bx, by, cx, cy) { return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); }

  function cut(x1, y1, x2, y2) {
    var n = 0;
    for (var k = 0; k < ropes.length; k++) {
      var r = ropes[k];
      for (var i = 0; i < r.alive.length; i++) {
        if (!r.alive[i]) continue;
        var ax = r.x[i], ay = r.y[i], bx = r.x[i + 1], by = r.y[i + 1];
        if (cross(x1, y1, x2, y2, ax, ay) * cross(x1, y1, x2, y2, bx, by) < 0 &&
            cross(ax, ay, bx, by, x1, y1) * cross(ax, ay, bx, by, x2, y2) < 0) { r.alive[i] = false; n++; }
      }
    }
    if (n) { buzz(); statusEl.textContent = 'Snip!'; }
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2430');
    g.addColorStop(1, '#141920');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#2c2621';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#3c342c';
    ctx.fillRect(0, FLOOR, W, 3);
    ctx.fillStyle = '#4a4f58';
    ctx.fillRect(0, TOP + 22, W, 8);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var n = 0; n < ropes.length; n++) {
      var r = ropes[n];
      // Twisted rope: a dark core with a lighter strand dashed along it.
      for (var pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? '#c9a46f' : '#7a5a35';
        ctx.lineWidth = pass ? 2.2 : 5;
        ctx.setLineDash(pass ? [4, 4] : []);
        ctx.beginPath();
        var open = false;
        for (var i = 0; i < r.alive.length; i++) {
          if (!r.alive[i]) { open = false; continue; }
          if (!open) { ctx.moveTo(r.x[i], r.y[i]); open = true; }
          ctx.lineTo(r.x[i + 1], r.y[i + 1]);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.fillStyle = '#c0c4cc';
      ctx.beginPath();
      ctx.arc(r.x[0], r.y[0], 5, 0, Math.PI * 2);
      ctx.fill();
      var bi = r.x.length - 1, bx = r.x[bi], by = r.y[bi];
      var bg = ctx.createRadialGradient(bx - 5, by - 6, 2, bx, by, BALL_RADIUS);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.3, r.color);
      bg.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(bx, by, BALL_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    trails = trails.filter(function (t) { return now - t.t < 220; });
    for (var k = 0; k < trails.length; k++) {
      var tr = trails[k];
      ctx.strokeStyle = 'rgba(240, 200, 170,' + (1 - (now - tr.t) / 220).toFixed(2) + ')';
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
    var p = { x: e.clientX, y: e.clientY, rope: null, index: 0 };
    if (tool === 'grab') {
      var best = GRAB_RADIUS * GRAB_RADIUS;
      for (var n = 0; n < ropes.length; n++) {
        for (var i = 1; i < ropes[n].x.length; i++) {
          var dx = ropes[n].x[i] - e.clientX, dy = ropes[n].y[i] - e.clientY, d = dx * dx + dy * dy;
          if (d < best) { best = d; p.rope = ropes[n]; p.index = i; }
        }
      }
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
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['tGrab', 'tCut'], function (id) { tool = id === 'tGrab' ? 'grab' : 'cut'; });
  document.getElementById('add').onclick = addRope;
  document.getElementById('reset').onclick = reset;

  window.addEventListener('resize', function () { resize(); reset(); });
  resize();
  reset();
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
  <div class="seg" role="group" aria-label="Tool">
    <button id="tGrab" class="on">Grab</button>
    <button id="tCut">Cut</button>
  </div>
  <div class="grow"></div>
  <button id="add">Add</button>
  <button id="reset">Reset</button>`,
  status: 'Swing the balls, or pick Cut and swipe across a rope.',
  script,
});

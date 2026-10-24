import simPage from './shell';

// A pane of glass in a window frame. A hit splits the piece it lands on into Voronoi cells whose
// seeds crowd around the impact, so splinters are small at the centre and larger further out, like
// real breaking glass. Shards near the hit fly out, spin and bounce; the rest stay in the frame,
// cracked, until hit again. A shard that lands hard can break in two.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRAVITY = 0.35;
  var BOUNCE = 0.3;
  var FLOOR_FRICTION = 0.8;
  var MAX_SHARDS = 500;
  var TOOLS = { tap: { seeds: 26, reach: 60, loosen: 34 }, smash: { seeds: 46, reach: 150, loosen: 110 } };
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, FLOOR, pane, view;
  var fixed = [];   // pieces still held in the frame: { pts: [x, y, ...] } in screen space
  var loose = [];   // falling shards: { pts (local), x, y, a, vx, vy, va, resting }
  var tool = 'tap';

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    FLOOR = H - 26;
    var pw = Math.min(W - 60, 420), ph = Math.min((FLOOR - TOP) * 0.62, pw * 1.35);
    pane = { x: (W - pw) / 2, y: TOP + 40, w: pw, h: ph };
    drawView();
  }

  // Evening sky and hills seen through the window, drawn once.
  function drawView() {
    view = document.createElement('canvas');
    view.width = canvas.width;
    view.height = canvas.height;
    var v = view.getContext('2d');
    v.scale(DPR, DPR);
    var g = v.createLinearGradient(0, pane.y, 0, pane.y + pane.h);
    g.addColorStop(0, '#2b3f66');
    g.addColorStop(0.65, '#d98a5b');
    g.addColorStop(1, '#f2c27a');
    v.fillStyle = g;
    v.fillRect(pane.x, pane.y, pane.w, pane.h);
    v.fillStyle = '#3b3a4f';
    v.beginPath();
    v.moveTo(pane.x, pane.y + pane.h);
    for (var x = 0; x <= pane.w; x += 6) v.lineTo(pane.x + x, pane.y + pane.h * 0.78 - Math.sin(x * 0.018) * 18 - Math.sin(x * 0.05) * 6);
    v.lineTo(pane.x + pane.w, pane.y + pane.h);
    v.fill();
    v.fillStyle = '#26253a';
    v.beginPath();
    v.moveTo(pane.x, pane.y + pane.h);
    for (x = 0; x <= pane.w; x += 6) v.lineTo(pane.x + x, pane.y + pane.h * 0.88 - Math.sin(x * 0.03 + 1.7) * 10);
    v.lineTo(pane.x + pane.w, pane.y + pane.h);
    v.fill();
  }

  function reset() {
    fixed = [{ pts: [pane.x, pane.y, pane.x + pane.w, pane.y, pane.x + pane.w, pane.y + pane.h, pane.x, pane.y + pane.h] }];
    loose = [];
    statusEl.textContent = 'Tap the glass to crack it, or switch to Smash.';
  }

  // Keep the part of a convex polygon on the near side of the bisector between seeds a and b.
  function clipHalf(pts, ax, ay, bx, by) {
    var mx = (ax + bx) / 2, my = (ay + by) / 2, nx = bx - ax, ny = by - ay, out = [];
    var n = pts.length / 2;
    for (var i = 0; i < n; i++) {
      var x1 = pts[i * 2], y1 = pts[i * 2 + 1], j = (i + 1) % n, x2 = pts[j * 2], y2 = pts[j * 2 + 1];
      var d1 = (x1 - mx) * nx + (y1 - my) * ny, d2 = (x2 - mx) * nx + (y2 - my) * ny;
      if (d1 <= 0) out.push(x1, y1);
      if ((d1 <= 0) !== (d2 <= 0)) {
        var t = d1 / (d1 - d2);
        out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
      }
    }
    return out;
  }

  function centroid(pts) {
    var cx = 0, cy = 0, n = pts.length / 2;
    for (var i = 0; i < n; i++) { cx += pts[i * 2]; cy += pts[i * 2 + 1]; }
    return [cx / n, cy / n];
  }

  function area(pts) {
    var a = 0, n = pts.length / 2;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n;
      a += pts[i * 2] * pts[j * 2 + 1] - pts[j * 2] * pts[i * 2 + 1];
    }
    return Math.abs(a) / 2;
  }

  function inside(pts, x, y) {
    var hit = false, n = pts.length / 2;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }

  // Split a convex piece into Voronoi cells around seeds crowded near (hx, hy).
  function shatter(pts, hx, hy, count, reach) {
    var seeds = [];
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 1.7) * reach * 2.2;
      seeds.push(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 1.1);
    }
    var cells = [];
    for (i = 0; i < count; i++) {
      var cell = pts.slice();
      for (var j = 0; j < count && cell.length >= 6; j++) {
        if (i !== j) cell = clipHalf(cell, seeds[i * 2], seeds[i * 2 + 1], seeds[j * 2], seeds[j * 2 + 1]);
      }
      if (cell.length >= 6 && area(cell) > 4) cells.push(cell);
    }
    return cells;
  }

  function loosen(cell, hx, hy, power) {
    var c = centroid(cell), local = [];
    for (var i = 0; i < cell.length; i += 2) local.push(cell[i] - c[0], cell[i + 1] - c[1]);
    var dx = c[0] - hx, dy = c[1] - hy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var speed = power * (1.4 + Math.random() * 2) * Math.max(0.2, 1 - d / 200);
    loose.push({ pts: local, x: c[0], y: c[1], a: 0,
      vx: (dx / d) * speed + (Math.random() - 0.5), vy: (dy / d) * speed - 1 - Math.random() * 1.5,
      va: (Math.random() - 0.5) * 0.25, resting: false });
    if (loose.length > MAX_SHARDS) loose.shift();
  }

  function hit(x, y) {
    var spec = TOOLS[tool];
    for (var f = 0; f < fixed.length; f++) {
      if (!inside(fixed[f].pts, x, y)) continue;
      var piece = fixed.splice(f, 1)[0];
      var cells = shatter(piece.pts, x, y, spec.seeds, spec.reach);
      for (var i = 0; i < cells.length; i++) {
        var c = centroid(cells[i]);
        var d = Math.hypot(c[0] - x, c[1] - y);
        if (d < spec.loosen || (tool === 'smash' && Math.random() < 0.35)) loosen(cells[i], x, y, tool === 'smash' ? 3 : 1.6);
        else fixed.push({ pts: cells[i] });
      }
      statusEl.textContent = loose.length + ' shards on the floor, ' + fixed.length + ' still in the frame';
      buzz();
      return;
    }
  }

  function step() {
    for (var i = 0; i < loose.length; i++) {
      var s = loose[i];
      if (s.resting) continue;
      s.vy += GRAVITY;
      s.vx *= 0.995; s.vy *= 0.995;
      s.x += s.vx; s.y += s.vy; s.a += s.va;
      // The lowest corner after rotation decides when it touches the floor; the next lowest tells
      // whether it is lying flat or balanced on a corner.
      var cos = Math.cos(s.a), sin = Math.sin(s.a), low = -Infinity, low2 = -Infinity, lowX = 0;
      for (var k = 0; k < s.pts.length; k += 2) {
        var ry = s.pts[k] * sin + s.pts[k + 1] * cos;
        if (ry > low) { low2 = low; low = ry; lowX = s.pts[k] * cos - s.pts[k + 1] * sin; }
        else if (ry > low2) low2 = ry;
      }
      if (s.y + low > FLOOR) {
        var impact = s.vy;
        s.y = FLOOR - low;
        s.vy = -s.vy * BOUNCE;
        s.vx *= FLOOR_FRICTION;
        // Standing on a corner, gravity tips it over around that corner until a side lies flat.
        s.va = s.va * 0.6 - lowX * 0.0025;
        if (impact > 7 && area(s.pts) > 220 && Math.random() < 0.5) { split(i); buzz(); continue; }
        var flat = low - low2 < 1;
        if (flat && Math.abs(s.vy) < 0.6 && Math.abs(s.vx) < 0.15) { s.resting = true; s.vy = 0; s.vx = 0; s.va = 0; }
      }
      if (s.x < 0 || s.x > W) { s.vx = -s.vx * 0.5; s.x = Math.max(0, Math.min(W, s.x)); }
    }
  }

  // Break a shard that hit the floor hard into two along a random line through its middle.
  function split(index) {
    var s = loose[index];
    var a = Math.random() * Math.PI, nx = Math.cos(a), ny = Math.sin(a);
    var halves = [clipHalf(s.pts, -nx, -ny, nx, ny), clipHalf(s.pts, nx, ny, -nx, -ny)];
    loose.splice(index, 1);
    var cos = Math.cos(s.a), sin = Math.sin(s.a);
    halves.forEach(function (h, side) {
      if (h.length < 6) return;
      var world = [];
      for (var k = 0; k < h.length; k += 2) world.push(s.x + h[k] * cos - h[k + 1] * sin, s.y + h[k] * sin + h[k + 1] * cos);
      var c = centroid(world), local = [];
      for (k = 0; k < world.length; k += 2) local.push(world[k] - c[0], world[k + 1] - c[1]);
      loose.push({ pts: local, x: c[0], y: c[1], a: 0, vx: s.vx + (side ? 1 : -1) * (0.5 + Math.random()),
        vy: -2 - Math.random() * 2, va: (Math.random() - 0.5) * 0.3, resting: false });
    });
  }

  function glassPath(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var k = 2; k < pts.length; k += 2) ctx.lineTo(pts[k], pts[k + 1]);
    ctx.closePath();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var wall = ctx.createLinearGradient(0, 0, 0, H);
    wall.addColorStop(0, '#2a2a30');
    wall.addColorStop(1, '#1d1d22');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#3d3329';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#4c4034';
    ctx.fillRect(0, FLOOR, W, 3);

    // The view outside, then the frame round it.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(view, 0, 0);
    ctx.restore();
    ctx.strokeStyle = '#6b5442';
    ctx.lineWidth = 14;
    ctx.strokeRect(pane.x - 7, pane.y - 7, pane.w + 14, pane.h + 14);
    ctx.strokeStyle = '#857058';
    ctx.lineWidth = 2;
    ctx.strokeRect(pane.x - 13, pane.y - 13, pane.w + 26, pane.h + 26);

    // Glass still in the frame: a faint tint with a sheen, and bright crack lines along every edge.
    var sheen = ctx.createLinearGradient(pane.x, pane.y, pane.x + pane.w, pane.y + pane.h);
    sheen.addColorStop(0, 'rgba(210, 235, 245, 0.22)');
    sheen.addColorStop(0.45, 'rgba(210, 235, 245, 0.06)');
    sheen.addColorStop(0.55, 'rgba(255, 255, 255, 0.2)');
    sheen.addColorStop(1, 'rgba(210, 235, 245, 0.08)');
    ctx.lineJoin = 'round';
    for (var f = 0; f < fixed.length; f++) {
      glassPath(fixed[f].pts);
      ctx.fillStyle = 'rgba(170, 205, 222, 0.2)';
      ctx.fill();
      ctx.fillStyle = sheen;
      ctx.fill();
      if (fixed.length > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    // Loose shards, lit along their edges.
    for (var i = 0; i < loose.length; i++) {
      var s = loose[i];
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      glassPath(s.pts);
      ctx.fillStyle = 'rgba(200, 228, 240, 0.32)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(235, 250, 255, 0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    hit(e.clientX, e.clientY);
  });

  segment(['tTap', 'tSmash'], function (id) { tool = id === 'tTap' ? 'tap' : 'smash'; });
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
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="seg" role="group" aria-label="Hit">
    <button id="tTap" class="on">Tap</button>
    <button id="tSmash">Smash</button>
  </div>
  <div class="grow"></div>
  <button id="reset">Reset</button>`,
  status: 'Tap the glass to crack it, or switch to Smash.',
  script,
});

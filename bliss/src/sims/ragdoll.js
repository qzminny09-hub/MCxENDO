import simPage from './shell';

// Ragdolls: Verlet points for head, neck, torso, elbows, hands, knees and feet, held together by
// sticks, with minimum distances acting as joint limits so limbs cannot fold through the body.
// They tumble down a staircase and off a shelf; grab any part to fling them.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRAVITY = 0.45;
  var DAMPING = 0.995;
  var SUBSTEPS = 2;
  var ITERATIONS = 8;
  var FRICTION = 0.7;
  var GRAB_RADIUS = 50;
  var MAX_DOLLS = 6;
  var HUES = [12, 205, 140, 45, 285, 330];
  var STEP_MS = 1000 / 60;

  // Body points: offsets from the pelvis when standing, and collision radius.
  var BODY = [
    [0, -76, 11],   // 0 head
    [0, -58, 6],    // 1 neck
    [0, -36, 7],    // 2 chest
    [0, 0, 7],      // 3 pelvis
    [-14, -40, 5],  // 4 left elbow
    [-18, -20, 4],  // 5 left hand
    [14, -40, 5],   // 6 right elbow
    [18, -20, 4],   // 7 right hand
    [-7, 26, 5],    // 8 left knee
    [-8, 52, 4],    // 9 left foot
    [7, 26, 5],     // 10 right knee
    [8, 52, 4],     // 11 right foot
  ];
  var STICKS = [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7], [3, 8], [8, 9], [3, 10], [10, 11], [0, 2], [1, 3]];
  // Joint limits: these pairs may not come closer than the given distance.
  var LIMITS = [[5, 1, 18], [7, 1, 18], [9, 3, 26], [11, 3, 26], [0, 3, 52], [4, 2, 10], [6, 2, 10], [8, 10, 6]];

  var W, H, DPR, TOP;
  var dolls = [];
  var blocks = [];
  var gx = 0, gy = GRAVITY;
  var pointers = {};
  var hueIndex = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    // A staircase down from the left, and a shelf high on the right.
    blocks = [];
    var steps = 6, rise = 30, run = (W * 0.6) / steps, top0 = H - (steps + 1) * rise;
    for (var i = 0; i < steps; i++) blocks.push({ x: i * run, y: top0 + i * rise, w: run, h: H - (top0 + i * rise) });
    blocks.push({ x: W * 0.62, y: H * 0.38, w: W * 0.38, h: 14 });
  }

  function makeDoll(px, py) {
    var d = { hue: HUES[hueIndex++ % HUES.length], x: [], y: [], ox: [], oy: [], dizzy: 0 };
    for (var i = 0; i < BODY.length; i++) {
      d.x.push(px + BODY[i][0]); d.y.push(py + BODY[i][1]);
      d.ox.push(px + BODY[i][0]); d.oy.push(py + BODY[i][1]);
    }
    d.rest = STICKS.map(function (s) { return Math.hypot(BODY[s[0]][0] - BODY[s[1]][0], BODY[s[0]][1] - BODY[s[1]][1]); });
    dolls.push(d);
  }

  function reset() {
    dolls = [];
    hueIndex = 0;
    var first = blocks[0];
    makeDoll(first.w * 0.5, first.y - 54);
    makeDoll(W * 0.8, blocks[blocks.length - 1].y - 54);
    makeDoll(W * 0.5, TOP + 90);
    updateStatus();
  }

  function addDoll() {
    if (dolls.length >= MAX_DOLLS) dolls.shift();
    makeDoll(W * (0.2 + Math.random() * 0.6), TOP + 90);
    updateStatus();
  }

  function updateStatus() {
    statusEl.textContent = dolls.length + (dolls.length === 1 ? ' ragdoll' : ' ragdolls') + '. Grab one and throw it.';
  }

  function stick(d, a, b, rest, minOnly) {
    var dx = d.x[b] - d.x[a], dy = d.y[b] - d.y[a];
    var dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
    if (minOnly && dist >= rest) return;
    var diff = ((dist - rest) / dist) * 0.5;
    d.x[a] += dx * diff; d.y[a] += dy * diff;
    d.x[b] -= dx * diff; d.y[b] -= dy * diff;
  }

  // Keep a point out of walls, floor and blocks. The solver calls this on every pass; impacts are
  // read on the first pass, and sliding friction is applied only on the last so it does not compound.
  function collide(d, i, first, last) {
    var r = BODY[i][2], x = d.x[i], y = d.y[i];
    var vx = x - d.ox[i], vy = y - d.oy[i], hit = 0;
    var f = last ? FRICTION : 1;
    if (y > H - r) { d.y[i] = H - r; d.ox[i] = d.x[i] - vx * f; hit = vy; }
    if (y < TOP + r) d.y[i] = TOP + r;
    if (x < r) { d.x[i] = r; d.oy[i] = d.y[i] - vy * f; hit = Math.max(hit, -vx); }
    if (x > W - r) { d.x[i] = W - r; d.oy[i] = d.y[i] - vy * f; hit = Math.max(hit, vx); }
    for (var b = 0; b < blocks.length; b++) {
      var k = blocks[b];
      x = d.x[i]; y = d.y[i];
      if (x < k.x - r || x > k.x + k.w + r || y < k.y - r || y > k.y + k.h + r) continue;
      var left = x - (k.x - r), right = k.x + k.w + r - x, up = y - (k.y - r), down = k.y + k.h + r - y;
      var m = Math.min(left, right, up, down);
      if (m === up) { d.y[i] = k.y - r; d.ox[i] = d.x[i] - vx * f; hit = Math.max(hit, vy); }
      else if (m === down) d.y[i] = k.y + k.h + r;
      else if (m === left) { d.x[i] = k.x - r; d.oy[i] = d.y[i] - vy * f; }
      else { d.x[i] = k.x + k.w + r; d.oy[i] = d.y[i] - vy * f; }
    }
    if (!first) return;
    if (hit > 9 && i === 0) { d.dizzy = 90; buzz(); }
    else if (hit > 11) buzz();
  }

  function substep() {
    var g2x = gx / (SUBSTEPS * SUBSTEPS), g2y = gy / (SUBSTEPS * SUBSTEPS);
    var damp = Math.pow(DAMPING, 1 / SUBSTEPS);
    for (var n = 0; n < dolls.length; n++) {
      var d = dolls[n];
      for (var i = 0; i < BODY.length; i++) {
        var vx = (d.x[i] - d.ox[i]) * damp, vy = (d.y[i] - d.oy[i]) * damp;
        d.ox[i] = d.x[i]; d.oy[i] = d.y[i];
        d.x[i] += vx + g2x; d.y[i] += vy + g2y;
      }
    }
    for (var id in pointers) {
      var p = pointers[id];
      if (!p.doll) continue;
      p.doll.x[p.index] += (p.x - p.doll.x[p.index]) * 0.5;
      p.doll.y[p.index] += (p.y - p.doll.y[p.index]) * 0.5;
    }
    for (var it = 0; it < ITERATIONS; it++) {
      for (n = 0; n < dolls.length; n++) {
        d = dolls[n];
        for (var s = 0; s < STICKS.length; s++) stick(d, STICKS[s][0], STICKS[s][1], d.rest[s], false);
        for (s = 0; s < LIMITS.length; s++) stick(d, LIMITS[s][0], LIMITS[s][1], LIMITS[s][2], true);
      }
      // Bodies bump into each other point by point.
      for (n = 0; n < dolls.length; n++) {
        for (var m = n + 1; m < dolls.length; m++) {
          var a = dolls[n], b = dolls[m];
          for (i = 0; i < BODY.length; i++) {
            for (var j = 0; j < BODY.length; j++) {
              var dx = b.x[j] - a.x[i], dy = b.y[j] - a.y[i], rr = BODY[i][2] + BODY[j][2];
              var d2 = dx * dx + dy * dy;
              if (d2 >= rr * rr || d2 === 0) continue;
              var dist = Math.sqrt(d2), push = ((rr - dist) / dist) * 0.5;
              a.x[i] -= dx * push; a.y[i] -= dy * push;
              b.x[j] += dx * push; b.y[j] += dy * push;
            }
          }
        }
      }
      for (n = 0; n < dolls.length; n++) for (i = 0; i < BODY.length; i++) collide(dolls[n], i, it === 0, it === ITERATIONS - 1);
    }
  }

  function step() {
    for (var s = 0; s < SUBSTEPS; s++) substep();
    for (var n = 0; n < dolls.length; n++) if (dolls[n].dizzy > 0) dolls[n].dizzy--;
  }

  function limb(d, a, b, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(d.x[a], d.y[a]);
    ctx.lineTo(d.x[b], d.y[b]);
    ctx.stroke();
  }

  function draw(now) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2226');
    g.addColorStop(1, '#11171a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (var b = 0; b < blocks.length; b++) {
      var k = blocks[b];
      ctx.fillStyle = '#3a2f27';
      ctx.fillRect(k.x, k.y, k.w, k.h);
      ctx.fillStyle = '#5c4a3b';
      ctx.fillRect(k.x, k.y, k.w, 5);
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (var n = 0; n < dolls.length; n++) {
      var d = dolls[n];
      var back = 'hsl(' + d.hue + ', 45%, 38%)', front = 'hsl(' + d.hue + ', 60%, 56%)', skin = 'hsl(30, 45%, 78%)';
      limb(d, 1, 4, 9, back); limb(d, 4, 5, 8, back);
      limb(d, 3, 8, 11, back); limb(d, 8, 9, 10, back);
      limb(d, 1, 2, 18, front); limb(d, 2, 3, 17, front);
      limb(d, 3, 10, 11, front); limb(d, 10, 11, 10, front);
      limb(d, 1, 6, 9, front); limb(d, 6, 7, 8, front);
      limb(d, 0, 1, 7, skin);
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.arc(d.x[0], d.y[0], BODY[0][2], 0, Math.PI * 2);
      ctx.fill();
      // Face turned the way the neck leans; dizzy eyes spin after a hard knock.
      var ang = Math.atan2(d.y[0] - d.y[1], d.x[0] - d.x[1]) + Math.PI / 2;
      var cx = d.x[0], cy = d.y[0];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.strokeStyle = '#2a2018';
      ctx.fillStyle = '#2a2018';
      ctx.lineWidth = 1.6;
      if (d.dizzy > 0) {
        for (var e = -1; e <= 1; e += 2) {
          ctx.beginPath();
          for (var t = 0; t < 1.5 * Math.PI * 2; t += 0.4) {
            var rr = 0.6 + t * 0.35, aa = t + now * 0.01;
            ctx.lineTo(e * 4 + Math.cos(aa) * rr, -2 + Math.sin(aa) * rr);
          }
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(-4, -2, 1.6, 0, Math.PI * 2);
        ctx.arc(4, -2, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 2.5, 3, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (var id in pointers) {
      var p = pointers[id];
      if (!p.doll) continue;
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.doll.x[p.index], p.doll.y[p.index], 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    var best = null, bestIndex = 0, bestD = GRAB_RADIUS * GRAB_RADIUS;
    for (var n = 0; n < dolls.length; n++) {
      for (var i = 0; i < BODY.length; i++) {
        var dx = dolls[n].x[i] - e.clientX, dy = dolls[n].y[i] - e.clientY, dd = dx * dx + dy * dy;
        if (dd < bestD) { bestD = dd; best = dolls[n]; bestIndex = i; }
      }
    }
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, doll: best, index: bestIndex };
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
  document.getElementById('add').onclick = addDoll;
  toggle('tilt', function (on) {
    post({ type: 'tilt', on: on });
    if (!on) { gx = 0; gy = GRAVITY; }
  });
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
  <button id="add">Add</button>
  <div class="grow"></div>
  <button id="tilt">Tilt</button>
  <button id="reset">Reset</button>`,
  status: 'Grab a ragdoll and throw it.',
  script,
});

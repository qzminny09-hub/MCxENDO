import simPage from './shell';

// Planets around a sun with full N-body gravity. Pull back and let go to slingshot a new planet;
// a dotted line previews its path around the sun. Bodies that touch merge, keeping momentum.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var G = 1;
  var SUN_MASS = 5000;
  var SOFTEN = 36;
  var SUBSTEPS = 4;
  var LAUNCH_SCALE = 0.045;
  var TRAIL = 140;
  var SIZES = { small: 2, big: 14 };
  var COLORS = ['#7fb7d9', '#d98f6c', '#c9b27a', '#8fd1a8', '#c79bd6', '#e3d5c0', '#6fa0e0'];
  var STEP_MS = 1000 / 60;

  var W, H, DPR, stars;
  var bodies = [];
  var size = 'small';
  var trails = true;
  var aim = null;
  var colorIndex = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    stars = document.createElement('canvas');
    stars.width = canvas.width;
    stars.height = canvas.height;
    var s = stars.getContext('2d');
    s.scale(DPR, DPR);
    s.fillStyle = '#05070c';
    s.fillRect(0, 0, W, H);
    for (var i = 0; i < 220; i++) {
      s.fillStyle = 'rgba(255, 255, 255,' + (0.1 + Math.random() * 0.55).toFixed(2) + ')';
      var r = Math.random() < 0.08 ? 1.5 : 0.9;
      s.fillRect(Math.random() * W, Math.random() * H, r, r);
    }
  }

  function radius(m, isSun) { return isSun ? 22 + Math.cbrt(m - SUN_MASS + 1) : 2.5 + Math.cbrt(m) * 1.6; }

  function addBody(x, y, vx, vy, m, isSun) {
    bodies.push({ x: x, y: y, vx: vx, vy: vy, m: m, sun: !!isSun, r: radius(m, isSun),
      color: isSun ? '#ffd27a' : COLORS[colorIndex++ % COLORS.length], trail: [] });
  }

  function reset() {
    bodies = [];
    colorIndex = 0;
    var cx = W / 2, cy = H / 2;
    addBody(cx, cy, 0, 0, SUN_MASS, true);
    [[70, 2], [115, 6], [165, 14], [210, 3]].forEach(function (o, i) {
      var a = i * 2.1, v = Math.sqrt((G * SUN_MASS) / o[0]);
      addBody(cx + Math.cos(a) * o[0], cy + Math.sin(a) * o[0], -Math.sin(a) * v, Math.cos(a) * v, o[1]);
    });
    updateStatus();
  }

  function updateStatus() {
    var n = bodies.filter(function (b) { return !b.sun; }).length;
    statusEl.textContent = n + (n === 1 ? ' planet' : ' planets') + ' in orbit';
  }

  function accelerate(list, dt) {
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      for (var j = i + 1; j < list.length; j++) {
        var b = list[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d2 = dx * dx + dy * dy + SOFTEN;
        var f = (G * dt) / (d2 * Math.sqrt(d2));
        // The sun stays anchored so the system never drifts off screen.
        if (!a.sun) { a.vx += dx * f * b.m; a.vy += dy * f * b.m; }
        if (!b.sun) { b.vx -= dx * f * a.m; b.vy -= dy * f * a.m; }
      }
    }
  }

  function step() {
    var dt = 1 / SUBSTEPS;
    for (var s = 0; s < SUBSTEPS; s++) {
      accelerate(bodies, dt);
      for (var i = 0; i < bodies.length; i++) { bodies[i].x += bodies[i].vx * dt; bodies[i].y += bodies[i].vy * dt; }
      merge();
    }
    for (i = bodies.length - 1; i >= 0; i--) {
      var b = bodies[i];
      if (!b.sun && (Math.abs(b.x - W / 2) > W * 3 || Math.abs(b.y - H / 2) > H * 3)) { bodies.splice(i, 1); updateStatus(); continue; }
      if (trails) { b.trail.push(b.x, b.y); if (b.trail.length > TRAIL * 2) b.trail.splice(0, 2); }
    }
  }

  function merge() {
    for (var i = 0; i < bodies.length; i++) {
      for (var j = i + 1; j < bodies.length; j++) {
        var a = bodies[i], b = bodies[j];
        var dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (dx * dx + dy * dy > rr * rr) continue;
        var big = a.m >= b.m ? a : b, small = big === a ? b : a, m = a.m + b.m;
        if (!big.sun) {
          big.vx = (a.vx * a.m + b.vx * b.m) / m;
          big.vy = (a.vy * a.m + b.vy * b.m) / m;
        }
        if (!big.sun) { big.x = (a.x * a.m + b.x * b.m) / m; big.y = (a.y * a.m + b.y * b.m) / m; }
        big.m = m;
        big.r = radius(m, big.sun);
        bodies.splice(bodies.indexOf(small), 1);
        buzz();
        updateStatus();
        return;
      }
    }
  }

  // Path a launched planet would follow, pulled by the bodies as they are right now.
  function predict(x, y, vx, vy) {
    var pts = [], dt = 1 / SUBSTEPS;
    for (var n = 0; n < 900; n++) {
      for (var i = 0; i < bodies.length; i++) {
        var b = bodies[i], dx = b.x - x, dy = b.y - y, d2 = dx * dx + dy * dy + SOFTEN;
        if (d2 < b.r * b.r) return pts;
        var f = (G * b.m * dt) / (d2 * Math.sqrt(d2));
        vx += dx * f; vy += dy * f;
      }
      x += vx * dt; y += vy * dt;
      if (n % 6 === 0) pts.push(x, y);
    }
    return pts;
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(stars, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    if (trails) {
      ctx.lineWidth = 1.2;
      for (var i = 0; i < bodies.length; i++) {
        var t = bodies[i].trail;
        if (bodies[i].sun || t.length < 4) continue;
        ctx.strokeStyle = bodies[i].color;
        for (var k = 2; k < t.length; k += 2) {
          ctx.globalAlpha = (k / t.length) * 0.6;
          ctx.beginPath();
          ctx.moveTo(t[k - 2], t[k - 1]);
          ctx.lineTo(t[k], t[k + 1]);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    for (i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (b.sun) {
        var g = ctx.createRadialGradient(b.x, b.y, b.r * 0.2, b.x, b.y, b.r * 4);
        g.addColorStop(0, 'rgba(255, 220, 140, 0.9)');
        g.addColorStop(0.25, 'rgba(255, 170, 70, 0.35)');
        g.addColorStop(1, 'rgba(255, 140, 40, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff1c9';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // Planets lit from the sun's side.
      var sun = bodies.find(function (o) { return o.sun; });
      var lx = sun ? (sun.x - b.x) : 0, ly = sun ? (sun.y - b.y) : -1, ll = Math.hypot(lx, ly) || 1;
      var pg = ctx.createRadialGradient(b.x + (lx / ll) * b.r * 0.5, b.y + (ly / ll) * b.r * 0.5, b.r * 0.1, b.x, b.y, b.r * 1.1);
      pg.addColorStop(0, b.color);
      pg.addColorStop(1, '#0b0f18');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }

    if (aim) {
      var vx = (aim.sx - aim.x) * LAUNCH_SCALE, vy = (aim.sy - aim.y) * LAUNCH_SCALE;
      var path = predict(aim.sx, aim.sy, vx, vy);
      ctx.fillStyle = 'rgba(228, 236, 232, 0.55)';
      for (var p = 0; p < path.length; p += 2) ctx.fillRect(path[p] - 1, path[p + 1] - 1, 2, 2);
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(aim.sx, aim.sy);
      ctx.lineTo(aim.x, aim.y);
      ctx.stroke();
      ctx.fillStyle = COLORS[colorIndex % COLORS.length];
      ctx.beginPath();
      ctx.arc(aim.sx, aim.sy, radius(SIZES[size]), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    aim = { id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!aim || aim.id !== e.pointerId) return;
    e.preventDefault();
    aim.x = e.clientX; aim.y = e.clientY;
  });
  canvas.addEventListener('pointerup', function (e) {
    if (!aim || aim.id !== e.pointerId) return;
    addBody(aim.sx, aim.sy, (aim.sx - aim.x) * LAUNCH_SCALE, (aim.sy - aim.y) * LAUNCH_SCALE, SIZES[size]);
    aim = null;
    updateStatus();
  });
  canvas.addEventListener('pointercancel', function () { aim = null; });

  segment(['zSmall', 'zBig'], function (id) { size = id === 'zSmall' ? 'small' : 'big'; });
  toggle('trails', function (on) {
    trails = on;
    if (!on) bodies.forEach(function (b) { b.trail = []; });
  });
  document.getElementById('trails').className = 'toggle on';
  document.getElementById('trails').setAttribute('aria-pressed', 'true');
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
  <div class="seg" role="group" aria-label="Planet size">
    <button id="zSmall" class="on">Small</button>
    <button id="zBig">Big</button>
  </div>
  <div class="grow"></div>
  <button id="trails">Trails</button>
  <button id="reset">Reset</button>`,
  status: 'Pull back and let go to launch a planet.',
  script,
});

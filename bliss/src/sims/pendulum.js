import simPage from './shell';

// Double pendulums, the textbook example of chaos. Several start a thousandth of a radian apart,
// move as one for a few seconds, then split onto completely different paths. Integrated with
// fourth-order Runge-Kutta so they keep their energy instead of slowly winding down or blowing up.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var G = 9.81;
  var DT = 0.008;
  var SUBSTEPS = 4;
  var TRAIL = 260;
  var GRAB_RADIUS = 40;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, PX, PY, L;
  var count = 3, trails = true;
  var bobs = [];
  var drag = null;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    PX = W / 2;
    PY = TOP + (H - TOP) * 0.42;
    L = Math.min(W, H - TOP) * 0.21;
  }

  function reset() {
    bobs = [];
    for (var i = 0; i < count; i++) {
      bobs.push({ a1: 2.3 + i * 0.001, a2: 2.7, w1: 0, w2: 0, hue: (200 + i * (300 / Math.max(1, count))) % 360, trail: [] });
    }
    statusEl.textContent = 'Drag a weight and let go. Tiny differences grow into chaos.';
  }

  // Angular accelerations for equal masses and rods.
  function accel(a1, a2, w1, w2) {
    var d = a1 - a2, den = 3 - Math.cos(2 * d);
    var x1 = (-3 * G * Math.sin(a1) - G * Math.sin(a1 - 2 * a2) - 2 * Math.sin(d) * (w2 * w2 + w1 * w1 * Math.cos(d))) / den;
    var x2 = (2 * Math.sin(d) * (2 * w1 * w1 + 2 * G * Math.cos(a1) + w2 * w2 * Math.cos(d))) / den;
    return [x1, x2];
  }

  function rk4(b, h) {
    var k1 = accel(b.a1, b.a2, b.w1, b.w2);
    var k2 = accel(b.a1 + b.w1 * h / 2, b.a2 + b.w2 * h / 2, b.w1 + k1[0] * h / 2, b.w2 + k1[1] * h / 2);
    var k3 = accel(b.a1 + (b.w1 + k1[0] * h / 2) * h / 2, b.a2 + (b.w2 + k1[1] * h / 2) * h / 2, b.w1 + k2[0] * h / 2, b.w2 + k2[1] * h / 2);
    var k4 = accel(b.a1 + (b.w1 + k2[0] * h / 2) * h, b.a2 + (b.w2 + k2[1] * h / 2) * h, b.w1 + k3[0] * h, b.w2 + k3[1] * h);
    var da1 = (b.w1 + 2 * (b.w1 + k1[0] * h / 2) + 2 * (b.w1 + k2[0] * h / 2) + (b.w1 + k3[0] * h)) / 6;
    var da2 = (b.w2 + 2 * (b.w2 + k1[1] * h / 2) + 2 * (b.w2 + k2[1] * h / 2) + (b.w2 + k3[1] * h)) / 6;
    b.w1 += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    b.w2 += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    b.a1 += h * da1;
    b.a2 += h * da2;
  }

  function positions(b) {
    var x1 = PX + Math.sin(b.a1) * L, y1 = PY + Math.cos(b.a1) * L;
    return [x1, y1, x1 + Math.sin(b.a2) * L, y1 + Math.cos(b.a2) * L];
  }

  function step() {
    for (var i = 0; i < bobs.length; i++) {
      var b = bobs[i];
      if (!drag) for (var s = 0; s < SUBSTEPS; s++) rk4(b, DT);
      if (trails) {
        var p = positions(b);
        b.trail.push(p[2], p[3]);
        if (b.trail.length > TRAIL * 2) b.trail.splice(0, 2);
      }
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    if (trails) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.6;
      for (var i = 0; i < bobs.length; i++) {
        var t = bobs[i].trail;
        for (var k = 2; k < t.length; k += 2) {
          ctx.strokeStyle = 'hsla(' + bobs[i].hue + ', 90%, 62%,' + ((k / t.length) * 0.7).toFixed(3) + ')';
          ctx.beginPath();
          ctx.moveTo(t[k - 2], t[k - 1]);
          ctx.lineTo(t[k], t[k + 1]);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (i = 0; i < bobs.length; i++) {
      var p = positions(bobs[i]);
      ctx.strokeStyle = 'rgba(220, 226, 236, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(PX, PY); ctx.lineTo(p[0], p[1]); ctx.lineTo(p[2], p[3]);
      ctx.stroke();
      ctx.fillStyle = 'hsl(' + bobs[i].hue + ', 75%, 62%)';
      ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(p[2], p[3], 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#d0d4dc';
    ctx.beginPath(); ctx.arc(PX, PY, 5, 0, Math.PI * 2); ctx.fill();
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (!bobs.length) return;
    var p = positions(bobs[0]);
    var d1 = Math.hypot(p[0] - e.clientX, p[1] - e.clientY), d2 = Math.hypot(p[2] - e.clientX, p[3] - e.clientY);
    if (Math.min(d1, d2) > GRAB_RADIUS) return;
    drag = { id: e.pointerId, which: d2 <= d1 ? 2 : 1 };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    // Every pendulum follows the drag, keeping its tiny offset so they split apart again on release.
    for (var i = 0; i < bobs.length; i++) {
      var b = bobs[i], off = i * 0.001;
      if (drag.which === 1) b.a1 = Math.atan2(e.clientX - PX, e.clientY - PY) + off;
      else {
        var x1 = PX + Math.sin(b.a1) * L, y1 = PY + Math.cos(b.a1) * L;
        b.a2 = Math.atan2(e.clientX - x1, e.clientY - y1) + off;
      }
      b.w1 = 0; b.w2 = 0;
      b.trail = [];
    }
  });
  function release(e) { if (drag && drag.id === e.pointerId) drag = null; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['n1', 'n3', 'n10'], function (id) { count = id === 'n1' ? 1 : id === 'n3' ? 3 : 10; reset(); });
  toggle('trails', function (on) { trails = on; bobs.forEach(function (b) { b.trail = []; }); });
  document.getElementById('trails').className = 'toggle on';
  document.getElementById('trails').setAttribute('aria-pressed', 'true');
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
  <div class="seg" role="group" aria-label="How many">
    <button id="n1">1</button>
    <button id="n3" class="on">3</button>
    <button id="n10">10</button>
  </div>
  <div class="grow"></div>
  <button id="trails">Trails</button>
  <button id="reset">Reset</button>`,
  status: 'Drag a weight and let go. Tiny differences grow into chaos.',
  script,
});

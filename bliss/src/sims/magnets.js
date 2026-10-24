import simPage from './shell';

// Iron filings on paper around bar magnets. Each magnet is a north and a south pole; the field at a
// point is the sum of each pole's pull (falling off with the square of distance), and every filing
// swings round to lie along it. Field lines can be traced from the north poles.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRID = 9;
  var MAG_LEN = 74;
  var MAG_W = 22;
  var MAX_MAGNETS = 4;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, paper;
  var magnets = [];
  var fx = [], fy = [], fa = [], fs = [];
  var lines = false;
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
    // Filings scattered over a jittered grid so they read as dust, not a pattern.
    fx = []; fy = []; fa = []; fs = [];
    for (var y = TOP + GRID / 2; y < H; y += GRID) {
      for (var x = GRID / 2; x < W; x += GRID) {
        fx.push(x + (Math.random() - 0.5) * GRID * 0.8);
        fy.push(y + (Math.random() - 0.5) * GRID * 0.8);
        fa.push(Math.random() * Math.PI);
        fs.push(0);
      }
    }
    paper = ctx.createLinearGradient(0, 0, W, H);
    paper.addColorStop(0, '#ece6d8');
    paper.addColorStop(1, '#d9d1bf');
  }

  function reset() {
    magnets = [
      { x: W * 0.32, y: TOP + (H - TOP) * 0.42, a: 0 },
      { x: W * 0.7, y: TOP + (H - TOP) * 0.62, a: Math.PI / 2 },
    ];
    statusEl.textContent = 'Drag a magnet to move it. Tap it to turn it.';
  }

  function poles() {
    var out = [];
    for (var i = 0; i < magnets.length; i++) {
      var m = magnets[i], c = Math.cos(m.a), s = Math.sin(m.a), h = MAG_LEN * 0.38;
      out.push(m.x + c * h, m.y + s * h, 1, m.x - c * h, m.y - s * h, -1);
    }
    return out;
  }

  function field(px, py, ps) {
    var bx = 0, by = 0;
    for (var i = 0; i < ps.length; i += 3) {
      var dx = px - ps[i], dy = py - ps[i + 1], d2 = dx * dx + dy * dy + 40;
      var f = (ps[i + 2] * 4000) / (d2 * Math.sqrt(d2));
      bx += dx * f; by += dy * f;
    }
    return [bx, by];
  }

  function insideMagnet(m, x, y) {
    var c = Math.cos(-m.a), s = Math.sin(-m.a), dx = x - m.x, dy = y - m.y;
    var lx = dx * c - dy * s, ly = dx * s + dy * c;
    return Math.abs(lx) < MAG_LEN / 2 + 6 && Math.abs(ly) < MAG_W / 2 + 6;
  }

  function step() {
    var ps = poles();
    for (var i = 0; i < fx.length; i++) {
      var b = field(fx[i], fy[i], ps);
      var target = Math.atan2(b[1], b[0]);
      // A filing has no head or tail, so turn the short way to either end of the field direction.
      var d = target - fa[i];
      d = ((d + Math.PI / 2) % Math.PI + Math.PI) % Math.PI - Math.PI / 2;
      var strength = Math.min(1, Math.sqrt(b[0] * b[0] + b[1] * b[1]) * 0.6);
      fa[i] += d * (0.05 + strength * 0.25);
      fs[i] += (strength - fs[i]) * 0.1;
    }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);
    // Filings: faint where the field is weak, longer and darker where it is strong.
    ctx.lineCap = 'round';
    for (var band = 0; band < 3; band++) {
      ctx.strokeStyle = ['rgba(60, 55, 50, 0.25)', 'rgba(45, 40, 36, 0.55)', 'rgba(30, 27, 25, 0.85)'][band];
      ctx.lineWidth = 1.1 + band * 0.25;
      ctx.beginPath();
      for (var i = 0; i < fx.length; i++) {
        var s = fs[i], b = s < 0.2 ? 0 : s < 0.55 ? 1 : 2;
        if (b !== band) continue;
        var len = 2 + s * 4.5, c = Math.cos(fa[i]) * len, sn = Math.sin(fa[i]) * len;
        ctx.moveTo(fx[i] - c, fy[i] - sn);
        ctx.lineTo(fx[i] + c, fy[i] + sn);
      }
      ctx.stroke();
    }

    if (lines) {
      var ps = poles();
      ctx.strokeStyle = 'rgba(180, 60, 50, 0.45)';
      ctx.lineWidth = 1.2;
      for (var p = 0; p < ps.length; p += 3) {
        if (ps[p + 2] < 0) continue;
        for (var k = 0; k < 14; k++) {
          var ang = (k / 14) * Math.PI * 2, x = ps[p] + Math.cos(ang) * 8, y = ps[p + 1] + Math.sin(ang) * 8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          for (var n = 0; n < 300; n++) {
            var f = field(x, y, ps), fl = Math.sqrt(f[0] * f[0] + f[1] * f[1]) || 1;
            x += (f[0] / fl) * 4; y += (f[1] / fl) * 4;
            ctx.lineTo(x, y);
            if (x < -50 || x > W + 50 || y < TOP - 50 || y > H + 50) break;
            var hitSouth = false;
            for (var q = 0; q < ps.length; q += 3) if (ps[q + 2] < 0 && Math.abs(x - ps[q]) < 6 && Math.abs(y - ps[q + 1]) < 6) hitSouth = true;
            if (hitSouth) break;
          }
          ctx.stroke();
        }
      }
    }

    for (var m = 0; m < magnets.length; m++) {
      var mg = magnets[m];
      ctx.save();
      ctx.translate(mg.x, mg.y);
      ctx.rotate(mg.a);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = '#c8433a';
      ctx.fillRect(0, -MAG_W / 2, MAG_LEN / 2, MAG_W);
      ctx.fillStyle = '#3d6fb6';
      ctx.fillRect(-MAG_LEN / 2, -MAG_W / 2, MAG_LEN / 2, MAG_W);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(-MAG_LEN / 2, -MAG_W / 2, MAG_LEN, 4);
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 13px system-ui, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', MAG_LEN / 4, 1);
      ctx.fillText('S', -MAG_LEN / 4, 1);
      ctx.restore();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    for (var i = magnets.length - 1; i >= 0; i--) {
      if (!insideMagnet(magnets[i], e.clientX, e.clientY)) continue;
      drag = { id: e.pointerId, m: magnets[i], ox: magnets[i].x - e.clientX, oy: magnets[i].y - e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
      return;
    }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault();
    drag.m.x = Math.max(20, Math.min(W - 20, e.clientX + drag.ox));
    drag.m.y = Math.max(TOP + 20, Math.min(H - 20, e.clientY + drag.oy));
  });
  function release(e) {
    if (!drag || drag.id !== e.pointerId) return;
    // A quick tap without moving turns the magnet an eighth of a turn.
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 6 && performance.now() - drag.t < 350) { drag.m.a += Math.PI / 4; buzz(); }
    drag = null;
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  document.getElementById('add').onclick = function () {
    if (magnets.length >= MAX_MAGNETS) magnets.shift();
    magnets.push({ x: W * (0.2 + Math.random() * 0.6), y: TOP + (H - TOP) * (0.2 + Math.random() * 0.6), a: Math.random() * Math.PI * 2 });
  };
  toggle('lines', function (on) { lines = on; });
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
  <button id="add">Add</button>
  <div class="grow"></div>
  <button id="lines">Lines</button>
  <button id="reset">Reset</button>`,
  status: 'Drag a magnet to move it. Tap it to turn it.',
  script,
});

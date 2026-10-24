import simPage from './shell';

// Electricity. Globe: a plasma ball whose filaments wander from the electrode to the glass and
// gather towards a finger. Storm: tap the sky to call a forked bolt down to that spot.
// Bolts are built by midpoint displacement: split each segment, nudge the middle sideways, repeat,
// and sometimes sprout a branch.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var FILAMENTS = 7;

  var W, H, DPR, TOP, sky, globe;
  var scene = 'globe';
  var auto = false, nextAuto = 0;
  var pointers = {};
  var strikes = [];
  var flash = 0;
  var filaments = [];

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    globe = { x: W / 2, y: TOP + (H - TOP) * 0.45, r: Math.min(W * 0.42, (H - TOP) * 0.3) };
    filaments = [];
    for (var i = 0; i < FILAMENTS; i++) filaments.push({ a: Math.random() * Math.PI * 2, drift: (Math.random() - 0.5) * 0.02 });
    drawSky();
  }

  // Storm clouds over a dark town line, drawn once.
  function drawSky() {
    sky = document.createElement('canvas');
    sky.width = canvas.width;
    sky.height = canvas.height;
    var s = sky.getContext('2d');
    s.scale(DPR, DPR);
    var g = s.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0f1a');
    g.addColorStop(1, '#1b2030');
    s.fillStyle = g;
    s.fillRect(0, 0, W, H);
    for (var i = 0; i < 26; i++) {
      var cx = Math.random() * W, cy = TOP + Math.random() * 90, r = 40 + Math.random() * 60;
      var cg = s.createRadialGradient(cx, cy, 0, cx, cy, r);
      cg.addColorStop(0, 'rgba(70, 76, 96, 0.55)');
      cg.addColorStop(1, 'rgba(70, 76, 96, 0)');
      s.fillStyle = cg;
      s.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    s.fillStyle = '#07080d';
    s.beginPath();
    s.moveTo(0, H);
    var x = 0;
    while (x < W) {
      var bw = 16 + Math.random() * 36, bh = 20 + Math.random() * 70;
      s.lineTo(x, H - bh); s.lineTo(x + bw, H - bh);
      x += bw;
    }
    s.lineTo(W, H);
    s.fill();
  }

  // Jagged path from (x1, y1) to (x2, y2); branches are collected in out.
  function bolt(x1, y1, x2, y2, rough, depth, out, branchChance) {
    var pts = [x1, y1, x2, y2];
    for (var d = 0; d < depth; d++) {
      var next = [];
      for (var i = 0; i < pts.length - 2; i += 2) {
        var ax = pts[i], ay = pts[i + 1], bx = pts[i + 2], by = pts[i + 3];
        var len = Math.hypot(bx - ax, by - ay);
        var off = (Math.random() - 0.5) * len * rough;
        var mx = (ax + bx) / 2 + (-(by - ay) / (len || 1)) * off, my = (ay + by) / 2 + ((bx - ax) / (len || 1)) * off;
        next.push(ax, ay, mx, my);
        if (out && d < depth - 2 && Math.random() < branchChance) {
          var ang = Math.atan2(by - ay, bx - ax) + (Math.random() - 0.5) * 1.6;
          var bl = len * (0.6 + Math.random() * 0.8);
          out.push(bolt(mx, my, mx + Math.cos(ang) * bl, my + Math.sin(ang) * bl, rough, depth - d - 1, null, 0));
        }
      }
      next.push(pts[pts.length - 2], pts[pts.length - 1]);
      pts = next;
    }
    return pts;
  }

  function strokePath(pts, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }

  // Wide faint glow, narrower brighter glow, then a white-hot core.
  function glowPath(pts, scale, hue, alpha) {
    strokePath(pts, 9 * scale, 'hsla(' + hue + ', 90%, 60%,' + (0.12 * alpha) + ')');
    strokePath(pts, 4 * scale, 'hsla(' + hue + ', 95%, 70%,' + (0.35 * alpha) + ')');
    strokePath(pts, 1.4 * scale, 'rgba(255, 255, 255,' + (0.95 * alpha) + ')');
  }

  function strike(x, y) {
    var branches = [];
    var main = bolt(x + (Math.random() - 0.5) * 120, TOP + 20, x, y, 0.45, 7, branches, 0.35);
    strikes.push({ main: main, branches: branches, life: 18 });
    flash = 1;
    buzz();
  }

  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (scene === 'storm') {
      ctx.drawImage(sky, 0, 0);
      if (flash > 0) {
        ctx.fillStyle = 'rgba(190, 200, 255,' + (flash * 0.35).toFixed(3) + ')';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flash *= 0.8;
        if (flash < 0.02) flash = 0;
      }
    } else {
      ctx.fillStyle = '#07060d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (scene === 'globe') {
      var gx = globe.x, gy = globe.y, R = globe.r;
      var inner = ctx.createRadialGradient(gx, gy, R * 0.05, gx, gy, R);
      inner.addColorStop(0, 'rgba(120, 60, 180, 0.35)');
      inner.addColorStop(1, 'rgba(40, 20, 80, 0.15)');
      ctx.fillStyle = inner;
      ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      var touches = [];
      for (var id in pointers) touches.push(pointers[id]);
      for (var f = 0; f < filaments.length; f++) {
        var fl = filaments[f];
        fl.a += fl.drift + (Math.random() - 0.5) * 0.05;
        var ex = gx + Math.cos(fl.a) * R, ey = gy + Math.sin(fl.a) * R;
        // A touch pulls filaments towards it: to the finger inside the glass, to the nearest
        // point of the glass outside it.
        if (touches.length) {
          var t = touches[f % touches.length];
          var dx = t.x - gx, dy = t.y - gy, dd = Math.hypot(dx, dy) || 1;
          if (dd < R) { ex = t.x + (Math.random() - 0.5) * 8; ey = t.y + (Math.random() - 0.5) * 8; }
          else { ex = gx + (dx / dd) * R + (Math.random() - 0.5) * 10; ey = gy + (dy / dd) * R + (Math.random() - 0.5) * 10; }
        }
        glowPath(bolt(gx, gy, ex, ey, 0.32, 6, null, 0), 0.8, 285, 0.8 + Math.random() * 0.2);
        if (touches.length && Math.hypot(touches[f % touches.length].x - gx, touches[f % touches.length].y - gy) > R) {
          var tt = touches[f % touches.length];
          glowPath(bolt(ex, ey, tt.x, tt.y, 0.35, 5, null, 0), 0.5, 260, 0.5);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      var core = ctx.createRadialGradient(gx - 4, gy - 4, 1, gx, gy, 16);
      core.addColorStop(0, '#ffffff');
      core.addColorStop(0.4, '#d9b3ff');
      core.addColorStop(1, '#5a2d8c');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(gx, gy, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(220, 220, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.beginPath(); ctx.ellipse(gx - R * 0.4, gy - R * 0.5, R * 0.25, R * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#23202b';
      ctx.beginPath();
      ctx.moveTo(gx - R * 0.45, gy + R + 40); ctx.lineTo(gx + R * 0.45, gy + R + 40);
      ctx.lineTo(gx + R * 0.28, gy + R - 6); ctx.lineTo(gx - R * 0.28, gy + R - 6);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'lighter';
      for (var s = strikes.length - 1; s >= 0; s--) {
        var st = strikes[s], alpha = st.life / 18;
        // Real strokes flicker: the channel re-lights a few times before fading.
        if (st.life % 5 === 0) alpha *= 0.35;
        glowPath(st.main, 1.3, 220, alpha);
        for (var b = 0; b < st.branches.length; b++) glowPath(st.branches[b], 0.6, 220, alpha * 0.8);
        if (--st.life <= 0) strikes.splice(s, 1);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (scene === 'storm') strike(e.clientX, Math.max(e.clientY, TOP + 120));
    else buzz();
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

  segment(['sGlobe', 'sStorm'], function (id) {
    scene = id === 'sGlobe' ? 'globe' : 'storm';
    strikes = [];
    statusEl.textContent = scene === 'globe' ? 'Touch the globe and the sparks follow your finger.' : 'Tap the sky to strike lightning.';
  });
  toggle('auto', function (on) { auto = on; nextAuto = 0; });

  window.addEventListener('resize', resize);
  resize();
  function frame(now) {
    if (auto && scene === 'storm' && now > nextAuto) {
      strike(W * (0.1 + Math.random() * 0.8), H - 40 - Math.random() * 60);
      nextAuto = now + 700 + Math.random() * 1800;
    }
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="seg" role="group" aria-label="Scene">
    <button id="sGlobe" class="on">Globe</button>
    <button id="sStorm">Storm</button>
  </div>
  <div class="grow"></div>
  <button id="auto">Auto</button>`,
  status: 'Touch the globe and the sparks follow your finger.',
  script,
});

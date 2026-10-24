import simPage from './shell';

// A shallow pond. The water surface is a height grid running the wave equation: each cell moves
// toward the average of its neighbours, overshoots, and slowly calms. The pebbles on the bottom are
// seen through the surface, shifted by its slope as light bends, with glints where the slope catches
// the light. Lily pads float on top and get pushed around by the waves.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var CELL = 3;
  var CALM = 0.985;
  var REFRACT = 1.6;
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, GW, GH;
  var cur, prev, bed, image, gridCanvas, gridCtx;
  var pads = [];
  var rain = false;
  var pointers = {};

  function resize() {
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
    cur = new Float32Array(GW * GH);
    prev = new Float32Array(GW * GH);
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = GW;
    gridCanvas.height = GH;
    gridCtx = gridCanvas.getContext('2d');
    image = gridCtx.createImageData(GW, GH);
    makeBed();
    pads = [];
    for (var i = 0; i < 5; i++) pads.push({ x: W * (0.15 + Math.random() * 0.7), y: TOP + (H - TOP) * (0.15 + Math.random() * 0.7), vx: 0, vy: 0, r: 16 + Math.random() * 14, a: Math.random() * Math.PI * 2 });
  }

  // Sandy bottom scattered with pebbles, drawn once at grid resolution and kept as pixels.
  function makeBed() {
    var c = document.createElement('canvas');
    c.width = GW; c.height = GH;
    var b = c.getContext('2d');
    var g = b.createLinearGradient(0, 0, 0, GH);
    g.addColorStop(0, '#8a7a5c');
    g.addColorStop(1, '#5e5440');
    b.fillStyle = g;
    b.fillRect(0, 0, GW, GH);
    for (var i = 0; i < (GW * GH) / 60; i++) {
      var shade = 60 + Math.random() * 110;
      b.fillStyle = 'rgb(' + (shade + 10 | 0) + ',' + (shade | 0) + ',' + (shade - 15 | 0) + ')';
      b.beginPath();
      b.ellipse(Math.random() * GW, Math.random() * GH, 1 + Math.random() * 3.5, 1 + Math.random() * 2.5, Math.random() * Math.PI, 0, Math.PI * 2);
      b.fill();
    }
    bed = b.getImageData(0, 0, GW, GH).data;
  }

  function disturb(gx, gy, radius, amount) {
    for (var y = Math.max(1, (gy - radius) | 0); y < Math.min(GH - 1, gy + radius); y++) {
      for (var x = Math.max(1, (gx - radius) | 0); x < Math.min(GW - 1, gx + radius); x++) {
        var d2 = (x - gx) * (x - gx) + (y - gy) * (y - gy);
        if (d2 < radius * radius) cur[y * GW + x] -= amount * (1 - d2 / (radius * radius));
      }
    }
  }

  function step() {
    if (rain && Math.random() < 0.25) disturb(Math.random() * GW, Math.random() * GH, 2, 40);
    for (var id in pointers) {
      var p = pointers[id];
      if (p.moved || p.fresh) disturb(p.x / CELL, (p.y - TOP) / CELL, 3, p.fresh ? 120 : 30);
      p.fresh = false; p.moved = false;
    }
    // Wave equation: next = average of neighbours * 2 - previous, then calm a little.
    for (var y = 1; y < GH - 1; y++) {
      for (var x = 1; x < GW - 1; x++) {
        var k = y * GW + x;
        prev[k] = ((cur[k - 1] + cur[k + 1] + cur[k - GW] + cur[k + GW]) * 0.5 - prev[k]) * CALM;
      }
    }
    var swap = cur; cur = prev; prev = swap;
    // Lily pads slide down the surface slope and drift to a stop.
    for (var i = 0; i < pads.length; i++) {
      var pd = pads[i], gx = Math.min(GW - 2, Math.max(1, (pd.x / CELL) | 0)), gy = Math.min(GH - 2, Math.max(1, ((pd.y - TOP) / CELL) | 0));
      var kk = gy * GW + gx;
      pd.vx -= (cur[kk + 1] - cur[kk - 1]) * 0.004;
      pd.vy -= (cur[kk + GW] - cur[kk - GW]) * 0.004;
      pd.vx *= 0.97; pd.vy *= 0.97;
      pd.x = Math.max(pd.r, Math.min(W - pd.r, pd.x + pd.vx));
      pd.y = Math.max(TOP + pd.r, Math.min(H - pd.r, pd.y + pd.vy));
      pd.a += pd.vx * 0.01;
    }
  }

  function draw() {
    var data = image.data;
    for (var y = 0; y < GH; y++) {
      for (var x = 0; x < GW; x++) {
        var k = y * GW + x, o = k * 4;
        var dx = x > 0 && x < GW - 1 ? cur[k + 1] - cur[k - 1] : 0;
        var dy = y > 0 && y < GH - 1 ? cur[k + GW] - cur[k - GW] : 0;
        // Look at the bed through the tilted surface.
        var sx = Math.min(GW - 1, Math.max(0, (x + dx * REFRACT) | 0)), sy = Math.min(GH - 1, Math.max(0, (y + dy * REFRACT) | 0));
        var b = (sy * GW + sx) * 4;
        var shade = 1 + (dx - dy) * 0.012;
        var glint = dx + dy < -6 ? Math.min(1, (-dx - dy - 6) * 0.04) : 0;
        data[o] = Math.min(255, (bed[b] * 0.55 + 20) * shade + 255 * glint);
        data[o + 1] = Math.min(255, (bed[b + 1] * 0.6 + 55) * shade + 255 * glint);
        data[o + 2] = Math.min(255, (bed[b + 2] * 0.55 + 60) * shade + 255 * glint);
        data[o + 3] = 255;
      }
    }
    gridCtx.putImageData(image, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#1d2a22';
    ctx.fillRect(0, 0, W, TOP);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(gridCanvas, 0, TOP, GW * CELL, GH * CELL);
    for (var i = 0; i < pads.length; i++) {
      var pd = pads[i];
      ctx.save();
      ctx.translate(pd.x, pd.y);
      ctx.rotate(pd.a);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.beginPath(); ctx.arc(4, 5, pd.r, 0.25, Math.PI * 2 - 0.25); ctx.lineTo(4, 5); ctx.fill();
      var lg = ctx.createRadialGradient(-pd.r * 0.3, -pd.r * 0.3, 2, 0, 0, pd.r);
      lg.addColorStop(0, '#7fbf5a');
      lg.addColorStop(1, '#3f7a35');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(0, 0, pd.r, 0.25, Math.PI * 2 - 0.25); ctx.lineTo(0, 0); ctx.fill();
      ctx.strokeStyle = 'rgba(30, 70, 25, 0.6)';
      ctx.lineWidth = 1;
      for (var v = 1; v < 6; v++) {
        var va = 0.25 + v * ((Math.PI * 2 - 0.5) / 6);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(va) * pd.r * 0.85, Math.sin(va) * pd.r * 0.85); ctx.stroke();
      }
      ctx.restore();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, fresh: true, moved: false };
    buzz();
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.x = e.clientX; p.y = e.clientY; p.moved = true;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  toggle('rain', function (on) {
    rain = on;
    statusEl.textContent = on ? 'Rain on the pond.' : 'Touch the water to make ripples.';
  });
  document.getElementById('reset').onclick = function () { cur.fill(0); prev.fill(0); };

  window.addEventListener('resize', resize);
  resize();
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
  <div class="grow"></div>
  <button id="rain">Rain</button>
  <button id="reset">Calm</button>`,
  status: 'Touch the water to make ripples.',
  script,
});

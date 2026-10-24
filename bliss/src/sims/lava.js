import simPage from './shell';

// A lava lamp. Wax blobs are warmed by the lamp at the base, rise as they heat, cool near the top
// and sink again. They are drawn as metaballs: each blob adds to a smooth field and everything above
// a threshold is wax, so blobs that touch flow together and pull apart like the real thing.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');

  var BLOBS = 10;
  var SCALE = 3;
  var STEP_MS = 1000 / 60;
  var PALETTES = {
    orange: { liquid: [120, 40, 60], wax: [255, 120, 40], hot: [255, 220, 120] },
    pink: { liquid: [40, 30, 90], wax: [255, 80, 170], hot: [255, 190, 230] },
    green: { liquid: [20, 50, 70], wax: [120, 230, 90], hot: [220, 255, 170] },
  };

  var W, H, DPR, TOP, lamp;
  var blobs = [];
  var colors = PALETTES.orange;
  var pointers = {};
  var fieldW, fieldH, image, fieldCanvas, fieldCtx;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    var h = (H - TOP) * 0.74, w = Math.min(W * 0.62, 260);
    lamp = { cx: W / 2, top: TOP + (H - TOP) * 0.08, h: h, bottomHalf: w / 2, topHalf: w * 0.26 };
    fieldW = Math.ceil(w / SCALE) + 2;
    fieldH = Math.ceil(h / SCALE) + 2;
    fieldCanvas = document.createElement('canvas');
    fieldCanvas.width = fieldW;
    fieldCanvas.height = fieldH;
    fieldCtx = fieldCanvas.getContext('2d');
    image = fieldCtx.createImageData(fieldW, fieldH);
  }

  // The glass widens from the cap down to the base.
  function halfWidth(y) {
    var t = Math.max(0, Math.min(1, (y - lamp.top) / lamp.h));
    return lamp.topHalf + (lamp.bottomHalf - lamp.topHalf) * Math.pow(t, 0.8);
  }

  function reset() {
    blobs = [];
    for (var i = 0; i < BLOBS; i++) {
      blobs.push({ x: lamp.cx + (Math.random() - 0.5) * lamp.bottomHalf, y: lamp.top + lamp.h * (0.3 + Math.random() * 0.65),
        vx: 0, vy: 0, r: 16 + Math.random() * 18, temp: Math.random() });
    }
  }

  function step() {
    var bottom = lamp.top + lamp.h;
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      // Heat from the lamp at the base, cooling everywhere and more so near the cap.
      if (b.y > bottom - 50) b.temp += 0.006;
      b.temp -= 0.0015 + (b.y < lamp.top + lamp.h * 0.25 ? 0.002 : 0);
      b.temp = Math.max(0, Math.min(1, b.temp));
      b.vy += (0.5 - b.temp) * 0.035;
      b.vx += (Math.random() - 0.5) * 0.02;
      for (var id in pointers) {
        var p = pointers[id], dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
        if (d < 80) { b.vx += p.vx * 0.04; b.vy += p.vy * 0.04; b.temp = Math.min(1, b.temp + 0.004); }
      }
      b.vx *= 0.96; b.vy *= 0.97;
      b.x += b.vx; b.y += b.vy;
      var hw = halfWidth(b.y) - b.r * 0.55;
      if (b.x < lamp.cx - hw) { b.x = lamp.cx - hw; b.vx = Math.abs(b.vx) * 0.3; }
      if (b.x > lamp.cx + hw) { b.x = lamp.cx + hw; b.vx = -Math.abs(b.vx) * 0.3; }
      if (b.y > bottom - b.r * 0.6) { b.y = bottom - b.r * 0.6; b.vy = 0; }
      if (b.y < lamp.top + b.r * 0.6) { b.y = lamp.top + b.r * 0.6; b.vy = 0; }
    }
    for (var id2 in pointers) { pointers[id2].vx *= 0.7; pointers[id2].vy *= 0.7; }
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = '#0c0a10';
    ctx.fillRect(0, 0, W, H);
    var glow = ctx.createRadialGradient(lamp.cx, lamp.top + lamp.h, 10, lamp.cx, lamp.top + lamp.h * 0.6, W * 0.8);
    glow.addColorStop(0, 'rgba(' + colors.wax.join(',') + ', 0.22)');
    glow.addColorStop(1, 'rgba(' + colors.wax.join(',') + ', 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Metaball field over the lamp's bounding box.
    var x0 = lamp.cx - lamp.bottomHalf - SCALE, y0 = lamp.top - SCALE, data = image.data, liquid = colors.liquid, wax = colors.wax, hot = colors.hot;
    for (var fy = 0; fy < fieldH; fy++) {
      var py = y0 + fy * SCALE, hw = halfWidth(py), depth = (py - lamp.top) / lamp.h;
      for (var fx = 0; fx < fieldW; fx++) {
        var px = x0 + fx * SCALE, o = (fy * fieldW + fx) * 4;
        if (Math.abs(px - lamp.cx) > hw || py < lamp.top || py > lamp.top + lamp.h) { data[o + 3] = 0; continue; }
        var f = 0, heat = 0;
        for (var i = 0; i < blobs.length; i++) {
          var b = blobs[i], dx = px - b.x, dy = py - b.y, v = (b.r * b.r) / (dx * dx + dy * dy + 1);
          f += v; heat += v * b.temp;
        }
        var light = 0.55 + 0.45 * depth;
        // Liquid glows a little near the wax; the wax edge blends over a short band so it stays smooth.
        var near = Math.max(0, Math.min(1, (f - 0.55) / 0.45));
        var lr = liquid[0] * light + wax[0] * 0.25 * near, lg = liquid[1] * light + wax[1] * 0.25 * near, lb = liquid[2] * light + wax[2] * 0.25 * near;
        var edge = f < 0.85 ? 0 : f > 1.15 ? 1 : (f - 0.85) / 0.3;
        edge = edge * edge * (3 - 2 * edge);
        var tt = Math.min(1, heat / f), core = Math.max(0, Math.min(1, (f - 1) * 0.6));
        var wr = (wax[0] + (hot[0] - wax[0]) * tt * core) * light;
        var wg = (wax[1] + (hot[1] - wax[1]) * tt * core) * light;
        var wb = (wax[2] + (hot[2] - wax[2]) * tt * core) * light;
        data[o] = lr + (wr - lr) * edge;
        data[o + 1] = lg + (wg - lg) * edge;
        data[o + 2] = lb + (wb - lb) * edge;
        data[o + 3] = 255;
      }
    }
    fieldCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fieldCanvas, x0, y0, fieldW * SCALE, fieldH * SCALE);

    // Glass outline (hiding the stepped edge of the coarse field), highlight, cap and base.
    ctx.strokeStyle = '#0c0a10';
    ctx.lineWidth = 5;
    for (var sideSign = -1; sideSign <= 1; sideSign += 2) {
      ctx.beginPath();
      for (var e2 = 0; e2 <= 1.0001; e2 += 0.02) ctx.lineTo(lamp.cx + sideSign * (halfWidth(lamp.top + e2 * lamp.h) + 2), lamp.top + e2 * lamp.h);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (var s = 0; s <= 1; s += 0.05) ctx.lineTo(lamp.cx - halfWidth(lamp.top + s * lamp.h) + 8, lamp.top + s * lamp.h);
    ctx.stroke();
    var metal = ctx.createLinearGradient(lamp.cx - lamp.bottomHalf, 0, lamp.cx + lamp.bottomHalf, 0);
    metal.addColorStop(0, '#5a5f68'); metal.addColorStop(0.4, '#c9ced6'); metal.addColorStop(1, '#4a4e56');
    ctx.fillStyle = metal;
    ctx.beginPath();
    ctx.moveTo(lamp.cx - lamp.topHalf - 4, lamp.top + 2);
    ctx.lineTo(lamp.cx - lamp.topHalf * 0.6, lamp.top - 34);
    ctx.lineTo(lamp.cx + lamp.topHalf * 0.6, lamp.top - 34);
    ctx.lineTo(lamp.cx + lamp.topHalf + 4, lamp.top + 2);
    ctx.fill();
    var by = lamp.top + lamp.h;
    ctx.beginPath();
    ctx.moveTo(lamp.cx - lamp.bottomHalf - 4, by - 2);
    ctx.lineTo(lamp.cx + lamp.bottomHalf + 4, by - 2);
    ctx.lineTo(lamp.cx + lamp.bottomHalf * 0.75, by + 70);
    ctx.lineTo(lamp.cx - lamp.bottomHalf * 0.75, by + 70);
    ctx.fill();
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY, vx: 0, vy: 0 };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    p.vx = e.clientX - p.x; p.vy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['cOrange', 'cPink', 'cGreen'], function (id) {
    colors = PALETTES[id === 'cOrange' ? 'orange' : id === 'cPink' ? 'pink' : 'green'];
  });

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
  <div class="seg" role="group" aria-label="Colour">
    <button id="cOrange" class="on">Orange</button>
    <button id="cPink">Pink</button>
    <button id="cGreen">Green</button>
  </div>`,
  status: 'Watch the wax rise and fall. Drag to stir it.',
  script,
});

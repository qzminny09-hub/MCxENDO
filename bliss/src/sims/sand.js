import simPage from './shell';

// Falling sand on a grid of 3px cells. Grains fall, slide off diagonally, and now and then skid two
// cells sideways, so piles settle near sand's real 30-35 degree slope with a rough surface.
// Walls you draw stay put; Erase clears both.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var CELL = 3;
  var EMPTY = 0, SAND = 1, WALL = 2;
  var BRUSH = 7;
  var STEPS_PER_FRAME = 2;
  var SKID_CHANCE = 0.4;
  var STEP_MS = 1000 / 60;
  var SAND_TONES = [[222, 190, 132], [210, 174, 116], [232, 204, 150], [196, 160, 104], [226, 182, 120]];
  var WALL_TONES = [[74, 88, 84], [66, 80, 76], [82, 96, 92]];
  var BG = [16, 23, 21];

  var W, H, DPR, TOP, GW, GH;
  var grid, tone, moved, grains;
  var tool = 'sand';
  var pointers = {};
  var flip = false;
  var gridCanvas, gridCtx, image;

  function build() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 8;
    GW = Math.floor(W / CELL);
    GH = Math.floor((H - TOP) / CELL);
    grid = new Uint8Array(GW * GH);
    tone = new Uint8Array(GW * GH);
    moved = new Uint8Array(GW * GH);
    gridCanvas = document.createElement('canvas');
    gridCanvas.width = GW;
    gridCanvas.height = GH;
    gridCtx = gridCanvas.getContext('2d');
    image = gridCtx.createImageData(GW, GH);
    clear();
  }

  function clear() {
    grid.fill(EMPTY);
    grains = 0;
    // A starter pile and a ledge so the first screen shows what sand does.
    var ledgeY = Math.floor(GH * 0.55);
    for (var x = Math.floor(GW * 0.12); x < Math.floor(GW * 0.5); x++) {
      for (var y = ledgeY; y < ledgeY + 3; y++) set(x, y, WALL);
    }
    var cx = Math.floor(GW * 0.68);
    for (var row = 0; row < Math.floor(GH * 0.18); row++) {
      var half = Math.floor(GH * 0.18) - row;
      for (x = cx - half; x <= cx + half; x++) {
        if (x >= 0 && x < GW) set(x, GH - 1 - row, SAND);
      }
    }
    updateStatus();
  }

  function set(x, y, kind) {
    var i = y * GW + x;
    if (grid[i] === SAND) grains--;
    grid[i] = kind;
    if (kind === SAND) grains++;
    tone[i] = (Math.random() * (kind === WALL ? WALL_TONES.length : SAND_TONES.length)) | 0;
  }

  function updateStatus() {
    statusEl.textContent = grains ? grains.toLocaleString() + ' grains' : 'Draw to pour sand.';
  }

  function step() {
    moved.fill(0);
    flip = !flip;
    for (var y = GH - 2; y >= 0; y--) {
      for (var n = 0; n < GW; n++) {
        var x = flip ? n : GW - 1 - n;
        var i = y * GW + x;
        if (grid[i] !== SAND || moved[i]) continue;
        var below = i + GW;
        var target = -1;
        if (grid[below] === EMPTY) target = below;
        else {
          var first = Math.random() < 0.5 ? -1 : 1;
          for (var k = 0; k < 2 && target < 0; k++) {
            var dx = k === 0 ? first : -first;
            var nx = x + dx;
            if (nx < 0 || nx >= GW) continue;
            if (grid[below + dx] === EMPTY && grid[i + dx] === EMPTY) target = below + dx;
          }
          if (target < 0 && Math.random() < SKID_CHANCE) {
            var sx = x + first * 2;
            if (sx >= 0 && sx < GW && grid[i + first] === EMPTY && grid[i + first * 2] === EMPTY && grid[below + first * 2] === EMPTY) {
              target = below + first * 2;
            }
          }
        }
        if (target < 0) continue;
        grid[target] = SAND;
        tone[target] = tone[i];
        grid[i] = EMPTY;
        moved[target] = 1;
      }
    }
  }

  function stamp(px, py) {
    var gx = Math.floor(px / CELL), gy = Math.floor((py - TOP) / CELL);
    var r2 = BRUSH * BRUSH;
    for (var oy = -BRUSH; oy <= BRUSH; oy++) {
      for (var ox = -BRUSH; ox <= BRUSH; ox++) {
        if (ox * ox + oy * oy > r2) continue;
        var x = gx + ox, y = gy + oy;
        if (x < 0 || x >= GW || y < 0 || y >= GH) continue;
        var i = y * GW + x;
        if (tool === 'sand') {
          if (grid[i] === EMPTY && Math.random() < 0.12) set(x, y, SAND);
        } else if (tool === 'wall') {
          if (grid[i] !== WALL) set(x, y, WALL);
        } else if (grid[i] !== EMPTY) {
          set(x, y, EMPTY);
        }
      }
    }
  }

  function draw() {
    var data = image.data;
    for (var i = 0, o = 0; i < grid.length; i++, o += 4) {
      var c = grid[i] === SAND ? SAND_TONES[tone[i]] : grid[i] === WALL ? WALL_TONES[tone[i]] : BG;
      // Grains open to the sky catch the light; buried ones sit a little in shadow.
      var lit = grid[i] === SAND ? (i < GW || grid[i - GW] === EMPTY ? 1.12 : 0.94) : 1;
      data[o] = Math.min(255, c[0] * lit); data[o + 1] = Math.min(255, c[1] * lit); data[o + 2] = Math.min(255, c[2] * lit);
      data[o + 3] = 255;
    }
    gridCtx.putImageData(image, 0, 0);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = 'rgb(' + BG.join(',') + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(gridCanvas, 0, TOP, GW * CELL, GH * CELL);
    for (var id in pointers) {
      var p = pointers[id];
      ctx.strokeStyle = 'rgba(228, 236, 232, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, BRUSH * CELL, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = pointers[e.pointerId];
    if (!p) return;
    e.preventDefault();
    if (tool !== 'sand') {
      // Fill the gap between move events so walls and erasing draw unbroken lines.
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      var n = Math.ceil(Math.sqrt(dx * dx + dy * dy) / (BRUSH * CELL * 0.5));
      for (var s = 1; s < n; s++) stamp(p.x + dx * s / n, p.y + dy * s / n);
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  function release(e) { delete pointers[e.pointerId]; }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  segment(['tSand', 'tWall', 'tErase'], function (id) {
    tool = id === 'tSand' ? 'sand' : id === 'tWall' ? 'wall' : 'erase';
  });
  document.getElementById('reset').onclick = clear;

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  build();
  var last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100);
    last = now;
    var steps = 0;
    while (acc >= STEP_MS && steps < 2) {
      for (var id in pointers) stamp(pointers[id].x, pointers[id].y);
      for (var s = 0; s < STEPS_PER_FRAME; s++) step();
      acc -= STEP_MS;
      steps++;
    }
    if (steps === 2) acc = 0;
    updateStatus();
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="seg" role="group" aria-label="Tool">
    <button id="tSand" class="on">Sand</button>
    <button id="tWall">Wall</button>
    <button id="tErase">Erase</button>
  </div>
  <div class="grow"></div>
  <button id="reset">Reset</button>`,
  status: 'Draw to pour sand.',
  script,
});

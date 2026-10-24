import simPage from './shell';

// Plinko: marbles fall through staggered pins into scoring slots. Marbles bounce off pins, slot
// walls and each other (equal-mass impulses with some energy lost), using sub-steps so fast
// marbles do not pass through pins.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRAVITY = 0.3;
  var SUBSTEPS = 3;
  var RADIUS = 7;
  var PIN_RADIUS = 4;
  var BOUNCE = 0.5;
  var MAX = 260;
  var SLOT_POINTS = [10, 50, 100, 500, 100, 50, 10];
  var COLORS = ['#e2574c', '#f0b44c', '#4cb3e2', '#6fd17d', '#b57be8', '#f2f2f2'];
  var STEP_MS = 1000 / 60;

  var W, H, DPR, TOP, FLOOR, SLOT_TOP;
  var pins = [], walls = [];
  var mx = [], my = [], mvx = [], mvy = [], mc = [], scored = [];
  var gx = 0, gy = GRAVITY;
  var score = 0, rain = 0;
  var sprites = [], board;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    TOP = document.getElementById('bar').getBoundingClientRect().bottom + 4;
    FLOOR = H - 72;
    SLOT_TOP = FLOOR - 90;
    // Staggered pins between the drop zone and the slots.
    pins = [];
    var rows = 11, top = TOP + 90, bottom = SLOT_TOP - 30, gap = (bottom - top) / (rows - 1);
    var cols = 9, sx = W / cols;
    for (var r = 0; r < rows; r++) {
      var off = r % 2 ? sx / 2 : 0;
      for (var c = 0; c <= cols; c++) {
        var x = c * sx + off;
        if (x < 10 || x > W - 10) continue;
        pins.push(x, top + r * gap);
      }
    }
    // Slot dividers as vertical walls.
    walls = [];
    var n = SLOT_POINTS.length;
    for (var i = 1; i < n; i++) walls.push((W * i) / n);
    makeSprites();
    drawBoard();
  }

  // A glossy marble per colour, drawn once and stamped each frame.
  function makeSprites() {
    sprites = COLORS.map(function (color) {
      var s = document.createElement('canvas'), size = Math.ceil(RADIUS * 2 * DPR) + 2;
      s.width = s.height = size;
      var c = s.getContext('2d'), r = size / 2 - 1;
      var g = c.createRadialGradient(size / 2 - r * 0.35, size / 2 - r * 0.4, r * 0.1, size / 2, size / 2, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, color);
      g.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
      c.fillStyle = color;
      c.beginPath(); c.arc(size / 2, size / 2, r, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.75;
      c.fillStyle = g;
      c.beginPath(); c.arc(size / 2, size / 2, r, 0, Math.PI * 2); c.fill();
      return s;
    });
  }

  // Board, pins, slots and their points, drawn once.
  function drawBoard() {
    board = document.createElement('canvas');
    board.width = canvas.width;
    board.height = canvas.height;
    var b = board.getContext('2d');
    b.scale(DPR, DPR);
    var g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#14213a');
    g.addColorStop(1, '#0d1626');
    b.fillStyle = g;
    b.fillRect(0, 0, W, H);
    for (var i = 0; i < pins.length; i += 2) {
      var pg = b.createRadialGradient(pins[i] - 1.2, pins[i + 1] - 1.2, 0.5, pins[i], pins[i + 1], PIN_RADIUS);
      pg.addColorStop(0, '#ffffff');
      pg.addColorStop(1, '#8a97ad');
      b.fillStyle = pg;
      b.beginPath(); b.arc(pins[i], pins[i + 1], PIN_RADIUS, 0, Math.PI * 2); b.fill();
    }
    var n = SLOT_POINTS.length;
    for (i = 0; i < n; i++) {
      var x0 = (W * i) / n, x1 = (W * (i + 1)) / n;
      var hot = SLOT_POINTS[i] / 500;
      b.fillStyle = 'rgba(' + (60 + 180 * hot) + ', ' + (90 + 60 * hot) + ', 160, 0.18)';
      b.fillRect(x0, SLOT_TOP, x1 - x0, FLOOR - SLOT_TOP);
      b.fillStyle = '#c9d4e6';
      b.font = '600 13px system-ui, Roboto, sans-serif';
      b.textAlign = 'center';
      b.fillText(String(SLOT_POINTS[i]), (x0 + x1) / 2, FLOOR + 18);
    }
    b.fillStyle = '#5d6b83';
    for (i = 0; i < walls.length; i++) b.fillRect(walls[i] - 2, SLOT_TOP, 4, FLOOR - SLOT_TOP);
    b.fillRect(0, FLOOR, W, 3);
  }

  function reset() {
    mx = []; my = []; mvx = []; mvy = []; mc = []; scored = [];
    score = 0;
    rain = 0;
    updateStatus();
  }

  function drop(x, y) {
    if (mx.length >= MAX) { mx.shift(); my.shift(); mvx.shift(); mvy.shift(); mc.shift(); scored.shift(); }
    mx.push(Math.max(RADIUS, Math.min(W - RADIUS, x)));
    my.push(Math.max(TOP + RADIUS, Math.min(y, TOP + 60)));
    mvx.push((Math.random() - 0.5) * 0.6);
    mvy.push(0);
    mc.push((Math.random() * COLORS.length) | 0);
    scored.push(false);
  }

  function updateStatus() {
    statusEl.textContent = mx.length ? 'Score ' + score.toLocaleString() + ' \\u00b7 ' + mx.length + ' marbles' : 'Tap to drop a marble.';
  }

  function substep() {
    var n = mx.length, i, j, dx, dy, d2, d, nx, ny, vn, rr;
    var g2x = gx / SUBSTEPS, g2y = gy / SUBSTEPS;
    for (i = 0; i < n; i++) {
      mvx[i] += g2x; mvy[i] += g2y;
      mx[i] += mvx[i] / SUBSTEPS; my[i] += mvy[i] / SUBSTEPS;
    }
    // Pins.
    rr = RADIUS + PIN_RADIUS;
    for (i = 0; i < n; i++) {
      for (var p = 0; p < pins.length; p += 2) {
        dx = mx[i] - pins[p]; dy = my[i] - pins[p + 1];
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        d = Math.sqrt(d2) || 0.01; nx = dx / d; ny = dy / d;
        mx[i] = pins[p] + nx * rr; my[i] = pins[p + 1] + ny * rr;
        vn = mvx[i] * nx + mvy[i] * ny;
        if (vn < 0) {
          mvx[i] -= (1 + BOUNCE) * vn * nx; mvy[i] -= (1 + BOUNCE) * vn * ny;
          mvx[i] += (Math.random() - 0.5) * 0.15;
          if (vn < -4) buzz();
        }
      }
    }
    // Marbles against each other.
    rr = RADIUS * 2;
    for (i = 0; i < n; i++) {
      for (j = i + 1; j < n; j++) {
        dx = mx[j] - mx[i]; dy = my[j] - my[i];
        if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
        d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 === 0) continue;
        d = Math.sqrt(d2); nx = dx / d; ny = dy / d;
        var push = (rr - d) / 2;
        mx[i] -= nx * push; my[i] -= ny * push; mx[j] += nx * push; my[j] += ny * push;
        vn = (mvx[j] - mvx[i]) * nx + (mvy[j] - mvy[i]) * ny;
        if (vn < 0) {
          var imp = (-(1 + BOUNCE) * vn) / 2;
          mvx[i] -= imp * nx; mvy[i] -= imp * ny; mvx[j] += imp * nx; mvy[j] += imp * ny;
        }
      }
    }
    // Side walls, floor and slot dividers.
    for (i = 0; i < n; i++) {
      if (mx[i] < RADIUS) { mx[i] = RADIUS; mvx[i] = Math.abs(mvx[i]) * BOUNCE; }
      if (mx[i] > W - RADIUS) { mx[i] = W - RADIUS; mvx[i] = -Math.abs(mvx[i]) * BOUNCE; }
      if (my[i] < TOP + RADIUS) { my[i] = TOP + RADIUS; mvy[i] = Math.abs(mvy[i]) * BOUNCE; }
      if (my[i] > FLOOR - RADIUS) { my[i] = FLOOR - RADIUS; mvy[i] = -Math.abs(mvy[i]) * BOUNCE; mvx[i] *= 0.98; }
      if (my[i] > SLOT_TOP - RADIUS) {
        for (var w = 0; w < walls.length; w++) {
          dx = mx[i] - walls[w];
          if (my[i] < SLOT_TOP) {
            // Rounded top of the divider.
            dy = my[i] - SLOT_TOP; d2 = dx * dx + dy * dy; rr = RADIUS + 2;
            if (d2 < rr * rr) {
              d = Math.sqrt(d2) || 0.01; nx = dx / d; ny = dy / d;
              mx[i] = walls[w] + nx * rr; my[i] = SLOT_TOP + ny * rr;
              vn = mvx[i] * nx + mvy[i] * ny;
              if (vn < 0) { mvx[i] -= (1 + BOUNCE) * vn * nx; mvy[i] -= (1 + BOUNCE) * vn * ny; }
            }
          } else if (Math.abs(dx) < RADIUS + 2) {
            mx[i] = walls[w] + (dx < 0 ? -1 : 1) * (RADIUS + 2);
            mvx[i] = -mvx[i] * BOUNCE;
          }
        }
      }
    }
  }

  function step() {
    if (rain > 0) { if (rain % 3 === 0) drop(Math.random() * W, TOP + 10); rain--; }
    for (var s = 0; s < SUBSTEPS; s++) substep();
    // A marble resting in a slot scores that slot once.
    var changed = false;
    for (var i = 0; i < mx.length; i++) {
      if (scored[i] || my[i] < SLOT_TOP + 10) continue;
      if (Math.abs(mvy[i]) < 0.6 && Math.abs(mvx[i]) < 0.6) {
        var slot = Math.min(SLOT_POINTS.length - 1, Math.max(0, Math.floor((mx[i] / W) * SLOT_POINTS.length)));
        score += SLOT_POINTS[slot];
        scored[i] = true;
        changed = true;
      }
    }
    if (changed || rain) updateStatus();
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(board, 0, 0);
    var size = sprites[0].width / DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (var i = 0; i < mx.length; i++) ctx.drawImage(sprites[mc[i]], mx[i] - size / 2, my[i] - size / 2, size, size);
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    drop(e.clientX, e.clientY);
    updateStatus();
  });

  window.onTilt = function (tx, ty) { gx = GRAVITY * tx; gy = GRAVITY * ty; };
  document.getElementById('rain').onclick = function () { rain = 75; };
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
    draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <button id="rain">Rain</button>
  <div class="grow"></div>
  <button id="tilt">Tilt</button>
  <button id="reset">Reset</button>`,
  status: 'Tap to drop a marble.',
  script,
});

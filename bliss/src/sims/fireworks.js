import simPage from './shell';

// Fireworks over a night skyline. Tap the sky to launch a rocket at that spot; sparks fall under
// gravity and air drag, leaving glowing trails that fade on their own layer.
// Keep backticks and dollar-brace sequences out of the script string.
const script = `
(function () {
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var statusEl = document.getElementById('status');

  var GRAVITY = 0.045;
  var MAX_SPARKS = 5000;
  var STEP_MS = 1000 / 60;
  var STYLES = {
    burst: { count: 150, speed: 4.2, drag: 0.975, life: 70, gravity: 1 },
    ring: { count: 90, speed: 4.6, drag: 0.972, life: 60, gravity: 0.7 },
    willow: { count: 120, speed: 3.4, drag: 0.955, life: 150, gravity: 0.55 },
  };

  var W, H, DPR;
  var sky, glow, glowCtx;
  var rockets = [];
  var sparks = [];
  var style = 'burst';
  var auto = false, nextAuto = 0, launched = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    [canvas].forEach(function (cv) {
      cv.width = Math.round(W * DPR);
      cv.height = Math.round(H * DPR);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
    });
    glow = document.createElement('canvas');
    glow.width = canvas.width;
    glow.height = canvas.height;
    glowCtx = glow.getContext('2d');
    glowCtx.scale(DPR, DPR);
    drawSky();
  }

  // Night sky, stars and a city skyline, drawn once.
  function drawSky() {
    sky = document.createElement('canvas');
    sky.width = canvas.width;
    sky.height = canvas.height;
    var s = sky.getContext('2d');
    s.scale(DPR, DPR);
    var g = s.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070d');
    g.addColorStop(0.7, '#0c1424');
    g.addColorStop(1, '#16203a');
    s.fillStyle = g;
    s.fillRect(0, 0, W, H);
    for (var i = 0; i < 160; i++) {
      s.fillStyle = 'rgba(255, 255, 255,' + (0.15 + Math.random() * 0.5).toFixed(2) + ')';
      s.fillRect(Math.random() * W, Math.random() * H * 0.75, Math.random() < 0.1 ? 1.6 : 1, Math.random() < 0.1 ? 1.6 : 1);
    }
    s.fillStyle = '#04060b';
    var x = 0;
    s.beginPath();
    s.moveTo(0, H);
    while (x < W) {
      var bw = 18 + Math.random() * 40, bh = 30 + Math.random() * 90;
      s.lineTo(x, H - bh);
      s.lineTo(x + bw, H - bh);
      x += bw;
    }
    s.lineTo(W, H);
    s.closePath();
    s.fill();
    s.fillStyle = 'rgba(255, 214, 140, 0.55)';
    for (i = 0; i < 90; i++) {
      var wx = Math.random() * W, wy = H - Math.random() * 70;
      s.fillRect(wx, wy, 2, 2.5);
    }
  }

  function launch(tx, ty) {
    var sx = tx + (Math.random() - 0.5) * 80;
    var frames = 48 + Math.random() * 14;
    rockets.push({ x: sx, y: H, tx: tx, ty: ty, vx: (tx - sx) / frames, vy: (ty - H) / frames,
      frames: frames, hue: (Math.random() * 360) | 0, style: style });
    launched++;
    statusEl.textContent = launched + (launched === 1 ? ' firework' : ' fireworks');
  }

  function explode(r) {
    var spec = STYLES[r.style];
    var hue2 = (r.hue + 40 + Math.random() * 60) % 360;
    for (var i = 0; i < spec.count && sparks.length < MAX_SPARKS; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = r.style === 'ring' ? spec.speed * (0.95 + Math.random() * 0.1) : spec.speed * Math.sqrt(Math.random());
      var willow = r.style === 'willow';
      sparks.push({
        x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: spec.life * (0.7 + Math.random() * 0.5), age: 0,
        drag: spec.drag, gravity: spec.gravity,
        hue: willow ? 38 : (i % 3 === 0 ? hue2 : r.hue), sat: willow ? 85 : 95,
        size: willow ? 1.4 : 1.8,
      });
    }
    buzz();
  }

  function step() {
    for (var i = rockets.length - 1; i >= 0; i--) {
      var r = rockets[i];
      r.x += r.vx; r.y += r.vy; r.frames--;
      if (sparks.length < MAX_SPARKS && Math.random() < 0.8) {
        sparks.push({ x: r.x, y: r.y, vx: (Math.random() - 0.5) * 0.4, vy: 0.6 + Math.random() * 0.6,
          life: 22, age: 0, drag: 0.94, gravity: 0.6, hue: 35, sat: 60, size: 1.1 });
      }
      if (r.frames <= 0) { explode(r); rockets.splice(i, 1); }
    }
    for (i = sparks.length - 1; i >= 0; i--) {
      var p = sparks[i];
      p.vx *= p.drag; p.vy = p.vy * p.drag + GRAVITY * p.gravity;
      p.x += p.vx; p.y += p.vy; p.age++;
      if (p.age >= p.life) { sparks[i] = sparks[sparks.length - 1]; sparks.pop(); }
    }
  }

  function draw(now) {
    // Fade the trail layer a little each frame, then add this frame's light on top.
    glowCtx.globalCompositeOperation = 'destination-out';
    glowCtx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    glowCtx.fillRect(0, 0, W, H);
    glowCtx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < sparks.length; i++) {
      var p = sparks[i], t = p.age / p.life;
      var flicker = t > 0.6 ? (Math.random() < 0.5 ? 0.3 : 1) : 1;
      var light = 70 - t * 25;
      glowCtx.fillStyle = 'hsla(' + p.hue + ',' + p.sat + '%,' + light + '%,' + ((1 - t) * flicker).toFixed(2) + ')';
      glowCtx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    for (i = 0; i < rockets.length; i++) {
      glowCtx.fillStyle = 'rgba(255, 230, 180, 0.95)';
      glowCtx.fillRect(rockets[i].x - 1, rockets[i].y - 1, 2, 3);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(sky, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    var top = document.getElementById('bar').getBoundingClientRect().bottom;
    launch(e.clientX, Math.max(top + 20, Math.min(e.clientY, H - 140)));
  });

  segment(['sBurst', 'sRing', 'sWillow'], function (id) {
    style = id === 'sBurst' ? 'burst' : id === 'sRing' ? 'ring' : 'willow';
  });
  toggle('auto', function (on) { auto = on; nextAuto = 0; });

  window.addEventListener('resize', resize);
  resize();
  var last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(now - last, 100);
    last = now;
    var steps = 0;
    while (acc >= STEP_MS && steps < 2) {
      if (auto && now > nextAuto) {
        var keep = style;
        style = ['burst', 'ring', 'willow'][(Math.random() * 3) | 0];
        launch(W * (0.15 + Math.random() * 0.7), H * (0.15 + Math.random() * 0.3));
        style = keep;
        nextAuto = now + 500 + Math.random() * 900;
      }
      step();
      acc -= STEP_MS;
      steps++;
    }
    if (steps === 2) acc = 0;
    draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

export default simPage({
  controls: `
  <div class="seg" role="group" aria-label="Firework style">
    <button id="sBurst" class="on">Burst</button>
    <button id="sRing">Ring</button>
    <button id="sWillow">Willow</button>
  </div>
  <div class="grow"></div>
  <button id="auto">Auto</button>`,
  status: 'Tap the sky to launch a firework.',
  script,
});

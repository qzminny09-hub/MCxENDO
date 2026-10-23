// Shared page shell for the canvas simulations shown inside a WebView.
// Each sim supplies its toolbar controls, starting status line and script.
// Messages to the app: {type: 'back'}, {type: 'buzz'}, {type: 'tilt', on: boolean}.
// The app calls window.onTilt(gx, gy) with gravity in screen space while tilt is on.
export default function simPage({ controls, status, script }) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>
  :root {
    --bg: #111917;
    --fg: #e4ece8;
    --muted: #8fa39c;
    --chip: #1c2825;
    --chip-on: #3f7366;
  }
  html, body { margin: 0; height: 100%; overflow: hidden; background: var(--bg); color: var(--fg);
    font-family: system-ui, -apple-system, Roboto, sans-serif; -webkit-user-select: none; user-select: none;
    -webkit-tap-highlight-color: transparent; }
  canvas { position: fixed; inset: 0; touch-action: none; display: block; }
  #bar { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; z-index: 2; }
  button { font: inherit; color: var(--fg); background: var(--chip); border: 0; border-radius: 999px;
    height: 38px; padding: 0 13px; font-size: 14px; font-weight: 600; letter-spacing: 0.02em; }
  button:focus-visible { outline: 2px solid var(--chip-on); outline-offset: 2px; }
  #back { width: 38px; padding: 0; font-size: 20px; line-height: 38px; flex: none; }
  .seg { display: flex; background: var(--chip); border-radius: 999px; padding: 3px; gap: 2px; }
  .seg button { height: 32px; background: transparent; padding: 0 12px; }
  .seg button.on, button.toggle.on { background: var(--chip-on); }
  .grow { flex: 1; }
  #status { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); width: max-content;
    max-width: calc(100% - 32px); text-align: center; font-size: 13px; color: var(--fg);
    background: rgba(10, 15, 14, 0.6); padding: 4px 12px; border-radius: 999px;
    letter-spacing: 0.04em; pointer-events: none; z-index: 2; font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="bar">
  <button id="back" aria-label="Back">&#8592;</button>
  ${controls}
</div>
<div id="status">${status}</div>
<script>
  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }
  var lastBuzz = 0;
  function buzz() {
    var now = performance.now();
    if (now - lastBuzz > 45) { lastBuzz = now; post({ type: 'buzz' }); }
  }
  // Wires a segmented control: ids of its buttons, called back with the chosen id.
  function segment(ids, onPick) {
    ids.forEach(function (id) {
      document.getElementById(id).onclick = function () {
        ids.forEach(function (other) { document.getElementById(other).className = other === id ? 'on' : ''; });
        onPick(id);
      };
    });
  }
  // Wires a toggle button, called back with its new state.
  function toggle(id, onChange) {
    var el = document.getElementById(id);
    el.className = 'toggle';
    el.setAttribute('aria-pressed', 'false');
    el.onclick = function () {
      var on = el.className.indexOf(' on') < 0;
      el.className = on ? 'toggle on' : 'toggle';
      el.setAttribute('aria-pressed', String(on));
      onChange(on);
    };
  }
  document.getElementById('back').onclick = function () { post({ type: 'back' }); };
</script>
<script>
${script}
</script>
</body>
</html>`;
}

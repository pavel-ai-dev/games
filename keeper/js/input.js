'use strict';
// Ввод: клавиатура (для ПК и тестов) + сенсорные кнопки и плавающий стик для iPhone.
var Input = (function () {
  var NAMES = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'parry', 'chakram', 'time', 'hook', 'pause', 'map'];
  var down = {}, prev = {}, hit = {}, rel = {}, latch = {};
  var keys = {}, pointers = {};
  var W = 800, H = 400, touchMode = false;
  var btn = {};                       // имя -> {x,y,r}
  var stick = { id: null, bx: 0, by: 0, x: 0, y: 0, R: 54, dx: 0, dy: 0 };
  var avail = { dash: false, chakram: false, time: false, hook: false };
  var hookVisible = false;
  var holdTime = 0, lastHold = 0;     // длительность удержания кнопки «время»
  NAMES.forEach(function (n) { down[n] = false; prev[n] = false; hit[n] = false; rel[n] = false; });

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyX: 'jump', KeyK: 'jump', KeyZ: 'attack', KeyJ: 'attack', KeyC: 'dash', KeyL: 'dash',
    KeyV: 'parry', KeyI: 'parry', ShiftLeft: 'parry', KeyB: 'chakram', KeyU: 'chakram', KeyN: 'time', KeyO: 'time',
    KeyG: 'hook', KeyH: 'hook', KeyM: 'map', Escape: 'pause', KeyP: 'pause'
  };

  function layout(w, h) {
    W = w; H = h;
    var r = clamp(Math.min(w, h) * 0.085, 26, 50);
    var m = r * 0.7;
    var px = w - m - r * 1.35, py = h - m - r * 1.35;
    btn.attack = { x: px, y: py, r: r * 1.2 };
    btn.jump = { x: px - r * 2.75, y: py + r * 0.35, r: r * 1.05 };
    btn.dash = { x: px - r * 2.1, y: py - r * 2.1, r: r * 0.9 };
    btn.parry = { x: px + r * 0.2, y: py - r * 2.65, r: r * 0.9 };
    btn.chakram = { x: px - r * 4.35, y: py - r * 1.1, r: r * 0.78 };
    btn.time = { x: px - r * 4.2, y: py - r * 3.0, r: r * 0.78 };
    btn.hook = { x: px - r * 1.1, y: py - r * 4.85, r: r * 0.8 };
    btn.pause = { x: w - r * 0.9, y: r * 0.9, r: r * 0.6 };
    btn.map = { x: w - r * 2.3, y: r * 0.9, r: r * 0.6 };
    stick.R = clamp(r * 1.25, 40, 64);
  }

  function hitButton(x, y) {
    var best = null, bd = 1e9;
    for (var n in btn) {
      if (n === 'hook' && !hookVisible) continue;
      if ((n === 'chakram' || n === 'time') && !avail[n]) continue;
      var b = btn[n], d = dist(x, y, b.x, b.y);
      if (d <= b.r * 1.25 && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  var tapPos = null;
  function pdown(e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') touchMode = true;
    var x = e.clientX, y = e.clientY;
    tapPos = { x: x, y: y };
    var b = hitButton(x, y);
    if (b) { pointers[e.pointerId] = { type: 'btn', name: b }; latch[b] = true; }
    else if (x < W * 0.55 && stick.id === null) {
      stick.id = e.pointerId; stick.bx = x; stick.by = y; stick.x = x; stick.y = y; stick.dx = 0; stick.dy = 0;
      pointers[e.pointerId] = { type: 'stick' };
    } else pointers[e.pointerId] = { type: 'none' };
    e.preventDefault();
  }
  function pmove(e) {
    var p = pointers[e.pointerId];
    if (p && p.type === 'stick') {
      stick.x = e.clientX; stick.y = e.clientY;
      var dx = stick.x - stick.bx, dy = stick.y - stick.by, d = Math.sqrt(dx * dx + dy * dy);
      if (d > stick.R) { stick.bx += dx / d * (d - stick.R); stick.by += dy / d * (d - stick.R); dx = stick.x - stick.bx; dy = stick.y - stick.by; d = stick.R; }
      stick.dx = dx / stick.R; stick.dy = dy / stick.R;
    }
    e.preventDefault();
  }
  function pup(e) {
    var p = pointers[e.pointerId];
    if (p && p.type === 'stick') { stick.id = null; stick.dx = 0; stick.dy = 0; }
    delete pointers[e.pointerId];
    e.preventDefault();
  }

  window.addEventListener('pointerdown', pdown, { passive: false });
  window.addEventListener('pointermove', pmove, { passive: false });
  window.addEventListener('pointerup', pup, { passive: false });
  window.addEventListener('pointercancel', pup, { passive: false });
  window.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  window.addEventListener('keydown', function (e) {
    var n = KEYMAP[e.code]; if (!n) return; if (!keys[n]) latch[n] = true; keys[n] = true;
    if (e.code.indexOf('Arrow') === 0 || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { var n = KEYMAP[e.code]; if (n) keys[n] = false; });
  window.addEventListener('blur', function () { keys = {}; pointers = {}; stick.id = null; stick.dx = stick.dy = 0; });

  var virt = {};   // для тестов и ботов: Input.virt.jump = true
  function update(dt) {
    var touchHeld = {};
    for (var id in pointers) { var p = pointers[id]; if (p.type === 'btn') touchHeld[p.name] = true; }
    var sx = stick.dx, sy = stick.dy;
    if (sx < -0.3) touchHeld.left = true;
    if (sx > 0.3) touchHeld.right = true;
    if (sy < -0.55) touchHeld.up = true;
    if (sy > 0.55) touchHeld.down = true;
    for (var i = 0; i < NAMES.length; i++) {
      var n = NAMES[i];
      prev[n] = down[n];
      down[n] = !!(keys[n] || touchHeld[n] || virt[n] || latch[n]);
      latch[n] = false;
      hit[n] = down[n] && !prev[n];
      rel[n] = !down[n] && prev[n];
    }
    if (rel.time) lastHold = holdTime;
    holdTime = down.time ? holdTime + dt : 0;
  }

  function drawBtn(ctx, name, label, alpha, active) {
    var b = btn[name]; if (!b) return;
    ctx.globalAlpha = alpha * (active ? 1 : 0.7);
    ctx.fillStyle = active ? 'rgba(255,214,120,0.55)' : 'rgba(20,14,28,0.55)';
    ctx.strokeStyle = 'rgba(255,225,160,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.font = 'bold ' + Math.round(b.r * 0.62) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x, b.y + 1);
  }
  function draw(ctx, state) {
    if (!touchMode) return;
    ctx.save();
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    var a = 0.78;
    // стик
    var bx = stick.id !== null ? stick.bx : W * 0.13, by = stick.id !== null ? stick.by : H - stick.R - 26;
    ctx.globalAlpha = 0.35; ctx.fillStyle = 'rgba(20,14,28,0.6)'; ctx.strokeStyle = 'rgba(255,225,160,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, by, stick.R, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.fillStyle = 'rgba(255,225,160,0.55)';
    ctx.beginPath(); ctx.arc(bx + stick.dx * stick.R * 0.7, by + stick.dy * stick.R * 0.7, stick.R * 0.38, 0, TAU); ctx.fill();
    drawBtn(ctx, 'attack', '⚔', a, down.attack);
    drawBtn(ctx, 'jump', '⤒', a, down.jump);
    if (avail.dash) drawBtn(ctx, 'dash', '➤', a, down.dash);
    drawBtn(ctx, 'parry', '◈', a, down.parry);
    if (avail.chakram) drawBtn(ctx, 'chakram', '⟲', a, down.chakram);
    if (avail.time) drawBtn(ctx, 'time', '⌛', a, down.time);
    if (hookVisible) drawBtn(ctx, 'hook', '⚓', a, down.hook);
    drawBtn(ctx, 'pause', 'II', 0.6, down.pause);
    drawBtn(ctx, 'map', '▦', 0.6, down.map);
    ctx.restore();
  }

  return {
    down: down, hit: hit, rel: rel, virt: virt, avail: avail, layout: layout, update: update, draw: draw,
    stick: stick, takeTap: function () { var t = tapPos; tapPos = null; return t; }, peekTap: function () { return tapPos; },
    get touchMode() { return touchMode; }, set touchMode(v) { touchMode = v; },
    set hookVisible(v) { hookVisible = v; }, get hookVisible() { return hookVisible; },
    get holdTime() { return holdTime; }, get lastHold() { return lastHold; },
    get axisX() { return (down.right ? 1 : 0) - (down.left ? 1 : 0); },
    get axisY() { return (down.down ? 1 : 0) - (down.up ? 1 : 0); }
  };
})();

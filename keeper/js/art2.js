'use strict';
// Графика, часть 2: герой (скелет + IK + верле-плащ), взмахи, предметы, фонтан, порталы, рычаги.
// Дополняет объект Art из art.js (подключать ПОСЛЕ art.js).
(function () {
  var U = Art.U, glow = U.glow, hash2 = U.hash2, rgbaC = U.rgbaC, mixC = U.mixC;

  var HERO = {
    skin: '#e3ab7c', skinD: '#b97c58', tunic: '#1f9aaa', tunicL: '#41c4cf', tunicD: '#146a7c', sash: '#d63a2e', sashD: '#9c231f',
    gold: '#f2cb68', goldD: '#b98a2c', pants: '#5a3f7e', pantsL: '#7a5aa0', pantsD: '#3a2858', boot: '#3b2a22', bootL: '#6a4a38',
    turban: '#f6ebd0', turbanD: '#cdb98c', hair: '#1c1218', cape: '#c42f35', capeD: '#7a1a24', capeL: '#ff6a4f', scarf: '#ff8a3a', scarfD: '#d4511f'
  };

  // =====================================================================
  //  ИК и примитивы
  // =====================================================================
  function ik(ax, ay, tx, ty, l1, l2, pref, out) {
    var dx = tx - ax, dy = ty - ay, d = Math.sqrt(dx * dx + dy * dy) || 0.001, mx = (l1 + l2) * 0.999;
    if (d > mx) { tx = ax + dx / d * mx; ty = ay + dy / d * mx; dx = tx - ax; dy = ty - ay; d = mx; }
    var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h2 = l1 * l1 - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0;
    var ux = dx / d, uy = dy / d, bx = ax + ux * a, by = ay + uy * a;
    var e1x = bx - uy * h, e1y = by + ux * h, e2x = bx + uy * h, e2y = by - ux * h, pick1;
    if (pref === 'down') pick1 = e1y > e2y; else if (pref === 'up') pick1 = e1y < e2y; else if (pref === 'back') pick1 = e1x < e2x; else pick1 = e1x > e2x;
    out.ex = pick1 ? e1x : e2x; out.ey = pick1 ? e1y : e2y; out.x = tx; out.y = ty; return out;
  }
  var IK1 = { ex: 0, ey: 0, x: 0, y: 0 }, IK2 = { ex: 0, ey: 0, x: 0, y: 0 };
  function seg(c, x0, y0, x1, y1, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
  function seg2(c, x0, y0, x1, y1, x2, y2, w, col) { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  // =====================================================================
  //  СПРАЙТ ГЕРОЯ (рисуем в оффскрин, потом контур + блит)
  // =====================================================================
  var HW = 124, HH = 128, OX = 62, OY = 104;
  var K = 0, spr = null, sc = null, sil = null, silc = null, ghost = null, gc = null, shade = null;
  function ensure(k) {
    if (K === k && spr) return; K = k;
    spr = makeCanvas(HW * k, HH * k); sc = spr.getContext('2d');
    sil = makeCanvas(HW * k, HH * k); silc = sil.getContext('2d');
    ghost = makeCanvas(HW * k, HH * k); gc = ghost.getContext('2d');
    sc.setTransform(k, 0, 0, k, OX * k, OY * k);
    shade = sc.createLinearGradient(0, -50, 0, 2); shade.addColorStop(0, 'rgba(255,240,210,0.22)'); shade.addColorStop(0.5, 'rgba(255,255,255,0)'); shade.addColorStop(1, 'rgba(10,0,30,0.30)');
  }
  function newA() {
    return {
      cur: { hx: 0, hy: -17, lean: 0, hdx: 0, hdy: 0, fnx: 5, fny: -2.5, ffx: -4, ffy: -2.5, hnx: 9, hny: -22, hfx: -1, hfy: -20, swA: -0.9, sw: 1, brace: 0 },
      tgt: { hx: 0, hy: -17, lean: 0, hdx: 0, hdy: 0, fnx: 5, fny: -2.5, ffx: -4, ffy: -2.5, hnx: 9, hny: -22, hfx: -1, hfy: -20, swA: -0.9, sw: 1, brace: 0 },
      ph: 0, lastT: 0, prev: 'idle', air: 0, land: 0, sq: 0, sqx: 0, t: 0, init: false, swing: 0
    };
  }

  function poseFor(p, A, T) {
    var s = p.state, t = A.t, vx = Math.abs(p.vx), c, sn, i;
    T.hx = 0; T.hy = -18.7; T.lean = 0.03; T.hdx = 0; T.hdy = 0; T.sw = 1; T.brace = 0;
    T.fnx = 5.5; T.fny = -2.2; T.ffx = -4.5; T.ffy = -2.2;
    var rate = 22, br = Math.sin(t * 2.2);
    function hands(sh, nx, ny, fx, fy) { T.hnx = sh.x + nx; T.hny = sh.y + ny; T.hfx = sh.x + fx; T.hfy = sh.y + fy; }
    var sh = { x: 0, y: 0 };
    function recalc() { sh.x = T.hx + Math.sin(T.lean) * 13.5; sh.y = T.hy - Math.cos(T.lean) * 13.5; }
    if (s === 'idle') {
      T.hy += br * 0.5 - (A.land > 0 ? A.land / 0.17 * 4.2 : 0); T.lean = 0.05 + Math.sin(t * 1.1) * 0.015 + (A.land > 0 ? A.land / 0.17 * 0.16 : 0); T.hdy = -br * 0.3;
      if (A.land > 0) { T.fnx = 7.5; T.ffx = -6.5; }
      recalc(); hands(sh, 9 + br * 0.4, 8 + br * 0.5, -1, 10 + br * 0.5); T.swA = -0.95 + Math.sin(t * 2.2) * 0.04;
    } else if (s === 'run') {
      var ph = A.ph, ph2 = ph + Math.PI, sp = Math.min(1, vx / 250);
      T.hy = -18.3 - Math.abs(Math.cos(ph)) * 1.7 + (A.land > 0 ? A.land / 0.17 * 3 : 0); T.lean = 0.2 + sp * 0.07; T.hx = 1;
      T.fnx = 2 + Math.sin(ph) * 11.5; T.fny = -2.5 - Math.max(0, Math.cos(ph)) * 8;
      T.ffx = 2 + Math.sin(ph2) * 11.5; T.ffy = -2.5 - Math.max(0, Math.cos(ph2)) * 8;
      recalc(); hands(sh, 7 + Math.sin(ph2) * 4.5, 9 - Math.max(0, Math.cos(ph2)) * 2.5, Math.sin(ph) * 9, 10 - Math.max(0, Math.cos(ph)) * 3); T.swA = -0.45 + Math.sin(ph * 2) * 0.08; T.hdy = Math.cos(ph * 2) * 0.5; rate = 46;
    } else if (s === 'jump') {
      T.hy = -19; T.lean = -0.03; T.fnx = 8; T.fny = -9.5; T.ffx = -6; T.ffy = -5.5; recalc(); hands(sh, 8, -4, -9, -6); T.swA = -1.15; rate = 24;
    } else if (s === 'fall') {
      T.hy = -18.4; T.lean = 0.06; T.fnx = 4.5; T.fny = -5; T.ffx = -4.5; T.ffy = -3; recalc(); hands(sh, 7, -11, -7, -12); T.swA = -1.35 + Math.sin(t * 9) * 0.05; rate = 14;
    } else if (s === 'glide') {
      T.hy = -18.2; T.lean = 0; T.fnx = 2.5; T.fny = -3; T.ffx = -2.5; T.ffy = -2.2; recalc(); hands(sh, 6, -15, -6, -15); T.swA = -1.5; rate = 14;
    } else if (s === 'wall') {
      T.hx = -3; T.hy = -17; T.lean = -0.1; T.fnx = -7.5; T.fny = -11; T.ffx = -7; T.ffy = -3.5; recalc(); hands(sh, -4, -15, -6, -13); T.swA = 0.5; T.hdx = -1;
    } else if (s === 'dash') {
      T.hx = -2; T.hy = -14; T.lean = 1.0; T.fnx = -15; T.fny = -8; T.ffx = -9; T.ffy = -3.5; T.hdx = 3; T.hdy = 1; recalc(); hands(sh, -13, 3, -11, 5); T.swA = 3.05; rate = 80;
    } else if (s === 'hurt') {
      T.hy = -16; T.lean = -0.42; T.fnx = 3; T.fny = -3.5; T.ffx = -7.5; T.ffy = -2.5; T.hdx = -1.5; recalc(); hands(sh, -6, -9, -9, -4); T.swA = -2.1; rate = 60;
    } else if (s === 'parry') {
      T.hx = -1; T.hy = -17.4; T.lean = -0.08; T.fnx = 9.5; T.fny = -2.5; T.ffx = -8.5; T.ffy = -2.5; recalc(); hands(sh, 12.5, -5, 3, 4); T.swA = -1.38; rate = 50;
    } else if (s === 'smash') {
      T.hy = -16.5; T.lean = 0.1; T.fnx = 2.5; T.fny = -11; T.ffx = -3; T.ffy = -13; recalc(); hands(sh, 4.5, -1.5, 6, -4.5); T.swA = 1.5; rate = 50;
    } else if (s === 'hook') {
      var an = p.hookAnchor, f = p.facing, ax = an ? (an.x - p.cx()) * f : 0, ay = an ? an.y - (p.y + p.h) : -52;
      if (p.hanging) { T.hy = -17; T.lean = Math.sin(t * 3.2) * -0.07; T.fnx = 3 + Math.sin(t * 3.2) * 3; T.fny = -3.5; T.ffx = -3 + Math.sin(t * 3.2) * 3; T.ffy = -2; recalc(); T.hnx = ax + 1; T.hny = ay + 3; T.hfx = ax - 2; T.hfy = ay + 5; }
      else { T.hy = -17; T.lean = 0.2; T.fnx = 3; T.fny = -5; T.ffx = -5; T.ffy = -3; recalc(); T.hnx = ax; T.hny = ay + 2; T.hfx = ax - 2; T.hfy = ay + 5; }
      T.swA = 2.4; T.sw = 2; rate = 40;
    } else if (s === 'attack' && p.atk) {
      var a = p.atk, u = a.t / a.dur, u0 = a.act[0] / a.dur, u1 = a.act[1] / a.dur, th, rr = 11, lean, hip = 0, lunge = 0, st = a.stage, dir = a.dir;
      var w = u < u0 ? u / u0 : 1, sp2 = u < u0 ? 0 : Math.min(1, (u - u0) / (u1 - u0)), fo = u > u1 ? Math.min(1, (u - u1) / (1 - u1)) : 0;
      var se = 1 - Math.pow(1 - sp2, 3);
      th = attackAngle(st, dir, w, se, fo);
      lean = 0; if (dir === 'u') { lean = lerp(0.05, -0.12, se); }
      else if (st === 0) lean = lerp(-0.1, 0.34, se) * (1 - fo * 0.2); else if (st === 1) lean = lerp(0.05, 0.28, se); else lean = lerp(-0.28, 0.52, se) * (1 - fo * 0.15);
      lunge = dir === 'u' ? 0 : (st === 2 ? 7 : 4) * se * (1 - fo * 0.4);
      T.hx = lunge * 0.5; T.hy = -18.4 + (dir === 'u' ? -1.5 * se : 1.6 + (st === 2 ? 2.4 * se : 0)); T.lean = lean;
      T.fnx = 6 + (dir === 'u' ? 0 : lunge * 1.8 + 3); T.fny = -2.5; T.ffx = -6 - (dir === 'u' ? 0 : lunge * 0.8 + 2); T.ffy = -2.5;
      if (dir === 'u') { T.fny = -2.5 - se * 3; T.ffy = -2.5 - se * 1; }
      recalc(); var ha = th - 0.45, rd = dir === 'u' ? 14 : (st === 2 && sp2 < 0.2 ? 8 : 12.5);
      T.hnx = sh.x + Math.cos(ha) * rd; T.hny = sh.y + Math.sin(ha) * rd;
      T.hfx = T.hnx - 1.5 + Math.cos(th) * -1; T.hfy = T.hny + 2.5; T.swA = th; rate = 100; A.swing = sp2 > 0 ? se : 0; T.brace = 1;
      A.atkTh = th; A.atkSh = sh.x; A.atkShy = sh.y; A.u = u; A.u0 = u0; A.u1 = u1; A.fo = fo; A.sp = sp2;
    } else {
      T.hy = -17; recalc(); hands(sh, 9, 9, -1, 10); T.swA = -0.9;
    }
    return rate;
  }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function attackAngle(st, dir, w, se, fo) {
    if (dir === 'u') return lerp(lerp(0.8, 1.15, w), -2.35, se) + fo * -0.12;
    if (st === 0) return lerp(lerp(-1.7, -2.65, w), 0.8, se) + fo * 0.25;
    if (st === 1) return lerp(lerp(1.0, 1.75, w), -1.95, se) - fo * 0.2;
    return lerp(lerp(-1.6, -3.0, w), 1.55, se) + fo * 0.1;
  }

  function drawBlade(c, x, y, ang, glowing) {
    c.save(); c.translate(x, y); c.rotate(ang);
    // рукоять и гарда
    c.fillStyle = HERO.goldD; c.fillRect(-3.4, -1.3, 5.6, 2.6); c.fillStyle = HERO.gold; c.fillRect(-3.4, -1.3, 5.6, 1.2);
    c.fillStyle = HERO.gold; c.beginPath(); c.arc(-3.6, 0, 1.6, 0, TAU); c.fill();
    c.fillStyle = HERO.gold; c.fillRect(2, -3.6, 2.2, 7.2); c.fillStyle = HERO.goldD; c.fillRect(2, 0, 2.2, 3.6);
    // клинок (шамшир)
    c.beginPath(); c.moveTo(4.2, -1.7); c.quadraticCurveTo(19, -6.3, 36, 3.2); c.quadraticCurveTo(21, -1.3, 4.2, 1.7); c.closePath();
    c.fillStyle = '#dce8f4'; c.fill();
    c.fillStyle = '#9bb2c8'; c.beginPath(); c.moveTo(4.2, 0.2); c.quadraticCurveTo(21, -2.6, 36, 3.2); c.quadraticCurveTo(21, -1.3, 4.2, 1.7); c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(5, -1.4); c.quadraticCurveTo(19, -5.6, 35, 3); c.stroke();
    if (glowing) { c.globalCompositeOperation = 'lighter'; glow(c, 30, 1, 11, '#bfe4ff', 0.75 * glowing); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }
    c.restore();
  }

  function renderHero(c, T, p, A, ctxInfo) {
    var hx = T.hx, hy = T.hy, lean = T.lean, sl = Math.sin(lean), cl = Math.cos(lean), t = A.t;
    var shx = hx + sl * 13.5, shy = hy - cl * 13.5, ux = sl, uy = -cl, nx = cl, ny = sl;
    var e = IK1, i;
    c.clearRect(-OX, -OY, HW, HH);
    // --- дальняя рука
    ik(shx - 1.2, shy + 1.2, T.hfx, T.hfy, 8, 8.4, 'down', e);
    seg2(c, shx - 1.2, shy + 1.2, e.ex, e.ey, e.x, e.y, 4.3, HERO.tunicD);
    seg(c, (e.ex + e.x) / 2, (e.ey + e.y) / 2, e.x, e.y, 3.6, HERO.goldD);
    c.fillStyle = HERO.skinD; c.beginPath(); c.arc(e.x, e.y, 2.1, 0, TAU); c.fill();
    // --- дальняя нога
    ik(hx - 1, hy + 1, T.ffx, T.ffy, 8.8, 8.8, 'fwd', e);
    seg2(c, hx - 1, hy + 1, e.ex, e.ey, e.x, e.y, 5.2, HERO.pantsD);
    seg(c, (e.ex + e.x) / 2, (e.ey + e.y) / 2, e.x, e.y, 4.4, '#2a1c18');
    c.fillStyle = '#2a1c18'; c.beginPath(); c.moveTo(e.x - 2.6, e.y - 2); c.lineTo(e.x + 2.4, e.y - 2.4); c.quadraticCurveTo(e.x + 7.5, e.y - 1.4, e.x + 7, e.y + 1.8); c.lineTo(e.x - 2.6, e.y + 2.2); c.fill();
    // --- хвосты тюрбана (позади головы)
    var hxp = shx + ux * 8.2 + T.hdx, hyp = shy + uy * 8.2 + T.hdy;
    var fl = Math.sin(t * 8) * 1.5 + (ctxInfo.run ? 3 : 0);
    c.fillStyle = HERO.sash; c.beginPath(); c.moveTo(hxp - 3.5, hyp - 3); c.quadraticCurveTo(hxp - 9, hyp - 3 + fl * 0.4, hxp - 14 - fl, hyp + 1.5 + fl); c.lineTo(hxp - 13 - fl, hyp + 4.5 + fl); c.quadraticCurveTo(hxp - 8, hyp + 1.5, hxp - 3, hyp + 0.5); c.fill();
    // --- торс
    var tw0 = 5.4, tw1 = 6.7;
    c.beginPath();
    c.moveTo(hx - nx * tw0 - 0.5, hy - ny * tw0 + 2); c.lineTo(shx - nx * tw1, shy - ny * tw1);
    c.quadraticCurveTo(shx + ux * 1.5 - 0.0, shy + uy * 1.5, shx + nx * tw1, shy + ny * tw1);
    c.lineTo(hx + nx * tw0 + 0.5, hy + ny * tw0 + 2);
    // подол туники
    c.lineTo(hx + nx * (tw0 + 1.4) + 1, hy + 7.2); c.quadraticCurveTo(hx, hy + 9.5, hx - nx * (tw0 + 1.4) - 1, hy + 7.2); c.closePath();
    var tg = c.createLinearGradient(hx - 6, 0, hx + 7, 0); tg.addColorStop(0, HERO.tunicD); tg.addColorStop(0.55, HERO.tunic); tg.addColorStop(1, HERO.tunicL);
    c.fillStyle = tg; c.fill();
    // золотая планка + воротник
    c.strokeStyle = HERO.gold; c.lineWidth = 1.5; c.beginPath(); c.moveTo(shx + nx * 1.4, shy + ny * 1.4 + 1.5); c.lineTo(hx + nx * 1.4, hy + ny * 1.4); c.stroke();
    c.fillStyle = HERO.gold; c.beginPath(); c.moveTo(shx - nx * 5, shy - ny * 5 + 0.5); c.quadraticCurveTo(shx + ux * 2.4, shy + uy * 2.4 + 2.5, shx + nx * 5.6, shy + ny * 5.6 + 0.5); c.lineTo(shx + nx * 5, shy + ny * 5 + 2.4); c.quadraticCurveTo(shx + ux * 0.4, shy + uy * 0.4 + 4.2, shx - nx * 4.6, shy - ny * 4.6 + 2.4); c.fill();
    // пояс-кушак с узлом и хвостами
    c.fillStyle = HERO.sash; c.beginPath(); c.moveTo(hx - nx * 6.2, hy - ny * 6.2 - 2.4); c.lineTo(hx + nx * 6.2, hy + ny * 6.2 - 2.4); c.lineTo(hx + nx * 6.6, hy + ny * 6.6 + 2.2); c.lineTo(hx - nx * 6.6, hy - ny * 6.6 + 2.2); c.fill();
    c.fillStyle = HERO.sashD; c.fillRect(hx - 6, hy + 0.6, 12, 1.4);
    c.fillStyle = HERO.gold; c.fillRect(hx + nx * 1.8 - 1.6, hy - 2.8 + ny * 1.8, 3.2, 4.2);
    var sf = Math.sin(t * 7) * 1.2 + (ctxInfo.run ? 2.5 : 0);
    c.fillStyle = HERO.sash; c.beginPath(); c.moveTo(hx - nx * 5.5, hy - ny * 5.5 - 1); c.quadraticCurveTo(hx - 10 - sf, hy + 1, hx - 13 - sf * 1.6, hy + 5 + sf * 0.6); c.lineTo(hx - 10 - sf, hy + 6); c.quadraticCurveTo(hx - 7, hy + 3, hx - nx * 5, hy + 1.5); c.fill();
    // плечо-наплечник
    c.fillStyle = HERO.gold; c.beginPath(); c.arc(shx + 0.5, shy + 2, 3.1, Math.PI * 1.05, TAU * 0.98); c.fill();
    // --- ближняя нога
    ik(hx + 1, hy + 1, T.fnx, T.fny, 8.8, 8.8, 'fwd', e);
    seg2(c, hx + 1, hy + 1, e.ex, e.ey, e.x, e.y, 6, HERO.pants);
    seg(c, hx + 1, hy + 1, e.ex, e.ey, 2.2, HERO.pantsL);
    seg(c, (e.ex + e.x) / 2 + 0.2, (e.ey + e.y) / 2, e.x, e.y, 4.6, HERO.boot);
    seg(c, (e.ex + e.x) / 2, (e.ey + e.y) / 2, e.x, e.y, 1.2, HERO.bootL);
    c.strokeStyle = HERO.gold; c.lineWidth = 1.2; c.beginPath(); c.moveTo(e.ex - 2.6, e.ey + 1); c.lineTo(e.ex + 2.6, e.ey + 1.4); c.stroke();
    c.fillStyle = HERO.boot; c.beginPath(); c.moveTo(e.x - 2.8, e.y - 2.2); c.lineTo(e.x + 2.6, e.y - 2.6); c.quadraticCurveTo(e.x + 8.4, e.y - 1.8, e.x + 8.6, e.y + 0.6); c.quadraticCurveTo(e.x + 9.2, e.y - 0.4, e.x + 8, e.y + 2); c.lineTo(e.x - 2.8, e.y + 2.4); c.fill();
    c.fillStyle = HERO.bootL; c.fillRect(e.x - 2.8, e.y + 1.6, 10, 0.9);
    // --- голова
    var hdx = shx + ux * 8.4 + T.hdx, hdy = shy + uy * 8.4 + T.hdy;
    seg(c, shx, shy + 0.5, hdx - 0.5, hdy + 3, 3.4, HERO.skinD);
    c.fillStyle = HERO.skin; c.beginPath(); c.ellipse(hdx + 1, hdy, 4.9, 5.2, 0, 0, TAU); c.fill();
    c.fillStyle = HERO.skinD; c.beginPath(); c.ellipse(hdx - 1.6, hdy + 1.2, 2.6, 4, 0, 0, TAU); c.fill();
    c.fillStyle = HERO.hair; c.beginPath(); c.moveTo(hdx + 0.5, hdy + 2.4); c.quadraticCurveTo(hdx + 4.6, hdy + 6.4, hdx + 5.2, hdy + 1.4); c.quadraticCurveTo(hdx + 3.6, hdy + 3.8, hdx + 0.5, hdy + 2.4); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(hdx + 3, hdy - 0.9, 1.5, 1.7, 0, 0, TAU); c.fill();
    c.fillStyle = '#1a1018'; c.beginPath(); c.arc(hdx + 3.4, hdy - 0.8, 0.95, 0, TAU); c.fill();
    c.strokeStyle = '#2a1820'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(hdx + 1.6, hdy - 2.7); c.lineTo(hdx + 4.7, hdy - 2.2); c.stroke();
    c.fillStyle = HERO.skinD; c.beginPath(); c.moveTo(hdx + 5.6, hdy - 0.6); c.lineTo(hdx + 7, hdy + 1.3); c.lineTo(hdx + 5.2, hdy + 1.4); c.fill();
    // тюрбан
    c.fillStyle = HERO.turban; c.beginPath(); c.ellipse(hdx + 0.6, hdy - 3.2, 6.4, 4.9, 0, Math.PI * 0.96, TAU * 1.02); c.fill();
    c.fillStyle = HERO.turbanD; c.beginPath(); c.ellipse(hdx - 1.5, hdy - 2.2, 4.4, 3.4, 0, Math.PI * 0.9, TAU * 0.99); c.fill();
    c.strokeStyle = HERO.turbanD; c.lineWidth = 0.8; c.beginPath(); c.arc(hdx + 0.6, hdy - 3.2, 5.2, Math.PI * 1.15, Math.PI * 1.75); c.stroke();
    c.fillStyle = HERO.sash; c.fillRect(hdx - 5.4, hdy - 3.8, 12, 1.9);
    c.fillStyle = HERO.gold; c.beginPath(); c.arc(hdx + 3.2, hdy - 2.9, 1.5, 0, TAU); c.fill(); c.fillStyle = '#7fe0ff'; c.fillRect(hdx + 2.8, hdy - 3.3, 0.8, 0.8);
    // --- ближняя рука + меч
    var hs = T.sw === 2;
    ik(shx + 0.5, shy + 1.8, T.hnx, T.hny, 8, 8.4, 'down', e);
    if (!hs) { /* меч за кистью: клинок поверх рукава, но под кистью */ }
    seg2(c, shx + 0.5, shy + 1.8, e.ex, e.ey, e.x, e.y, 4.6, HERO.tunic);
    seg(c, shx + 0.5, shy + 1.8, e.ex, e.ey, 1.4, HERO.tunicL);
    seg(c, (e.ex + e.x) / 2, (e.ey + e.y) / 2, e.x, e.y, 3.9, HERO.gold);
    seg(c, (e.ex + e.x) / 2, (e.ey + e.y) / 2, e.x, e.y, 1.5, HERO.goldD);
    var gx = e.x, gy = e.y;
    if (hs) drawBlade(c, hx - 4, hy - 1, T.swA, 0); else drawBlade(c, gx, gy, T.swA, ctxInfo.glow);
    c.fillStyle = HERO.skin; c.beginPath(); c.arc(gx, gy, 2.4, 0, TAU); c.fill();
    c.fillStyle = HERO.skinD; c.fillRect(gx - 0.3, gy - 0.2, 1.8, 0.9);
    // --- тон и блик поверх всего
    c.globalCompositeOperation = 'source-atop'; c.fillStyle = shade; c.fillRect(-OX, -OY, HW, HH);
    if (ctxInfo.tint) { c.fillStyle = ctxInfo.tint; c.fillRect(-OX, -OY, HW, HH); }
    c.globalCompositeOperation = 'source-over';
  }

  // =====================================================================
  //  drawHero: оффскрин → силуэт-контур → блит + эффекты
  // =====================================================================
  var OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.72, 0.72], [-0.72, 0.72], [0.72, -0.72], [-0.72, -0.72]];
  function drawHero(ctx, p) {
    var S = ctx.getTransform().a, k = S > 2.15 ? 3 : 2; ensure(k);
    var A = p._A || (p._A = newA()), dt = Math.min(0.05, U.dt()), f = p.facing, s = p.state, T = A.tgt, cur = A.cur;
    var cx = p.x + p.w / 2, feet = p.y + p.h, now = U.now();
    if (!A.init) { A.init = true; A.prev = s; A.t = p.animT; }
    // переходы состояний → пружины растяжения/приземления
    if (s !== A.prev) {
      var pa = A.prev, air = pa === 'jump' || pa === 'fall' || pa === 'glide' || pa === 'wall' || pa === 'hook';
      if (s === 'jump' && (pa === 'idle' || pa === 'run')) A.sq = -0.2;
      if ((s === 'idle' || s === 'run') && air) { A.land = Math.min(0.17, 0.07 + A.air * 0.12); A.sq = Math.min(0.2, 0.06 + A.air * 0.12); }
      if (s === 'dash') A.sq = -0.12;
      if (s === 'attack' && p.atk && p.atk.stage === 2) A.sq = 0.08;
      if (pa === 'hurt') A.sq = 0;
      A.prev = s; A.air = 0;
    }
    if (s === 'jump' || s === 'fall' || s === 'glide') A.air = Math.min(1.2, A.air + dt);
    A.land = Math.max(0, A.land - dt); A.sq = A.sq * Math.exp(-9 * dt);
    A.t = p.animT;
    if (s === 'run') A.ph += dt * (8.5 + Math.min(1, Math.abs(p.vx) / 250) * 5);
    var rate = poseFor(p, A, T);
    var kk = Math.min(1, dt * rate), key;
    for (key in T) { if (key === 'sw') cur[key] = T[key]; else cur[key] += (T[key] - cur[key]) * kk; }
    var tint = null, fl = p.hurtFlash > 0 ? p.hurtFlash : 0;
    if (fl > 0.2) tint = 'rgba(255,255,255,0.85)'; else if (fl > 0) tint = 'rgba(255,60,60,' + (fl / 0.2 * 0.45) + ')';
    else if (p.parryFlash > 0.15) tint = 'rgba(255,245,190,0.5)';
    else if (s === 'smash') tint = 'rgba(255,150,60,0.2)';
    renderHero(sc, cur, p, A, { run: s === 'run' || s === 'dash', glow: s === 'attack' ? 1 : (s === 'parry' ? 0.6 : 0), tint: tint });
    // силуэт
    silc.setTransform(1, 0, 0, 1, 0, 0); silc.globalCompositeOperation = 'source-over'; silc.clearRect(0, 0, sil.width, sil.height);
    silc.drawImage(spr, 0, 0); silc.globalCompositeOperation = 'source-in'; silc.fillStyle = '#0a0414'; silc.fillRect(0, 0, sil.width, sil.height);

    var baseAlpha = ctx.globalAlpha;
    ctx.save();
    // --- шлейф рывка
    if (s === 'dash' || (p.trail && p.trail.length && p.dashT > 0)) {
      gc.setTransform(1, 0, 0, 1, 0, 0); gc.globalCompositeOperation = 'source-over'; gc.clearRect(0, 0, ghost.width, ghost.height); gc.drawImage(spr, 0, 0);
      gc.globalCompositeOperation = 'source-in'; gc.fillStyle = '#8fd4ff'; gc.fillRect(0, 0, ghost.width, ghost.height);
      ctx.globalCompositeOperation = 'lighter';
      var tr = p.trail, n = tr.length;
      for (var i = 0; i < n; i++) {
        var q = tr[i], u = (i + 1) / n; ctx.globalAlpha = baseAlpha * u * 0.42;
        ctx.save(); ctx.translate(q.x + p.w / 2, q.y + p.h); ctx.scale(q.f || f, 1); ctx.scale(1.25, 0.94); ctx.drawImage(ghost, -OX, -OY, HW, HH); ctx.restore();
      }
      ctx.globalAlpha = baseAlpha;
      // линии скорости
      ctx.lineCap = 'round';
      for (i = 0; i < 4; i++) {
        var ly = feet - 8 - i * 9 - (i & 1) * 3, ln = 36 + i * 11 + (hash2(i, Math.floor(now * 30)) * 18);
        var lg = ctx.createLinearGradient(cx - f * 8, 0, cx - f * (8 + ln), 0); lg.addColorStop(0, 'rgba(190,230,255,0.7)'); lg.addColorStop(1, 'rgba(120,180,255,0)');
        ctx.strokeStyle = lg; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - f * 8, ly); ctx.lineTo(cx - f * (8 + ln), ly); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // --- рывок (след огня) у удара вниз
    if (s === 'smash') {
      ctx.globalCompositeOperation = 'lighter';
      var sg = ctx.createLinearGradient(0, feet - 120, 0, feet - 20); sg.addColorStop(0, 'rgba(255,140,50,0)'); sg.addColorStop(1, 'rgba(255,190,90,0.55)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(cx - 9, feet - 22); ctx.lineTo(cx + 9, feet - 22); ctx.lineTo(cx + 3, feet - 120); ctx.lineTo(cx - 3, feet - 120); ctx.fill();
      glow(ctx, cx, feet + 2, 20, '#ffb060', 0.7); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = baseAlpha;
    }
    // --- парение: купол из песка
    if (s === 'glide') {
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = baseAlpha * (0.55 + Math.sin(now * 9) * 0.1);
      var cyc = feet - 52;
      ctx.fillStyle = 'rgba(255,225,150,0.2)'; ctx.beginPath(); ctx.moveTo(cx - 22, cyc + 6); ctx.quadraticCurveTo(cx, cyc - 26, cx + 22, cyc + 6); ctx.quadraticCurveTo(cx, cyc - 1 + Math.sin(now * 9) * 1.5, cx - 22, cyc + 6); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,190,0.65)'; ctx.lineWidth = 1.2; ctx.stroke();
      glow(ctx, cx, cyc, 24, '#ffd890', 0.35); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = baseAlpha;
    }
    // --- крюк: цепь к якорю
    if (s === 'hook' && p.hookAnchor) {
      var an = p.hookAnchor, hxw = cx + (cur.hnx) * f, hyw = feet + cur.hny;
      ctx.strokeStyle = '#2a1c0c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(hxw, hyw); ctx.lineTo(an.x, an.y); ctx.stroke();
      ctx.strokeStyle = HERO.gold; ctx.lineWidth = 1.6; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]);
    }
    // --- скольжение по стене: искры
    if (s === 'wall') {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(255,230,180,0.6)'; ctx.lineWidth = 1;
      for (i = 0; i < 3; i++) { var wy = feet - 24 + ((now * 70 + i * 13) % 26), wx = cx - f * 11; ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx - f * 1, wy + 5 + i); ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }
    // --- блит с контуром
    var sq = A.sq + (p.squash || 0) * 0.5;
    var scx = f * (1 - sq * 0.5 + (s === 'dash' ? 0.2 : 0)), scy = 1 + sq;
    ctx.translate(cx, feet); ctx.scale(scx, scy);
    if (p.invuln > 0 && p.hurtFlash <= 0 && s !== 'dash' && Math.floor(p.animT * 20) % 2 === 0 && p.parryFlash <= 0) ctx.globalAlpha = baseAlpha * 0.5;
    ctx.imageSmoothingEnabled = true;
    var ow = 0.95;
    for (i = 0; i < OFFS.length; i++) ctx.drawImage(sil, -OX + OFFS[i][0] * ow, -OY + OFFS[i][1] * ow, HW, HH);
    ctx.drawImage(spr, -OX, -OY, HW, HH);
    // --- взмах мечом
    if (s === 'attack' && p.atk) drawSwoosh(ctx, p, A, cur);
    // --- парирование
    if (p.parryT > 0 || p.parryFlash > 0) drawParry(ctx, p, now);
    ctx.restore();
  }

  function drawSwoosh(ctx, p, A, cur) {
    var a = p.atk, u = A.u, u0 = A.u0, u1 = A.u1;
    if (u < u0 * 0.55) return;
    var st = a.stage, dir = a.dir, w = 1, sp = A.sp, fo = A.fo;
    var sh = A.atkSh, shy = A.atkShy, R = (st === 2 && dir !== 'u' ? 52 : 46), n = 14;
    var se = 1 - Math.pow(1 - sp, 3), se0 = Math.max(0, 1 - Math.pow(1 - Math.max(0, sp - 0.4), 3));
    var h = attackAngle(st, dir, 1, se, 0), tl = attackAngle(st, dir, 1, se0 * 0.0 + Math.max(0, 1 - Math.pow(1 - Math.max(0, sp - 0.45), 3)), 0);
    if (sp <= 0.02) return;
    var alpha = (1 - fo) * Math.min(1, sp * 4);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var pass, i, ang, cs, sn, ri, ro;
    for (pass = 0; pass < 3; pass++) {
      ctx.beginPath();
      for (i = 0; i <= n; i++) { var q = i / n; ang = tl + (h - tl) * q; ro = R + (st === 2 ? 4 : 0) + pass * 3 * (pass === 2 ? 0.5 : 0); ctx.lineTo(sh + Math.cos(ang) * ro, shy + Math.sin(ang) * ro); }
      for (i = n; i >= 0; i--) { q = i / n; ang = tl + (h - tl) * q; ri = R - (2 + (pass === 0 ? 20 : pass === 1 ? 13 : 5) * Math.pow(q, 1.2)); ctx.lineTo(sh + Math.cos(ang) * ri, shy + Math.sin(ang) * ri); }
      ctx.closePath();
      ctx.fillStyle = pass === 0 ? 'rgba(120,190,255,' + (0.2 * alpha) + ')' : pass === 1 ? 'rgba(190,230,255,' + (0.42 * alpha) + ')' : 'rgba(255,255,255,' + (0.9 * alpha) + ')';
      ctx.fill();
    }
    if (st === 2 && dir !== 'u') { ctx.fillStyle = 'rgba(255,200,110,' + (0.25 * alpha) + ')'; glow(ctx, sh + Math.cos(h) * R, shy + Math.sin(h) * R, 22, '#ffc070', 0.6 * alpha); }
    ctx.restore();
  }
  function drawParry(ctx, p, now) {
    var perfect = p.parryT > P.PARRY_T - P.PARRY_PERFECT;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    if (p.parryT > 0) {
      var pu = 1 - p.parryT / P.PARRY_T, al = perfect ? 1 : 0.6 * (1 - pu * 0.7);
      ctx.strokeStyle = perfect ? 'rgba(255,248,200,' + al + ')' : 'rgba(255,200,120,' + al + ')'; ctx.lineWidth = perfect ? 3 : 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(6, -24, 21, -1.15, 1.15); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,' + al * 0.7 + ')'; ctx.beginPath(); ctx.arc(6, -24, 17, -1.0, 1.0); ctx.stroke();
      if (perfect) glow(ctx, 22, -24, 22, '#fff0b0', 0.55);
    }
    if (p.parryFlash > 0) {
      var u = 1 - p.parryFlash / 0.3;
      glow(ctx, 18, -26, 34 * (0.6 + u * 0.8), '#fff3b8', 0.9 * (1 - u));
      ctx.strokeStyle = 'rgba(255,248,210,' + (1 - u) + ')'; ctx.lineWidth = 2.4 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(18, -26, 8 + u * 34, 0, TAU); ctx.stroke();
      for (var i = 0; i < 8; i++) { var a = i / 8 * TAU + 0.4, r0 = 6 + u * 12, r1 = 14 + u * 36; ctx.beginPath(); ctx.moveTo(18 + Math.cos(a) * r0, -26 + Math.sin(a) * r0); ctx.lineTo(18 + Math.cos(a) * r1, -26 + Math.sin(a) * r1); ctx.stroke(); }
    }
    ctx.restore();
  }

  // =====================================================================
  //  ПЛАЩ И ШАРФ (верле)
  // =====================================================================
  function initChain(c, n, ax, ay, f, dx, dy) { while (c.length < n) c.push({ x: ax, y: ay }); for (var i = 0; i < c.length; i++) { c[i].x = ax - f * i * dx; c[i].y = ay + i * dy; c[i].ox = c[i].x; c[i].oy = c[i].y; } }
  function stepChain(c, ax, ay, f, p, len, grav, back, damp, flutter, tt, lift) {
    var i, a, b;
    c[0].ox = c[0].x; c[0].oy = c[0].y; c[0].x = ax; c[0].y = ay;
    for (i = 1; i < c.length; i++) {
      b = c[i]; var vx = (b.x - b.ox) * damp, vy = (b.y - b.oy) * damp; b.ox = b.x; b.oy = b.y;
      var fx = -f * back + Math.sin(tt * 7 + i * 0.9) * flutter * (i / c.length), fy = grav - lift;
      b.x += vx + fx; b.y += vy + fy;
    }
    for (var it = 0; it < 4; it++) {
      c[0].x = ax; c[0].y = ay;
      for (i = 1; i < c.length; i++) {
        a = c[i - 1]; b = c[i]; var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 0.001, df = (d - len) / d;
        if (i === 1) { b.x -= dx * df; b.y -= dy * df; } else { a.x += dx * df * 0.5; a.y += dy * df * 0.5; b.x -= dx * df * 0.5; b.y -= dy * df * 0.5; }
      }
    }
  }
  function updateCape(p, dt) {
    var f = p.facing, c = p.cape, s = p.state;
    while (c.length < 8) c.push({ x: c[c.length - 1].x, y: c[c.length - 1].y });
    var ax = p.x + p.w / 2 - f * 3.2, ay = p.y + 9.5, sc = p.scarf || (p.scarf = []);
    if (s === 'dash') { ax -= f * 1; ay += 7; }
    if (s === 'wall') ax += f * 0.5;
    var tt = (p.animT || 0);
    if (!c._init || Math.abs(c[1].x - ax) > 60 || Math.abs(c[1].y - ay) > 60 || p.rewinding > 0) { initChain(c, 8, ax, ay, f, 1.2, 5.2); c._init = true; }
    var air = !p.grounded, lift = 0, back = 0.08 + Math.abs(p.vx) * 0.00068, grav = 0.2;
    if (s === 'glide') { lift = 0.34; back = 0.04; } else if (s === 'run') { back = 0.16 + Math.abs(p.vx) * 0.0004; grav = 0.12; }
    else if (s === 'dash') { back = 0.55; grav = 0.02; }
    stepChain(c, ax, ay, f, p, 4.9, grav, back, 0.972, 0.12, tt, lift);
    if (!sc._init || Math.abs(sc[1] ? sc[1].x - ax : 99) > 60 || p.rewinding > 0) { initChain(sc, 6, ax, ay, f, 1.5, 3); sc._init = true; }
    var nx = p.x + p.w / 2 + f * 1, ny = p.y + 9;
    stepChain(sc, nx, ny, f, p, 4.4, 0.14, 0.2 + Math.abs(p.vx) * 0.001, 0.97, 0.45, tt, lift * 0.7);
  }
  function ribbon(ctx, pts, w0, w1, wEnd, base, hi, dark, outline) {
    var n = pts.length, L = [], Rr = [], i;
    for (i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
      var q = i / (n - 1), w = (q < 0.5 ? w0 + (w1 - w0) * q * 2 : w1 + (wEnd - w1) * (q - 0.5) * 2) / 2;
      L.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w }); Rr.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
    }
    function path() { ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y); for (var i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y); for (i = n - 1; i >= 0; i--) ctx.lineTo(Rr[i].x, Rr[i].y); ctx.closePath(); }
    path(); ctx.lineJoin = 'round'; ctx.strokeStyle = outline; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.fillStyle = base; ctx.fill();
    // тень и блик
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (i = 1; i < n; i++) ctx.lineTo(Rr[i].x, Rr[i].y); for (i = n - 1; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath(); ctx.fillStyle = dark; ctx.fill();
    ctx.strokeStyle = hi; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(L[0].x, L[0].y); for (i = 1; i < n; i++) ctx.lineTo(L[i].x, L[i].y); ctx.stroke();
    return { L: L, R: Rr };
  }
  function drawCape(ctx, p) {
    var c = p.cape, sc = p.scarf;
    ctx.save();
    if (sc && sc._init) { ribbon(ctx, sc, 3.4, 3.2, 4.6, HERO.scarf, '#ffd08a', 'rgba(150,40,10,0.45)', '#2a0c08'); }
    var e = ribbon(ctx, c, 6.6, 4.4, 8.2, HERO.cape, HERO.capeL, 'rgba(70,6,22,0.5)', '#240612');
    var n = c.length - 1; ctx.strokeStyle = HERO.gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(e.L[n].x, e.L[n].y); ctx.lineTo(e.R[n].x, e.R[n].y); ctx.stroke();
    ctx.restore();
  }

  // =====================================================================
  //  УДАР ПО ЦЕЛИ (искры + дуга)
  // =====================================================================
  function drawSlash(ctx, s) {
    var u = 1 - s.life / s.max, a = Math.max(0, Math.min(1, s.life / s.max)), st = s.stage;
    ctx.save(); ctx.translate(s.x + s.f * 14, s.y); ctx.scale(s.f, 1); ctx.globalCompositeOperation = 'lighter';
    var R = 24 + (st === 2 ? 10 : 0) + u * 8, a0, a1;
    if (st === 0) { a0 = -1.2; a1 = 0.9; } else if (st === 1) { a0 = 1.2; a1 = -1.1; } else { a0 = -1.6; a1 = 1.5; }
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath(); var n = 10, i, q, ang, d = a1 < a0 ? -1 : 1;
      for (i = 0; i <= n; i++) { q = i / n; ang = a0 + (a1 - a0) * q; ctx.lineTo(Math.cos(ang) * R, Math.sin(ang) * R); }
      for (i = n; i >= 0; i--) { q = i / n; ang = a0 + (a1 - a0) * q; var rr = R - (pass ? 2 : 7) * Math.sin(q * Math.PI) - 1; ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fillStyle = pass ? 'rgba(255,255,255,' + (0.95 * a) + ')' : 'rgba(150,210,255,' + (0.45 * a) + ')'; ctx.fill();
    }
    glow(ctx, 6, 0, 26 * (1 - u * 0.4), '#fff0c0', 0.8 * a);
    ctx.strokeStyle = 'rgba(255,245,210,' + a + ')'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    var cnt = st === 2 ? 9 : 6;
    for (i = 0; i < cnt; i++) { var rA = i / cnt * TAU + st, r0 = 4 + u * 8, r1 = 10 + u * 26 + (i % 2) * 8; ctx.beginPath(); ctx.moveTo(6 + Math.cos(rA) * r0, Math.sin(rA) * r0); ctx.lineTo(6 + Math.cos(rA) * r1, Math.sin(rA) * r1); ctx.stroke(); }
    ctx.restore();
  }

  // =====================================================================
  //  СНАРЯДЫ
  // =====================================================================
  function drawProjectile(ctx, pr) {
    var x = pr.cx(), y = pr.cy(), r = pr.r, t = pr.g.time, col = pr.color;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, r * 4.2, col, 0.7); glow(ctx, x, y, r * 2.1, col, 0.9);
    var a = Math.atan2(pr.vy, pr.vx);
    ctx.translate(x, y); ctx.rotate(a);
    ctx.globalAlpha = 0.55; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 4.4, 0); ctx.quadraticCurveTo(-r * 1.4, -r * 0.9, r * 0.2, -r * 0.6); ctx.lineTo(r * 0.2, r * 0.6); ctx.quadraticCurveTo(-r * 1.4, r * 0.9, -r * 4.4, 0); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.rotate(-a + t * 6);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.52, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.9; ctx.globalAlpha = 0.8;
    for (var i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 1.9 + Math.sin(t * 20 + i) * 0.6, 0); ctx.stroke(); }
    ctx.restore();
  }
  function drawChakram(ctx, c) {
    var x = c.cx(), y = c.cy(), t = c.g.time;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 30, '#ffd27d', 0.55);
    ctx.globalAlpha = 0.28; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, c.rot - 1.6, c.rot - 0.2); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, 12, c.rot + Math.PI - 1.6, c.rot + Math.PI - 0.2); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.rot);
    ctx.fillStyle = '#ffe9a8';
    for (var i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(9, -2); ctx.lineTo(16, 0); ctx.lineTo(9, 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#b8862e'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 6.2, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff6cf'; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.7 + Math.sin(t * 30) * 0.2; ctx.fillRect(x + Math.cos(c.rot) * 11 - 1, y + Math.sin(c.rot) * 11 - 1, 2, 2); ctx.restore();
  }

  // =====================================================================
  //  ПРЕДМЕТЫ
  // =====================================================================
  var ORB_COL = Art.ORB_COL, orbSpr = {}, heartSpr = null;
  function orbSprite(col) {
    var s = orbSpr[col]; if (s) return s;
    s = makeCanvas(56, 56); var x = s.getContext('2d'), g = x.createRadialGradient(22, 20, 1, 28, 28, 22);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, col); g.addColorStop(0.85, mixC(col, '#1a0830', 0.55)); g.addColorStop(1, mixC(col, '#000000', 0.7));
    x.fillStyle = g; x.beginPath(); x.arc(28, 28, 20, 0, TAU); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 1.5; x.beginPath(); x.arc(28, 28, 19.2, 0, TAU); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.ellipse(20, 18, 6, 3.4, -0.6, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-atop'; var g2 = x.createRadialGradient(34, 36, 2, 34, 36, 18); g2.addColorStop(0, 'rgba(255,255,255,0.35)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g2; x.fillRect(0, 0, 56, 56);
    orbSpr[col] = s; return s;
  }
  function orbGlyph(c, ab, col) {
    c.save(); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.fillStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 1.7; c.lineCap = 'round'; c.lineJoin = 'round';
    c.shadowColor = 'rgba(0,0,0,0)';
    c.beginPath();
    if (ab === 'dash') { c.moveTo(-6, -5); c.lineTo(-1, 0); c.lineTo(-6, 5); c.moveTo(0, -5); c.lineTo(5, 0); c.lineTo(0, 5); }
    else if (ab === 'djump') { c.moveTo(-4, 1); c.lineTo(0, -3); c.lineTo(4, 1); c.moveTo(-4, 6); c.lineTo(0, 2); c.lineTo(4, 6); }
    else if (ab === 'slow') { c.moveTo(-4, -5); c.lineTo(4, -5); c.lineTo(0, 0); c.lineTo(4, 5); c.lineTo(-4, 5); c.lineTo(0, 0); c.closePath(); }
    else if (ab === 'rewind') { c.arc(0, 0, 5, -2.4, 3.6, true); c.moveTo(-5.5, -4); c.lineTo(-5, -0.5); c.lineTo(-1.5, -3); }
    else if (ab === 'wall') { c.moveTo(-3, -6); c.lineTo(-3, 6); c.moveTo(1, -3); c.lineTo(5, -3); c.moveTo(1, 1); c.lineTo(5, 1); c.moveTo(1, 5); c.lineTo(5, 5); }
    else if (ab === 'chakram') { c.arc(0, 0, 5, 0, TAU); c.moveTo(2, 0); c.arc(0, 0, 2, 0, TAU); for (var i = 0; i < 4; i++) { var a = i / 4 * TAU + 0.4; c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5); c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8); } }
    else if (ab === 'smash') { c.moveTo(0, -6); c.lineTo(0, 4); c.moveTo(-4, 0); c.lineTo(0, 5); c.lineTo(4, 0); c.moveTo(-6, 6.5); c.lineTo(6, 6.5); }
    else if (ab === 'hook') { c.arc(0, -3, 2, 0, TAU); c.moveTo(0, -1); c.lineTo(0, 5); c.moveTo(-5, 1); c.quadraticCurveTo(-5, 6, 0, 6); c.quadraticCurveTo(5, 6, 5, 1); }
    c.stroke(); c.restore();
  }
  function heartPath(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + 8.5 * s); c.bezierCurveTo(x - 14 * s, y - 1 * s, x - 9 * s, y - 11 * s, x, y - 4.5 * s); c.bezierCurveTo(x + 9 * s, y - 11 * s, x + 14 * s, y - 1 * s, x, y + 8.5 * s); c.closePath();
  }
  function heartSprite() {
    if (heartSpr) return heartSpr;
    heartSpr = makeCanvas(48, 48); var x = heartSpr.getContext('2d');
    var g = x.createRadialGradient(19, 17, 1, 24, 24, 20); g.addColorStop(0, '#ffb0b0'); g.addColorStop(0.35, '#ff4a56'); g.addColorStop(1, '#a8142c');
    heartPath(x, 24, 22, 1.4); x.fillStyle = g; x.fill(); x.strokeStyle = '#4a0614'; x.lineWidth = 1.6; x.stroke();
    x.strokeStyle = 'rgba(255,230,230,0.9)'; x.lineWidth = 1; x.beginPath(); x.moveTo(24, 31); x.bezierCurveTo(9, 21, 10, 10, 17, 11); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.8)'; x.beginPath(); x.ellipse(15.5, 13.5, 3.4, 2, -0.7, 0, TAU); x.fill();
    return heartSpr;
  }
  function drawPickup(ctx, p) {
    var t = p.g.time, bob = Math.sin(p.t * 3 + p.bob) * (p.settle ? 0 : 3), x = p.cx(), y = p.cy() + bob, i;
    ctx.save();
    if (p.type === 'shard') {
      var sx = Math.abs(Math.cos(p.t * 3 + p.bob)) * 0.7 + 0.3;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 15, '#ffd870', 0.75);
      ctx.globalCompositeOperation = 'source-over'; ctx.translate(x, y); ctx.scale(sx, 1);
      ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.6, -1); ctx.lineTo(0, 7); ctx.lineTo(-4.6, -1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.6, -1); ctx.lineTo(0, 0.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8861a'; ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(4.6, -1); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#4a2a06'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(4.6, -1); ctx.lineTo(0, 7); ctx.lineTo(-4.6, -1); ctx.closePath(); ctx.stroke();
      ctx.scale(1 / sx, 1); ctx.globalCompositeOperation = 'lighter';
      var gl = (Math.sin(p.t * 5 + p.bob) + 1) / 2; ctx.fillStyle = '#fff'; ctx.globalAlpha = gl; ctx.fillRect(-0.5, -11, 1, 6); ctx.fillRect(-3, -8.5, 6, 1);
    } else if (p.type === 'drop') {
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 17, '#ff6a7a', 0.7); ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(heartSprite(), x - 8.5, y - 9, 17, 17);
    } else if (p.type === 'heart') {
      var pu = 1 + Math.sin(p.t * 5) * 0.07 + Math.max(0, Math.sin(p.t * 5 - 0.6)) * 0.05;
      ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 40, '#ff6a7a', 0.55 + Math.sin(p.t * 3) * 0.1);
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.2); ctx.globalAlpha = 0.22; ctx.fillStyle = '#ff9aa8';
      for (i = 0; i < 6; i++) { ctx.rotate(TAU / 6); ctx.beginPath(); ctx.moveTo(10, -1.2); ctx.lineTo(36, 0); ctx.lineTo(10, 1.2); ctx.fill(); }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; var hs = 25 * pu; ctx.drawImage(heartSprite(), x - hs / 2, y - hs / 2 - 1, hs, hs);
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < 3; i++) { var ph = (p.t * 0.7 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.fillStyle = '#ffd0d8'; ctx.fillRect(x + Math.sin(i * 2 + p.bob) * 12 - 0.7, y + 8 - ph * 24, 1.4, 1.4); }
    } else if (p.type === 'orb') {
      var col = ORB_COL[p.data.ab] || '#fff', pul = 0.5 + Math.sin(p.t * 3) * 0.5;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, 64, col, 0.5 + pul * 0.2); glow(ctx, x, y, 30, '#ffffff', 0.35);
      ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * 0.7); ctx.fillStyle = col; ctx.globalAlpha = 0.28 + pul * 0.1;
      for (i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(9, -2.2); ctx.lineTo(58, 0); ctx.lineTo(9, 2.2); ctx.fill(); }
      ctx.rotate(Math.PI / 4); ctx.globalAlpha = 0.16; for (i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(9, -1.4); ctx.lineTo(38, 0); ctx.lineTo(9, 1.4); ctx.fill(); }
      ctx.restore();
      // кольца
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      for (i = 0; i < 2; i++) { ctx.globalAlpha = 0.7; ctx.save(); ctx.translate(x, y); ctx.rotate(p.t * (i ? -1.1 : 0.9) + i * 1.2); ctx.scale(1, 0.34 + 0.12 * i); ctx.beginPath(); ctx.arc(0, 0, 17 + i * 3, 0, TAU); ctx.stroke(); ctx.restore(); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      var os = 1 + Math.sin(p.t * 4) * 0.04; ctx.drawImage(orbSprite(col), x - 28 * os * 0.55, y - 28 * os * 0.55, 56 * os * 0.55, 56 * os * 0.55);
      ctx.save(); ctx.translate(x, y); orbGlyph(ctx, p.data.ab, col); ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < 4; i++) { var a = p.t * 1.8 + i * TAU / 4, rr = 22 + Math.sin(p.t * 2 + i) * 3; var ox = x + Math.cos(a) * rr, oy = y + Math.sin(a) * rr * 0.55; glow(ctx, ox, oy, 6, '#ffffff', 0.8); }
    }
    ctx.restore();
  }

  // =====================================================================
  //  ФОНТАН-ЧЕКПОЙНТ
  // =====================================================================
  function drawCheckpoint(ctx, c) {
    var x = c.cx(), y = c.y + c.h, th = THEMES[c.g.themeKey], t = c.g.time, act = c.active, fl = Math.max(0, c.flash || 0), i;
    var stone = th.stoneLight, dk = mixC(th.stone, '#000000', 0.3), mid = th.stone;
    ctx.save();
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 21, 3, 0, 0, TAU); ctx.fill();
    // ступени/основание
    ctx.fillStyle = dk; ctx.fillRect(x - 20, y - 5, 40, 5); ctx.fillStyle = stone; ctx.fillRect(x - 17, y - 10, 34, 5.5);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 17, y - 10, 34, 1.4); ctx.fillStyle = th.trim; ctx.globalAlpha = 0.8; ctx.fillRect(x - 17, y - 6, 34, 1.2); ctx.globalAlpha = 1;
    // ножка
    var cg = ctx.createLinearGradient(x - 6, 0, x + 6, 0); cg.addColorStop(0, dk); cg.addColorStop(0.5, stone); cg.addColorStop(1, mid);
    ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(x - 4, y - 10); ctx.lineTo(x - 7, y - 21); ctx.lineTo(x + 7, y - 21); ctx.lineTo(x + 4, y - 10); ctx.fill();
    ctx.fillStyle = th.trim; ctx.fillRect(x - 5.5, y - 17, 11, 1.4);
    // чаша
    ctx.fillStyle = dk; ctx.beginPath(); ctx.ellipse(x, y - 23, 16, 5.2, 0, 0, Math.PI); ctx.lineTo(x - 11, y - 20); ctx.quadraticCurveTo(x, y - 14, x + 11, y - 20); ctx.fill();
    ctx.fillStyle = stone; ctx.beginPath(); ctx.ellipse(x, y - 24, 17, 5.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = th.trim; ctx.lineWidth = 1.2; ctx.stroke();
    // вода
    var wc = act ? '#7fe8ff' : '#2e4658';
    ctx.fillStyle = wc; ctx.beginPath(); ctx.ellipse(x, y - 24.4, 14, 3.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = act ? 'rgba(255,255,255,0.7)' : 'rgba(120,150,170,0.35)';
    for (i = 0; i < 3; i++) { var rp = ((t * 0.8 + i / 3) % 1); ctx.globalAlpha = (1 - rp) * (act ? 0.8 : 0.4); ctx.strokeStyle = act ? '#fff' : '#9ab'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(x, y - 24.4, 3 + rp * 11, 1 + rp * 2.9, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (act) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 26, 50, '#6fd8ff', 0.5 + fl * 0.4); glow(ctx, x, y - 26, 26, '#ffffff', 0.35);
      // струя и капли
      var jh = 20 + Math.sin(t * 6) * 1.5;
      var jg = ctx.createLinearGradient(0, y - 24 - jh, 0, y - 24); jg.addColorStop(0, 'rgba(200,245,255,0)'); jg.addColorStop(1, 'rgba(200,245,255,0.7)');
      ctx.fillStyle = jg; ctx.fillRect(x - 1.4, y - 24 - jh, 2.8, jh);
      for (i = 0; i < 14; i++) {
        var ph = (t * 1.0 + i / 14) % 1, side = (i % 2 ? 1 : -1) * (0.6 + (i % 5) * 0.18), dx = side * ph * 15, dy = -4 * ph * (1 - ph) * (jh + 6) * 1.35;
        ctx.globalAlpha = 0.9 * (1 - ph * 0.5); ctx.fillStyle = '#e8fbff'; ctx.fillRect(x + dx - 0.7, y - 24 - jh * 0.35 + dy + ph * jh * 0.35, 1.5, 1.5);
      }
      // руническое кольцо
      ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2; ctx.strokeStyle = '#9fe8ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y - 1, 24, 4.2, 0, 0, TAU); ctx.stroke();
      for (i = 0; i < 8; i++) { var ra = t * 0.8 + i * TAU / 8; ctx.fillStyle = '#c8f4ff'; ctx.fillRect(x + Math.cos(ra) * 24 - 1, y - 1 + Math.sin(ra) * 4.2 - 1, 2, 2); }
      // золотые искры вверх
      ctx.fillStyle = '#ffe9a8';
      for (i = 0; i < 6; i++) { var pp = (t * 0.4 + i / 6) % 1; ctx.globalAlpha = (1 - pp) * 0.9; ctx.fillRect(x + Math.sin(i * 3.1 + t) * 10 - 0.7, y - 28 - pp * 36, 1.4, 1.4); }
      if (fl > 0) { ctx.globalAlpha = fl; glow(ctx, x, y - 24, 80, '#ffffff', 0.9); }
    } else {
      ctx.fillStyle = 'rgba(120,150,170,0.5)'; for (i = 0; i < 2; i++) { var dd = (t * 0.5 + i * 0.5) % 1; ctx.globalAlpha = 0.5 * (1 - dd); ctx.fillRect(x + (i ? 5 : -6) - 0.5, y - 22 + dd * 2, 1, 2); }
    }
    ctx.restore();
  }

  // =====================================================================
  //  РЫЧАГ, ЯКОРЬ, ПОРТАЛ
  // =====================================================================
  function drawLever(ctx, l) {
    var x = l.cx(), y = l.y + l.h, th = THEMES[l.g.themeKey], dt = Math.min(0.05, U.dt());
    var target = l.on ? 0.9 : -0.9; l._a = l._a === undefined ? target : l._a + (target - l._a) * Math.min(1, dt * 16);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y + 0.5, 13, 2.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = mixC(th.stoneDark, '#000000', 0.2); ctx.fillRect(x - 11, y - 7, 22, 7); ctx.fillStyle = th.stoneLight; ctx.fillRect(x - 11, y - 7, 22, 1.4);
    ctx.fillStyle = th.stone; ctx.fillRect(x - 8, y - 12, 16, 5); ctx.fillStyle = th.trim; ctx.fillRect(x - 8, y - 12, 16, 1.2);
    ctx.fillStyle = '#1a1018'; ctx.fillRect(x - 5, y - 14, 10, 3.4);
    ctx.fillStyle = th.trim; ctx.fillRect(x - 9.5, y - 5.6, 1.6, 1.6); ctx.fillRect(x + 7.9, y - 5.6, 1.6, 1.6);
    // индикатор
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y - 5, 9, l.on ? '#6fe08a' : '#ffb04a', 0.7); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = l.on ? '#8aff9a' : '#ffcf6b'; ctx.fillRect(x - 1.2, y - 6, 2.4, 2.4);
    ctx.translate(x, y - 11.5); ctx.rotate(l._a);
    ctx.strokeStyle = '#1a1018'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -17); ctx.stroke();
    ctx.strokeStyle = '#c8c0b0'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -17); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-0.9, -2); ctx.lineTo(-0.9, -16); ctx.stroke();
    ctx.fillStyle = '#1a1018'; ctx.beginPath(); ctx.arc(0, -19, 5.8, 0, TAU); ctx.fill();
    ctx.fillStyle = l.on ? '#5fd87a' : '#ffbe4a'; ctx.beginPath(); ctx.arc(0, -19, 4.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-1.4, -20.4, 1.5, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, 0, -19, 13, l.on ? '#6fe08a' : '#ffcf6b', 0.5 + Math.sin(l.g.time * 4) * 0.1);
    ctx.restore();
  }
  function drawAnchor(ctx, a) {
    var x = a.cx(), y = a.cy(), th = THEMES[a.g.themeKey], t = a.g.time, pul = 0.5 + Math.sin(t * 4) * 0.5;
    ctx.save();
    ctx.fillStyle = mixC(th.stoneDark, '#000000', 0.25); ctx.fillRect(x - 7, y - 21, 14, 5); ctx.fillStyle = th.stoneLight; ctx.fillRect(x - 7, y - 21, 14, 1.2);
    ctx.fillStyle = th.trim; ctx.fillRect(x - 5, y - 19.5, 1.5, 1.5); ctx.fillRect(x + 3.5, y - 19.5, 1.5, 1.5);
    ctx.strokeStyle = '#2a1c0c'; ctx.lineWidth = 3; ctx.setLineDash([2.4, 1.2]); ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 7); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#3a2808'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = th.trim; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 7.5, 3.4, 4.5); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, y, 22 + pul * 4, th.trim, 0.4 + pul * 0.2); glow(ctx, x, y, 9, '#ffffff', 0.3);
    ctx.fillStyle = '#fff'; ctx.globalAlpha = pul; var ra = t * 1.5; ctx.fillRect(x + Math.cos(ra) * 12 - 0.8, y + Math.sin(ra) * 12 - 0.8, 1.6, 1.6);
    ctx.restore();
  }
  function drawPortal(ctx, p) {
    var x = p.cx(), y = p.y + p.h, th = THEMES[p.g.themeKey], t = p.g.time, i;
    var tc = 'rgb(154,209,255)';
    ctx.save();
    // проём
    var hw = 21, top = y - 62;
    ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x - hw, y - 44); ctx.quadraticCurveTo(x - hw, top - 4, x, top - 12); ctx.quadraticCurveTo(x + hw, top - 4, x + hw, y - 44); ctx.lineTo(x + hw, y); ctx.closePath();
    var vg = ctx.createLinearGradient(0, y - 74, 0, y); vg.addColorStop(0, 'rgba(10,6,30,0.85)'); vg.addColorStop(1, 'rgba(30,50,110,0.7)'); ctx.fillStyle = vg; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 6; i++) { var ph = ((t * 0.35 + i / 6) % 1), wx = x + Math.sin(t * 1.6 + i * 1.3) * 9 * (1 - ph * 0.3), wy = y - ph * 72; ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.5; glow(ctx, wx, wy, 14, i % 2 ? '#9ad1ff' : '#c8a2ff', 1); }
    for (i = 0; i < 3; i++) { ctx.globalAlpha = 0.3; ctx.strokeStyle = '#b8dcff'; ctx.lineWidth = 1.2; ctx.beginPath(); for (var yy = 0; yy <= 70; yy += 5) { var xx = x + Math.sin(yy * 0.12 + t * 2.2 + i * 2.1) * (6 + i * 3) * (1 - yy / 120); if (yy === 0) ctx.moveTo(xx, y - yy); else ctx.lineTo(xx, y - yy); } ctx.stroke(); }
    var eg = ctx.createLinearGradient(x - hw, 0, x + hw, 0); eg.addColorStop(0, 'rgba(154,209,255,0.5)'); eg.addColorStop(0.25, 'rgba(154,209,255,0)'); eg.addColorStop(0.75, 'rgba(154,209,255,0)'); eg.addColorStop(1, 'rgba(154,209,255,0.5)'); ctx.globalAlpha = 1; ctx.fillStyle = eg; ctx.fillRect(x - hw, y - 80, hw * 2, 80);
    ctx.restore();
    // каменная рама
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.moveTo(x - hw, y); ctx.lineTo(x - hw, y - 44); ctx.quadraticCurveTo(x - hw, top - 4, x, top - 12); ctx.quadraticCurveTo(x + hw, top - 4, x + hw, y - 44); ctx.lineTo(x + hw, y);
    ctx.strokeStyle = '#1a1030'; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.stroke(); ctx.strokeStyle = mixC(th.stone, th.stoneLight, 0.4); ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = th.trim; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = mixC(th.stone, '#000000', 0.25); ctx.fillRect(x - hw - 5, y - 7, 10, 7); ctx.fillRect(x + hw - 5, y - 7, 10, 7);
    ctx.fillStyle = th.trim; ctx.beginPath(); ctx.moveTo(x, top - 18); ctx.lineTo(x + 5, top - 11); ctx.lineTo(x, top - 5); ctx.lineTo(x - 5, top - 11); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; glow(ctx, x, top - 11, 14, '#c8e8ff', 0.6); glow(ctx, x, y - 30, 48, tc, 0.28);
    // стрелка направления
    var d = p.dir, pu = (t * 1.2) % 1; ctx.strokeStyle = '#dff0ff'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (i = 0; i < 2; i++) { var k = (pu + i * 0.5) % 1, cx = x + d * (-6 + k * 12); ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8; ctx.beginPath(); ctx.moveTo(cx - d * 3, y - 38); ctx.lineTo(cx + d * 2, y - 32); ctx.lineTo(cx - d * 3, y - 26); ctx.stroke(); }
    ctx.restore();
  }

  Art.drawHero = drawHero; Art.updateCape = updateCape; Art.drawCape = drawCape; Art.drawSlash = drawSlash;
  Art.drawProjectile = drawProjectile; Art.drawChakram = drawChakram; Art.drawPickup = drawPickup; Art.drawCheckpoint = drawCheckpoint;
  Art.drawLever = drawLever; Art.drawAnchor = drawAnchor; Art.drawPortal = drawPortal;
})();

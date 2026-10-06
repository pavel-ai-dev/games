'use strict';
// Графика, часть 1: темы, параллакс-фон, тайлы (чанки), архитектура заднего плана, свет, атмосфера.
// Часть 2 (герой, предметы, объекты) — js/art2.js (подключается после art.js, дополняет Art).
var THEMES = {
  garden: {
    name: 'Дворцовый сад',
    sky: ['#2b1b3d', '#8a3f62', '#f09a5a'], far: '#7a4562', mid: '#4f2c52', near: '#2a1733',
    stone: '#a98462', stoneDark: '#5b3b3c', stoneLight: '#e2c08c', trim: '#e8bf6a', moss: '#6f9a4a', dust: '#f0d2a8',
    ambient: 'rgba(30,8,36,0.30)', light: '#ffcf8a', glow: '#ffb15c', accent: '#e8bf6a', rim: '#ffb070', fog: '#e08a6a'
  },
  cistern: {
    name: 'Подземные цистерны',
    sky: ['#04101a', '#0a2a38', '#14525a'], far: '#12475a', mid: '#0c3140', near: '#06161f',
    stone: '#4a6e78', stoneDark: '#1f343d', stoneLight: '#86b8bc', trim: '#5fe0d0', moss: '#2f9a6a', dust: '#a0d8d0',
    ambient: 'rgba(0,14,26,0.45)', light: '#7fe7ff', glow: '#4fd6c8', accent: '#5fe0d0', rim: '#5fe0d0', fog: '#1e6a72'
  },
  ruins: {
    name: 'Пустынные руины',
    sky: ['#4a2a36', '#c9693c', '#f7c06a'], far: '#b8683f', mid: '#94492f', near: '#5a2c22',
    stone: '#c09a68', stoneDark: '#7a5236', stoneLight: '#ecd29a', trim: '#ffd27d', moss: '#9a9a4a', dust: '#f0d9a8',
    ambient: 'rgba(48,18,0,0.20)', light: '#ffe2a0', glow: '#ffbf5c', accent: '#ffd27d', rim: '#ffd890', fog: '#f0a860'
  },
  tower: {
    name: 'Башня Часов',
    sky: ['#080514', '#2a1450', '#6a3086'], far: '#33195e', mid: '#1f1040', near: '#110726',
    stone: '#54447a', stoneDark: '#251b3d', stoneLight: '#9a84c8', trim: '#e0c070', moss: '#6a4aa0', dust: '#c8b8ff',
    ambient: 'rgba(12,0,34,0.38)', light: '#d0b0ff', glow: '#b48aff', accent: '#c8a2ff', rim: '#c8a2ff', fog: '#4a2a80'
  }
};

var Art = (function () {
  var U = {};
  var frameNo = 0, nowMs = 0, rdt = 0.016;
  function rgbOf(c) {
    if (c.charAt(0) === '#') return hex(c);
    var m = c.match(/[\d.]+/g); return [+m[0], +m[1], +m[2]];
  }
  function rgbaC(c, a) { var h = rgbOf(c); return 'rgba(' + (h[0] | 0) + ',' + (h[1] | 0) + ',' + (h[2] | 0) + ',' + a + ')'; }
  function hash2(x, y) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function mixC(a, b, t) { var A = rgbOf(a), B = rgbOf(b); return 'rgb(' + ((A[0] + (B[0] - A[0]) * t) | 0) + ',' + ((A[1] + (B[1] - A[1]) * t) | 0) + ',' + ((A[2] + (B[2] - A[2]) * t) | 0) + ')'; }
  function pick(arr, r) { return arr[Math.min(arr.length - 1, (r * arr.length) | 0)]; }
  U.rgbaC = rgbaC; U.hash2 = hash2; U.rgbOf = rgbOf; U.mixC = mixC; U.pick = pick; U.dt = function () { return rdt; }; U.now = function () { return nowMs / 1000; };

  // ---------- мягкие ореолы: спрайт-градиент, цвет красится один раз
  var glowCache = {};
  function glowSprite(color) {
    var s = glowCache[color]; if (s) return s;
    s = makeCanvas(64, 64); var x = s.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.62)'); g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, 64, 64);
    glowCache[color] = s; return s;
  }
  // ctx.globalCompositeOperation задаёт вызывающий ('lighter' обычно)
  function glow(ctx, x, y, r, color, a) { ctx.globalAlpha = a; ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2); }
  U.glow = glow; U.glowSprite = glowSprite;

  // ---------- спрайт шестерни
  var gearCache = {};
  function gearSprite(teeth, r, col, edge) {
    var key = teeth + '|' + r + '|' + col + '|' + edge, s = gearCache[key]; if (s) return s;
    var sz = Math.ceil(r * 2 + 10); s = makeCanvas(sz, sz); var x = s.getContext('2d'), c = sz / 2;
    var ro = r, ri = r * 0.84, i, a;
    x.beginPath();
    for (i = 0; i < teeth; i++) {
      a = i / teeth * TAU; var w = TAU / teeth;
      x.lineTo(c + Math.cos(a) * ri, c + Math.sin(a) * ri);
      x.lineTo(c + Math.cos(a + w * 0.12) * ro, c + Math.sin(a + w * 0.12) * ro);
      x.lineTo(c + Math.cos(a + w * 0.42) * ro, c + Math.sin(a + w * 0.42) * ro);
      x.lineTo(c + Math.cos(a + w * 0.54) * ri, c + Math.sin(a + w * 0.54) * ri);
    }
    x.closePath(); x.fillStyle = col; x.fill();
    x.strokeStyle = edge; x.lineWidth = Math.max(1, r * 0.04); x.stroke();
    x.globalCompositeOperation = 'destination-out';
    x.beginPath(); x.arc(c, c, r * 0.62, 0, TAU); x.fill();
    for (i = 0; i < 5; i++) { /* окна между спицами */ }
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = col; x.lineWidth = r * 0.12; x.beginPath(); x.arc(c, c, r * 0.62, 0, TAU); x.stroke();
    x.lineWidth = r * 0.11; x.beginPath();
    for (i = 0; i < 6; i++) { a = i / 6 * TAU; x.moveTo(c, c); x.lineTo(c + Math.cos(a) * r * 0.62, c + Math.sin(a) * r * 0.62); }
    x.stroke();
    x.beginPath(); x.arc(c, c, r * 0.16, 0, TAU); x.fillStyle = col; x.fill(); x.strokeStyle = edge; x.lineWidth = 1; x.stroke();
    gearCache[key] = s; return s;
  }
  U.gearSprite = gearSprite;

  // =====================================================================
  //  ПАРАЛЛАКС-ФОН
  // =====================================================================
  var bgCache = {};
  function lay(W, H, fn, seed, C) { var c = makeCanvas(W, H), x = c.getContext('2d'); fn(x, mulberry32(seed), W, H, C); return c; }
  function rep(W, cx, hw, f) { f(cx); if (cx - hw < 0) f(cx + W); if (cx + hw > W) f(cx - W); }
  function haze(x, W, H, color, a0, a1) {
    x.save(); x.globalCompositeOperation = 'source-atop';
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, rgbaC(color, a0)); g.addColorStop(1, rgbaC(color, a1));
    x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore();
  }
  function dome(x, cx, by, r, hh, col) {
    x.fillStyle = col; x.beginPath(); x.moveTo(cx - r, by);
    x.bezierCurveTo(cx - r * 1.05, by - hh * 0.75, cx - r * 0.3, by - hh * 0.85, cx, by - hh * 1.3);
    x.bezierCurveTo(cx + r * 0.3, by - hh * 0.85, cx + r * 1.05, by - hh * 0.75, cx + r, by); x.closePath(); x.fill();
    x.fillRect(cx - 0.8, by - hh * 1.3 - 9, 1.6, 10);
  }
  function minaret(x, cx, by, h, w, col) {
    x.fillStyle = col; x.fillRect(cx - w / 2, by - h, w, h);
    x.fillRect(cx - w * 0.9, by - h * 0.78, w * 1.8, 3);
    x.beginPath(); x.moveTo(cx - w * 0.75, by - h); x.lineTo(cx, by - h - w * 3.2); x.lineTo(cx + w * 0.75, by - h); x.fill();
    x.fillRect(cx - 0.6, by - h - w * 3.2 - 6, 1.2, 7);
  }
  function cypress(x, cx, by, h, w, col) {
    x.fillStyle = col; x.beginPath(); x.moveTo(cx, by - h);
    x.bezierCurveTo(cx + w, by - h * 0.6, cx + w * 0.8, by - h * 0.15, cx + w * 0.3, by);
    x.lineTo(cx - w * 0.3, by); x.bezierCurveTo(cx - w * 0.8, by - h * 0.15, cx - w, by - h * 0.6, cx, by - h); x.fill();
  }
  function pointedArch(x, x0, x1, by, rise) {
    var m = (x0 + x1) / 2; x.moveTo(x0, by); x.quadraticCurveTo(x0, by - rise * 0.62, m, by - rise); x.quadraticCurveTo(x1, by - rise * 0.62, x1, by); x.closePath();
  }
  function column(x, cx, by, w, h, col, rim) {
    x.fillStyle = col;
    x.fillRect(cx - w / 2, by - h, w, h);
    x.fillRect(cx - w * 0.72, by - 9, w * 1.44, 9); x.fillRect(cx - w * 0.62, by - 14, w * 1.24, 5);
    var ty = by - h;
    x.beginPath(); x.moveTo(cx - w / 2, ty + 14); x.quadraticCurveTo(cx - w * 0.95, ty + 8, cx - w * 0.95, ty - 2); x.lineTo(cx + w * 0.95, ty - 2); x.quadraticCurveTo(cx + w * 0.95, ty + 8, cx + w / 2, ty + 14); x.closePath(); x.fill();
    x.fillRect(cx - w * 1.05, ty - 8, w * 2.1, 7);
    if (rim) { x.save(); x.globalCompositeOperation = 'source-atop'; x.fillStyle = rim; x.fillRect(cx + w * 0.18, ty - 8, w * 0.34, h + 8); x.restore(); }
  }
  function bush(x, cx, by, r, col) {
    x.fillStyle = col; for (var i = 0; i < 6; i++) { var a = i / 6; x.beginPath(); x.arc(cx + (a - 0.5) * r * 2.2, by - r * 0.4 - Math.sin(a * 3.14) * r * 0.7, r * (0.45 + Math.sin(a * 3.14) * 0.35), 0, TAU); x.fill(); }
  }
  function vine(x, r, x0, y0, len, col, leaf, flower) {
    x.strokeStyle = col; x.lineWidth = 1.4; x.beginPath(); x.moveTo(x0, y0);
    var sw = (r() - 0.5) * 14; x.bezierCurveTo(x0 + sw, y0 + len * 0.3, x0 - sw, y0 + len * 0.65, x0 + sw * 0.4, y0 + len); x.stroke();
    x.fillStyle = leaf || col;
    var n = (len / 7) | 0;
    for (var i = 1; i <= n; i++) {
      var t = i / (n + 1), py = y0 + len * t, px = x0 + Math.sin(t * 6 + x0) * sw * 0.5 * (1 - t) + sw * 0.4 * t;
      var s = i % 2 ? 1 : -1; x.save(); x.translate(px, py); x.rotate(s * 0.7); x.beginPath(); x.ellipse(s * 3.2, 0, 3.6, 1.7, 0, 0, TAU); x.fill(); x.restore();
    }
    if (flower) { x.fillStyle = flower; x.beginPath(); x.arc(x0 + sw * 0.4, y0 + len, 2.2, 0, TAU); x.fill(); }
  }

  function cloudStrip(W, H, col, seed) {
    return lay(W, H, function (x, r, W, H) {
      for (var i = 0; i < 9; i++) {
        var cx = r() * W, cy = H * (0.35 + r() * 0.35), w = 70 + r() * 110;
        rep(W, cx, w, function (cx) {
          for (var k = 0; k < 7; k++) {
            x.fillStyle = rgbaC(col, 0.07 + r() * 0.05);
            x.beginPath(); x.ellipse(cx + (r() - 0.5) * w, cy + (r() - 0.5) * 10, w * (0.3 + r() * 0.3), 5 + r() * 9, 0, 0, TAU); x.fill();
          }
        });
      }
    }, seed);
  }

  // ---- параметры по темам
  function bakeGarden(th) {
    var o = { layers: [] }, C = th;
    o.far = lay(1000, 190, function (x, r, W, H) {
      x.fillStyle = C.far; x.beginPath(); x.moveTo(0, H);
      for (var i = 0; i <= W; i += 16) x.lineTo(i, H - 40 - Math.sin(i * TAU * 2 / W) * 12 - Math.sin(i * TAU * 5 / W + 1) * 6);
      x.lineTo(W, H); x.fill();
      var px = 10;
      while (px < W - 80) {
        var bw = 18 + r() * 36, bh = 36 + r() * 66, by = H - 34, k = r();
        x.fillStyle = C.far; x.fillRect(px, by - bh, bw, bh + 34);
        if (k < 0.45) dome(x, px + bw / 2, by - bh, bw * 0.56, bw * 0.62, C.far);
        else if (k < 0.75) minaret(x, px + bw * (r() < 0.5 ? 0.15 : 0.85), by - bh + 6, 50 + r() * 40, 4, C.far);
        else { x.beginPath(); x.moveTo(px - 2, by - bh); x.lineTo(px + bw / 2, by - bh - 14); x.lineTo(px + bw + 2, by - bh); x.fill(); }
        x.fillStyle = 'rgba(255,190,120,0.55)';
        for (var w = 0; w < 3; w++) if (r() < 0.6) x.fillRect(px + 3 + r() * (bw - 8), by - bh + 6 + r() * (bh - 12), 1.6, 2.4);
        px += bw + 4 + r() * 22;
      }
      haze(x, W, H, C.fog, 0.2, 0.8);
    }, 11);
    o.mid = lay(1200, 250, function (x, r, W, H) {
      var bay = 120, nb = (W / bay) | 0, top = H - 128;
      x.fillStyle = C.mid; x.fillRect(0, top, W, 128);
      for (var i = 0; i < nb; i++) {
        var cx = i * bay + bay / 2;
        if (r() < 0.55) dome(x, cx, top, 26 + r() * 10, 30 + r() * 14, C.mid);
        else if (r() < 0.5) minaret(x, cx + (r() - 0.5) * 30, top + 4, 60 + r() * 40, 5, C.mid);
        x.fillStyle = C.mid; x.fillRect(i * bay - 3, top - 10, 7, 16);
      }
      x.globalCompositeOperation = 'destination-out';
      for (i = 0; i < nb; i++) { x.beginPath(); pointedArch(x, i * bay + 24, i * bay + bay - 24, H, 106); x.fill(); }
      x.globalCompositeOperation = 'source-over';
      x.globalCompositeOperation = 'source-atop'; x.strokeStyle = rgbaC(C.rim, 0.5); x.lineWidth = 2;
      for (i = 0; i < nb; i++) { x.beginPath(); x.moveTo(i * bay + 24, H); x.quadraticCurveTo(i * bay + 24, H - 66, i * bay + bay / 2, H - 106); x.stroke(); }
      x.globalCompositeOperation = 'source-over';
      for (i = 0; i < nb; i++) if (r() < 0.8) cypress(x, i * bay + (r() < 0.5 ? 6 : bay - 6), H, 90 + r() * 40, 11, C.mid);
      haze(x, W, H, C.fog, 0.05, 0.5);
    }, 23);
    o.near = lay(1300, 300, function (x, r, W, H) {
      var cx = 50;
      while (cx < W - 80) {
        var cw = 22 + r() * 10, ch = H * (0.7 + r() * 0.25);
        column(x, cx, H, cw, ch, C.near, rgbaC(C.rim, 0.28));
        if (r() < 0.6) bush(x, cx + (r() - 0.5) * 60, H, 18 + r() * 14, C.near);
        if (r() < 0.5) vine(x, r, cx - cw, H - ch + 8, 40 + r() * 60, C.near, C.near, null);
        cx += cw + 170 + r() * 220;
      }
    }, 37);
    o.top = lay(900, 120, function (x, r, W, H) {
      x.fillStyle = C.near; x.fillRect(0, 0, W, 6);
      for (var i = 0; i < 14; i++) vine(x, r, r() * W, 0, 30 + r() * 80, C.near, C.near, r() < 0.3 ? '#ff6f8a' : null);
      for (i = 0; i < 3; i++) {
        var lx = r() * W; x.fillStyle = C.near; x.fillRect(lx - 0.7, 0, 1.4, 22); x.beginPath(); x.arc(lx, 28, 6, 0, TAU); x.fill();
        var g = x.createRadialGradient(lx, 28, 0, lx, 28, 18); g.addColorStop(0, 'rgba(255,200,120,0.9)'); g.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = g; x.fillRect(lx - 18, 10, 36, 36);
        x.fillStyle = '#ffd890'; x.beginPath(); x.arc(lx, 28, 2.6, 0, TAU); x.fill();
      }
    }, 41);
    o.clouds = [cloudStrip(700, 70, '#ffd0a8', 3), cloudStrip(900, 60, '#ff9a8a', 4)];
    o.sunCol = '#ffb070'; o.sun = { x: 0.68, y: 0.58, r: 30 };
    o.stars = 40;
    return o;
  }

  function bakeCistern(th) {
    var o = {}, C = th;
    o.far = lay(1000, 240, function (x, r, W, H) {
      var bay = 125, nb = (W / bay) | 0;
      x.fillStyle = C.far; x.fillRect(0, H - 150, W, 150);
      x.globalCompositeOperation = 'destination-out';
      for (var i = 0; i < nb; i++) { x.beginPath(); pointedArch(x, i * bay + 18, i * bay + bay - 18, H, 140); x.fill(); }
      x.globalCompositeOperation = 'source-over';
      x.globalCompositeOperation = 'source-atop'; x.strokeStyle = rgbaC(C.trim, 0.25); x.lineWidth = 1.6;
      for (i = 0; i < nb; i++) { x.beginPath(); x.moveTo(i * bay + 18, H); x.quadraticCurveTo(i * bay + 18, H - 87, i * bay + bay / 2, H - 140); x.stroke(); }
      x.globalCompositeOperation = 'source-over';
      haze(x, W, H, C.fog, 0.35, 0.85);
    }, 51);
    o.mid = lay(1100, 270, function (x, r, W, H) {
      var wy = H - 46, cx = 40;
      var draw = function (alpha, flip) {
        x.save(); if (flip) { x.translate(0, wy * 2); x.scale(1, -1); }
        x.beginPath(); x.rect(0, 0, W, flip ? wy * 2 : wy); x.clip();
        x.globalAlpha = alpha; var rr = mulberry32(77), c2 = 40;
        while (c2 < W - 40) { var cw = 24 + rr() * 14; column(x, c2, wy, cw, 150 + rr() * 80, C.mid, rgbaC(C.rim, 0.25)); c2 += cw + 110 + rr() * 140; }
        x.restore();
      };
      draw(1, false); x.save(); x.beginPath(); x.rect(0, wy, W, H - wy); x.clip(); draw(0.28, true); x.restore();
      var g = x.createLinearGradient(0, wy, 0, H); g.addColorStop(0, 'rgba(60,200,200,0.35)'); g.addColorStop(1, 'rgba(6,30,40,0.85)'); x.fillStyle = g; x.fillRect(0, wy, W, H - wy);
      x.fillStyle = 'rgba(160,255,240,0.5)'; x.fillRect(0, wy, W, 1.2);
      haze(x, W, H, C.fog, 0.12, 0.5);
    }, 53);
    o.near = lay(1300, 300, function (x, r, W, H) {
      var cx = 70;
      while (cx < W - 80) { var cw = 24 + r() * 12; column(x, cx, H, cw, H * (0.7 + r() * 0.25), C.near, rgbaC(C.rim, 0.22)); cx += cw + 200 + r() * 240; }
      // трубы
      x.fillStyle = C.near; x.fillRect(0, 36, W, 12); x.fillRect(0, 62, W, 6);
      for (var i = 0; i < 9; i++) { var px = r() * W; x.fillRect(px, 30, 7, 24); x.fillRect(px - 1, 30, 9, 3); }
    }, 57);
    o.top = lay(900, 130, function (x, r, W, H) {
      x.fillStyle = C.near; x.fillRect(0, 0, W, 8);
      for (var i = 0; i < 20; i++) {
        var sx = r() * W, sw = 6 + r() * 12, sl = 14 + r() * 56;
        x.beginPath(); x.moveTo(sx - sw / 2, 4); x.lineTo(sx, 4 + sl); x.lineTo(sx + sw / 2, 4); x.fill();
        if (r() < 0.4) { x.fillStyle = 'rgba(120,255,230,0.8)'; x.beginPath(); x.arc(sx, 6 + sl, 1.6, 0, TAU); x.fill(); x.fillStyle = C.near; }
      }
      for (i = 0; i < 4; i++) { var cx2 = r() * W; x.strokeStyle = C.near; x.lineWidth = 2; x.setLineDash([3, 2]); x.beginPath(); x.moveTo(cx2, 0); x.lineTo(cx2 + (r() - 0.5) * 8, 40 + r() * 50); x.stroke(); x.setLineDash([]); }
    }, 59);
    // лучи света (вертикальные «окна» в потолке)
    o.rays = lay(160, 300, function (x, r, W, H) {
      var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(150,255,245,0.55)'); g.addColorStop(0.7, 'rgba(120,230,230,0.12)'); g.addColorStop(1, 'rgba(100,220,220,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(50, 0); x.lineTo(110, 0); x.lineTo(150, H); x.lineTo(10, H); x.closePath(); x.fill();
    }, 61);
    o.caustic = lay(128, 128, function (x, r, W, H) {
      x.strokeStyle = 'rgba(180,255,245,0.7)'; x.lineWidth = 1.2;
      for (var i = 0; i < 16; i++) {
        var cx = r() * W, cy = r() * H, rr = 8 + r() * 14;
        for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) {
          x.beginPath(); x.ellipse(cx + dx * W, cy + dy * H, rr, rr * (0.4 + r() * 0.4), r() * 3, 0, TAU * (0.6 + r() * 0.3)); x.stroke();
        }
      }
    }, 63);
    return o;
  }

  function bakeRuins(th) {
    var o = {}, C = th;
    o.far = lay(1100, 170, function (x, r, W, H) {
      x.fillStyle = C.far;
      x.beginPath(); x.moveTo(0, H); for (var i = 0; i <= W; i += 14) x.lineTo(i, H - 30 - Math.max(0, Math.sin(i * TAU * 3 / W)) * 30 - Math.sin(i * TAU * 7 / W) * 5); x.lineTo(W, H); x.fill();
      var px = 40;
      while (px < W - 160) {
        var k = r(), by = H - 36;
        if (k < 0.3) { var bw = 70 + r() * 70, bh = 40 + r() * 40; x.beginPath(); x.moveTo(px, by); x.lineTo(px + 10, by - bh); x.lineTo(px + bw - 10, by - bh); x.lineTo(px + bw, by); x.fill(); px += bw + 30; }
        else if (k < 0.5) { var pw = 90 + r() * 40; for (var s = 0; s < 6; s++) x.fillRect(px + s * 6, by - (s + 1) * 14, pw - s * 12, 14); px += pw + 30; }
        else if (k < 0.7) { x.beginPath(); x.moveTo(px, by); x.lineTo(px + 4, by - 70 - r() * 30); x.lineTo(px + 8, by); x.fill(); px += 50; }
        else { for (var c2 = 0; c2 < 4; c2++) x.fillRect(px + c2 * 18, by - 30 - r() * 24, 8, 60); px += 90; }
      }
      haze(x, W, H, C.fog, 0.3, 0.85);
    }, 71);
    o.mid = lay(1200, 230, function (x, r, W, H) {
      x.fillStyle = C.mid;
      x.beginPath(); x.moveTo(0, H); for (var i = 0; i <= W; i += 12) x.lineTo(i, H - 28 - Math.sin(i * TAU * 2 / W) * 14 - Math.sin(i * TAU * 6 / W + 2) * 5); x.lineTo(W, H); x.fill();
      var px = 30;
      while (px < W - 200) {
        var k = r(), by = H - 34;
        if (k < 0.4) { // разбитая колоннада
          for (var c2 = 0; c2 < 4; c2++) { var ch = 40 + r() * 80; column(x, px + c2 * 44, by, 14, ch, C.mid, rgbaC(C.rim, 0.3)); }
          x.fillRect(px - 14, by - 150, 60, 10);
          px += 200;
        } else if (k < 0.7) { // арка
          x.fillRect(px, by - 130, 150, 130);
          x.globalCompositeOperation = 'destination-out'; x.beginPath(); pointedArch(x, px + 30, px + 120, by + 2, 90); x.fill();
          x.beginPath(); x.moveTo(px - 2, by - 130); x.lineTo(px + 40 + r() * 60, by - 130); x.lineTo(px + 20, by - 90 - r() * 20); x.closePath(); x.fill();
          x.globalCompositeOperation = 'source-over'; px += 190;
        } else { // голова-колосс
          x.beginPath(); x.ellipse(px + 40, by - 40, 36, 48, 0, 0, TAU); x.fill(); x.fillRect(px + 14, by - 20, 52, 28);
          x.fillStyle = rgbaC(C.fog, 0.4); x.fillRect(px + 22, by - 52, 12, 5); x.fillRect(px + 46, by - 52, 12, 5); x.fillStyle = C.mid;
          px += 150;
        }
      }
      haze(x, W, H, C.fog, 0.1, 0.55);
    }, 73);
    o.near = lay(1300, 290, function (x, r, W, H) {
      x.fillStyle = C.near;
      x.beginPath(); x.moveTo(0, H); for (var i = 0; i <= W; i += 10) x.lineTo(i, H - 22 - Math.sin(i * TAU * 3 / W) * 10 - Math.sin(i * TAU * 9 / W) * 4); x.lineTo(W, H); x.fill();
      var cx = 60;
      while (cx < W - 90) { var cw = 24 + r() * 10, ch = 70 + r() * 150; column(x, cx, H - 10, cw, ch, C.near, rgbaC(C.rim, 0.3)); if (r() < 0.4) { x.save(); x.translate(cx + 40, H - 26); x.rotate(-0.5); column(x, 0, 0, 16, 40, C.near); x.restore(); } cx += cw + 190 + r() * 200; }
    }, 77);
    o.top = lay(900, 110, function (x, r, W, H) {
      x.fillStyle = C.near; x.fillRect(0, 0, W, 5);
      for (var i = 0; i < 8; i++) {
        var bx = r() * W, bw = 10 + r() * 10, bl = 30 + r() * 60;
        x.fillStyle = C.near; x.fillRect(bx - 0.8, 0, 1.6, 8);
        x.beginPath(); x.moveTo(bx - bw / 2, 8); x.lineTo(bx + bw / 2, 8); var n = 4; for (var k = n; k >= 0; k--) x.lineTo(bx - bw / 2 + k * bw / n + (k % 2 ? 0 : 0), 8 + bl - (k % 2 ? 7 : 0) - r() * 6); x.closePath(); x.fill();
      }
    }, 79);
    o.sunCol = '#ffd890'; o.sun = { x: 0.62, y: 0.55, r: 42 };
    o.clouds = [cloudStrip(900, 60, '#ffe0a8', 5)];
    o.stars = 0;
    return o;
  }

  function bakeTower(th) {
    var o = {}, C = th;
    o.far = lay(1000, 300, function (x, r, W, H) {
      var px = 10;
      while (px < W - 60) {
        var bw = 16 + r() * 30, bh = 80 + r() * 160;
        x.fillStyle = C.far; x.fillRect(px, H - bh, bw, bh);
        x.beginPath(); x.moveTo(px - 2, H - bh); x.lineTo(px + bw / 2, H - bh - 30 - r() * 50); x.lineTo(px + bw + 2, H - bh); x.fill();
        x.fillStyle = 'rgba(255,220,150,0.7)'; for (var w = 0; w < 4; w++) if (r() < 0.6) x.fillRect(px + 3 + r() * (bw - 7), H - bh + 8 + r() * (bh - 20), 1.8, 3);
        if (r() < 0.3) { x.fillStyle = C.far; x.fillRect(px + bw, H - bh * 0.6, 40, 3); }
        px += bw + 6 + r() * 24;
      }
      haze(x, W, H, C.fog, 0.35, 0.8);
    }, 91);
    o.mid = lay(1100, 300, function (x, r, W, H) {
      x.fillStyle = C.mid; var cx = 40;
      while (cx < W - 40) { var cw = 20 + r() * 12; x.fillRect(cx - cw / 2, 0, cw, H); x.fillStyle = rgbaC(C.trim, 0.25); x.fillRect(cx - 0.6, 0, 1.2, H); x.fillStyle = C.mid; cx += cw + 130 + r() * 120; }
      x.globalAlpha = 1; haze(x, W, H, C.fog, 0.1, 0.5);
    }, 93);
    o.near = lay(1300, 300, function (x, r, W, H) {
      var cx = 80;
      while (cx < W - 80) { var cw = 26 + r() * 10; column(x, cx, H, cw, H * (0.78 + r() * 0.2), C.near, rgbaC(C.rim, 0.35)); x.fillStyle = rgbaC(C.trim, 0.45); x.fillRect(cx - 0.8, H * 0.2, 1.6, H * 0.8); x.fillStyle = C.near; cx += cw + 210 + r() * 200; }
    }, 97);
    o.top = lay(900, 130, function (x, r, W, H) {
      x.fillStyle = C.near; x.fillRect(0, 0, W, 7);
      for (var i = 0; i < 9; i++) {
        var cx = r() * W, len = 20 + r() * 80; x.strokeStyle = C.near; x.lineWidth = 2; x.setLineDash([4, 2.5]); x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, len); x.stroke(); x.setLineDash([]);
        if (r() < 0.5) x.drawImage(gearSprite(8, 8 + r() * 6, C.near, C.near), cx - 12, len - 4);
      }
    }, 99);
    o.moon = lay(360, 360, function (x, r, W, H) {
      var c = W / 2, g = x.createRadialGradient(c, c, 60, c, c, 180); g.addColorStop(0, 'rgba(210,170,255,0.5)'); g.addColorStop(1, 'rgba(120,60,200,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.fillStyle = 'rgba(40,18,80,0.9)'; x.beginPath(); x.arc(c, c, 118, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(232,200,120,0.75)'; x.lineWidth = 3; x.beginPath(); x.arc(c, c, 118, 0, TAU); x.stroke();
      x.lineWidth = 1.2; x.beginPath(); x.arc(c, c, 100, 0, TAU); x.stroke();
      for (var i = 0; i < 12; i++) { var a = i / 12 * TAU; x.lineWidth = i % 3 === 0 ? 3 : 1.4; x.beginPath(); x.moveTo(c + Math.cos(a) * 88, c + Math.sin(a) * 88); x.lineTo(c + Math.cos(a) * 100, c + Math.sin(a) * 100); x.stroke(); }
      x.fillStyle = 'rgba(232,200,120,0.8)'; x.beginPath(); x.arc(c, c, 6, 0, TAU); x.fill();
    }, 101);
    o.gears = [];
    var gr = mulberry32(103);
    for (var i = 0; i < 7; i++) o.gears.push({ x: i * 160 + gr() * 80, y: 70 + gr() * 170, r: 34 + gr() * 44, teeth: 10 + ((gr() * 8) | 0), sp: (0.12 + gr() * 0.22) * (i % 2 ? 1 : -1), a0: gr() * 6 });
    o.stars = 70;
    return o;
  }

  var BAKE = { garden: bakeGarden, cistern: bakeCistern, ruins: bakeRuins, tower: bakeTower };
  function bgFor(key) {
    var o = bgCache[key]; if (o) return o;
    var th = THEMES[key]; o = BAKE[key](th);
    var sc = makeCanvas(4, 256), sx = sc.getContext('2d'), g = sx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, th.sky[0]); g.addColorStop(0.5, th.sky[1]); g.addColorStop(1, th.sky[2]); sx.fillStyle = g; sx.fillRect(0, 0, 4, 256);
    o.sky = sc;
    var r = mulberry32(5); o.starList = [];
    for (var i = 0; i < (o.stars || 0); i++) o.starList.push({ x: r() * 720, y: r() * 190, a: 0.25 + r() * 0.65, s: r() < 0.15 ? 1.8 : 1, ph: r() * 6, sp: 1 + r() * 3 });
    // лучи света для garden/ruins: диагональные лучи
    if (key === 'garden' || key === 'ruins') {
      o.rays = lay(300, 340, function (x, r, W, H) {
        for (var i = 0; i < 4; i++) {
          var x0 = 40 + i * 62 + r() * 20, w = 12 + r() * 26;
          var g = x.createLinearGradient(x0, 0, x0 - 150, H); g.addColorStop(0, 'rgba(255,225,170,0.95)'); g.addColorStop(1, 'rgba(255,200,120,0)');
          x.fillStyle = g; x.beginPath(); x.moveTo(x0, 0); x.lineTo(x0 + w, 0); x.lineTo(x0 + w - 150, H); x.lineTo(x0 - 150 - w * 0.5, H); x.closePath(); x.fill();
        }
      }, 111);
    }
    bgCache[key] = o; return o;
  }

  function drawBackground(ctx, cam, themeKey, t, vw, vh) {
    frameNo++;
    var now = performance.now(); rdt = Math.min(0.05, (now - nowMs) / 1000 || 0.016); nowMs = now;
    var th = THEMES[themeKey], bg = bgFor(themeKey), i, s;
    ctx.drawImage(bg.sky, 0, 0, 4, 256, 0, 0, vw, vh);
    // небесные тела
    if (bg.sun) {
      var sxp = vw * bg.sun.x - cam.x * 0.012, syp = vh * bg.sun.y - cam.y * 0.02;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, sxp, syp, bg.sun.r * 6.5, bg.sunCol, 0.55 + Math.sin(t * 0.4) * 0.05);
      glow(ctx, sxp, syp, bg.sun.r * 2.4, '#fff0c0', 0.5);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff6dc'; ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(sxp, syp, bg.sun.r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (bg.moon) {
      var mxp = vw * 0.74 - cam.x * 0.015, myp = vh * 0.33 - cam.y * 0.02;
      ctx.drawImage(bg.moon, mxp - 180, myp - 180);
      ctx.strokeStyle = 'rgba(240,210,140,0.9)'; ctx.lineCap = 'round'; ctx.lineWidth = 3;
      var ha = t * 0.05; ctx.beginPath(); ctx.moveTo(mxp, myp); ctx.lineTo(mxp + Math.cos(ha) * 70, myp + Math.sin(ha) * 70); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(mxp, myp); ctx.lineTo(mxp + Math.cos(ha * 12) * 96, myp + Math.sin(ha * 12) * 96); ctx.stroke();
    }
    if (bg.starList.length) {
      var so = -((cam.x * 0.02) % 720); ctx.fillStyle = '#fff';
      for (i = 0; i < bg.starList.length; i++) {
        s = bg.starList[i]; ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(t * s.sp + s.ph));
        ctx.fillRect(s.x + so, s.y - cam.y * 0.01, s.s, s.s); ctx.fillRect(s.x + so + 720, s.y - cam.y * 0.01, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }
    var cl = bg.clouds;
    if (cl) for (i = 0; i < cl.length; i++) {
      var c = cl[i], cw = c.width, off = -(((cam.x * (0.03 + i * 0.02) + t * (4 + i * 3)) % cw)); if (off > 0) off -= cw;
      ctx.globalAlpha = 0.9; for (var cx = off; cx < vw; cx += cw) ctx.drawImage(c, cx, vh * (0.18 + i * 0.16) - cam.y * 0.02);
      ctx.globalAlpha = 1;
    }
    function layer(img, f, anchor, alpha, fy) {
      var w = img.width, off = -((cam.x * f) % w); if (off > 0) off -= w;
      var y = anchor - Math.min(cam.y * (fy === undefined ? f * 0.3 : fy), 60);
      ctx.globalAlpha = alpha;
      for (var x = off; x < vw; x += w) ctx.drawImage(img, x, y - img.height);
      ctx.globalAlpha = 1;
    }
    layer(bg.far, 0.1, vh * 0.94, 1);
    if (themeKey === 'tower') {
      // вращающиеся шестерни
      var gs = bg.gears, gw = 1100;
      for (i = 0; i < gs.length; i++) {
        var g = gs[i], gx = g.x - ((cam.x * 0.2) % gw), spr = gearSprite(g.teeth, g.r, i % 2 ? '#2c1a52' : '#37206a', 'rgba(224,192,112,0.55)');
        for (var k = 0; k < 2; k++) {
          var px = gx + k * gw; if (px < -g.r - 10) px += gw; if (px > vw + g.r + 10) continue;
          ctx.save(); ctx.translate(px, g.y - cam.y * 0.04); ctx.rotate(g.a0 + t * g.sp); ctx.drawImage(spr, -spr.width / 2, -spr.height / 2); ctx.restore();
        }
      }
      layer(bg.mid, 0.26, vh * 1.0, 0.6);
    } else layer(bg.mid, 0.24, vh * 1.0, 1);
    if (themeKey === 'cistern') {
      // лучи сквозь своды, мерцание
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < 4; i++) {
        var rx = ((i * 260 + 90) - cam.x * 0.3) % 1040; if (rx < -200) rx += 1040;
        ctx.globalAlpha = 0.16 + Math.sin(t * 0.8 + i * 1.7) * 0.05; ctx.drawImage(bg.rays, rx - 80, 0, 160, vh * 1.05);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
    layer(bg.near, 0.45, vh * 1.05, 0.95, 0.12);
    // верхняя бахрома
    var w2 = bg.top.width, o2 = -((cam.x * 0.6) % w2); if (o2 > 0) o2 -= w2;
    ctx.globalAlpha = 0.95; for (var x2 = o2; x2 < vw; x2 += w2) ctx.drawImage(bg.top, x2, -Math.min(cam.y * 0.15, 40) - 4);
    ctx.globalAlpha = 1;
    if (bg.rays && themeKey !== 'cistern') {
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < 3; i++) {
        var rx2 = ((i * 330 + 40) - cam.x * 0.18) % 1000; if (rx2 < -300) rx2 += 1000;
        ctx.globalAlpha = (themeKey === 'ruins' ? 0.11 : 0.1) + Math.sin(t * 0.5 + i * 2.1) * 0.035;
        ctx.drawImage(bg.rays, rx2 + vw * 0.35 - 90, -10, 300 * 1.2, vh * 1.15);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  // =====================================================================
  //  ТАЙЛЫ: чанки 8×8 в 2× разрешении
  // =====================================================================
  var CT = 8, CS = CT * 32, CK = 2, MAXCH = 56;
  function solidLike(t) { return t === TILE.SOLID || t === TILE.CRACK || t === TILE.DOOR || t === TILE.THIN; }
  function palOf(th) {
    if (th._P) return th._P;
    var P = { ramp: [] }, i;
    for (i = 0; i < 9; i++) P.ramp.push(mixHex(th.stone, th.stoneDark, i / 8));
    P.light = mixHex(th.stoneLight, th.stone, 0.35); P.light2 = th.stoneLight;
    P.dark = mixHex(th.stoneDark, '#000000', 0.35);
    th._P = P; return P;
  }
  function artFor(L, th) {
    if (L._art) return L._art;
    var w = L.w, h = L.h, d = new Uint8Array(w * h), x, y, k, A = {};
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) d[y * w + x] = solidLike(L.get(x, y)) ? 9 : 0;
    for (k = 0; k < 4; k++) {
      for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
        var i = y * w + x; if (!d[i]) continue; var m = d[i];
        for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
          var nx = x + dx, ny = y + dy; if (nx < 0 || nx >= w || ny < 0) continue; if (ny >= h) { m = 1; continue; }
          var nv = d[ny * w + nx] + 1; if (nv < m) m = nv;
        }
        d[i] = m;
      }
    }
    A.depth = d; A.decor = null; L._art = A; return A;
  }
  function isAir(L, tx, ty) { return !solidLike(L.get(tx, ty)); }

  // --- спрайты затенения (AO)
  var aoS = null;
  function aoSprites() {
    if (aoS) return aoS;
    function g(w, h, x0, y0, x1, y1, a) { var c = makeCanvas(w, h), x = c.getContext('2d'), gr = x.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(0.5, 'rgba(0,0,0,' + a * 0.3 + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); return c; }
    aoS = { top: g(1, 20, 0, 0, 0, 20, 0.5), bot: g(1, 8, 0, 8, 0, 0, 0.3), left: g(14, 1, 0, 0, 14, 0, 0.36), right: g(14, 1, 14, 0, 0, 0, 0.36) };
    return aoS;
  }

  function cutCorner(x, cx, cy, dx, dy, r) {
    x.save(); x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + dx * r, cy);
    var s = Math.atan2(-dy, 0), e = Math.atan2(0, -dx), d = e - s; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
    x.arc(cx + dx * r, cy + dy * r, r, s, e, d < 0); x.closePath(); x.fill(); x.restore();
  }

  // ---------- базовая кладка
  var BOND = { garden: { rh: 16, reg: true }, cistern: { rh: 32, reg: true }, ruins: { rh: 16, reg: false }, tower: { rh: 32, reg: true } };
  function paintBase(x, L, th, P, tx, ty, depth, v, kind) {
    var px = tx * T, py = ty * T, bd = BOND[L.theme] || BOND.garden;
    var k = 0.1 + (depth > 4 ? 4 : depth - 1) * 0.1 + (v % 7) * 0.012;
    x.fillStyle = P.ramp[Math.min(8, Math.round(k * 8))]; x.fillRect(px, py, T, T);
    var rows = T / bd.rh;
    for (var hr = 0; hr < rows; hr++) {
      var row = ty * rows + hr, y0 = py + hr * bd.rh;
      var ox = bd.reg ? (row & 1) * 16 : (hash2(row, 17) < 0.5 ? 0 : 16);
      var segs = ox === 0 ? [[px, 32, tx]] : [[px, 16, tx - 1], [px + 16, 16, tx]];
      for (var s = 0; s < segs.length; s++) {
        var sg = segs[s], sh = hash2(sg[2] * 3 + ((hash2(row, 3) * 5) | 0), row);
        x.fillStyle = sh < 0.5 ? 'rgba(0,0,0,' + (0.02 + sh * 0.12) + ')' : 'rgba(255,255,255,' + ((sh - 0.5) * 0.12) + ')';
        x.fillRect(sg[0], y0, sg[1], bd.rh);
        // вертикальный шов
        x.fillStyle = 'rgba(0,0,0,0.34)'; x.fillRect(sg[0], y0, 1.2, bd.rh);
        x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(sg[0] + 1.2, y0, 1, bd.rh);
      }
      x.fillStyle = 'rgba(0,0,0,0.38)'; x.fillRect(px, y0, T, 1.4);
      x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(px, y0 + 1.4, T, 1);
    }
    // зерно
    for (var i = 0; i < 7; i++) {
      var hx = hash2(tx * 11 + i, ty * 5), hy = hash2(tx * 3, ty * 7 + i);
      x.fillStyle = (i & 1) ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)'; x.fillRect(px + hx * 29, py + hy * 29, 1 + (i % 3), 1 + (i % 2));
    }
    if (depth > 1) { x.fillStyle = 'rgba(0,0,0,' + Math.min(0.5, (depth - 1) * 0.12) + ')'; x.fillRect(px, py, T, T); }
  }

  // ---------- тематические украшения (внутри плитки)
  function glyph(x, cx, cy, kind, col, col2) {
    x.save(); x.lineWidth = 1.5; x.lineCap = 'round'; x.lineJoin = 'round';
    for (var pass = 0; pass < 2; pass++) {
      x.strokeStyle = pass === 0 ? col2 : col; x.save(); x.translate(cx, cy + (pass === 0 ? 1 : 0)); x.beginPath();
      if (kind === 0) { x.arc(0, 0, 7, 0, TAU); x.moveTo(1.5, 0); x.arc(0, 0, 1.5, 0, TAU); }
      else if (kind === 1) { x.moveTo(-7, 6); x.lineTo(0, -7); x.lineTo(7, 6); x.closePath(); x.moveTo(0, 0); x.lineTo(0, 6); }
      else if (kind === 2) { x.moveTo(-9, 0); x.quadraticCurveTo(-5, -7, 0, 0); x.quadraticCurveTo(5, 7, 9, 0); x.moveTo(-9, 5); x.lineTo(9, 5); }
      else if (kind === 3) { x.moveTo(-8, 7); x.lineTo(-8, 1); x.lineTo(-3, 1); x.lineTo(-3, -4); x.lineTo(2, -4); x.lineTo(2, -9); x.lineTo(8, -9); }
      else if (kind === 4) { x.moveTo(-9, 0); x.quadraticCurveTo(0, -9, 9, 0); x.quadraticCurveTo(0, 9, -9, 0); x.moveTo(2, 0); x.arc(0, 0, 2, 0, TAU); }
      else { x.arc(0, 0, 3.5, 0, TAU); for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; x.moveTo(Math.cos(a) * 5.5, Math.sin(a) * 5.5); x.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); } }
      x.stroke(); x.restore();
    }
    x.restore();
  }
  function clockSymbol(x, cx, cy, kind, col) {
    x.save(); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 1.2; x.lineCap = 'round';
    if (kind === 0) {
      x.beginPath(); x.arc(cx, cy, 9, 0, TAU); x.stroke();
      for (var i = 0; i < 12; i++) { var a = i / 12 * TAU, r0 = i % 3 ? 7.2 : 6; x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * 8.4, cy + Math.sin(a) * 8.4); x.stroke(); }
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + 3, cy - 4); x.moveTo(cx, cy); x.lineTo(cx - 1, cy - 6); x.stroke();
    } else if (kind === 1) {
      x.beginPath(); x.moveTo(cx - 6, cy - 9); x.lineTo(cx + 6, cy - 9); x.lineTo(cx, cy); x.lineTo(cx + 6, cy + 9); x.lineTo(cx - 6, cy + 9); x.lineTo(cx, cy); x.closePath(); x.stroke();
      x.globalAlpha *= 0.7; x.beginPath(); x.moveTo(cx - 3, cy + 9); x.lineTo(cx + 3, cy + 9); x.lineTo(cx, cy + 4); x.fill();
    } else {
      x.drawImage(gearSprite(9, 9, 'rgba(0,0,0,0)', col), cx - gearSprite(9, 9, 'rgba(0,0,0,0)', col).width / 2, cy - gearSprite(9, 9, 'rgba(0,0,0,0)', col).height / 2);
      x.beginPath(); x.arc(cx, cy, 3, 0, TAU); x.stroke();
    }
    x.restore();
  }

  function paintInterior(x, L, th, P, tx, ty, depth, v) {
    var px = tx * T, py = ty * T, key = L.theme, h = hash2(tx, ty * 3 + 1);
    if (depth > 3) return;
    if (key === 'garden') {
      if (h < 0.09) { // розетка-мозаика
        var cx = px + 16, cy = py + 16;
        for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; x.fillStyle = i & 1 ? 'rgba(47,168,160,0.6)' : 'rgba(232,191,106,0.65)'; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a - 0.3) * 9, cy + Math.sin(a - 0.3) * 9); x.lineTo(cx + Math.cos(a + 0.3) * 9, cy + Math.sin(a + 0.3) * 9); x.fill(); }
        x.fillStyle = 'rgba(196,85,58,0.8)'; x.beginPath(); x.arc(cx, cy, 2.6, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, 10, 0, TAU); x.stroke();
      } else if (h < 0.17) { // ниша-арка
        x.fillStyle = 'rgba(0,0,0,0.22)'; x.beginPath(); pointedArch(x, px + 8, px + 24, py + 28, 22); x.fill();
        x.strokeStyle = 'rgba(255,230,180,0.2)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px + 24.5, py + 28); x.quadraticCurveTo(px + 24.5, py + 15, px + 16, py + 6); x.stroke();
      }
    } else if (key === 'cistern') {
      if (h < 0.1) { // решётка водостока
        x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(px + 7, py + 9, 18, 14); x.fillStyle = 'rgba(120,170,170,0.5)';
        for (var j = 0; j < 4; j++) x.fillRect(px + 9 + j * 4.5, py + 9, 1.6, 14);
        x.fillRect(px + 7, py + 15, 18, 1.4);
      } else if (h < 0.22) { // мох-пятно
        x.fillStyle = 'rgba(47,154,106,0.3)'; for (var m = 0; m < 4; m++) { x.beginPath(); x.arc(px + 6 + hash2(tx + m, ty) * 22, py + 6 + hash2(tx, ty + m) * 22, 3 + m, 0, TAU); x.fill(); }
      } else if (h < 0.28) { // биолюминесценция
        var bx = px + 6 + hash2(tx, ty + 9) * 20, by = py + 6 + hash2(tx + 4, ty) * 20;
        x.globalCompositeOperation = 'lighter'; glow(x, bx, by, 9, '#3fe8d0', 0.5); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      }
    } else if (key === 'ruins') {
      if (h < 0.11) glyph(x, px + 16, py + 16, (hash2(tx * 5, ty) * 6) | 0, 'rgba(70,36,14,0.55)', 'rgba(255,235,190,0.22)');
      else if (h < 0.22) { // трещина
        x.strokeStyle = 'rgba(40,20,8,0.55)'; x.lineWidth = 1.2; x.beginPath(); var cx2 = px + hash2(tx, ty + 2) * 20 + 4, cy2 = py + 2; x.moveTo(cx2, cy2);
        for (var k = 0; k < 5; k++) { cx2 += (hash2(tx + k, ty + 8) - 0.5) * 11; cy2 += 5 + hash2(tx + k * 2, ty) * 3; x.lineTo(cx2, cy2); } x.stroke();
        x.strokeStyle = 'rgba(255,230,180,0.15)'; x.translate(1, 0); x.stroke(); x.translate(-1, 0);
      }
    } else if (key === 'tower') {
      if (h < 0.07) clockSymbol(x, px + 16, py + 16, 0, 'rgba(232,192,112,0.7)');
      else if (h < 0.12) clockSymbol(x, px + 16, py + 16, 1, 'rgba(232,192,112,0.6)');
      else if (h < 0.17) clockSymbol(x, px + 16, py + 16, 2, 'rgba(232,192,112,0.55)');
      else if (h < 0.4) { // прожилки мрамора
        x.strokeStyle = 'rgba(200,180,255,0.13)'; x.lineWidth = 1.1; x.beginPath(); x.moveTo(px + hash2(tx, ty + 1) * 32, py);
        x.bezierCurveTo(px + hash2(tx + 1, ty) * 32, py + 10, px + hash2(tx, ty + 5) * 32, py + 20, px + hash2(tx + 3, ty) * 32, py + 32); x.stroke();
      }
    }
  }

  // ---------- кромки плитки + верх/низ/бока
  function paintEdges(x, L, th, P, tx, ty, aU, aD, aL, aR, kind) {
    var px = tx * T, py = ty * T, key = L.theme;
    if (aU) {
      x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(px, py, T, 1.6);
      x.fillStyle = P.light; x.fillRect(px, py + 1.6, T, 3.6);
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px, py + 5.2, T, 1.3);
      x.fillStyle = 'rgba(255,255,255,0.1)'; x.fillRect(px, py + 6.5, T, 1);
    }
    if (aL) { x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(px, py, 2.2, T); x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(px + 2.2, py, 1.4, T); }
    if (aR) { x.fillStyle = 'rgba(0,0,0,0.34)'; x.fillRect(px + T - 3.4, py, 3.4, T); x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(px + T - 4.6, py, 1.2, T); }
    if (aD) { x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(px, py + T - 5, T, 5); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(px, py + T - 8, T, 3); x.fillStyle = 'rgba(255,255,255,0.07)'; x.fillRect(px, py + T - 5, T, 1); }
    // темы
    if (key === 'garden') {
      if (aU) { // мозаичный фриз
        var cols = ['#2fa8a0', '#e8bf6a', '#c4553a', '#f0e2c0'];
        for (var i = 0; i < 8; i++) { x.fillStyle = cols[(tx * 8 + i + (ty & 1)) & 3]; x.globalAlpha = 0.85; x.fillRect(px + i * 4, py + 7.6, 3.4, 3.4); }
        x.globalAlpha = 1; x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(px, py + 11.4, T, 1);
      }
      if (aL || aR) { x.fillStyle = 'rgba(232,191,106,0.42)'; x.fillRect(aL ? px + 6 : px + T - 7, py, 1.2, T); }
      if (aD) { x.fillStyle = 'rgba(232,191,106,0.35)'; x.fillRect(px, py + T - 11, T, 1.2); for (var d = 0; d < 4; d++) { x.fillStyle = 'rgba(255,230,180,0.28)'; x.fillRect(px + 2 + d * 8, py + T - 9.6, 4, 3.4); } }
    } else if (key === 'cistern') {
      if (aU) { x.fillStyle = 'rgba(170,255,240,0.38)'; x.fillRect(px, py + 1.8, T, 1.1); }
      if (aL || aR) { x.fillStyle = 'rgba(95,224,208,0.2)'; x.fillRect(aL ? px + 3.6 : px + T - 6, py, 1.4, T); }
    } else if (key === 'ruins') {
      if (aU) { x.strokeStyle = 'rgba(70,36,14,0.28)'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px, py + 13); for (var z = 0; z < 8; z++) x.lineTo(px + z * 4 + 2, py + 13 + (z & 1 ? 0 : 3.5)); x.lineTo(px + T, py + 13); x.stroke(); x.fillStyle = 'rgba(255,210,125,0.35)'; x.fillRect(px, py + 6.4, T, 1); }
    } else if (key === 'tower') {
      if (aU) { x.fillStyle = 'rgba(232,192,112,0.85)'; x.fillRect(px, py + 1.2, T, 1.6); for (var q = 0; q < 4; q++) { x.fillStyle = 'rgba(232,192,112,0.6)'; x.beginPath(); x.moveTo(px + q * 8 + 4, py + 8); x.lineTo(px + q * 8 + 7.2, py + 11); x.lineTo(px + q * 8 + 4, py + 14); x.lineTo(px + q * 8 + 0.8, py + 11); x.fill(); } }
      if (aL || aR) { x.fillStyle = 'rgba(232,192,112,0.5)'; x.fillRect(aL ? px + 5 : px + T - 6, py, 1.2, T); if (!(ty & 1)) { x.fillStyle = 'rgba(232,192,112,0.8)'; x.fillRect(aL ? px + 4 : px + T - 7, py + 15, 3.2, 3.2); } }
      if (aD) { x.fillStyle = 'rgba(232,192,112,0.55)'; x.fillRect(px, py + T - 4, T, 1.2); }
    }
    // скругление выступающих углов
    var r = 5;
    if (aU && aL) cutCorner(x, px, py, 1, 1, r); if (aU && aR) cutCorner(x, px + T, py, -1, 1, r);
    if (aD && aL) cutCorner(x, px, py + T, 1, -1, 4); if (aD && aR) cutCorner(x, px + T, py + T, -1, -1, 4);
  }

  // ---------- нависающие украшения (рисуются вне плитки; вызывать и для гало соседних чанков)
  function chain(x, x0, y0, len, col, hi) {
    x.strokeStyle = col; x.lineWidth = 1.6;
    for (var y = 0; y < len; y += 4.2) { x.beginPath(); x.ellipse(x0, y0 + y + 2, y % 8.4 < 4.2 ? 1.2 : 1.9, 2.4, 0, 0, TAU); x.stroke(); }
  }
  function paintOverhang(x, L, th, P, tx, ty, aU, aD, aL, aR) {
    var px = tx * T, py = ty * T, key = L.theme, h1 = hash2(tx, ty), h2 = hash2(tx + 100, ty + 31), h3 = hash2(tx + 7, ty + 77), i, bx, len;
    var solid = L.get(tx, ty) === TILE.SOLID;
    if (!solid) return;
    if (key === 'garden') {
      if (aU) {
        for (i = 0; i < 6; i++) { // трава
          bx = px + hash2(tx * 9 + i, ty) * 30; var gh = 3 + hash2(tx, ty * 9 + i) * 6;
          x.fillStyle = i & 1 ? '#5f8f3e' : '#7fb04e'; x.beginPath(); x.moveTo(bx - 1.2, py + 2.4); x.quadraticCurveTo(bx, py - gh * 0.6, bx + (hash2(tx + i, ty) - 0.5) * 4, py - gh); x.lineTo(bx + 1.2, py + 2.4); x.fill();
        }
        if (h1 < 0.22) { bx = px + 4 + h2 * 24; x.strokeStyle = '#4f7a30'; x.lineWidth = 1; x.beginPath(); x.moveTo(bx, py + 2); x.lineTo(bx, py - 7); x.stroke(); x.fillStyle = pick(['#ff7a9a', '#fff0d8', '#ffd24a', '#ff9a5a'], h3); x.beginPath(); x.arc(bx, py - 8, 2, 0, TAU); x.fill(); x.fillStyle = '#ffe9a8'; x.fillRect(bx - 0.5, py - 8.5, 1, 1); }
      }
      if (aD && h1 < 0.5) {
        bx = px + 3 + h2 * 26; len = 10 + h3 * 38; var seed = mulberry32((tx * 131 + ty * 7) | 0);
        vine(x, seed, bx, py + T - 3, len, '#3f6a2a', '#5f9a3a', h1 < 0.18 ? '#ff7a9a' : null);
      }
    } else if (key === 'cistern') {
      if (aD) {
        if (h1 < 0.55) { bx = px + 3 + h2 * 26; len = 6 + h3 * 18; var w = 3 + h2 * 4; x.fillStyle = mixHex(th.stoneDark, th.stone, 0.4); x.beginPath(); x.moveTo(bx - w, py + T - 4); x.lineTo(bx + 0.5, py + T + len); x.lineTo(bx + w, py + T - 4); x.fill(); x.fillStyle = 'rgba(160,230,230,0.25)'; x.beginPath(); x.moveTo(bx - w, py + T - 4); x.lineTo(bx + 0.5, py + T + len); x.lineTo(bx - w * 0.3, py + T - 4); x.fill(); if (h3 < 0.5) { x.fillStyle = 'rgba(190,255,250,0.9)'; x.beginPath(); x.arc(bx + 0.5, py + T + len + 2.5, 1.5, 0, TAU); x.fill(); } }
        if (h2 < 0.2) { bx = px + 6 + h3 * 20; len = 12 + h1 * 26; x.strokeStyle = '#2f9a6a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(bx, py + T - 3); x.quadraticCurveTo(bx + 3, py + T + len * 0.5, bx, py + T + len); x.stroke(); x.globalCompositeOperation = 'lighter'; glow(x, bx, py + T + len, 6, '#4fe8c0', 0.7); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; }
      }
      if (aU && h1 < 0.3) { bx = px + 4 + h2 * 20; x.fillStyle = 'rgba(120,230,230,0.4)'; x.beginPath(); x.ellipse(bx + 5, py + 0.5, 7 + h3 * 6, 1.8, 0, 0, TAU); x.fill(); x.fillStyle = 'rgba(220,255,255,0.7)'; x.fillRect(bx + 2, py - 0.2, 5, 0.8); }
    } else if (key === 'ruins') {
      if (aU && h1 < 0.6) { // навеянный песок
        var a = px + h2 * 12, b = px + 16 + h3 * 16, hh = 3 + h1 * 6;
        x.fillStyle = '#e8cf98'; x.beginPath(); x.moveTo(a, py + 3); x.quadraticCurveTo((a + b) / 2, py - hh * 1.5, b, py + 3); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(160,110,60,0.35)'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(a + 3, py + 2); x.quadraticCurveTo((a + b) / 2, py - hh * 0.9, b - 3, py + 2); x.stroke();
        x.fillStyle = 'rgba(255,248,220,0.5)'; x.beginPath(); x.moveTo(a + 2, py + 2.4); x.quadraticCurveTo((a + b) / 2, py - hh * 1.5, b - 6, py); x.lineTo(b - 6, py + 0.8); x.quadraticCurveTo((a + b) / 2, py - hh * 1.1, a + 2, py + 2.4); x.fill();
      }
      if (aD && h1 < 0.3) { // лохмотья ткани
        bx = px + 4 + h2 * 20; len = 18 + h3 * 28; var cw = 8 + h2 * 6, cc = pick(['#9a3a2a', '#c08a3a', '#7a4a6a'], h3);
        x.fillStyle = cc; x.beginPath(); x.moveTo(bx - cw / 2, py + T - 3); x.lineTo(bx + cw / 2, py + T - 3);
        for (i = 4; i >= 0; i--) x.lineTo(bx - cw / 2 + i * cw / 4, py + T - 3 + len - (i & 1 ? 6 : 0) - hash2(tx + i, ty) * 4); x.closePath(); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(bx + cw * 0.1, py + T - 3, cw * 0.4, len * 0.7); x.fillStyle = 'rgba(255,220,150,0.5)'; x.fillRect(bx - cw / 2, py + T - 3, cw, 1.5);
      } else if (aD && h1 < 0.45) { x.strokeStyle = 'rgba(70,40,20,0.75)'; x.lineWidth = 1.2; bx = px + 6 + h2 * 20; x.beginPath(); x.moveTo(bx, py + T - 3); x.quadraticCurveTo(bx + 3, py + T + 10, bx - 1, py + T + 14 + h3 * 14); x.stroke(); }
    } else if (key === 'tower') {
      if (aD && h1 < 0.4) {
        bx = px + 4 + h2 * 24; len = 14 + h3 * 42; chain(x, bx, py + T - 3, len, '#7a6a9a');
        if (h2 < 0.45) { var gs = gearSprite(8, 6 + h3 * 4, '#3a2a60', 'rgba(232,192,112,0.9)'); x.drawImage(gs, bx - gs.width / 2, py + T - 3 + len - 2); }
        else { x.fillStyle = 'rgba(232,192,112,0.95)'; x.beginPath(); x.arc(bx, py + T + len, 2.2, 0, TAU); x.fill(); x.globalCompositeOperation = 'lighter'; glow(x, bx, py + T + len, 8, '#e0c070', 0.8); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; }
      } else if (aD && h1 < 0.62) { bx = px + 4 + h2 * 24; len = 8 + h3 * 16; x.fillStyle = 'rgba(180,150,255,0.65)'; x.beginPath(); x.moveTo(bx - 3, py + T - 3); x.lineTo(bx, py + T + len); x.lineTo(bx + 3, py + T - 3); x.fill(); x.fillStyle = 'rgba(255,255,255,0.4)'; x.beginPath(); x.moveTo(bx - 3, py + T - 3); x.lineTo(bx, py + T + len); x.lineTo(bx - 1, py + T - 3); x.fill(); }
      if (aU && h1 < 0.15) { bx = px + 6 + h2 * 20; x.globalCompositeOperation = 'lighter'; glow(x, bx, py - 3, 10, '#b48aff', 0.6); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = '#e8d8ff'; x.fillRect(bx - 1, py - 4, 2, 2); }
    }
  }

  // ---------- особые тайлы
  function paintOneWay(x, L, th, P, tx, ty) {
    var px = tx * T, py = ty * T, key = L.theme, h = hash2(tx, ty);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(px, py + 8, T, 3);
    x.fillStyle = P.light2; x.fillRect(px, py, T, 7);
    x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(px, py, T, 1.6);
    x.fillStyle = th.trim; x.globalAlpha = 0.85; x.fillRect(px, py + 1.6, T, 1.6); x.globalAlpha = 1;
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(px, py + 5.4, T, 1.6);
    x.fillStyle = P.ramp[3]; x.fillRect(px + 2, py + 7, T - 4, 3);
    // кронштейны
    x.fillStyle = P.ramp[5];
    x.beginPath(); x.moveTo(px + 3, py + 10); x.lineTo(px + 10, py + 10); x.lineTo(px + 3, py + 18); x.fill();
    x.beginPath(); x.moveTo(px + T - 3, py + 10); x.lineTo(px + T - 10, py + 10); x.lineTo(px + T - 3, py + 18); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(px + 3, py + 10, 7, 1);
    x.fillStyle = 'rgba(0,0,0,0.18)'; for (var i = 0; i < 4; i++) x.fillRect(px + 4 + i * 7, py + 3, 1, 3);
    if (key === 'garden' && h < 0.5) vine(x, mulberry32(tx * 31 + ty), px + 6 + h * 20, py + 8, 10 + h * 20, '#3f6a2a', '#5f9a3a', null);
    if (key === 'cistern') { x.fillStyle = 'rgba(190,255,250,0.6)'; x.beginPath(); x.arc(px + 8 + h * 16, py + 12, 1.2, 0, TAU); x.fill(); }
    if (key === 'tower') { x.fillStyle = 'rgba(232,192,112,0.9)'; x.fillRect(px + 2, py + 7.6, 3, 1.4); x.fillRect(px + T - 5, py + 7.6, 3, 1.4); }
    if (key === 'ruins' && h < 0.4) { x.fillStyle = '#e8cf98'; x.beginPath(); x.moveTo(px + 6, py + 1); x.quadraticCurveTo(px + 14, py - 4, px + 24, py + 1); x.fill(); }
  }
  function paintSpike(x, L, th, P, tx, ty) {
    var px = tx * T, py = ty * T, v = hash2(tx, ty);
    x.fillStyle = '#12101a'; x.fillRect(px, py + T - 6, T, 6);
    x.fillStyle = '#3a3646'; x.fillRect(px, py + T - 7, T, 1.6);
    for (var s = 0; s < 4; s++) {
      var sx = px + s * 8, tipY = py + 6 + ((hash2(tx + s, ty) * 4) | 0);
      x.fillStyle = '#e2e8f2'; x.beginPath(); x.moveTo(sx + 0.8, py + T - 6); x.lineTo(sx + 4, tipY); x.lineTo(sx + 4, py + T - 6); x.fill();
      x.fillStyle = '#7d8798'; x.beginPath(); x.moveTo(sx + 4, tipY); x.lineTo(sx + 7.2, py + T - 6); x.lineTo(sx + 4, py + T - 6); x.fill();
      x.fillStyle = '#fff'; x.fillRect(sx + 3.2, tipY + 1, 0.9, 6);
      x.strokeStyle = 'rgba(8,6,14,0.85)'; x.lineWidth = 0.9; x.beginPath(); x.moveTo(sx + 0.8, py + T - 6); x.lineTo(sx + 4, tipY); x.lineTo(sx + 7.2, py + T - 6); x.stroke();
      if (v < 0.4 && s === 1) { x.fillStyle = 'rgba(170,30,40,0.7)'; x.beginPath(); x.moveTo(sx + 4, tipY + 3); x.lineTo(sx + 6.2, py + T - 6); x.lineTo(sx + 4, py + T - 6); x.fill(); }
    }
  }
  function paintDoor(x, L, th, P, tx, ty) {
    var px = tx * T, py = ty * T;
    x.fillStyle = '#2a1c14'; x.fillRect(px, py, T, T);
    var g = x.createLinearGradient(px, 0, px + T, 0); g.addColorStop(0, '#5a3a22'); g.addColorStop(0.5, '#7a5230'); g.addColorStop(1, '#4a2e1c'); x.fillStyle = g; x.fillRect(px + 2, py, T - 4, T);
    x.fillStyle = 'rgba(0,0,0,0.35)'; for (var i = 0; i < 4; i++) x.fillRect(px + 4 + i * 7, py, 1.4, T);
    x.fillStyle = th.trim; x.globalAlpha = 0.95; x.fillRect(px + 2, py + 5, T - 4, 2.4); x.fillRect(px + 2, py + T - 7, T - 4, 2.4); x.globalAlpha = 1;
    for (var k = 0; k < 4; k++) { x.fillStyle = '#ffe9a8'; x.beginPath(); x.arc(px + 6 + (k & 1) * 20, py + 6 + (k >> 1) * 20, 1.5, 0, TAU); x.fill(); }
    x.strokeStyle = th.trim; x.lineWidth = 2; x.beginPath(); x.arc(px + 16, py + 16, 6, 0, TAU); x.stroke();
    x.fillStyle = th.accent; x.beginPath(); x.moveTo(px + 16, py + 11); x.lineTo(px + 20, py + 16); x.lineTo(px + 16, py + 21); x.lineTo(px + 12, py + 16); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.2)'; x.fillRect(px, py, 2, T); x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(px + T - 2, py, 2, T);
  }
  function paintThin(x, L, th, P, tx, ty) {
    var px = tx * T, py = ty * T;
    var g = x.createLinearGradient(px + 6, 0, px + T - 6, 0); g.addColorStop(0, P.ramp[3]); g.addColorStop(0.5, P.light); g.addColorStop(1, P.ramp[4]);
    x.fillStyle = g; x.fillRect(px + 6, py, T - 12, T);
    x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(px + 6, py, 1.2, T); x.fillRect(px + T - 7.2, py, 1.2, T);
    x.strokeStyle = 'rgba(40,20,10,0.55)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px + 9, py); x.lineTo(px + 16, py + 9); x.lineTo(px + 12, py + 17); x.lineTo(px + 20, py + 26); x.lineTo(px + 17, py + T); x.stroke();
    x.globalCompositeOperation = 'lighter'; x.fillStyle = rgbaC(th.accent, 0.5); x.fillRect(px + T / 2 - 0.8, py, 1.6, T); glow(x, px + 16, py + 16, 18, th.accent, 0.28); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.fillStyle = rgbaC(th.accent, 0.7); // шевроны-подсказка
    for (var i = 0; i < 2; i++) { var cy = py + 8 + i * 14; x.beginPath(); x.moveTo(px + 11, cy); x.lineTo(px + 16, cy + 4); x.lineTo(px + 21, cy); x.lineTo(px + 21, cy + 2); x.lineTo(px + 16, cy + 6); x.lineTo(px + 11, cy + 2); x.fill(); }
  }
  function paintCrack(x, L, th, P, tx, ty) {
    var px = tx * T, py = ty * T;
    x.fillStyle = 'rgba(20,6,0,0.22)'; x.fillRect(px, py, T, T);
    x.strokeStyle = 'rgba(14,4,0,0.95)'; x.lineWidth = 3; x.lineJoin = 'round'; x.beginPath(); x.moveTo(px + 3, py + 1); x.lineTo(px + 13, py + 11); x.lineTo(px + 8, py + 18); x.lineTo(px + 21, py + 29); x.moveTo(px + 24, py + 4); x.lineTo(px + 13, py + 11); x.moveTo(px + 8, py + 18); x.lineTo(px + 1, py + 25); x.moveTo(px + 21, py + 29); x.lineTo(px + 30, py + 24); x.stroke();
    x.globalCompositeOperation = 'lighter'; x.strokeStyle = 'rgba(255,140,50,0.95)'; x.lineWidth = 1.4; x.stroke(); x.strokeStyle = 'rgba(255,230,160,0.8)'; x.lineWidth = 0.6; x.stroke();
    glow(x, px + 14, py + 14, 24, '#ff8a3a', 0.42); glow(x, px + 16, py + 3, 14, '#ffb060', 0.35); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(px + 3, py + T - 3, 4, 2); x.fillRect(px + 22, py + T - 4, 5, 3);
  }

  // ---------- задняя архитектура (колонны, арки, окна, статуи, баннеры)
  function genDecor(L, th) {
    var key = L.theme, rng = mulberry32((L.def.seed || 7) * 131 + 17), items = [], w = L.w, h = L.h, tx, ty;
    var lastCol = null;
    for (tx = 3; tx < w - 3; tx += 3 + ((rng() * 5) | 0)) {
      // найти ряд воздуха: пол-потолок
      var best = null;
      for (ty = 1; ty < h - 1; ty++) {
        if (!isAir(L, tx, ty) || solidLike(L.get(tx, ty - 1)) === false) continue;
        var y1 = ty; while (y1 < h && isAir(L, tx, y1)) y1++;
        var len = y1 - ty;
        if (len >= 6 && y1 < h && solidLike(L.get(tx, y1))) { if (!best || len > best.len) best = { top: ty, bot: y1, len: len }; }
        ty = y1;
      }
      if (!best) { lastCol = null; continue; }
      // ширина свободы: проверяем, что колонны стоят в открытом пространстве
      var open = true; for (var k = -1; k <= 1; k += 2) for (var yy = best.top; yy < best.bot; yy += 2) if (!isAir(L, tx + k, yy)) { open = false; break; }
      if (!open) { lastCol = null; continue; }
      var col = { k: 'col', x: tx * T + 16, top: best.top * T, bot: best.bot * T, tx: tx, rowTop: best.top, rowBot: best.bot };
      var r = rng();
      if (lastCol && lastCol.rowBot === best.bot && lastCol.rowTop === best.top && tx - lastCol.tx <= 8 && r < 0.8) {
        // арка между колоннами; проверим прямоугольник
        var okRect = true; for (var xx = lastCol.tx; xx <= tx && okRect; xx++) for (var y2 = best.top; y2 < best.bot; y2 += 2) if (!isAir(L, xx, y2)) { okRect = false; break; }
        if (okRect) items.push({ k: 'arch', x0: lastCol.x, x1: col.x, top: best.top * T, bot: best.bot * T, win: rng() });
      }
      if (rng() < 0.82) { items.push(col); lastCol = col; } else lastCol = null;
      if (rng() < 0.28) items.push({ k: 'statue', x: tx * T + 16 + (rng() < 0.5 ? 40 : -40), bot: best.bot * T, pose: (rng() * 3) | 0, top: best.top * T });
      if (rng() < 0.4) items.push({ k: 'hang', x: tx * T + 16 + (rng() - 0.5) * 60, top: best.top * T, len: 40 + rng() * 80, v: rng() });
    }
    return items;
  }
  function drawDecorItem(x, it, th, P, key, vis) {
    var wallC = mixC(th.stoneDark, th.stone, 0.18), colC = mixC(th.stone, th.stoneDark, 0.38), rimC = rgbaC(th.rim, 0.28);
    if (it.k === 'col') {
      var cw = 20, cx = it.x, top = it.top, bot = it.bot;
      var g = x.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0); g.addColorStop(0, mixC(colC, '#000000', 0.12)); g.addColorStop(0.6, colC); g.addColorStop(1, mixC(colC, th.rim, 0.22));
      x.fillStyle = g; x.fillRect(cx - cw / 2, top, cw, bot - top);
      x.fillStyle = 'rgba(0,0,0,0.2)'; for (var f = 0; f < 4; f++) x.fillRect(cx - cw / 2 + 3 + f * 4.5, top + 18, 1, bot - top - 30);
      var base = mixC(colC, '#000000', 0.1);
      x.fillStyle = base; x.fillRect(cx - 15, bot - 12, 30, 12); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(cx - 15, bot - 12, 30, 1.5);
      x.fillStyle = base; x.fillRect(cx - 15, top, 30, 12); x.fillRect(cx - 12, top + 12, 24, 5); x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(cx - 15, top, 30, 1.5);
      if (key === 'tower') { x.fillStyle = 'rgba(232,192,112,0.55)'; x.fillRect(cx - 15, top + 10, 30, 1.2); x.fillRect(cx - 0.6, top + 20, 1.2, bot - top - 40); }
      if (key === 'garden') { x.fillStyle = 'rgba(232,191,106,0.5)'; x.fillRect(cx - 15, top + 10, 30, 1.2); }
      if (key === 'cistern') { var sg = x.createLinearGradient(0, top, 0, bot); sg.addColorStop(0, 'rgba(95,224,208,0)'); sg.addColorStop(1, 'rgba(47,154,106,0.35)'); x.fillStyle = sg; x.fillRect(cx - cw / 2, top, cw, bot - top); }
      if (key === 'ruins' && ((it.x / 7) | 0) % 3 === 0) { x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.moveTo(cx - 15, top + 30); x.lineTo(cx, top + 42); x.lineTo(cx + 15, top + 26); x.lineTo(cx + 15, top + 60); x.lineTo(cx - 15, top + 60); x.fill(); }
    } else if (it.k === 'arch') {
      var x0 = it.x0, x1 = it.x1, span = x1 - x0, spr = it.top + 36, rise = Math.min(span * 0.62, 70);
      // стена над аркой
      x.fillStyle = wallC; x.beginPath(); x.moveTo(x0, it.top); x.lineTo(x1, it.top); x.lineTo(x1, spr); x.quadraticCurveTo(x1, spr - rise * 0.2, (x0 + x1) / 2, spr - rise); x.quadraticCurveTo(x0, spr - rise * 0.2, x0, spr); x.closePath(); x.fill();
      // подсветка внутреннего контура арки
      x.strokeStyle = rimC; x.lineWidth = 3; x.beginPath(); x.moveTo(x1, spr); x.quadraticCurveTo(x1, spr - rise * 0.2, (x0 + x1) / 2, spr - rise); x.quadraticCurveTo(x0, spr - rise * 0.2, x0, spr); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1.4; x.stroke();
      x.fillStyle = th.trim; x.globalAlpha = 0.55; x.beginPath(); x.moveTo((x0 + x1) / 2 - 4, spr - rise - 1); x.lineTo((x0 + x1) / 2, spr - rise - 8); x.lineTo((x0 + x1) / 2 + 4, spr - rise - 1); x.fill(); x.globalAlpha = 1;
      // луч света из окна-арки (garden/ruins/cistern)
      if (vis && (key === 'garden' || key === 'ruins' || key === 'cistern')) {
        var lc = key === 'cistern' ? 'rgba(150,255,245,' : 'rgba(255,215,150,', bx = (x0 + x1) / 2 + (key === 'cistern' ? 0 : -span * 0.1);
        var lg = x.createLinearGradient(0, spr - rise, 0, it.bot); lg.addColorStop(0, lc + '0.20)'); lg.addColorStop(1, lc + '0.0)');
        x.fillStyle = lg; x.beginPath(); x.moveTo(x0 + 10, spr - 8); x.lineTo(x1 - 10, spr - 8); x.lineTo(x1 + (key === 'cistern' ? -10 : 70), it.bot); x.lineTo(x0 + (key === 'cistern' ? 10 : 50), it.bot); x.closePath(); x.fill();
      }
    } else if (it.k === 'statue') {
      var sx = it.x, by = it.bot, sc = mixC(th.stoneDark, th.stone, 0.3);
      x.fillStyle = mixC(sc, '#000000', 0.15); x.fillRect(sx - 14, by - 14, 28, 14); x.fillRect(sx - 11, by - 30, 22, 16);
      x.fillStyle = sc; x.beginPath(); x.moveTo(sx - 10, by - 30); x.lineTo(sx - 8, by - 66); x.lineTo(sx + 8, by - 66); x.lineTo(sx + 10, by - 30); x.closePath(); x.fill();
      x.beginPath(); x.arc(sx, by - 74, 6.5, 0, TAU); x.fill();
      x.fillRect(sx - 8, by - 68, 16, 4);
      x.strokeStyle = sc; x.lineWidth = 3.4; x.lineCap = 'round'; x.beginPath();
      if (it.pose === 0) { x.moveTo(sx + 8, by - 64); x.lineTo(sx + 14, by - 84); x.moveTo(sx + 14, by - 84); x.lineTo(sx + 14, by - 100); x.moveTo(sx - 8, by - 64); x.lineTo(sx - 12, by - 48); }
      else if (it.pose === 1) { x.moveTo(sx + 8, by - 64); x.lineTo(sx + 18, by - 56); x.moveTo(sx - 8, by - 64); x.lineTo(sx - 18, by - 56); }
      else { x.moveTo(sx - 8, by - 64); x.lineTo(sx - 14, by - 86); x.moveTo(sx + 8, by - 64); x.lineTo(sx + 14, by - 86); }
      x.stroke();
      x.fillStyle = rimC; x.fillRect(sx + 3, by - 66, 4, 36); x.fillStyle = 'rgba(0,0,0,0.2)'; x.fillRect(sx - 10, by - 30, 4, 30);
    } else if (it.k === 'hang') {
      var hx = it.x, ht = it.top;
      if (key === 'garden') { x.fillStyle = '#7a1f2a'; x.fillRect(hx - 9, ht, 18, it.len); x.beginPath(); x.moveTo(hx - 9, ht + it.len); x.lineTo(hx, ht + it.len - 12); x.lineTo(hx + 9, ht + it.len); x.lineTo(hx + 9, ht + it.len + 10); x.lineTo(hx, ht + it.len); x.lineTo(hx - 9, ht + it.len + 10); x.fill(); x.fillStyle = th.trim; x.fillRect(hx - 10, ht, 20, 2.5); x.fillRect(hx - 1, ht + it.len * 0.3, 2, it.len * 0.3); x.fillRect(hx - 5, ht + it.len * 0.45, 10, 1.4); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(hx + 2, ht, 7, it.len); }
      else if (key === 'cistern') { chain(x, hx, ht, it.len * 0.8, '#4a6a70'); x.fillStyle = '#2a4a50'; x.fillRect(hx - 5, ht + it.len * 0.8, 10, 12); x.fillStyle = 'rgba(95,224,208,0.7)'; x.fillRect(hx - 2, ht + it.len * 0.8 + 3, 4, 6); }
      else if (key === 'ruins') { x.fillStyle = it.v < 0.5 ? '#8a3a2a' : '#b08a3a'; x.beginPath(); x.moveTo(hx - 9, ht); x.lineTo(hx + 9, ht); x.lineTo(hx + 7, ht + it.len); x.lineTo(hx + 3, ht + it.len - 8); x.lineTo(hx - 2, ht + it.len); x.lineTo(hx - 6, ht + it.len - 6); x.closePath(); x.fill(); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(hx, ht, 8, it.len - 8); }
      else { chain(x, hx, ht, it.len, '#8a7aaa'); var gs = gearSprite(10, 11, '#2a1a4a', 'rgba(232,192,112,0.9)'); x.drawImage(gs, hx - gs.width / 2, ht + it.len - 2); }
    }
  }

  // ---------- сборка чанка
  function buildChunk(L, cx, cy, th) {
    var P = palOf(th), A = artFor(L, th), c = makeCanvas(CS * CK, CS * CK), x = c.getContext('2d');
    x.scale(CK, CK); x.translate(-cx * CS, -cy * CS);
    var tx0 = cx * CT, ty0 = cy * CT, tx1 = tx0 + CT, ty1 = ty0 + CT, tx, ty, w = L.w, h = L.h;
    // 1) архитектура заднего плана
    if (!A.decor) A.decor = genDecor(L, th);
    var rx0 = cx * CS, rx1 = rx0 + CS, ry0 = cy * CS, ry1 = ry0 + CS, dec = A.decor, i;
    for (i = 0; i < dec.length; i++) {
      var it = dec[i], bx0, bx1, by0, by1;
      if (it.k === 'col') { bx0 = it.x - 16; bx1 = it.x + 16; by0 = it.top; by1 = it.bot; }
      else if (it.k === 'arch') { bx0 = it.x0; bx1 = it.x1 + 80; by0 = it.top; by1 = it.bot; }
      else if (it.k === 'statue') { bx0 = it.x - 24; bx1 = it.x + 24; by0 = it.bot - 110; by1 = it.bot; }
      else { bx0 = it.x - 14; bx1 = it.x + 14; by0 = it.top; by1 = it.top + it.len + 40; }
      if (bx1 < rx0 || bx0 > rx1 || by1 < ry0 || by0 > ry1) continue;
      drawDecorItem(x, it, th, P, L.theme, true);
    }
    // 2) затенение воздуха возле стен
    var ao = aoSprites();
    for (ty = ty0; ty < ty1; ty++) for (tx = tx0; tx < tx1; tx++) {
      if (tx >= w || ty >= h) continue;
      if (solidLike(L.get(tx, ty))) continue;
      var px = tx * T, py = ty * T;
      if (solidLike(L.get(tx, ty - 1))) x.drawImage(ao.top, px, py, T, 20);
      if (solidLike(L.get(tx, ty + 1))) x.drawImage(ao.bot, px, py + T - 8, T, 8);
      if (solidLike(L.get(tx - 1, ty))) x.drawImage(ao.left, px, py, 14, T);
      if (solidLike(L.get(tx + 1, ty))) x.drawImage(ao.right, px + T - 14, py, 14, T);
    }
    // 3) плитки
    for (ty = ty0; ty < ty1; ty++) for (tx = tx0; tx < tx1; tx++) {
      if (tx >= w || ty >= h) continue;
      var t = L.get(tx, ty), v = L.variant[ty * w + tx] || 0;
      if (t === TILE.AIR) continue;
      if (t === TILE.ONEWAY) { paintOneWay(x, L, th, P, tx, ty); continue; }
      if (t === TILE.SPIKE) { paintSpike(x, L, th, P, tx, ty); continue; }
      var d = A.depth[ty * w + tx] || 1;
      var aU = isAir(L, tx, ty - 1), aD = isAir(L, tx, ty + 1), aL = isAir(L, tx - 1, ty), aR = isAir(L, tx + 1, ty);
      paintBase(x, L, th, P, tx, ty, d, v, t);
      if (t === TILE.SOLID) paintInterior(x, L, th, P, tx, ty, d, v);
      if (t === TILE.DOOR) { paintDoor(x, L, th, P, tx, ty); if (aU) cutCorner(x, tx * T, ty * T, 1, 1, 4), cutCorner(x, tx * T + T, ty * T, -1, 1, 4); continue; }
      if (t === TILE.THIN) paintThin(x, L, th, P, tx, ty);
      if (t === TILE.CRACK) paintCrack(x, L, th, P, tx, ty);
      paintEdges(x, L, th, P, tx, ty, aU, aD, aL, aR, t);
    }
    // 4) нависающее (с гало: рисуется из клеток соседних чанков)
    for (ty = ty0 - 3; ty <= ty1; ty++) for (tx = tx0 - 1; tx <= tx1; tx++) {
      if (tx < 0 || tx >= w || ty < 0 || ty >= h) continue;
      if (L.get(tx, ty) !== TILE.SOLID) continue;
      var u = isAir(L, tx, ty - 1), dn = isAir(L, tx, ty + 1);
      if (!u && !dn) continue;
      if (ty < ty0 && !dn) continue; if (ty >= ty1 && !u) continue;
      paintOverhang(x, L, th, P, tx, ty, u, dn, false, false);
    }
    return c;
  }
  var chQueue = 0;
  function chunkKey(cx, cy) { return cx + ',' + cy; }
  function getChunk(L, cx, cy, th) {
    var k = chunkKey(cx, cy), ch = L.chunks[k];
    if (!ch) { ch = { c: buildChunk(L, cx, cy, th), u: frameNo }; L.chunks[k] = ch; L.chunkN = (L.chunkN || 0) + 1; }
    ch.u = frameNo; return ch;
  }
  function evict(L) {
    if ((L.chunkN || 0) <= MAXCH) return;
    var oldest = null, ok = null;
    for (var k in L.chunks) { var c = L.chunks[k]; if (c.u < frameNo - 2 && (!oldest || c.u < oldest.u)) { oldest = c; ok = k; } }
    if (ok) { delete L.chunks[ok]; L.chunkN--; }
  }
  function drawTiles(ctx, L, cam, vw, vh, themeKey) {
    var th = THEMES[themeKey], S = ctx.getTransform ? ctx.getTransform().a : 1;
    var c0 = Math.floor(cam.x / CS), c1 = Math.floor((cam.x + vw) / CS), r0 = Math.floor(cam.y / CS), r1 = Math.floor((cam.y + vh) / CS);
    if (!L.chunks) { L.chunks = {}; L.chunkN = 0; }
    var maxC = Math.ceil(L.w / CT), maxR = Math.ceil(L.h / CT), cx, cy, built = 0;
    for (cy = Math.max(0, r0); cy <= r1; cy++) for (cx = Math.max(0, c0); cx <= c1; cx++) {
      if (cx >= maxC || cy >= maxR) continue;
      var ch = getChunk(L, cx, cy, th);
      var dx = Math.round(cx * CS * S) / S, dy = Math.round(cy * CS * S) / S, dw = Math.round((cx * CS + CS) * S) / S - dx, dh = Math.round((cy * CS + CS) * S) / S - dy;
      ctx.drawImage(ch.c, dx, dy, dw, dh);
    }
    // предсборка соседей по одному за кадр
    var tried = 0;
    for (cy = Math.max(0, r0 - 1); cy <= r1 + 1 && !built; cy++) for (cx = Math.max(0, c0 - 1); cx <= c1 + 1 && !built; cx++) {
      if (cx >= maxC || cy >= maxR || L.chunks[chunkKey(cx, cy)]) continue;
      getChunk(L, cx, cy, th); built = 1;
    }
    evict(L);
  }
  function invalidate(L, tx, ty) {
    if (!L.chunks) return;
    var x0 = Math.floor((tx - 1) / CT), x1 = Math.floor((tx + 1) / CT), y0 = Math.floor((ty - 1) / CT), y1 = Math.floor((ty + 4) / CT);
    for (var cy = y0; cy <= y1; cy++) for (var cx = x0; cx <= x1; cx++) { var k = chunkKey(cx, cy); if (L.chunks[k]) { delete L.chunks[k]; L.chunkN--; } }
    if (L._art) { L._art.depth = null; L._art = null; }
  }

  // «задняя стена»: текстурная заливка с параллаксом
  var wallPats = {};
  function wallPat(th, key) {
    if (wallPats[key]) return wallPats[key];
    var c = makeCanvas(128, 128), x = c.getContext('2d'), r = mulberry32(3), P = palOf(th);
    x.fillStyle = mixHex(th.stoneDark, '#000000', 0.5); x.fillRect(0, 0, 128, 128);
    for (var i = 0; i < 30; i++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)'; x.fillRect(r() * 120, r() * 124, 10 + r() * 26, 4 + r() * 6); }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 63, 128, 2); x.fillRect(0, 127, 128, 1); x.fillRect(63, 0, 2, 64); x.fillRect(31, 64, 2, 64); x.fillRect(95, 64, 2, 64);
    x.fillStyle = 'rgba(255,255,255,0.04)'; x.fillRect(0, 65, 128, 1); x.fillRect(0, 1, 128, 1);
    wallPats[key] = c; return c;
  }
  var WALLA = { garden: 0.42, cistern: 0.8, ruins: 0.3, tower: 0.62 };
  function drawBackWall(ctx, L, cam, vw, vh, themeKey) {
    var th = THEMES[themeKey], pat = wallPat(th, themeKey);
    ctx.globalAlpha = WALLA[themeKey];
    var ox = -((cam.x * 0.85) % 128), oy = -((cam.y * 0.85) % 128);
    for (var y = oy - 128; y < vh; y += 128) for (var xx = ox - 128; xx < vw; xx += 128) ctx.drawImage(pat, xx, y);
    ctx.globalAlpha = 1;
    var bgs = bgFor(themeKey);
    if (bgs.sun) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, vw * bgs.sun.x - cam.x * 0.012, vh * bgs.sun.y - cam.y * 0.02, bgs.sun.r * 3, bgs.sunCol, 0.45); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (themeKey === 'cistern') { // блики воды на стенах
      var bgc = bgFor('cistern').caustic, t = nowMs / 1000;
      ctx.globalCompositeOperation = 'lighter';
      for (var p = 0; p < 2; p++) {
        ctx.globalAlpha = 0.07; var ox2 = -((cam.x * 0.6 + t * (p ? 9 : -7)) % 128), oy2 = -((cam.y * 0.6 + t * (p ? 5 : 8)) % 128);
        for (y = oy2 - 128; y < vh; y += 128) for (xx = ox2 - 128; xx < vw; xx += 128) ctx.drawImage(bgc, xx, y);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  // =====================================================================
  //  СВЕТ
  // =====================================================================
  var lightCanvas = null, lightCtx = null, holeSpr = null, lightGrad = null, lightGradKey = '';
  function holeSprite() {
    if (holeSpr) return holeSpr;
    holeSpr = makeCanvas(64, 64); var x = holeSpr.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.3, 'rgba(0,0,0,0.8)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(0.85, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return holeSpr;
  }
  var DIV = 4;
  function drawLighting(ctx, game, vw, vh, S) {
    var th = THEMES[game.themeKey], lw = Math.ceil(vw / DIV), lh = Math.ceil(vh / DIV);
    if (!lightCanvas || lightCanvas.width !== lw || lightCanvas.height !== lh) { lightCanvas = makeCanvas(lw, lh); lightCtx = lightCanvas.getContext('2d'); lightGradKey = ''; }
    var x = lightCtx, dk = game.darkness || 0.55, rgb3 = rgbOf(th.ambient), key = game.themeKey + dk + lw + lh;
    if (key !== lightGradKey) {
      lightGradKey = key; lightGrad = x.createLinearGradient(0, 0, 0, lh);
      var cc = 'rgba(' + (rgb3[0] | 0) + ',' + (rgb3[1] | 0) + ',' + (rgb3[2] | 0) + ',';
      lightGrad.addColorStop(0, cc + Math.min(0.95, dk * 1.25) + ')'); lightGrad.addColorStop(0.5, cc + dk * 0.9 + ')'); lightGrad.addColorStop(1, cc + Math.min(0.95, dk * 1.15) + ')');
    }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.clearRect(0, 0, lw, lh); x.fillStyle = lightGrad; x.fillRect(0, 0, lw, lh);
    x.globalCompositeOperation = 'destination-out';
    var cam = game.cam, hs = holeSprite(), k = S / DIV;
    function hole(wx, wy, r, a) {
      var sx = (wx - cam.x) * k, sy = (wy - cam.y) * k, rr = r * k;
      if (sx < -rr || sy < -rr || sx > lw + rr || sy > lh + rr) return;
      x.globalAlpha = a; x.drawImage(hs, sx - rr, sy - rr, rr * 2, rr * 2);
    }
    var p = game.player, t = game.time, i;
    hole(p.cx(), p.cy(), 210, 0.95); hole(p.cx(), p.cy(), 90, 0.5);
    for (i = 0; i < game.lights.length; i++) { var l = game.lights[i]; var fl = 1 + Math.sin(t * 7.3 + i * 2.1) * 0.035 + Math.sin(t * 17 + i) * 0.02; hole(l.x, l.y, l.r * 1.25 * fl, l.a); }
    for (i = 0; i < game.ents.length; i++) { var e = game.ents[i]; if (e.light) hole(e.cx(), e.cy(), e.light * 1.2, 0.85); else if (e.constructor && (e.type === 'orb' || e.type === 'heart')) hole(e.cx(), e.cy(), e.type === 'orb' ? 120 : 70, 0.8); else if (e.active) hole(e.cx(), e.cy(), 130, 0.8); }
    x.globalAlpha = 1;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lightCanvas, 0, 0, lw, lh, 0, 0, vw, vh);
    ctx.restore();
  }

  // тёплые ореолы + бликовая атмосфера (поверх, аддитивно)
  var ambP = [], ambKey = '', ambFrame = -1, ambAcc = 0;
  function drawGlows(ctx, game) {
    var th = THEMES[game.themeKey], i, t = game.time;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < game.lights.length; i++) {
      var l = game.lights[i], fl = 0.88 + Math.sin(t * 7 + i * 2.3) * 0.08 + Math.sin(t * 19 + i) * 0.04;
      glow(ctx, l.x, l.y, l.r * 0.85, th.glow, 0.2 * fl); glow(ctx, l.x, l.y, 34 * fl, '#ffc070', 0.5); glow(ctx, l.x, l.y, 12, '#fff2c0', 0.55);
    }
    // тёплый ореол героя
    var p = game.player; if (p && !p.dead) glow(ctx, p.cx(), p.cy(), 60, th.light, 0.06);
    ctx.restore();
    ambient(ctx, game, rdt);
  }

  // =====================================================================
  //  АТМОСФЕРНЫЕ ЧАСТИЦЫ
  // =====================================================================
  var AMB_N = { garden: 34, cistern: 30, ruins: 36, tower: 34 };
  function spawnAmb(game, key, k, init) {
    var cam = game.cam, vw = game.vw, vh = game.vh, r = Math.random, q = { x: cam.x + r() * vw, y: cam.y + r() * vh, vx: 0, vy: 0, life: 0, max: 5, k: 0, ph: r() * 6.28, s: 1 };
    if (!init) { q.x = cam.x - 20 + r() * (vw + 40); }
    if (key === 'garden') {
      var d = r();
      if (d < 0.45) { q.k = 0; q.max = 5 + r() * 6; q.vx = (r() - 0.5) * 8; q.vy = (r() - 0.5) * 8; q.s = 0.8 + r() * 0.8; q.c = r() < 0.6 ? '#d8ff7a' : '#ffe08a'; }
      else if (d < 0.8) { q.k = 1; q.max = 8 + r() * 4; q.vx = 14 + r() * 14; q.vy = 14 + r() * 12; q.s = 2 + r() * 1.6; if (!init) { q.y = cam.y - 8; q.x = cam.x + r() * vw - 40; } q.c = pick(['#ff9ab4', '#ffd0dc', '#ffb48a', '#fff0d8'], r()); }
      else { q.k = 2; q.max = 4 + r() * 4; q.vx = 6 + r() * 6; q.vy = -2 - r() * 4; q.s = 1; q.c = '#fff0c0'; }
    } else if (key === 'cistern') {
      var e = r();
      if (e < 0.34) { q.k = 0; q.max = 3; q.vy = 0; q.vx = 0; if (!init) q.y = cam.y + r() * vh * 0.4; q.s = 1; q.c = '#cfffff'; }
      else if (e < 0.7) { q.k = 1; q.max = 7 + r() * 5; q.vx = (r() - 0.5) * 6; q.vy = -4 - r() * 8; q.s = 1 + r(); q.c = r() < 0.5 ? '#4fffd8' : '#7fe7ff'; }
      else { q.k = 2; q.max = 10 + r() * 6; q.vx = 5 + r() * 6; q.vy = -2; q.s = 32 + r() * 30; q.c = '#7fd8d8'; if (!init) q.y = cam.y + vh * (0.5 + r() * 0.5); }
    } else if (key === 'ruins') {
      var f = r();
      if (f < 0.55) { q.k = 0; q.max = 1.4 + r() * 1.2; q.vx = 150 + r() * 120; q.vy = 10 + r() * 14; q.s = 6 + r() * 10; if (!init) q.x = cam.x - 30; q.c = '#f6dfaa'; }
      else if (f < 0.9) { q.k = 1; q.max = 6 + r() * 5; q.vx = 24 + r() * 30; q.vy = (r() - 0.5) * 8; q.s = 1 + r() * 0.8; q.c = '#ffe4a8'; }
      else { q.k = 2; q.max = 3 + r() * 3; q.vx = 20; q.vy = -14 - r() * 10; q.s = 1.2; q.c = '#ff9a4a'; }
    } else {
      var g = r();
      if (g < 0.4) { q.k = 0; q.max = 3 + r() * 3; q.vx = (r() - 0.5) * 10; q.vy = -14 - r() * 20; q.s = 1 + r(); q.c = r() < 0.6 ? '#ffd27d' : '#ffb04a'; }
      else if (g < 0.58) { q.k = 1; q.max = 8 + r() * 6; q.vx = (r() - 0.5) * 8; q.vy = 6 + r() * 8; q.s = 4 + r() * 3; if (!init) q.y = cam.y - 8; }
      else { q.k = 2; q.max = 6 + r() * 5; q.vx = (r() - 0.5) * 6; q.vy = -3 - r() * 5; q.s = 1.2 + r(); q.c = r() < 0.5 ? '#c8a2ff' : '#e8d8ff'; }
    }
    q.life = init ? q.max * Math.random() : q.max;
    return q;
  }
  function ambient(ctx, game, dt) {
    if (ambFrame === frameNo) return; ambFrame = frameNo;
    var key = game.themeKey, cam = game.cam, vw = game.vw, vh = game.vh, i, q, L = game.level, t = game.time;
    if (ambKey !== key) { ambKey = key; ambP.length = 0; }
    var N = AMB_N[key] || 30;
    if (!ambP.length) for (i = 0; i < N; i++) ambP.push(spawnAmb(game, key, 0, true));
    ctx.save();
    for (i = 0; i < ambP.length; i++) {
      q = ambP[i]; q.life -= dt;
      var out = q.x < cam.x - 60 || q.x > cam.x + vw + 60 || q.y < cam.y - 40 || q.y > cam.y + vh + 40;
      if (q.life <= 0 || out) { ambP[i] = spawnAmb(game, key, 0, false); if (out && Math.random() < 0.5) { /* потеряно вне экрана */ } continue; }
      var u = q.life / q.max, a = Math.min(1, u * 4, (1 - u) * 4 + 0.001);
      if (q.k === 0 && key === 'cistern') {
        q.vy += 320 * dt; q.y += q.vy * dt;
        if (L.solid(Math.floor(q.x / T), Math.floor((q.y + 2) / T), false)) { // всплеск
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; ctx.strokeStyle = '#bfffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(q.x, q.y, 3, 1, 0, 0, TAU); ctx.stroke();
          ambP[i] = spawnAmb(game, key, 0, false); continue;
        }
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75; ctx.fillStyle = q.c; ctx.fillRect(q.x - 0.6, q.y - 3, 1.2, 4);
        continue;
      }
      var wob = Math.sin(t * (key === 'garden' && q.k === 1 ? 2.2 : 1.4) + q.ph);
      q.x += (q.vx + (q.k === 0 && key === 'garden' ? Math.sin(t * 0.9 + q.ph) * 8 : 0) + (q.k === 1 && key === 'garden' ? wob * 14 : 0)) * dt; q.y += (q.vy + (q.k === 0 && key === 'garden' ? Math.cos(t * 0.7 + q.ph) * 7 : 0)) * dt;
      if (key === 'garden') {
        if (q.k === 0) { ctx.globalCompositeOperation = 'lighter'; var pl = 0.5 + 0.5 * Math.sin(t * 2.6 + q.ph); glow(ctx, q.x, q.y, 7 * q.s, q.c, a * (0.25 + pl * 0.55)); ctx.fillStyle = '#fff'; ctx.globalAlpha = a * pl; ctx.fillRect(q.x - 0.6, q.y - 0.6, 1.2, 1.2); }
        else if (q.k === 1) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.9; ctx.fillStyle = q.c; ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 2 + q.ph); ctx.scale(1, 0.55 + 0.45 * Math.sin(t * 3 + q.ph)); ctx.beginPath(); ctx.ellipse(0, 0, q.s, q.s * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore(); }
        else { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.55; ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, 1.2, 1.2); }
      } else if (key === 'cistern') {
        if (q.k === 1) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, q.x, q.y, 6 * q.s, q.c, a * (0.3 + 0.3 * Math.sin(t * 2 + q.ph))); ctx.globalAlpha = a * 0.8; ctx.fillStyle = '#e8ffff'; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1); }
        else { ctx.globalCompositeOperation = 'lighter'; glow(ctx, q.x, q.y, q.s, q.c, a * 0.09); }
      } else if (key === 'ruins') {
        if (q.k === 0) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.4; ctx.strokeStyle = q.c; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x - q.s, q.y - q.s * 0.07); ctx.stroke(); }
        else if (q.k === 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.5; ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.s, q.s); }
        else { ctx.globalCompositeOperation = 'lighter'; glow(ctx, q.x, q.y, 5, q.c, a * 0.6); ctx.globalAlpha = a; ctx.fillStyle = '#ffe0a0'; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1); }
      } else {
        if (q.k === 0) { ctx.globalCompositeOperation = 'lighter'; glow(ctx, q.x, q.y, 6 * q.s, q.c, a * 0.5); ctx.globalAlpha = a; ctx.fillStyle = '#fff3c8'; ctx.fillRect(q.x - 0.5, q.y - 0.5, 1, 1); }
        else if (q.k === 1) { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a * 0.7; var gs = gearSprite(6, q.s, '#4a3a70', 'rgba(232,192,112,0.9)'); ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(t * 1.4 + q.ph); ctx.drawImage(gs, -gs.width / 2, -gs.height / 2); ctx.restore(); }
        else { ctx.globalCompositeOperation = 'lighter'; glow(ctx, q.x, q.y, 5 * q.s, q.c, a * 0.4); }
      }
    }
    ctx.restore();
  }

  // ---------- факел
  function drawTorch(ctx, l, t) {
    var x = l.x, y = l.y, f = Math.sin(t * 9 + x) * 1.4 + Math.sin(t * 23 + x * 2) * 0.7;
    ctx.save();
    // кронштейн
    ctx.fillStyle = '#2a1e18'; ctx.fillRect(x - 2.5, y + 3, 5, 18); ctx.fillStyle = '#5a4838'; ctx.fillRect(x - 1.6, y + 3, 1.6, 18);
    ctx.fillStyle = '#3a2c22'; ctx.beginPath(); ctx.moveTo(x - 7, y - 1); ctx.lineTo(x + 7, y - 1); ctx.lineTo(x + 4.5, y + 6); ctx.lineTo(x - 4.5, y + 6); ctx.fill();
    ctx.fillStyle = '#9a7a4a'; ctx.fillRect(x - 7, y - 2, 14, 2);
    ctx.fillStyle = '#6a5038'; ctx.fillRect(x - 6.4, y + 9, 12.8, 2); ctx.fillRect(x - 3.5, y + 18, 7, 3);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y - 8, 30, '#ff9a3c', 0.5);
    ctx.globalCompositeOperation = 'source-over';
    // пламя
    ctx.fillStyle = '#e8501a'; ctx.beginPath(); ctx.moveTo(x - 5.5, y - 1); ctx.quadraticCurveTo(x - 8, y - 11 - f, x + f * 0.3, y - 21 - f * 1.5); ctx.quadraticCurveTo(x + 8, y - 11 + f, x + 5.5, y - 1); ctx.fill();
    ctx.fillStyle = '#ffa43a'; ctx.beginPath(); ctx.moveTo(x - 4, y - 1); ctx.quadraticCurveTo(x - 5.5, y - 9 - f * 0.5, x + f * 0.2, y - 17 - f); ctx.quadraticCurveTo(x + 5.5, y - 9, x + 4, y - 1); ctx.fill();
    ctx.fillStyle = '#fff0b0'; ctx.beginPath(); ctx.moveTo(x - 2, y - 1); ctx.quadraticCurveTo(x - 2.6, y - 6, x, y - 11 - f * 0.5); ctx.quadraticCurveTo(x + 2.6, y - 6, x + 2, y - 1); ctx.fill();
    // искры
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffc060';
    for (var i = 0; i < 3; i++) { var ph = (t * 0.9 + i * 0.37 + x * 0.01) % 1; ctx.globalAlpha = 1 - ph; ctx.fillRect(x + Math.sin(ph * 6 + i * 2 + x) * 5, y - 14 - ph * 26, 1.3, 1.3); }
    ctx.restore();
  }

  return {
    U: U, THEMES: THEMES, drawBackground: drawBackground, drawTiles: drawTiles, drawBackWall: drawBackWall, invalidate: invalidate,
    drawLighting: drawLighting, drawGlows: drawGlows, drawTorch: drawTorch, ambient: ambient,
    ORB_COL: { dash: '#7fc8ff', djump: '#c8f7a0', slow: '#7fe7ff', rewind: '#c8a2ff', wall: '#ffb86b', chakram: '#ffe08a', smash: '#ff9a6b', hook: '#ffe08a' },
    _frame: function () { return frameNo; }
  };
})();

'use strict';
// Общие помощники: математика, ГСЧ, цвета, сглаживание.
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function sign(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
function approach(v, target, d) { return v < target ? Math.min(v + d, target) : Math.max(v - d, target); }
function smooth(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }
function rnd(a, b) { return a + Math.random() * (b - a); }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var ease = {
  outQuad: function (t) { return 1 - (1 - t) * (1 - t); },
  inQuad: function (t) { return t * t; },
  inOutQuad: function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outCubic: function (t) { return 1 - Math.pow(1 - t, 3); }
};
function hex(c) {
  return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
}
function rgb(r, g, b, a) { return a === undefined ? 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')' : 'rgba(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ',' + a + ')'; }
function mixHex(c1, c2, t, a) {
  var A = hex(c1), B = hex(c2);
  return rgb(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t), a);
}
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
function makeCanvas(w, h) {
  var c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c;
}

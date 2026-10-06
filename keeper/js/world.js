'use strict';
// Мир: тайловая карта, столкновения AABB, опасные тайлы.
var T = 32;
var TILE = { AIR: 0, SOLID: 1, ONEWAY: 2, SPIKE: 3, THIN: 4, CRACK: 5, DOOR: 6 };
var EPS = 0.001;

function Level(def) {
  this.def = def;
  this.w = def.w; this.h = def.h;
  this.t = new Uint8Array(this.w * this.h);
  for (var i = 0; i < def.tiles.length; i++) this.t[i] = def.tiles[i];
  this.theme = def.theme;
  this.explored = new Uint8Array(Math.ceil(this.w / 4) * Math.ceil(this.h / 4));
  this.exW = Math.ceil(this.w / 4);
  this.variant = new Uint8Array(this.w * this.h);        // случайная вариация тайла для рисунка
  var r = mulberry32(def.seed || 7);
  for (var k = 0; k < this.variant.length; k++) this.variant[k] = (r() * 256) | 0;
}
Level.prototype.get = function (tx, ty) {
  if (tx < 0 || tx >= this.w || ty < 0) return TILE.SOLID;
  if (ty >= this.h) return TILE.AIR;
  return this.t[ty * this.w + tx];
};
Level.prototype.set = function (tx, ty, v) {
  if (tx < 0 || tx >= this.w || ty < 0 || ty >= this.h) return;
  this.t[ty * this.w + tx] = v;
  if (this.onChange) this.onChange(tx, ty);
};
Level.prototype.solid = function (tx, ty, phase) {
  var v = this.get(tx, ty);
  return v === TILE.SOLID || v === TILE.CRACK || v === TILE.DOOR || (v === TILE.THIN && !phase);
};
Level.prototype.markExplored = function (px, py) {
  var cx = Math.floor(px / T / 4), cy = Math.floor(py / T / 4);
  for (var dy = -1; dy <= 1; dy++) for (var dx = -2; dx <= 2; dx++) {
    var x = cx + dx, y = cy + dy;
    if (x >= 0 && x < this.exW && y >= 0 && y < Math.ceil(this.h / 4)) this.explored[y * this.exW + x] = 1;
  }
};

// Движение тела. b: {x,y,w,h,vx,vy}. Обновляет b.hitL/hitR/hitU/ground.
// opts: phase (проходить сквозь THIN), drop (проваливаться сквозь ONEWAY), noOneWay
Level.prototype.move = function (b, dx, dy, opts) {
  opts = opts || {};
  var phase = !!opts.phase;
  b.hitL = b.hitR = b.hitU = false;
  // X
  if (dx !== 0) {
    b.x += dx;
    var top = Math.floor(b.y / T), bot = Math.floor((b.y + b.h - EPS) / T);
    if (dx > 0) {
      var tx = Math.floor((b.x + b.w - EPS) / T);
      for (var ty = top; ty <= bot; ty++) if (this.solid(tx, ty, phase)) { b.x = tx * T - b.w; b.hitR = true; break; }
    } else {
      var tx2 = Math.floor(b.x / T);
      for (var ty2 = top; ty2 <= bot; ty2++) if (this.solid(tx2, ty2, phase)) { b.x = (tx2 + 1) * T; b.hitL = true; break; }
    }
  }
  // Y
  var wasGround = false;
  if (dy !== 0) {
    var prevBottom = b.y + b.h;
    b.y += dy;
    var l = Math.floor(b.x / T), r = Math.floor((b.x + b.w - EPS) / T);
    if (dy > 0) {
      var ty3 = Math.floor((b.y + b.h - EPS) / T);
      for (var tx3 = l; tx3 <= r; tx3++) {
        var v = this.get(tx3, ty3);
        var s = this.solid(tx3, ty3, phase);
        if (!s && v === TILE.ONEWAY && !opts.drop && !opts.noOneWay && prevBottom <= ty3 * T + 0.5) s = true;
        if (s) { b.y = ty3 * T - b.h; b.vy = 0; wasGround = true; break; }
      }
    } else {
      var ty4 = Math.floor(b.y / T);
      for (var tx4 = l; tx4 <= r; tx4++) if (this.solid(tx4, ty4, phase)) { b.y = (ty4 + 1) * T; b.hitU = true; if (b.vy < 0) b.vy = 0; break; }
    }
  }
  return wasGround;
};
// стоит ли тело на земле (проба на 1 px вниз)
Level.prototype.groundBelow = function (b, opts) {
  opts = opts || {};
  var l = Math.floor((b.x + 1) / T), r = Math.floor((b.x + b.w - 1 - EPS) / T);
  var ty = Math.floor((b.y + b.h + 1) / T);
  for (var tx = l; tx <= r; tx++) {
    if (this.solid(tx, ty, opts.phase)) return true;
    if (!opts.drop && this.get(tx, ty) === TILE.ONEWAY && b.y + b.h <= ty * T + 1.5) return true;
  }
  return false;
};
// касание стены слева (-1) или справа (+1): пробуем на 2 px в сторону
Level.prototype.wallSide = function (b, dir) {
  var x = dir > 0 ? b.x + b.w + 2 : b.x - 2;
  var tx = Math.floor(x / T);
  var top = Math.floor((b.y + 4) / T), bot = Math.floor((b.y + b.h - 4) / T);
  for (var ty = top; ty <= bot; ty++) if (this.get(tx, ty) === TILE.SOLID) return true;
  return false;
};
Level.prototype.hazardHit = function (b) {
  var l = Math.floor((b.x + 3) / T), r = Math.floor((b.x + b.w - 3) / T);
  var t = Math.floor((b.y + 3) / T), bt = Math.floor((b.y + b.h - 1) / T);
  for (var ty = t; ty <= bt; ty++) for (var tx = l; tx <= r; tx++) {
    if (this.get(tx, ty) === TILE.SPIKE) {
      var sy = ty * T + T * 0.5;
      if (b.y + b.h > sy && b.y < ty * T + T && b.x + b.w - 3 > tx * T + 3 && b.x + 3 < tx * T + T - 3) return true;
    }
  }
  return false;
};
// луч по тайлам: свободна ли линия между точками (для зрения врагов)
Level.prototype.lineClear = function (x0, y0, x1, y1) {
  var n = Math.ceil(dist(x0, y0, x1, y1) / 12);
  for (var i = 1; i < n; i++) {
    var t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
    if (this.solid(Math.floor(x / T), Math.floor(y / T), false)) return false;
  }
  return true;
};

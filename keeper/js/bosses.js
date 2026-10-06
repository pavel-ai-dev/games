'use strict';
// Боссы. BOSS_TYPES[имя] = конструктор (g, x, y, arena{x0,y0,x1,y1 в пикселях}).
// Босс = Enemy с boss=true: g.startBoss() создаёт его, g.endBoss() вызывается, когда boss.dead.
// Здесь: Страж Сада (guardian), Хозяйка Цистерн (serpent), Песчаный Колосс (colossus), Часовщик (clockmaker).
// Общая смерть боссов: die() -> 'dying' (замедление, вспышки, дрожь) -> finishDying() -> dead=true.

// ---------------- общие помощники
var _bGlowCache = {};
function bGlowSprite(color) {
  var c = _bGlowCache[color];
  if (!c) {
    c = makeCanvas(64, 64); var x = c.getContext('2d'), h = hex(color);
    var gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, rgb(h[0], h[1], h[2], 1)); gr.addColorStop(0.35, rgb(h[0], h[1], h[2], 0.45)); gr.addColorStop(1, rgb(h[0], h[1], h[2], 0));
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64); _bGlowCache[color] = c;
  }
  return c;
}
// мягкое свечение (аддитивно) без создания градиентов на кадре
function bGlow(ctx, x, y, r, color, a) {
  var ga = ctx.globalAlpha, gc = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = ga * a;
  ctx.drawImage(bGlowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalCompositeOperation = gc; ctx.globalAlpha = ga;
}
// сходящееся кольцо-предупреждение (u: 0..1 прогресс телеграфа)
function bFlare(ctx, x, y, u, color, r) {
  bGlow(ctx, x, y, r * (0.7 + u * 0.9), color, 0.4 + u * 0.6);
  var ga = ctx.globalAlpha;
  ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.globalAlpha = ga * (0.5 + u * 0.5);
  ctx.beginPath(); ctx.arc(x, y, r * (1.5 - u * 0.9), 0, TAU); ctx.stroke(); ctx.globalAlpha = ga;
}
function bSegDist(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1); var qx = ax + dx * t - px, qy = ay + dy * t - py; return Math.sqrt(qx * qx + qy * qy);
}
function bGear(ctx, x, y, r, n, rot, col, holeCol) {
  ctx.fillStyle = col; ctx.beginPath();
  for (var i = 0; i < n * 2; i++) {
    var a = rot + i * Math.PI / n, rr = (i & 1) ? r * 0.78 : r, a2 = a + Math.PI / n * 0.5;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); ctx.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = holeCol || '#1a0f33'; ctx.beginPath(); ctx.arc(x, y, r * 0.34, 0, TAU); ctx.fill();
}

// ---------------- общая смерть/атрибуты боссов
function bossInherit(C) {
  C.prototype = Object.create(Enemy.prototype); C.prototype.constructor = C;
  C.prototype.onHit = bossOnHit; C.prototype.die = bossDie; C.prototype.tickDying = bossTickDying; C.prototype.finishDying = bossFinish; C.prototype.initBoss = bossInit;
}
function bossInit(name, arena, pal) {
  this.boss = true; this.name = name; this.arena = arena; this.floor = arena.y1; this.pal = pal; this.phase = 1; this.spd = 1;
  this.dying = false; this.dieT = 0; this.dieDur = 2.2; this.ghost = false; this.light = 150; this.dt = 0.016;
}
function bossOnHit(dmg, dir, info, attacker) {
  if (this.dying || this.dead || this.ghost) return false;
  return Enemy.prototype.onHit.call(this, dmg, dir, info, attacker);
}
function bossDie() {
  if (this.dying) return;
  var g = this.g; this.dying = true; this.dieT = 0; this.hp = 0; this.tele = 0; this.stun = 0; this.vx = 0; this.vy = 0; this.invulnT = 999; this.ghost = false;
  g.hitstop(0.25); g.shake(12); g.flash('#ffffff', 0.45); g.timeScale = 0.3;
  g.fx.ring(this.cx(), this.cy(), this.pal[1]); g.fx.burst(this.cx(), this.cy(), 30, this.pal[0], 320);
  if (this.onDying) this.onDying();
}
function bossTickDying(dt) {
  var g = this.g, rt = dt / Math.max(0.05, g.timeScale); this.dieT += rt;
  this.burstT = (this.burstT || 0) - rt;
  if (this.burstT <= 0) {
    this.burstT = 0.06;
    var bx = this.x + Math.random() * this.w, by = this.y + Math.random() * this.h;
    g.fx.burst(bx, by, 5, this.pal[Math.random() < 0.5 ? 0 : 1], 240);
    if (Math.random() < 0.25) g.fx.ring(bx, by, this.pal[1]);
    g.shake(4 + this.dieT * 3);
    if (this.dyingFx) this.dyingFx(rt);
  }
  if (this.dieT >= this.dieDur) this.finishDying();
}
function bossFinish() {
  var g = this.g, cx = this.cx(), cy = this.cy();
  g.timeScale = 1; g.flash('#ffffff', 0.9); g.hitstop(0.14); g.shake(16);
  g.fx.burst(cx, cy, 50, this.pal[0], 380); g.fx.burst(cx, cy, 30, '#ffffff', 300);
  g.fx.ring(cx, cy, '#ffffff'); g.fx.ring(cx, cy, this.pal[1]); g.fx.ring(cx, cy - 20, this.pal[0]);
  if (this.onFinish) this.onFinish();
  Enemy.prototype.die.call(this, 0);
}
// дрожь и растворение при смерти; пара deathPre/deathPost оборачивает рисунок босса
function bDeathPre(ctx, b) {
  ctx.save();
  if (b.dying) {
    var k = Math.min(1, b.dieT / 1.2);
    ctx.translate((Math.random() - 0.5) * 6 * k, (Math.random() - 0.5) * 6 * k);
    if (b.dieT > b.dieDur - 0.7) ctx.globalAlpha = Math.max(0, (b.dieDur - b.dieT) / 0.7);
  }
}
function bDeathPost(ctx, b) {
  ctx.restore();
  if (b.dying) bGlow(ctx, b.cx(), b.cy(), 40 + b.dieT * 70, '#ffffff', Math.min(1, b.dieT / b.dieDur) * 0.85);
}

// ---------------- Волна по полу (вода / песок): перепрыгнуть
function Wave(g, owner, x, dir, speed, kind) {
  Ent.call(this, g, x - 17, owner.floor - 30, 34, 30);
  this.owner = owner; this.dir = dir; this.vx = dir * speed; this.kind = kind || 'sand'; this.layer = 3; this.fl = owner.floor; this.life = 5; this.puffT = 0;
}
Wave.prototype = Object.create(Ent.prototype);
Wave.prototype.kill = function () { this.dead = true; this.g.fx.burst(this.cx(), this.fl - 10, 6, this.kind === 'water' ? '#9fefe8' : '#e0c38a', 120); };
Wave.prototype.update = function (dt) {
  var g = this.g, p = g.player, A = this.owner.arena;
  this.t += dt; this.life -= dt;
  if (this.owner.dead || this.owner.dying || this.life <= 0) { this.kill(); return; }
  this.x += this.vx * dt;
  if (this.cx() < A.x0 + 8 || this.cx() > A.x1 - 8) { this.kill(); return; }
  this.puffT -= dt;
  if (this.puffT <= 0) {
    this.puffT = 0.07;
    g.fx.add({ x: this.cx() + rnd(-8, 8), y: this.fl - rnd(2, 14), vx: -this.vx * 0.1, vy: rnd(-30, -10), life: 0.4, max: 0.4, size: rnd(2, 4), color: this.kind === 'water' ? '#9fefe8' : '#e0c38a', grav: -10, drag: 2, glow: this.kind === 'water' });
  }
  if (!p.dead && p.x < this.x + this.w - 5 && p.x + p.w > this.x + 5 && p.y + p.h > this.y + 6 && p.y < this.y + this.h) {
    var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: false, src: this });
    if (r === 'hit') this.kill();
  }
};
Wave.prototype.draw = function (ctx) {
  var x = this.cx(), fl = this.fl, f = this.dir, water = this.kind === 'water', k = 1 + Math.sin(this.t * 14) * 0.07;
  ctx.save(); ctx.translate(x, fl); ctx.scale(f, k);
  ctx.fillStyle = water ? 'rgba(70,200,200,0.85)' : 'rgba(200,160,100,0.9)';
  ctx.beginPath(); ctx.moveTo(-20, 0); ctx.bezierCurveTo(-16, -10, -6, -24, 6, -28); ctx.bezierCurveTo(16, -30, 22, -22, 15, -17); ctx.bezierCurveTo(19, -12, 21, -6, 21, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = water ? '#d6fff8' : '#fff0c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-14, -8); ctx.bezierCurveTo(-8, -18, 0, -24, 8, -26); ctx.stroke();
  ctx.restore();
  bGlow(ctx, x, fl - 14, 30, water ? '#4fd6c8' : '#ffbf5c', 0.5);
};

// ---------------- Падающий камень (колосс): тень = телеграф
function Rock(g, owner, tx, delay) {
  Ent.call(this, g, tx - 15, owner.floor - 340, 30, 30);
  this.owner = owner; this.tx = tx; this.delay = delay; this.age = 0; this.vy = 0; this.layer = 3; this.fall = false; this.rot = rnd(0, 6); this.fl = owner.floor;
}
Rock.prototype = Object.create(Ent.prototype);
Rock.prototype.update = function (dt) {
  var g = this.g, p = g.player;
  this.t += dt; this.age += dt;
  if (this.owner.dead || this.owner.dying) { this.dead = true; return; }
  if (!this.fall) { if (this.age >= this.delay) { this.fall = true; this.vy = 160; } return; }
  this.vy += 1900 * dt; this.y += this.vy * dt; this.rot += dt * 5;
  if (!p.dead && p.x < this.x + this.w - 3 && p.x + p.w > this.x + 3 && p.y < this.y + this.h && p.y + p.h > this.y + 4) {
    p.takeHit({ dmg: 1, x: this.cx(), parryable: false, src: this });
    g.fx.burst(this.cx(), this.cy(), 10, '#e0c38a', 200); this.dead = true; return;
  }
  if (this.y + this.h >= this.fl) {
    this.dead = true; g.shake(4); g.fx.dust(this.cx(), this.fl, 8, 2); g.fx.burst(this.cx(), this.fl - 8, 8, '#c9a470', 200);
  }
};
Rock.prototype.draw = function (ctx) {
  var u = clamp(this.age / Math.max(0.1, this.delay), 0, 1);
  if (!this.fall) {
    ctx.save(); ctx.translate(this.tx, this.fl - 1); ctx.scale(1, 0.18);
    ctx.fillStyle = 'rgba(255,60,40,' + (0.12 + u * 0.4) + ')'; ctx.beginPath(); ctx.arc(0, 0, 12 + u * 26, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,90,60,' + (0.4 + u * 0.5) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 12 + u * 26, 0, TAU); ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.save(); ctx.translate(this.cx(), this.cy()); ctx.rotate(this.rot);
  ctx.fillStyle = '#9b7a4e'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-5, -15); ctx.lineTo(10, -12); ctx.lineTo(15, 2); ctx.lineTo(6, 14); ctx.lineTo(-9, 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9a470'; ctx.beginPath(); ctx.moveTo(-5, -15); ctx.lineTo(10, -12); ctx.lineTo(4, -4); ctx.lineTo(-10, -4); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#5a3d26'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(3, 9); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = '#e0c38a'; ctx.fillRect(this.cx() - 3, this.y - 30, 6, 30); ctx.restore();
};

// ---------------- Песчаные лучи (колосс): красные, по диагонали от головы
function SandBeams(g, owner, base, offs, tele) {
  var A = owner.arena; Ent.call(this, g, A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  this.owner = owner; this.offs = offs; this.tele = tele; this.age = 0; this.base = base; this.fire = 0.55; this.xs = []; this.layer = 3; this.fired = false; this.sx = owner.hx; this.sy = owner.hy; this.dirs = [];
  for (var i = 0; i < offs.length; i++) { this.xs.push(base + offs[i]); this.dirs.push(1); }
}
SandBeams.prototype = Object.create(Ent.prototype);
SandBeams.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner, A = o.arena, i;
  this.t += dt; this.age += dt;
  if (o.dead || o.dying) { this.dead = true; return; }
  this.sx = o.hx; this.sy = o.hy;
  if (this.age < this.tele * 0.55) this.base = p.cx();
  for (i = 0; i < this.offs.length; i++) { this.xs[i] = clamp(this.base + this.offs[i], A.x0 + 24, A.x1 - 24); this.dirs[i] = o.cx() >= this.xs[i] ? 1 : -1; }
  if (this.age >= this.tele && this.age < this.tele + this.fire) {
    if (!this.fired) { this.fired = true; g.shake(7); g.flash('#ffbf5c', 0.12); }
    for (i = 0; i < this.xs.length; i++) {
      g.fx.add({ x: this.xs[i] + rnd(-8, 8), y: o.floor - 2, vx: rnd(-60, 60), vy: rnd(-160, -60), life: 0.4, max: 0.4, size: rnd(2, 4), color: '#ffbf5c', grav: 400, drag: 1, glow: true });
      if (!p.dead) {
        var dr = this.dirs[i];
        for (var k = 0; k <= 24; k++) {
          var hh = k / 24 * 230, bx = this.xs[i] + dr * 0.45 * hh, by = o.floor - hh;
          if (bx > p.x - 6 && bx < p.x + p.w + 6 && by > p.y - 4 && by < p.y + p.h + 4) { p.takeHit({ dmg: 1, x: bx, parryable: false, src: this }); break; }
        }
      }
    }
  }
  if (this.age >= this.tele + this.fire + 0.15) { this.dead = true; this.done = true; }
};
SandBeams.prototype.draw = function (ctx) {
  var o = this.owner, fl = o.floor, i, x;
  if (this.age < this.tele) {
    var u = clamp(this.age / this.tele, 0, 1);
    ctx.save(); ctx.setLineDash([7, 6]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,74,58,' + (0.25 + u * 0.7) + ')';
    for (i = 0; i < this.xs.length; i++) {
      x = this.xs[i]; ctx.beginPath(); ctx.moveTo(x + this.dirs[i] * 180, fl - 400); ctx.lineTo(x, fl); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (i = 0; i < this.xs.length; i++) {
      x = this.xs[i]; ctx.save(); ctx.translate(x, fl - 1); ctx.scale(1, 0.2); ctx.fillStyle = 'rgba(255,74,58,' + (0.15 + u * 0.5) + ')'; ctx.beginPath(); ctx.arc(0, 0, 14 + u * 16, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
    bFlare(ctx, this.sx, this.sy, u, '#ff4a3a', 26);
  } else {
    var f = clamp((this.age - this.tele) / (this.fire + 0.15), 0, 1), w = 17 * (1 - f * f);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (i = 0; i < this.xs.length; i++) {
      x = this.xs[i];
      ctx.strokeStyle = 'rgba(255,150,60,0.55)'; ctx.lineWidth = w + 8; var tx = x + this.dirs[i] * 180, ty = fl - 400;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, fl); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,110,0.9)'; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, fl); ctx.stroke();
      ctx.strokeStyle = '#fff6d8'; ctx.lineWidth = w * 0.35; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, fl); ctx.stroke();
    }
    ctx.restore();
    for (i = 0; i < this.xs.length; i++) bGlow(ctx, this.xs[i], fl - 4, 36, '#ffbf5c', 1 - f);
  }
};

// ---------------- Вихрь песка (колосс, фаза 2): притягивает
function Vortex(g, owner, x) {
  Ent.call(this, g, x - 60, owner.floor - 160, 120, 160);
  this.owner = owner; this.cxx = x; this.fl = owner.floor; this.life = 4.6; this.layer = 3; this.age = 0;
}
Vortex.prototype = Object.create(Ent.prototype);
Vortex.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner;
  this.t += dt; this.age += dt; this.life -= dt;
  if (o.dead || o.dying || this.life <= 0) { this.dead = true; return; }
  var grow = clamp(this.age / 0.6, 0, 1) * clamp(this.life / 0.5, 0, 1);
  if (Math.random() < dt * 40) {
    var a = Math.random() * TAU, hh = rnd(0, 150);
    g.fx.add({ x: this.cxx + Math.cos(a) * (20 + hh * 0.4), y: this.fl - hh, vx: -Math.sin(a) * 150, vy: rnd(-20, 10), life: 0.5, max: 0.5, size: rnd(2, 4), color: '#e0c38a', grav: 0, drag: 1.5, glow: false });
  }
  if (!p.dead && grow > 0.5) {
    var dx = this.cxx - p.cx(), ax = Math.abs(dx);
    if (ax < 340 && p.y + p.h > this.fl - 190) {
      var pull = 135 * (1 - ax / 480) * grow;
      g.level.move(p, sign(dx) * Math.min(ax, pull * dt), 0);
    }
    if (ax < 28 && p.y + p.h > this.fl - 170) p.takeHit({ dmg: 1, x: this.cxx, parryable: false, src: this });
  }
};
Vortex.prototype.draw = function (ctx) {
  var grow = clamp(this.age / 0.6, 0, 1) * clamp(this.life / 0.5, 0, 1), x = this.cxx, fl = this.fl, t = this.t;
  ctx.save();
  for (var k = 0; k < 12; k++) {
    var yy = fl - k * 13 * grow, rw = (10 + k * 5.5) * grow, off = Math.sin(t * 6 + k * 0.7) * rw * 0.35;
    ctx.fillStyle = 'rgba(225,190,130,' + (0.22 * grow) + ')'; ctx.strokeStyle = 'rgba(255,230,170,' + (0.5 * grow) + ')'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(x + off, yy, rw, 5.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + off, yy, rw, 5.5, 0, t * 3 + k, t * 3 + k + 2.4); ctx.stroke();
  }
  ctx.restore();
  bGlow(ctx, x, fl - 30, 60 * grow, '#ffbf5c', 0.5);
};

// ---------------- Водяной шар-орбита (змея, фаза 2)
function WaterOrb(g, owner, ang, fireAt) {
  Ent.call(this, g, owner.cx(), owner.cy(), 22, 22);
  this.owner = owner; this.ang = ang; this.rad = 10; this.age = 0; this.fireAt = fireAt; this.hurt = true; this.layer = 3; this.uid = ++Chakram.uid; this.light = 60;
}
WaterOrb.prototype = Object.create(Ent.prototype);
WaterOrb.prototype.box = function () { return this; };
WaterOrb.prototype.pop = function (fx) {
  this.dead = true; if (fx) { this.g.fx.burst(this.cx(), this.cy(), 12, '#9fefe8', 220); this.g.fx.ring(this.cx(), this.cy(), '#bff7ee'); }
};
WaterOrb.prototype.onHit = function (dmg, dir, info) {
  if (this.dead) return false;
  if (info && info.hit) { if (info.hit.indexOf(this.uid) >= 0) return false; info.hit.push(this.uid); }
  this.pop(true); return true;
};
WaterOrb.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner;
  this.t += dt; this.age += dt;
  if (o.dead || o.dying || o.ghost || o.rise < 0.5) { this.pop(!o.dead); return; }
  this.ang += dt * 1.9 * o.spd; this.rad = approach(this.rad, 78, 140 * dt);
  this.x = o.px + Math.cos(this.ang) * this.rad - 11; this.y = o.floor - 70 + Math.sin(this.ang) * this.rad * 0.55 - 11;
  if (this.age >= this.fireAt) {
    var dx = p.cx() - this.cx(), dy = p.cy() - this.cy(), d = Math.sqrt(dx * dx + dy * dy) || 1;
    g.add(new Projectile(g, this.cx(), this.cy(), dx / d * 265, dy / d * 265, { dmg: 1, color: '#ffe27a', parryable: true, r: 8, life: 3.2, kind: 'orb' }));
    this.pop(true); return;
  }
  if (!p.dead && overlap(this, p)) {
    var res = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
    if (res === 'parried' || res === 'hit' || res === 'blocked') this.pop(true);
  }
};
WaterOrb.prototype.draw = function (ctx) {
  var x = this.cx(), y = this.cy(), charge = this.fireAt - this.age < 0.55, fl = charge && Math.sin(this.t * 30) > 0;
  bGlow(ctx, x, y, 26, fl ? '#ffe27a' : '#4fd6c8', 0.9);
  ctx.fillStyle = fl ? '#fff3b0' : '#8ff0e6'; ctx.beginPath(); ctx.arc(x, y, 8 + Math.sin(this.t * 8) * 1.2, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8fffb'; ctx.beginPath(); ctx.arc(x - 2.5, y - 2.5, 3, 0, TAU); ctx.fill();
  if (charge) { ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.stroke(); }
};

// ---------------- Бассейны арены змеи + пузыри/рябь-телеграф
function ArenaDeco(g, owner) {
  var A = owner.arena; Ent.call(this, g, A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0); this.owner = owner; this.layer = 0;
}
ArenaDeco.prototype = Object.create(Ent.prototype);
ArenaDeco.prototype.update = function (dt) { this.t += dt; if (this.owner.dead) this.dead = true; };
ArenaDeco.prototype.draw = function (ctx) {
  var o = this.owner, fl = o.floor, t = this.t, i, s;
  for (i = 0; i < o.slots.length; i++) {
    s = o.slots[i]; var act = Math.abs(s - o.px) < 2 && o.rise > 0.05;
    ctx.fillStyle = 'rgba(6,40,52,0.95)'; ctx.beginPath(); ctx.ellipse(s, fl + 1, 56, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(70,200,200,' + (act ? 0.5 : 0.28) + ')'; ctx.beginPath(); ctx.ellipse(s, fl + 1, 48 + Math.sin(t * 2 + i) * 2, 5.5, 0, 0, TAU); ctx.fill();
    var rr = (t * 18 + i * 13) % 40; ctx.strokeStyle = 'rgba(170,250,240,' + (0.5 * (1 - rr / 40)) + ')'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(s, fl + 1, 10 + rr, 1 + rr * 0.12, 0, 0, TAU); ctx.stroke();
  }
  if (o.state === 'submerge' || (o.state === 'emerge' && o.stateT < 0.1)) {
    var x = o.tgtX, lock = o.tgtLock, u = o.tgtU, col = lock ? '#ff6a58' : '#9ffcf0';
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = lock ? 0.5 + Math.sin(t * 24) * 0.4 : 0.6;
    for (i = 0; i < 3; i++) { var q = (t * 1.6 + i / 3) % 1; ctx.beginPath(); ctx.ellipse(x, fl + 1, 14 + q * 46, 2 + q * 7, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = col;
    for (i = 0; i < 9; i++) {
      var bu = (t * 0.9 + i * 0.37) % 1; ctx.globalAlpha = (1 - bu) * (0.5 + u * 0.5);
      ctx.beginPath(); ctx.arc(x + Math.sin(i * 7.3 + t * 3) * 24, fl - bu * (30 + u * 40), 1.8 + (i % 3), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (lock) {
      ctx.save(); ctx.translate(x, fl - 1); ctx.scale(1, 0.16); ctx.fillStyle = 'rgba(255,74,58,0.35)'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill(); ctx.restore();
    }
  }
};

// ---------------- Замедляющая зона (часовщик)
function TimeZone(g, owner, x, sx, sy) {
  Ent.call(this, g, x - 100, owner.floor - 100, 200, 100);
  this.owner = owner; this.cxx = x; this.R = 96; this.age = 0; this.sx = sx; this.sy = sy; this.fallT = 0.55; this.grow = 0.45; this.life = 7; this.layer = 0; this.fl = owner.floor; this.inside = false;
}
TimeZone.prototype = Object.create(Ent.prototype);
TimeZone.prototype.amount = function () {
  var a = clamp((this.age - this.fallT) / this.grow, 0, 1), tail = this.fallT + this.grow + this.life;
  return a * clamp((tail - this.age) / 0.6, 0, 1);
};
TimeZone.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner;
  this.t += dt; this.age += dt;
  if (o.dead || o.dying || this.age > this.fallT + this.grow + this.life) { this.dead = true; return; }
  var a = this.amount(); this.inside = false;
  if (a > 0.6 && !p.dead && Math.abs(p.cx() - this.cxx) < this.R * a && p.y + p.h > this.fl - 90) { p.vx *= 0.62; this.inside = true; if (Math.random() < dt * 12) g.fx.mote(p.cx() + rnd(-8, 8), p.cy() + rnd(-10, 10), '#7fe7ff'); }
  if (a > 0 && Math.random() < dt * 14) g.fx.mote(this.cxx + rnd(-this.R, this.R) * a, this.fl - rnd(0, 40), '#c8a2ff');
};
TimeZone.prototype.draw = function (ctx) {
  var x = this.cxx, fl = this.fl, a = this.amount(), t = this.t;
  if (this.age < this.fallT) {
    var u = this.age / this.fallT, ox = lerp(this.sx, x, u), oy = lerp(this.sy, fl - 8, u) - Math.sin(u * Math.PI) * 60;
    bGlow(ctx, ox, oy, 22, '#7fe7ff', 1); ctx.fillStyle = '#e8ffff'; ctx.beginPath(); ctx.arc(ox, oy, 5, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(x, fl - 1); ctx.scale(1, 0.14); ctx.strokeStyle = 'rgba(127,231,255,0.7)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, this.R * (0.4 + u * 0.3), 0, TAU); ctx.stroke(); ctx.restore();
    return;
  }
  var R = this.R * a;
  ctx.save(); ctx.translate(x, fl - 1); ctx.scale(1, 0.16);
  ctx.fillStyle = 'rgba(90,60,170,' + (0.32 * a) + ')'; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,230,255,' + (0.85 * a) + ')'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(200,162,255,' + (0.7 * a) + ')'; ctx.beginPath(); ctx.arc(0, 0, R * 0.72, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,160,' + (0.8 * a) + ')'; ctx.lineWidth = 5;
  for (var i = 0; i < 12; i++) { var an = i * TAU / 12 + t * 0.5; ctx.beginPath(); ctx.moveTo(Math.cos(an) * R * 0.85, Math.sin(an) * R * 0.85); ctx.lineTo(Math.cos(an) * R * 0.97, Math.sin(an) * R * 0.97); ctx.stroke(); }
  var ha = -t * 1.2; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ha) * R * 0.6, Math.sin(ha) * R * 0.6); ctx.stroke();
  ctx.restore();
  bGlow(ctx, x, fl - 20, R * 0.9, '#8a6aff', 0.28 * a);
  if (this.inside) { ctx.save(); ctx.strokeStyle = 'rgba(127,231,255,0.8)'; ctx.lineWidth = 1.5; var p = this.g.player; ctx.beginPath(); ctx.arc(p.cx(), p.cy(), 22 + Math.sin(t * 12) * 2, 0, TAU); ctx.stroke(); ctx.restore(); }
};

// ---------------- Фантом-копия часовщика: жёлтый удар, исчезает
function Phantom(g, owner, x, delay) {
  Ent.call(this, g, x - 11, owner.floor - 62, 22, 62);
  this.owner = owner; this.hurt = true; this.hp = 1; this.uid = ++Chakram.uid; this.layer = 2; this.state = 'in'; this.stateT = 0; this.facing = 1;
  this.nextAtk = delay; this.life = 6.2; this.tele = 0; this.teleMax = 0.45; this.hitDone = false; this.attacks = 0; this.alpha = 0; this.light = 70;
}
Phantom.prototype = Object.create(Ent.prototype);
Phantom.prototype.box = function () { return this; };
Phantom.prototype.vanish = function (fx) {
  this.dead = true; if (fx) { this.g.fx.burst(this.cx(), this.cy(), 16, '#9fe8ff', 260); this.g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); }
};
Phantom.prototype.onHit = function (dmg, dir, info) {
  if (this.dead || this.state === 'in') return false;
  if (info && info.hit) { if (info.hit.indexOf(this.uid) >= 0) return false; info.hit.push(this.uid); }
  this.vanish(true); this.g.fx.slash(this.cx(), this.cy(), dir, 1); return true;
};
Phantom.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner, A = o.arena;
  this.t += dt; this.stateT += dt; this.life -= dt;
  if (o.dead || o.dying) { this.vanish(false); return; }
  if (this.life <= 0) { this.state = 'out'; this.stateT = 0; this.life = 99; }
  var s = this.state;
  if (s === 'in') { this.alpha = clamp(this.stateT / 0.6, 0, 0.8); if (this.stateT > 0.6) { this.state = 'wait'; this.stateT = 0; } }
  else if (s === 'wait') {
    this.facing = p.cx() >= this.cx() ? 1 : -1; this.nextAtk -= dt;
    if (this.nextAtk <= 0) { this.state = 'tele'; this.stateT = 0; this.tele = this.teleMax = 0.45 / o.spd; }
  } else if (s === 'tele') {
    this.tele -= dt; if (this.tele <= 0) { this.state = 'dash'; this.stateT = 0; this.hitDone = false; }
  } else if (s === 'dash') {
    if (this.stateT < 0.22) this.x = clamp(this.x + this.facing * 470 * dt, A.x0 + 12, A.x1 - 12 - this.w);
    if (this.stateT < 0.26 && !this.hitDone) {
      var bx = this.facing > 0 ? this.x + this.w - 6 : this.x - 52;
      if (!p.dead && p.x < bx + 58 && p.x + p.w > bx && p.y < this.y + this.h && p.y + p.h > this.y + 4) {
        this.hitDone = true;
        var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
        if (r === 'parried') { this.vanish(true); o.onHit(1, this.facing, { hit: [], stage: 1 }, p); return; }
      }
    }
    if (this.stateT > 0.32) { this.attacks++; if (this.attacks >= 2) { this.state = 'out'; this.stateT = 0; } else { this.state = 'wait'; this.stateT = 0; this.nextAtk = 1.7 / o.spd; } }
  } else if (s === 'out') { this.alpha = Math.max(0, this.alpha - dt * 3); if (this.alpha <= 0) this.dead = true; }
};
Phantom.prototype.draw = function (ctx) {
  Bosses.drawClockman(ctx, this.cx(), this.y + this.h, this.facing, { t: this.t, alpha: this.alpha, ph: 1, pose: this.state === 'tele' ? 1 : (this.state === 'dash' ? 2 : 0), p: this.state === 'dash' ? clamp(this.stateT / 0.22, 0, 1) : 0, fl: false, hs: 2.4 });
  if (this.state === 'tele') bFlare(ctx, this.cx() + this.facing * 14, this.cy() - 6, 1 - this.tele / this.teleMax, '#ffd84a', 24);
};

// ---------------- Шестерёнка-снаряд часовщика (жёлтая, парируется)
function GearShot(g, x, y, vx, vy, o) { Projectile.call(this, g, x, y, vx, vy, o); }
GearShot.prototype = Object.create(Projectile.prototype);
GearShot.prototype.draw = function (ctx) {
  var x = this.cx(), y = this.cy();
  bGlow(ctx, x, y, this.r * 3, this.friendly ? '#fff3b0' : '#ffd84a', 0.85);
  bGear(ctx, x, y, this.r + 3, 8, this.t * 9, this.friendly ? '#fff3b0' : '#f0c860', '#5a3d10');
};

// ---------------- Стрелки-лучи часов (часовщик, фаза 3)
function ClockHands(g, owner, px, py, dir) {
  var A = owner.arena; Ent.call(this, g, A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
  this.owner = owner; this.px = px; this.py = py; this.age = 0; this.tele = 1.3; this.dur = 5.8; this.fade = 0.6; this.dir = dir; this.layer = 1;
  var pl = g.player, pa = Math.atan2(pl.cy() - py, pl.cx() - px);
  this.a2 = pa - dir * Math.PI * 0.75; this.a1 = pa - dir * Math.PI * 0.9; this.w2 = 1.05 * dir; this.w1 = 0.55 * dir; this.l2 = 480; this.l1 = 300;
}
ClockHands.prototype = Object.create(Ent.prototype);
ClockHands.prototype.update = function (dt) {
  var g = this.g, p = g.player, o = this.owner;
  this.t += dt; this.age += dt;
  if (o.dead || o.dying || this.age > this.tele + this.dur + this.fade) { this.dead = true; return; }
  if (this.age >= this.tele && this.age < this.tele + this.dur) {
    this.a1 += this.w1 * dt; this.a2 += this.w2 * dt;
    if (!p.dead) {
      this.hitHand(p, this.a2, this.l2, 6 + 10); this.hitHand(p, this.a1, this.l1, 8 + 10);
    }
  }
};
ClockHands.prototype.hitHand = function (p, a, len, rad) {
  var ex = this.px + Math.cos(a) * len, ey = this.py + Math.sin(a) * len;
  if (bSegDist(p.cx(), p.cy() - 9, this.px, this.py, ex, ey) < rad || bSegDist(p.cx(), p.cy() + 9, this.px, this.py, ex, ey) < rad) {
    var ax = Math.cos(a), r = p.takeHit({ dmg: 1, x: p.cx() - (ax >= 0 ? -1 : 1) * 20, parryable: false, src: this });
    if (r === 'hit') this.g.fx.burst(p.cx(), p.cy(), 10, '#c8a2ff', 220);
  }
};
ClockHands.prototype.draw = function (ctx) {
  var A = this.owner.arena, u = clamp(this.age / this.tele, 0, 1), live = this.age >= this.tele, alpha = live ? clamp((this.tele + this.dur + this.fade - this.age) / this.fade, 0, 1) : 0.25 + u * 0.35;
  ctx.save(); ctx.beginPath(); ctx.rect(A.x0, A.y0 - 200, A.x1 - A.x0, this.owner.floor - (A.y0 - 200)); ctx.clip();
  ctx.globalAlpha = alpha;
  // циферблат
  var px = this.px, py = this.py, i;
  ctx.fillStyle = 'rgba(20,10,46,0.8)'; ctx.beginPath(); ctx.arc(px, py, 30, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e2bd5f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 30, 0, TAU); ctx.stroke();
  ctx.lineWidth = 2; for (i = 0; i < 12; i++) { var an = i * TAU / 12; ctx.beginPath(); ctx.moveTo(px + Math.cos(an) * 24, py + Math.sin(an) * 24); ctx.lineTo(px + Math.cos(an) * 29, py + Math.sin(an) * 29); ctx.stroke(); }
  this.drawHand(ctx, this.a1, this.l1, 15, live, u); this.drawHand(ctx, this.a2, this.l2, 10, live, u);
  ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(px, py, 7, 0, TAU); ctx.fill();
  bGlow(ctx, px, py, 56, '#b48aff', 0.6);
  ctx.restore();
};
ClockHands.prototype.drawHand = function (ctx, a, len, th, live, u) {
  var px = this.px, py = this.py, ca = Math.cos(a), sa = Math.sin(a);
  ctx.save(); ctx.lineCap = 'round';
  if (!live) {
    ctx.strokeStyle = 'rgba(255,74,58,' + (0.3 + u * 0.6) + ')'; ctx.lineWidth = 3; ctx.setLineDash([8, 7]);
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + ca * len, py + sa * len); ctx.stroke(); ctx.restore(); return;
  }
  ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(180,138,255,0.55)'; ctx.lineWidth = th + 12;
  ctx.beginPath(); ctx.moveTo(px - ca * 36, py - sa * 36); ctx.lineTo(px + ca * len, py + sa * len); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#e2bd5f'; ctx.lineWidth = th; ctx.beginPath(); ctx.moveTo(px - ca * 36, py - sa * 36); ctx.lineTo(px + ca * (len - 22), py + sa * (len - 22)); ctx.stroke();
  ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = th * 0.3; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + ca * (len - 22), py + sa * (len - 22)); ctx.stroke();
  ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.moveTo(px + ca * len, py + sa * len);
  ctx.lineTo(px + ca * (len - 30) - sa * th * 0.9, py + sa * (len - 30) + ca * th * 0.9); ctx.lineTo(px + ca * (len - 30) + sa * th * 0.9, py + sa * (len - 30) - ca * th * 0.9); ctx.closePath(); ctx.fill();
  ctx.restore();
};

// ---------------- Шестерня-обломок (смерть часовщика)
function GearDebris(g, x, y, vx, vy, r, fl) {
  Ent.call(this, g, x - r, y - r, r * 2, r * 2); this.vx = vx; this.vy = vy; this.r = r; this.fl = fl; this.life = 2.4; this.rot = 0; this.vr = rnd(-8, 8); this.layer = 3;
}
GearDebris.prototype = Object.create(Ent.prototype);
GearDebris.prototype.update = function (dt) {
  this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
  this.vy += 1100 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.rot += this.vr * dt;
  if (this.y + this.h > this.fl) { this.y = this.fl - this.h; this.vy = -this.vy * 0.45; this.vx *= 0.7; this.vr *= 0.7; if (Math.abs(this.vy) < 60) this.vy = 0; }
};
GearDebris.prototype.draw = function (ctx) {
  ctx.save(); ctx.globalAlpha = clamp(this.life / 0.6, 0, 1);
  bGear(ctx, this.cx(), this.cy(), this.r, 8, this.rot, '#e2bd5f', '#2a1b52'); ctx.restore();
};

// =====================================================================================
// 1. СТРАЖ САДА (зона 1, 32 HP) — образец
// =====================================================================================
function GuardianBoss(g, x, y, arena) {
  Enemy.call(this, g, x, y, { w: 38, h: 66, hp: 32, armor: true, touch: 1, shard: 14 });
  this.initBoss('Страж Сада', arena, ['#ffb86b', '#ffe9a8']);
  this.facing = -1; this.light = 130;
  this.setState('intro'); this.nextAtk = 0; this.combo = 0; this.hitDone = false; this.waveSpeed = 250;
}
bossInherit(GuardianBoss);
GuardianBoss.prototype.update = function (dt) {
  this.baseUpdate(dt);
  var g = this.g, p = g.player, s = this.state;
  if (this.dying) { this.physics(dt); this.tickDying(dt); return; }
  if (this.phase === 1 && this.hp < this.maxHp * 0.5) { this.phase = 2; g.shake(10); g.flash('#ff3b3b', 0.3); g.fx.ring(this.cx(), this.cy(), '#ff6b6b'); this.waveSpeed = 330; }
  var spd = this.phase === 2 ? 1.25 : 1;
  if (this.stun > 0) { this.vx = approach(this.vx, 0, 900 * dt); this.physics(dt); return; }
  if (s === 'intro') {
    this.vx = 0; this.face();
    if (this.stateT < 0.1) { g.shake(4); g.fx.dust(this.cx(), this.y + this.h, 10, 2); }
    if (this.stateT > 0.6 && !this.roared) { this.roared = true; g.shake(8); g.fx.ring(this.cx(), this.cy(), '#ffd27d'); g.fx.burst(this.cx(), this.y + 10, 16, '#ffd27d', 260); }
    if (this.stateT > 1.2) this.setState('chase');
  } else if (s === 'chase' || s === 'stunned') {
    this.face();
    var d = Math.abs(this.dx());
    if (s === 'stunned') this.setState('chase');
    else if (d < 70) { this.vx = 0; this.setState('wind1'); this.startTele(0.5 / spd, true); }
    else if (this.stateT > 1.3) {
      if (Math.random() < 0.55) { this.vx = 0; this.setState('leapwind'); this.startTele(0.6 / spd, false); }
      else { this.vx = 0; this.setState('wavewind'); this.startTele(0.7 / spd, false); }
    } else this.vx = this.facing * 90 * spd;
  } else if (s === 'wind1') {
    this.vx = 0; if (this.tele <= 0) { this.setState('slash1'); this.hitDone = false; this.vx = this.facing * 220; }
  } else if (s === 'slash1' || s === 'slash2') {
    this.vx = approach(this.vx, 0, 700 * dt);
    if (this.stateT > 0.06 && this.stateT < 0.2 && !this.hitDone) this.swing(1);
    if (this.stateT > 0.32) {
      if (s === 'slash1' && (this.phase === 2 || Math.random() < 0.5)) { this.face(); this.setState('wind2'); this.startTele(0.38 / spd, true); }
      else this.setState('recover');
    }
  } else if (s === 'wind2') {
    this.vx = 0; if (this.tele <= 0) { this.setState('slash2'); this.hitDone = false; this.vx = this.facing * 260; }
  } else if (s === 'recover') {
    this.vx = 0; if (this.stateT > 0.7 / spd) this.setState('chase');
  } else if (s === 'leapwind') {
    this.vx = 0; this.face();
    if (this.tele <= 0) {
      var tx = clamp(p.cx(), this.arena.x0 + 40, this.arena.x1 - 40), t = 0.62;
      this.vx = (tx - this.cx()) / t; this.vy = -720; this.setState('leap'); this.onGround = false;
    }
  } else if (s === 'leap') {
    if (this.stateT > 0.15 && this.onGround) {
      this.vx = 0; this.slam(); this.setState('recover');
    }
  } else if (s === 'wavewind') {
    this.vx = 0; this.face(); if (this.tele <= 0) { this.slam(true); this.setState('recover'); }
  }
  this.physics(dt);
  this.x = clamp(this.x, this.arena.x0 + 10, this.arena.x1 - this.w - 10);
  this.touchDamage();
};
GuardianBoss.prototype.swing = function (dmg) {
  var p = this.g.player;
  var box = { x: this.facing > 0 ? this.x + this.w - 6 : this.x - 56, y: this.y + 6, w: 62, h: this.h - 10 };
  if (!p.dead && overlap(box, p)) {
    this.hitDone = true;
    var r = p.takeHit({ dmg: dmg, x: this.cx(), parryable: true, src: this });
    if (r === 'parried') this.parried(1.7);
  }
};
GuardianBoss.prototype.slam = function (fromGround) {
  var g = this.g, fy = this.y + this.h;
  g.shake(9); g.fx.dust(this.cx(), fy, 16, 3); g.fx.ring(this.cx(), fy, '#ffb86b');
  for (var d = -1; d <= 1; d += 2) g.add(new Projectile(g, this.cx() + d * 22, fy - 13, d * this.waveSpeed, 0, { dmg: 1, color: '#ffb86b', parryable: false, r: 13, life: 3.2, kind: 'wave' }));
  var p = g.player; if (!fromGround && !p.dead && Math.abs(p.cx() - this.cx()) < 50 && p.grounded) p.takeHit({ dmg: 1, x: this.cx(), parryable: false });
};
GuardianBoss.prototype.draw = function (ctx) { Bosses.drawGuardian(ctx, this); };

// =====================================================================================
// 2. ХОЗЯЙКА ЦИСТЕРН (зона 2, 28 HP): водяная змея-колдунья
//   Вынырнув у бассейна: укус (жёлтый, парируется -> оглушение), удар хвостом (красный, прыжок),
//   плевок шарами (жёлтые), волна по полу (красная, прыжок), нырок -> геизер под ногами (красный).
//   Фаза 2 (<50%): быстрее, двойной хвост, 3 шара, водяные шары-орбиты (бьются/парируются).
// =====================================================================================
function SerpentBoss(g, x, y, arena) {
  Enemy.call(this, g, x, y, { w: 46, h: 104, hp: 28, armor: true, touch: 0, shard: 18, flying: true });
  this.initBoss('Хозяйка Цистерн', arena, ['#5fe0d0', '#d6fff8']);
  this.slots = []; for (var i = 0; i < 5; i++) this.slots.push(arena.x0 + 100 + (arena.x1 - arena.x0 - 200) * i / 4);
  var best = this.slots[0]; for (i = 1; i < 5; i++) if (Math.abs(this.slots[i] - x) < Math.abs(best - x)) best = this.slots[i];
  this.px = best; this.rise = 0; this.facing = -1; this.ghost = true; this.atkN = 0; this.lastAtk = ''; this.pendingRoar = false; this.orbList = [];
  this.tgtX = this.px; this.tgtU = 0; this.tgtLock = false; this.shotsLeft = 0; this.tailsLeft = 0; this.hitDone = false; this.waveT = 0; this.recoil = 0; this.roared = false;
  this.subMode = 'slot'; this.subLen = 1.5; this.tailDir = -1;
  this.setState('intro'); this.syncBody();
  g.add(new ArenaDeco(g, this));
}
bossInherit(SerpentBoss);
SerpentBoss.INT = { idle: 1, recover: 1, spitwind: 1, tailwind: 1, wavewind: 1, bitewind: 1, tail: 1 };
SerpentBoss.prototype.onHit = function (dmg, dir, info, attacker) {
  var h0 = this.hp, r = bossOnHit.call(this, dmg, dir, info, attacker);
  if (r) {
    this.dmgAcc = (this.dmgAcc || 0) + (h0 - this.hp);
    if (this.dmgAcc >= 5 && !this.dying && this.stun <= 0 && SerpentBoss.INT[this.state]) { this.dmgAcc = 0; this.tele = 0; this.waveT = 0; this.lastAtk = 'dive'; this.g.fx.text(this.px, this.floor - 120, 'НЫРЯЕТ', '#bff7ee'); this.setState('dive'); }
  }
  return r;
};
SerpentBoss.prototype.syncBody = function () {
  this.x = this.px - this.w / 2; this.y = this.floor - this.h * this.rise; this.light = 70 + 90 * this.rise;
};
SerpentBoss.prototype.update = function (dt) {
  this.baseUpdate(dt);
  var g = this.g, p = g.player, s = this.state, spd = this.spd, A = this.arena, i;
  this.recoil -= dt;
  if (this.dying) { this.syncBody(); this.tickDying(dt); return; }
  if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
    this.phase = 2; this.spd = spd = 1.3; this.pendingRoar = true; g.shake(10); g.flash('#4fd6c8', 0.3); g.fx.ring(this.px, this.floor - 50, '#9ffcf0');
  }
  if (this.waveT > 0) { this.waveT -= dt; if (this.waveT <= 0) { g.add(new Wave(g, this, this.px + this.tailDir * 30, this.tailDir, 250, 'water')); g.fx.dust(this.px, this.floor, 6, 2); } }
  if (this.stun > 0) { this.rise = approach(this.rise, 1, dt * 3); this.ghost = false; this.syncBody(); return; }

  if (s === 'intro') {
    var u = clamp(this.stateT / 0.9, 0, 1); this.rise = ease.outCubic(u); this.ghost = u < 0.6;
    if (this.stateT < 0.05) { g.shake(4); g.fx.ring(this.px, this.floor, '#9ffcf0'); }
    if (!this.roared && this.stateT > 0.85) { this.roared = true; g.shake(9); g.fx.burst(this.px, this.floor - 60, 20, '#9ffcf0', 300); g.fx.ring(this.px, this.floor - 60, '#5fe0d0'); }
    if (this.stateT > 1.25) this.setState('idle');
  } else if (s === 'idle' || s === 'stunned') {
    this.rise = 1; this.ghost = false; this.face();
    if (this.stateT > (s === 'stunned' ? 0.2 : 0.55 / spd)) this.decide();
  } else if (s === 'bitewind') {
    if (this.tele <= 0) { this.setState('bite'); this.hitDone = false; g.shake(3); }
  } else if (s === 'bite') {
    if (this.stateT > 0.06 && this.stateT < 0.3 && !this.hitDone) {
      var bx = this.facing > 0 ? this.px - 10 : this.px - 150, bo = this.tmp || (this.tmp = { x: 0, y: 0, w: 160, h: 100 });
      bo.x = bx; bo.y = this.floor - 110;
      if (!p.dead && overlap(bo, p)) {
        this.hitDone = true;
        var r = p.takeHit({ dmg: 1, x: this.px, parryable: true, src: this });
        if (r === 'parried') { this.parried(1.8); this.setState('stunned'); }
      }
    }
    if (this.state === 'bite' && this.stateT > 0.6) this.setState('recover');
  } else if (s === 'tailwind') {
    if (this.tele <= 0) { this.setState('tail'); this.hitDone = false; this.tailsLeft--; g.shake(4); g.fx.dust(this.px + this.tailDir * 120, this.floor, 10, 3); g.fx.burst(this.px + this.tailDir * 200, this.floor - 8, 10, '#9fefe8', 200); }
  } else if (s === 'tail') {
    if (this.stateT > 0.04 && this.stateT < 0.26 && !this.hitDone) {
      var tb = this.tmp2 || (this.tmp2 = { x: 0, y: 0, w: 250, h: 26 });
      tb.x = this.tailDir > 0 ? this.px : this.px - 250; tb.y = this.floor - 26;
      if (!p.dead && overlap(tb, p)) { this.hitDone = true; p.takeHit({ dmg: 1, x: this.px, parryable: false, src: this }); }
    }
    if (this.stateT > 0.5) { if (this.tailsLeft > 0) { this.setState('tailwind'); this.startTele(0.42 / spd, false); } else this.setState('recover'); }
  } else if (s === 'spitwind') {
    if (this.tele <= 0) {
      this.spit(); this.recoil = 0.2; this.shotsLeft--;
      if (this.shotsLeft > 0) { this.setState('spitwind'); this.startTele(0.42 / spd, true); } else this.setState('recover');
    }
  } else if (s === 'wavewind') {
    if (this.tele <= 0) {
      g.shake(7); g.fx.ring(this.px, this.floor, '#9ffcf0'); g.fx.dust(this.px, this.floor, 10, 3);
      g.add(new Wave(g, this, this.px + this.facing * 30, this.facing, 235 * (this.phase === 2 ? 1.1 : 1), 'water'));
      this.tailDir = this.facing; if (this.phase === 2) this.waveT = 0.6;
      this.setState('recover');
    }
  } else if (s === 'recover') {
    this.rise = 1; if (this.stateT > 0.65 / spd) this.setState('idle');
  } else if (s === 'roar' || s === 'summon') {
    this.rise = 1;
    if (this.stateT > 0.45 && !this.cast) { this.cast = true; g.shake(8); g.flash('#4fd6c8', 0.2); g.fx.ring(this.px, this.floor - 60, '#9ffcf0'); this.spawnOrbs(); }
    if (this.stateT > (s === 'roar' ? 1.0 : 0.85)) this.setState('idle');
  } else if (s === 'dive') {
    var d1 = clamp(this.stateT / 0.55, 0, 1); this.rise = 1 - ease.inQuad(d1); this.ghost = this.rise < 0.65;
    if (this.stateT < 0.05) { g.fx.burst(this.px, this.floor - 20, 16, '#9fefe8', 260); g.fx.ring(this.px, this.floor, '#9ffcf0'); g.shake(4); }
    if (this.stateT > 0.6) {
      this.rise = 0; this.ghost = true; this.setState('submerge'); this.tgtLock = false; this.tgtU = 0;
      this.subMode = Math.random() < 0.6 ? 'ambush' : 'slot'; this.subLen = (this.subMode === 'ambush' ? 1.8 : 1.3) / (this.phase === 2 ? 1.15 : 1);
      if (this.subMode === 'slot') {
        var tries = 0; do { this.tgtX = this.slots[(Math.random() * 5) | 0]; tries++; } while ((Math.abs(this.tgtX - this.px) < 5 || Math.abs(this.tgtX - p.cx()) < 150) && tries < 12);
      } else this.tgtX = clamp(p.cx(), A.x0 + 60, A.x1 - 60);
    }
  } else if (s === 'submerge') {
    this.rise = 0; this.ghost = true;
    if (this.subMode === 'ambush') {
      if (this.stateT < this.subLen - 0.9) { this.tgtX = clamp(p.cx(), A.x0 + 60, A.x1 - 60); this.tgtLock = false; }
      else this.tgtLock = true;
    }
    this.tgtU = clamp(this.stateT / this.subLen, 0, 1);
    if (this.stateT >= this.subLen) {
      this.px = this.tgtX; this.tgtLock = false; this.setState('emerge'); this.hitDone = false; this.face();
      g.shake(7); g.fx.burst(this.px, this.floor - 20, 22, '#9fefe8', 320); g.fx.ring(this.px, this.floor, '#d6fff8');
    }
  } else if (s === 'emerge') {
    var e1 = clamp(this.stateT / 0.45, 0, 1); this.rise = ease.outCubic(e1); this.ghost = this.rise < 0.6; this.face();
    if (this.stateT < 0.32 && !this.hitDone && !p.dead && Math.abs(p.cx() - this.px) < 40 && p.y + p.h > this.floor - 150) {
      this.hitDone = true; p.takeHit({ dmg: 1, x: this.px, parryable: false, src: this });
    }
    if (this.stateT > 0.5) this.setState('idle');
  }
  this.syncBody();
  // касание корпуса
  if (this.rise > 0.8 && !this.ghost && !p.dead && p.x < this.px + 15 && p.x + p.w > this.px - 15 && p.y < this.floor && p.y + p.h > this.floor - 90) p.takeHit({ dmg: 1, x: this.px, parryable: false, src: this });
};
SerpentBoss.prototype.decide = function () {
  var d = Math.abs(this.dx()), i, spd = this.spd;
  this.atkN++;
  for (i = this.orbList.length - 1; i >= 0; i--) if (this.orbList[i].dead) this.orbList.splice(i, 1);
  if (this.pendingRoar) { this.pendingRoar = false; this.cast = false; this.lastAtk = 'roar'; this.setState('roar'); return; }
  if (this.phase === 2 && !this.orbList.length && this.lastAtk !== 'summon' && Math.random() < 0.6) { this.cast = false; this.lastAtk = 'summon'; this.setState('summon'); return; }
  if (this.atkN % 3 === 0 && this.lastAtk !== 'dive') { this.lastAtk = 'dive'; this.setState('dive'); return; }
  var pick;
  if (d < 130 && this.lastAtk !== 'bite' && Math.random() < 0.65) pick = 'bite';
  else {
    var r = Math.random(); pick = r < 0.34 ? 'spit' : (r < 0.67 ? 'wave' : 'tail');
    if (pick === 'tail' && d > 300) pick = 'spit';
    if (pick === this.lastAtk) pick = pick === 'spit' ? (d < 300 ? 'tail' : 'wave') : 'spit';
  }
  this.lastAtk = pick;
  if (pick === 'bite') { this.setState('bitewind'); this.startTele(0.5 / spd, true); }
  else if (pick === 'tail') { this.setState('tailwind'); this.startTele(0.65 / spd, false); this.tailsLeft = this.phase === 2 ? 2 : 1; this.tailDir = this.facing; }
  else if (pick === 'spit') { this.setState('spitwind'); this.startTele(0.55 / spd, true); this.shotsLeft = this.phase === 2 ? 3 : 2; }
  else { this.setState('wavewind'); this.startTele(0.7 / spd, false); }
};
SerpentBoss.prototype.spit = function () {
  var g = this.g, p = g.player, mx = this.px + this.facing * 22, my = this.floor - 92 * this.rise;
  var dx = p.cx() - mx, dy = p.cy() - my, d = Math.sqrt(dx * dx + dy * dy) || 1, sp = 250 * (this.phase === 2 ? 1.1 : 1);
  g.add(new Projectile(g, mx, my, dx / d * sp, dy / d * sp, { dmg: 1, color: '#ffe27a', parryable: true, r: 8, life: 3.5, kind: 'orb' }));
  g.fx.burst(mx, my, 6, '#ffe27a', 160);
};
SerpentBoss.prototype.spawnOrbs = function () {
  for (var i = 0; i < 3; i++) { var o = new WaterOrb(this.g, this, i * TAU / 3, 2.8 + i * 0.7); this.orbList.push(o); this.g.add(o); }
};
SerpentBoss.prototype.parried = function (t) { Enemy.prototype.parried.call(this, t); this.rise = 1; };
SerpentBoss.prototype.draw = function (ctx) { Bosses.drawSerpent(ctx, this); };

// =====================================================================================
// 3. ПЕСЧАНЫЙ КОЛОСС (зона 3, 36 HP): броня — урон только по подсвеченной слабой точке
//   Кулак сверху (красный, ударная волна) -> кулак застревает: бей по запястью.
//   Размах (жёлтый): парирование = на колени, ядро открыто (урон x2).
//   Лучи (красные, диагональ) -> перегрев: ядро открыто. Падающие камни.
//   Фаза 2 (<50%): вихрь песка (притягивает), прыжки с ударной волной, быстрее.
// =====================================================================================
function ColossusBoss(g, x, y, arena) {
  Enemy.call(this, g, x, y, { w: 92, h: 168, hp: 36, armor: true, touch: 1, shard: 26 });
  this.initBoss('Песчаный Колосс', arena, ['#ffbf5c', '#fff0c0']);
  this.dieDur = 2.6; this.facing = -1; this.weak = 0; this.kneel = 1; this.kneelTo = 1; this.open = 0; this.aim = 90; this.aimLock = false;
  this.hl = { x: 70, y: -40 }; this.lastAtk = ''; this.vortex = null; this.hitDone = false; this.light = 220; this.beams = null; this.volleys = 0; this.pendingRoar = false;
  this.hx = this.cx(); this.hy = this.floor - 150; this.clankT = 0; this.leapX = x; this.leapLock = false; this.roared = false; this.sweepU = 0; this.stuckX = 0;
  this.box_ = { x: 0, y: 0, w: 0, h: 0 }; this.tmp = { x: 0, y: 0, w: 0, h: 0 };
  this.setState('intro');
}
bossInherit(ColossusBoss);
ColossusBoss.prototype.box = function () {
  var b = this.box_, f = this.facing;
  if (this.state === 'stuck' && this.weak > 0) { b.x = this.cx() + f * this.aim - 42; b.y = this.floor - 64; b.w = 84; b.h = 64; return b; }
  if (this.weak > 0 || this.stun > 0) { b.x = this.cx() - 46; b.y = this.floor - 110; b.w = 92; b.h = 110; return b; }
  return this;
};
ColossusBoss.prototype.onHit = function (dmg, dir, info, attacker) {
  if (this.dying || this.dead) return false;
  if (!(this.weak > 0 || this.stun > 0)) {
    if (info && info.hit) { if (info.hit.indexOf(this.uid) >= 0) return false; info.hit.push(this.uid); }
    var g = this.g, f = attacker && attacker.cx ? attacker : g.player;
    g.fx.burst(f.cx() + dir * 26, f.cy() - 4, 6, '#ffe9a8', 200); g.fx.ring(f.cx() + dir * 26, f.cy() - 4, '#ffe9a8');
    if (this.clankT <= 0) { this.clankT = 0.7; g.fx.text(this.cx(), this.y + 20, 'ЗВОН', '#ffe9a8'); }
    g.shake(1.5); this.flash = 0.05;
    return false;
  }
  return Enemy.prototype.onHit.call(this, dmg, dir, info, attacker);
};
ColossusBoss.prototype.hand = function (tx, ty, k) { this.hl.x = smooth(this.hl.x, tx, k, this.dt); this.hl.y = smooth(this.hl.y, ty, k, this.dt); };
ColossusBoss.prototype.vortexAlive = function () { return this.vortex && !this.vortex.dead; };
ColossusBoss.prototype.update = function (dt) {
  this.baseUpdate(dt); this.dt = dt; this.clankT -= dt;
  var g = this.g, p = g.player, s = this.state, spd = this.spd, A = this.arena, f = this.facing;
  this.kneel = approach(this.kneel, this.kneelTo, dt * 3.2);
  this.open = approach(this.open, (this.weak > 0 || this.stun > 0) ? 1 : 0, dt * 4);
  this.hx = this.cx() + f * 14; this.hy = this.floor - 158 + 44 * this.kneel;
  if (this.dying) { this.kneelTo = 1; this.hand(60, -20, 4); this.physics(dt); this.tickDying(dt); return; }
  if (this.weak > 0) this.weak -= dt;
  if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
    this.phase = 2; this.spd = spd = 1.2; this.pendingRoar = true; g.shake(12); g.flash('#ffbf5c', 0.3); g.fx.ring(this.cx(), this.cy(), '#ffd27d'); g.fx.burst(this.cx(), this.cy(), 24, '#ffbf5c', 300);
  }
  if (this.stun > 0) {
    this.vx = approach(this.vx, 0, 900 * dt); this.kneelTo = 1; this.hand(56, -14, 5); this.physics(dt); this.keepIn(); return;
  }
  if (s === 'intro') {
    this.vx = 0; this.face(); this.kneelTo = this.stateT < 0.7 ? 1 : 0; this.hand(110, -190, 4);
    if (this.stateT < 0.1) { g.shake(4); g.fx.dust(this.cx(), this.floor, 14, 3); }
    if (!this.roared && this.stateT > 0.95) { this.roared = true; g.shake(12); g.flash('#ffbf5c', 0.2); g.fx.ring(this.cx(), this.floor - 20, '#ffd27d'); g.fx.dust(this.cx(), this.floor, 24, 4); g.fx.burst(this.cx(), this.hy, 18, '#ffbf5c', 280); }
    if (this.stateT > 1.3) this.setState('chase');
  } else if (s === 'chase' || s === 'stunned') {
    this.face(); this.kneelTo = 0; this.hand(70 + Math.sin(this.t * 2) * 4, -38, 7);
    var d = Math.abs(this.dx());
    if (s === 'stunned') { this.setState('recover'); }
    else {
      this.vx = d > 100 ? this.facing * 55 * spd : 0;
      if (this.vx && this.onGround && Math.sin(this.t * 6.5) > 0.96) { g.shake(1.5); g.fx.dust(this.cx() + f * 20, this.floor, 3, 1); }
      if (this.stateT > 0.6 / spd && (d < 150 || this.stateT > 1.8)) { this.vx = 0; this.pick(d); }
    }
  } else if (s === 'slamwind') {
    this.vx = 0; this.kneelTo = 0;
    if (!this.aimLock) { this.aim = clamp(Math.abs(this.dx()), 30, 125); if (this.tele < 0.28) this.aimLock = true; }
    this.hand(this.aim, -238, 9);
    if (this.tele <= 0) { this.setState('slam'); this.hitDone = false; }
  } else if (s === 'slam') {
    this.hand(this.aim, -16, 48);
    if (this.stateT >= 0.1 && !this.hitDone) { this.hitDone = true; this.impact(this.cx() + f * this.aim, true); }
    if (this.stateT > 0.22) { this.setState('stuck'); this.weak = this.phase === 2 ? 1.7 : 2.1; this.kneelTo = 0.35; g.fx.text(this.cx() + f * this.aim, this.floor - 76, 'УЯЗВИМ!', '#fff3b0'); }
  } else if (s === 'stuck') {
    this.hand(this.aim, -16 + Math.sin(this.t * 25) * 1.5, 30);
    if (this.weak <= 0) this.setState('recover');
  } else if (s === 'sweepwind') {
    this.vx = 0; this.kneelTo = 0; this.hand(-80, -168, 9);
    if (this.tele <= 0) { this.setState('sweep'); this.hitDone = false; g.shake(3); }
  } else if (s === 'sweep') {
    var u = clamp(this.stateT / 0.38, 0, 1), th = lerp(-2.5, 0.85, Math.pow(u, 1.4)), sy = -124 + 44 * this.kneel;
    this.hl.x = 36 + Math.cos(th) * 150; this.hl.y = sy + Math.sin(th) * 150;
    if (this.stateT > 0.1 && this.stateT < 0.34 && !this.hitDone) {
      var b = this.tmp; b.w = 186; b.h = 116; b.y = this.floor - 120; b.x = f > 0 ? this.cx() + 14 : this.cx() - 14 - 186;
      if (!p.dead && overlap(b, p)) {
        this.hitDone = true;
        var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
        if (r === 'parried') { this.parried(2.9); this.weak = 2.9; g.shake(10); g.fx.text(this.cx(), this.y + 10, 'ЯДРО ОТКРЫТО', '#fff3b0'); g.fx.burst(this.cx(), this.cy(), 16, '#ffbf5c', 260); return; }
      }
    }
    if (this.stateT > 0.75) this.setState('recover');
  } else if (s === 'beamwind') {
    this.vx = 0; this.kneelTo = 0; this.hand(110, -190, 6);
    if (this.tele <= 0) this.setState('beamfire');
  } else if (s === 'beamfire') {
    this.hand(110, -190, 6);
    if (!this.beams || this.beams.dead) {
      this.volleys--;
      if (this.volleys > 0) this.beginBeams(0.7 / spd);
      else { this.setState('overheat'); this.weak = 1.8; this.kneelTo = 1; g.fx.text(this.cx(), this.y + 10, 'ПЕРЕГРЕВ — БЕЙ В ЯДРО', '#fff3b0'); g.fx.burst(this.cx(), this.floor - 90, 14, '#ffbf5c', 240); }
    }
  } else if (s === 'overheat') {
    this.vx = 0; this.kneelTo = 1; this.hand(56, -14, 5);
    if (Math.random() < dt * 14) g.fx.add({ x: this.cx() + rnd(-14, 14), y: this.floor - 80, vx: rnd(-30, 30), vy: rnd(-120, -60), life: 0.5, max: 0.5, size: rnd(2, 4), color: '#ffbf5c', grav: 100, drag: 1, glow: true });
    if (this.weak <= 0) this.setState('recover');
  } else if (s === 'rockwind') {
    this.vx = 0; this.kneelTo = 0; this.hand(110, -190, 6);
    if (Math.random() < dt * 10) g.fx.dust(this.cx() + rnd(-200, 200), this.floor - 280, 1, 1);
    if (this.tele <= 0) this.setState('rockfall');
  } else if (s === 'rockfall') {
    this.hand(70, -38, 6); if (this.stateT > 0.9) this.setState('recover');
  } else if (s === 'leapwind') {
    this.vx = 0; this.kneelTo = 0.9; this.hand(20, -60, 8);
    if (!this.leapLock) { this.leapX = clamp(p.cx(), A.x0 + 70, A.x1 - 70); if (this.tele < 0.3) this.leapLock = true; }
    if (this.tele <= 0) { this.vx = clamp((this.leapX - this.cx()) / 0.72, -520, 520); this.vy = -780; this.onGround = false; this.setState('leap'); this.kneelTo = 0; g.fx.dust(this.cx(), this.floor, 14, 3); }
  } else if (s === 'leap') {
    this.hand(40, -210, 8);
    if (this.stateT > 0.2 && this.onGround) {
      this.vx = 0; this.impact(this.cx(), false); this.setState('landed'); this.weak = 1.2; this.kneelTo = 1;
      g.fx.text(this.cx(), this.y + 10, 'УЯЗВИМ!', '#fff3b0');
    }
  } else if (s === 'landed') {
    this.vx = 0; this.hand(56, -14, 5); if (this.weak <= 0) this.setState('recover');
  } else if (s === 'vortexwind') {
    this.vx = 0; this.kneelTo = 0; this.hand(110, -150, 6);
    if (this.tele <= 0) {
      this.vortex = new Vortex(g, this, clamp(this.cx() + f * 300, A.x0 + 90, A.x1 - 90)); g.add(this.vortex);
      g.shake(6); g.fx.ring(this.vortex.cxx, this.floor, '#ffd27d'); this.setState('cast');
    }
  } else if (s === 'cast') {
    this.hand(80, -60, 6); if (this.stateT > 0.5) this.setState('recover');
  } else if (s === 'roar') {
    this.vx = 0; this.kneelTo = 0; this.hand(110, -200, 6);
    if (this.tele <= 0) this.setState('recover');
  } else if (s === 'recover') {
    this.vx = 0; this.kneelTo = 0; this.hand(70, -38, 6);
    if (this.stateT > 0.75 / spd) this.setState('chase');
  }
  this.physics(dt); this.keepIn();
  this.touchDamage();
};
ColossusBoss.prototype.keepIn = function () { this.x = clamp(this.x, this.arena.x0 + 10, this.arena.x1 - this.w - 10); };
ColossusBoss.prototype.pick = function (d) {
  var r = Math.random(), near = d < 170, a, spd = this.spd, g = this.g;
  if (this.pendingRoar) {
    this.pendingRoar = false; this.lastAtk = 'roar'; this.setState('roar'); this.startTele(1.0, false);
    var px = g.player.cx(); this.spawnRocks(5, 1.0, px); return;
  }
  if (this.phase === 2 && !this.vortexAlive() && this.lastAtk !== 'vortex' && r < 0.16) a = 'vortex';
  else if (this.phase === 2 && d > 200 && r < 0.5 && this.lastAtk !== 'leap') a = 'leap';
  else if (near) a = r < 0.45 ? 'fist' : (r < 0.85 ? 'sweep' : (r < 0.93 ? 'beam' : 'rocks'));
  else a = r < 0.5 ? 'beam' : 'rocks';
  if (a === this.lastAtk) a = near ? (a === 'fist' ? 'sweep' : 'fist') : (a === 'beam' ? 'rocks' : 'beam');
  this.lastAtk = a;
  if (a === 'fist') { this.setState('slamwind'); this.aim = clamp(Math.abs(this.dx()), 30, 125); this.aimLock = false; this.startTele(0.75 / spd, false); }
  else if (a === 'sweep') { this.setState('sweepwind'); this.startTele(0.6 / spd, true); }
  else if (a === 'beam') { this.setState('beamwind'); this.startTele(0.95 / spd, false); this.volleys = this.phase === 2 ? 2 : 1; this.beginBeams(0.95 / spd, true); }
  else if (a === 'rocks') { this.setState('rockwind'); this.startTele(0.95 / spd, false); this.spawnRocks(this.phase === 2 ? 6 : 4, 0.95 / spd, this.g.player.cx()); }
  else if (a === 'leap') { this.setState('leapwind'); this.leapLock = false; this.startTele(0.85 / spd, false); }
  else if (a === 'vortex') { this.setState('vortexwind'); this.startTele(0.8 / spd, false); }
};
ColossusBoss.prototype.beginBeams = function (tele, first) {
  var p = this.g.player, offs = this.phase === 2 && !first ? [-130, -20, 95, 205] : [-110, 0, 110];
  this.beams = new SandBeams(this.g, this, p.cx(), offs, tele); this.g.add(this.beams);
  if (!first) { this.setState('beamwind'); this.startTele(tele, false); }
};
ColossusBoss.prototype.spawnRocks = function (n, tele, px) {
  var A = this.arena, i, xs = [];
  xs.push(clamp(px + rnd(-30, 30), A.x0 + 40, A.x1 - 40));
  for (i = 1; i < n; i++) {
    var x, tries = 0; do { x = rnd(A.x0 + 50, A.x1 - 50); tries++; var ok = true; for (var k = 0; k < xs.length; k++) if (Math.abs(xs[k] - x) < 70) ok = false; } while (!ok && tries < 15);
    xs.push(x);
  }
  for (i = 0; i < xs.length; i++) this.g.add(new Rock(this.g, this, xs[i], tele + i * 0.12 + rnd(0, 0.3)));
};
ColossusBoss.prototype.impact = function (x, fist) {
  var g = this.g, p = g.player, fl = this.floor, ws = this.phase === 2 ? 285 : 240;
  g.shake(fist ? 11 : 13); g.hitstop(0.04); g.fx.dust(x, fl, 16, 3); g.fx.ring(x, fl - 6, '#ffd27d'); g.fx.burst(x, fl - 10, 14, '#e0c38a', 260);
  if (!p.dead && Math.abs(p.cx() - x) < (fist ? 44 : 60) && p.y + p.h > fl - 70) p.takeHit({ dmg: 1, x: x, parryable: false, src: this });
  g.add(new Wave(g, this, x - 40, -1, ws, 'sand')); g.add(new Wave(g, this, x + 40, 1, ws, 'sand'));
};
ColossusBoss.prototype.parried = function (t) { Enemy.prototype.parried.call(this, t); this.kneelTo = 1; };
ColossusBoss.prototype.draw = function (ctx) { Bosses.drawColossus(ctx, this); };

// =====================================================================================
// 4. ЧАСОВЩИК (зона 4, ФИНАЛ, 40 HP, 3 фазы): повелитель времени
//   Блинк-удар (телепорт со следом; жёлтый), фантомы-копии (жёлтые удары), шестерёнки (жёлтые),
//   замедляющие зоны, перемотка себя (раз за фазу, здоровье не восстанавливает).
//   Ф2 (<65%): быстрее, двойной блинк, 3 фантома. Ф3 (<25%): ещё быстрее + стрелки-лучи по арене.
// =====================================================================================
function ClockmakerBoss(g, x, y, arena) {
  Enemy.call(this, g, x, y, { w: 44, h: 78, hp: 40, armor: true, touch: 1, shard: 40, flying: true });
  this.initBoss('Часовщик', arena, ['#c8a2ff', '#e8ffff']);
  this.dieDur = 3.0; this.light = 200; this.hover = 12; this.ty = this.floor - this.h - this.hover; this.facing = -1;
  this.deck = []; this.lastAtk = ''; this.atkN = 0; this.phase3N = 0; this.rewindReady = true; this.pendingRewind = false; this.phaseHp = this.maxHp; this.alpha = 1;
  this.hist = []; for (var i = 0; i < 22; i++) this.hist.push({ x: this.x, y: this.y }); this.histI = 0; this.histT = 0;
  this.ghosts = []; for (i = 0; i < 24; i++) this.ghosts.push({ life: 0, x: 0, y: 0, f: 1 });
  this.phantoms = []; this.zones = []; this.blinksLeft = 0; this.dest = x; this.hands = null; this.gearsLeft = 0; this.recDur = 0.85; this.handsPending = false;
  this.roared = false; this.lungeV = 0; this.tmp = { x: 0, y: 0, w: 76, h: 70 }; this.rwFrom = { x: 0, y: 0 }; this.rwTo = { x: 0, y: 0 };
  this.y = this.ty - 170; this.setState('intro');
}
bossInherit(ClockmakerBoss);
ClockmakerBoss.prototype.onHit = function (dmg, dir, info, attacker) {
  var h0 = this.hp, r = bossOnHit.call(this, dmg, dir, info, attacker);
  if (r) {
    this.dmgAcc = (this.dmgAcc || 0) + (h0 - this.hp);
    if (this.dmgAcc >= 7 && !this.dying && this.stun <= 0 && !this.pendingRewind && ClockmakerBoss.RW_OK[this.state]) { this.dmgAcc = 0; this.tele = 0; this.blinksLeft = 1; this.setState('blinkout'); }
  }
  if (r && this.rewindReady && !this.dying && this.hp > 0 && this.stun <= 0 && this.hp <= this.phaseHp - 3 && ClockmakerBoss.RW_OK[this.state]) { this.rewindReady = false; this.pendingRewind = true; }
  return r;
};
ClockmakerBoss.RW_OK = { idle: 1, recover: 1, gearwind: 1, blinkin: 1, zonecast: 1, summon: 1 };
ClockmakerBoss.prototype.addGhost = function (x, y, f, life) {
  for (var i = 0; i < this.ghosts.length; i++) { var q = this.ghosts[i]; if (q.life <= 0) { q.life = life || 0.5; q.max = q.life; q.x = x; q.y = y; q.f = f; return; } }
};
ClockmakerBoss.prototype.startPhase = function (n) {
  var g = this.g, i; this.phase = n; this.spd = [1, 1.15, 1.4][n - 1]; this.rewindReady = true; this.phaseHp = this.hp; this.pendingRewind = false;
  for (i = 0; i < this.phantoms.length; i++) this.phantoms[i].vanish(true);
  this.phantoms.length = 0; this.tele = 0; this.stun = 0; this.ghost = false; this.alpha = 1;
  this.setState('phase'); this.invulnT = 1.4; this.handsPending = n === 3;
  g.flash('#7fe7ff', 0.35); g.shake(11); g.hitstop(0.08); g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); g.fx.ring(this.cx(), this.cy(), '#c8a2ff'); g.fx.burst(this.cx(), this.cy(), 26, '#c8a2ff', 320);
  for (i = 0; i < 6; i++) g.add(new GearDebris(g, this.cx(), this.cy(), rnd(-260, 260), rnd(-420, -150), rnd(5, 9), this.floor));
};
ClockmakerBoss.prototype.update = function (dt) {
  this.baseUpdate(dt); this.dt = dt;
  var g = this.g, p = g.player, s = this.state, spd = this.spd, A = this.arena, i;
  for (i = 0; i < this.ghosts.length; i++) this.ghosts[i].life -= dt;
  if (this.dying) { this.tickDying(dt); return; }
  if (!this.ghost && s !== 'handsrun' && s !== 'handsup') {
    this.histT -= dt; if (this.histT <= 0) { this.histT = 0.1; this.histI = (this.histI + 1) % 22; this.hist[this.histI].x = this.x; this.hist[this.histI].y = this.y; }
  }
  if (s !== 'intro' && s !== 'phase' && s !== 'rewind' && !this.handsBusy()) {
    if (this.phase === 1 && this.hp < this.maxHp * 0.65) { this.startPhase(2); return; }
    if (this.phase === 2 && this.hp < this.maxHp * 0.25) { this.startPhase(3); return; }
  }
  this.touch = this.ghost ? 0 : 1;
  if (this.pendingRewind && ClockmakerBoss.RW_OK[s]) { this.pendingRewind = false; this.beginRewind(); s = this.state; }
  if (this.stun > 0) {
    this.vx = 0; this.ty = this.floor - this.h; this.y = smooth(this.y, this.ty, 8, dt); this.alpha = 1; return;
  }
  if (s === 'intro') {
    var u = clamp(this.stateT / 1.0, 0, 1); this.y = this.ty - 170 * (1 - ease.outCubic(u)); this.face();
    if (this.stateT < 0.05) { g.shake(4); g.fx.ring(this.cx(), this.cy(), '#c8a2ff'); }
    if (!this.roared && this.stateT > 0.95) { this.roared = true; g.shake(9); g.flash('#c8a2ff', 0.2); g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); g.fx.burst(this.cx(), this.cy(), 22, '#c8a2ff', 300); }
    if (this.stateT > 1.25) this.setState('idle');
  } else if (s === 'phase') {
    this.ty = this.floor - this.h - 50; this.y = smooth(this.y, this.ty, 6, dt); this.face();
    if (this.stateT > 1.3) { this.ty = this.floor - this.h - this.hover; if (this.handsPending) { this.handsPending = false; this.startHands(); } else this.setState('idle'); }
  } else if (s === 'idle' || s === 'stunned') {
    this.alpha = 1; this.ty = this.floor - this.h - this.hover; this.face();
    if (s === 'stunned') this.setState('recover');
    else {
      var d = Math.abs(this.dx()), dir = this.dx() >= 0 ? 1 : -1;
      this.x = clamp(this.x + (d > 240 ? dir * 70 : (d < 110 ? -dir * 45 : 0)) * dt, A.x0 + 12, A.x1 - 12 - this.w);
      if (this.stateT > 0.65 / spd) this.pickAttack();
    }
  } else if (s === 'recover') {
    this.face(); this.ty = this.floor - this.h - this.hover;
    if (this.stateT > this.recDur / spd) { this.recDur = 0.85; this.setState('idle'); }
  } else if (s === 'blinkout') {
    var bo = clamp(this.stateT / 0.3, 0, 1); this.alpha = 1 - bo;
    if (this.stateT < 0.03) this.addGhost(this.x, this.y, this.facing, 0.5);
    if (this.stateT >= 0.3) {
      this.alpha = 0; this.ghost = true; this.setState('blinkwait');
      var side = Math.random() < 0.7 ? p.facing : -p.facing; this.dest = p.cx() + side * 85;
      if (this.dest < A.x0 + 60 || this.dest > A.x1 - 60) this.dest = p.cx() - side * 85;
      this.dest = clamp(this.dest, A.x0 + 50, A.x1 - 50);
    }
  } else if (s === 'blinkwait') {
    this.alpha = 0; this.ghost = true;
    if (this.stateT >= 0.55 / spd) {
      var nx = this.dest - this.w / 2, k;
      for (k = 0; k < 7; k++) this.addGhost(lerp(this.x, nx, k / 6), this.y, this.facing, 0.55);
      this.x = nx; this.ty = this.floor - this.h - this.hover; this.y = this.ty; this.ghost = false; this.alpha = 0.3; this.face();
      this.setState('blinkin'); this.startTele(0.42 / spd, true); g.fx.ring(this.cx(), this.cy(), '#c8a2ff'); g.fx.burst(this.cx(), this.cy(), 12, '#c8a2ff', 220);
    }
  } else if (s === 'blinkin') {
    this.alpha = approach(this.alpha, 1, dt * 6); this.face();
    if (this.tele <= 0) { this.setState('blinkslash'); this.hitDone = false; this.lungeV = this.facing * 340; this.alpha = 1; }
  } else if (s === 'blinkslash') {
    this.lungeV = approach(this.lungeV, 0, 1800 * dt); this.x = clamp(this.x + this.lungeV * dt, A.x0 + 12, A.x1 - 12 - this.w);
    if (this.stateT > 0.04 && this.stateT < 0.22 && !this.hitDone) {
      var b = this.tmp; b.w = 78; b.h = 74; b.y = this.y + 2; b.x = this.facing > 0 ? this.x + this.w - 8 : this.x - 70;
      if (!p.dead && overlap(b, p)) {
        this.hitDone = true;
        var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
        if (r === 'parried') { this.parried(1.9); g.fx.text(this.cx(), this.y - 8, 'ВРЕМЯ СБИТО', '#fff3b0'); return; }
      }
    }
    if (this.stateT > 0.36) { this.blinksLeft--; if (this.blinksLeft > 0) this.setState('blinkout'); else this.setState('recover'); }
  } else if (s === 'gearwind') {
    this.face();
    if (this.tele <= 0) {
      this.fireGear(); this.gearsLeft--;
      if (this.gearsLeft > 0) { this.setState('gearwind'); this.startTele(0.36 / spd, true); } else this.setState('recover');
    }
  } else if (s === 'zonecast') {
    this.face();
    if (this.tele <= 0) {
      this.castZone(clamp(p.cx() + rnd(-40, 40), A.x0 + 60, A.x1 - 60));
      if (this.phase === 3) this.castZone(clamp(p.cx() + (p.cx() < (A.x0 + A.x1) / 2 ? 190 : -190), A.x0 + 60, A.x1 - 60));
      this.setState('recover');
    }
  } else if (s === 'summon') {
    this.face();
    if (this.tele <= 0) { this.spawnPhantoms(); this.recDur = 1.5; this.setState('recover'); }
  } else if (s === 'rewind') {
    var ru = clamp(this.stateT / 0.7, 0, 1), re = ease.inOutQuad(ru);
    this.x = lerp(this.rwFrom.x, this.rwTo.x, re); this.y = lerp(this.rwFrom.y, this.rwTo.y, re);
    if (Math.random() < 0.7) this.addGhost(this.x, this.y, this.facing, 0.35);
    if (this.stateT >= 0.7) { this.invulnT = 0.15; this.setState('recover'); g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); }
  } else if (s === 'handsup') {
    this.alpha = this.stateT < 0.4 ? 1 - this.stateT / 0.4 : 0; this.ghost = true;
    if (this.stateT >= 0.5) {
      var A2 = this.arena, px = (A2.x0 + A2.x1) / 2, py = this.floor - 135;
      for (var q = 0; q < 6; q++) this.addGhost(lerp(this.x, px - this.w / 2, q / 5), lerp(this.y, py - this.h / 2, q / 5), this.facing, 0.55);
      this.x = px - this.w / 2; this.y = py - this.h / 2; this.ty = this.y; this.alpha = 1; this.ghost = false;
      this.hands = new ClockHands(g, this, px, py, Math.random() < 0.5 ? 1 : -1); g.add(this.hands);
      g.shake(8); g.flash('#c8a2ff', 0.2); g.fx.ring(px, py, '#c8a2ff'); this.setState('handsrun');
    }
  } else if (s === 'handsrun') {
    this.alpha = 1; this.invulnT = 999;
    if (!this.hands || this.hands.dead) { this.invulnT = 0; this.ty = this.floor - this.h; this.setState('handsdown'); }
  } else if (s === 'handsdown') {
    this.y = smooth(this.y, this.floor - this.h, 14, dt);
    if (this.stateT > 0.5) {
      this.y = this.floor - this.h; this.parried(2.6); g.shake(10); g.fx.dust(this.cx(), this.floor, 14, 3); g.fx.text(this.cx(), this.y - 8, 'ИСТОЩЁН — БЕЙ!', '#fff3b0'); this.recDur = 0.5;
    }
  }
  if (this.state !== 'handsup' && this.state !== 'handsrun' && this.state !== 'rewind' && this.state !== 'blinkslash' && this.state !== 'handsdown' && this.state !== 'intro') this.y = smooth(this.y, this.ty, 9, dt);
  this.x = clamp(this.x, A.x0 + 10, A.x1 - this.w - 10);
  this.touchDamage();
};
ClockmakerBoss.prototype.handsBusy = function () { var s = this.state; return s === 'handsup' || s === 'handsrun' || s === 'handsdown'; };
ClockmakerBoss.prototype.startHands = function () { this.setState('handsup'); this.tele = 0; };
ClockmakerBoss.prototype.beginRewind = function () {
  var h = this.hist[(this.histI + 1) % 22], g = this.g;
  this.rwFrom.x = this.x; this.rwFrom.y = this.y; this.rwTo.x = clamp(h.x, this.arena.x0 + 12, this.arena.x1 - 12 - this.w); this.rwTo.y = this.floor - this.h - this.hover;
  this.tele = 0; this.invulnT = 0.9; this.setState('rewind'); this.alpha = 1; this.ghost = false;
  g.flash('#7fe7ff', 0.2); g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); g.fx.text(this.cx(), this.y - 10, 'ПЕРЕМОТКА', '#9fe8ff');
};
ClockmakerBoss.prototype.pickAttack = function () {
  var g = this.g, i, a;
  this.atkN++;
  if (this.phase === 3) { this.phase3N++; if (this.phase3N % 4 === 0) { this.lastAtk = 'hands'; this.startHands(); return; } }
  if (!this.deck.length) { this.deck = ['blink', 'gears', 'zone', 'phantoms']; for (i = 3; i > 0; i--) { var j = (Math.random() * (i + 1)) | 0, t = this.deck[i]; this.deck[i] = this.deck[j]; this.deck[j] = t; } }
  a = this.deck.pop();
  if (a === this.lastAtk && this.deck.length) { var a2 = this.deck.pop(); this.deck.push(a); a = a2; }
  this.phantoms = this.phantoms.filter(function (q) { return !q.dead; });
  this.zones = this.zones.filter(function (q) { return !q.dead; });
  if (a === 'phantoms' && this.phantoms.length) a = 'blink';
  if (a === 'zone' && this.zones.length >= 2) a = 'gears';
  this.lastAtk = a; var spd = this.spd;
  if (a === 'blink') { this.blinksLeft = this.phase >= 2 ? 2 : 1; this.setState('blinkout'); }
  else if (a === 'gears') { this.gearsLeft = 3; this.setState('gearwind'); this.startTele(0.55 / spd, true); }
  else if (a === 'zone') { this.setState('zonecast'); this.startTele(0.55 / spd, false); }
  else { this.setState('summon'); this.startTele(0.65 / spd, true); }
};
ClockmakerBoss.prototype.fireGear = function () {
  var g = this.g, p = g.player, mx = this.cx() + this.facing * 22, my = this.cy() - 14, dx = p.cx() - mx, dy = p.cy() - my, d = Math.sqrt(dx * dx + dy * dy) || 1, sp = 300 * (this.phase === 3 ? 1.1 : 1);
  g.add(new GearShot(g, mx, my, dx / d * sp, dy / d * sp, { dmg: 1, color: '#ffd84a', parryable: true, r: 9, life: 3.4, kind: 'orb' }));
  g.fx.burst(mx, my, 6, '#ffd84a', 160);
};
ClockmakerBoss.prototype.castZone = function (x) {
  var z = new TimeZone(this.g, this, x, this.cx() + this.facing * 16, this.cy() - 10);
  this.zones.push(z); this.g.add(z);
  if (this.zones.length > 2) { var old = this.zones.shift(); old.age = Math.max(old.age, old.fallT + old.grow + old.life - 0.6); }
};
ClockmakerBoss.prototype.spawnPhantoms = function () {
  var g = this.g, p = g.player, A = this.arena, n = this.phase === 1 ? 2 : 3, spd = this.spd;
  g.shake(5); g.fx.ring(this.cx(), this.cy(), '#9fe8ff');
  for (var i = 0; i < n; i++) {
    var sg = (i & 1) ? 1 : -1, xx = clamp(p.cx() + sg * (150 + i * 55), A.x0 + 30, A.x1 - 30);
    if (Math.abs(xx - p.cx()) < 90) xx = clamp(p.cx() - sg * (150 + i * 55), A.x0 + 30, A.x1 - 30);
    var ph = new Phantom(g, this, xx, (1.0 + i * 0.95) / spd); this.phantoms.push(ph); g.add(ph);
    g.fx.burst(xx, this.floor - 30, 10, '#9fe8ff', 180);
  }
};
ClockmakerBoss.prototype.onDying = function () { this.g.fx.text(this.cx(), this.y - 14, 'ВРЕМЯ ОСТАНОВИЛОСЬ', '#e8ffff'); };
ClockmakerBoss.prototype.dyingFx = function () {
  var g = this.g;
  if (Math.random() < 0.5) g.add(new GearDebris(g, this.cx() + rnd(-16, 16), this.cy() + rnd(-20, 20), rnd(-220, 220), rnd(-380, -120), rnd(4, 8), this.floor));
};
ClockmakerBoss.prototype.onFinish = function () {
  var g = this.g, cx = this.cx(), cy = this.cy();
  for (var i = 0; i < 16; i++) g.add(new GearDebris(g, cx, cy, rnd(-340, 340), rnd(-520, -120), rnd(5, 10), this.floor));
  if (g.onFinalBossDefeated) g.onFinalBossDefeated();
};
ClockmakerBoss.prototype.draw = function (ctx) { Bosses.drawClockmaker(ctx, this); };

var BOSS_TYPES = { guardian: GuardianBoss, serpent: SerpentBoss, colossus: ColossusBoss, clockmaker: ClockmakerBoss };

// =====================================================================================
// Отрисовка боссов (Canvas2D кодом)
// =====================================================================================
var Bosses = (function () {
  var _ik = { ex: 0, ey: 0, hx: 0, hy: 0 };
  // двухзвенная IK: плечо (sx,sy) -> кисть (tx,ty); локоть изгибается «наружу»
  function ik(sx, sy, tx, ty, l1, l2, bend) {
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    var mx = l1 + l2 - 0.5; if (d > mx) { tx = sx + dx / d * mx; ty = sy + dy / d * mx; dx = tx - sx; dy = ty - sy; d = mx; }
    if (d < 30) { d = 30; }
    var a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    _ik.ex = sx + dx / d * a - dy / d * h * bend; _ik.ey = sy + dy / d * a + dx / d * h * bend; _ik.hx = tx; _ik.hy = ty;
  }

  // ---------------- Страж Сада
  function drawGuardian(ctx, b) {
    var f = b.facing, cx = b.cx(), feet = b.y + b.h, t = b.t, fl = b.flash > 0, st = b.state;
    bDeathPre(ctx, b);
    ctx.save(); ctx.translate(cx, feet); ctx.scale(f, 1);
    if (st === 'intro') { var iu = clamp(b.stateT / 0.5, 0, 1); ctx.scale(1, 0.55 + 0.45 * ease.outBack(iu)); }
    var body = fl ? '#fff' : '#3d5a4a', dark = fl ? '#fff' : '#24382e', gold = fl ? '#fff' : '#d4b05a', metal = fl ? '#fff' : '#a9b5ad';
    var walk = Math.sin(t * 8) * (Math.abs(b.vx) > 5 ? 1 : 0.15);
    ctx.strokeStyle = dark; ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -28); ctx.lineTo(-6 + walk * 7, -2); ctx.moveTo(7, -28); ctx.lineTo(7 - walk * 7, -2); ctx.stroke();
    var lean = st === 'wind1' || st === 'wind2' ? -0.3 : (st === 'slash1' || st === 'slash2' ? 0.4 : (st === 'leapwind' ? -0.4 : (st === 'intro' && b.stateT > 0.5 ? -0.35 : 0)));
    ctx.save(); ctx.translate(0, -28); ctx.rotate(lean);
    ctx.fillStyle = body; ctx.fillRect(-15, -34, 30, 36);
    ctx.fillStyle = gold; ctx.fillRect(-16, -36, 32, 8); ctx.fillRect(-15, -4, 30, 5);
    ctx.fillStyle = metal; ctx.beginPath(); ctx.arc(2, -44, 11, Math.PI, 0); ctx.fill(); ctx.fillRect(-9, -44, 22, 10);
    ctx.fillStyle = b.phase === 2 || (st === 'intro' && b.stateT > 0.5) ? '#ff7a4a' : '#e8453c'; ctx.fillRect(4, -42, 7, 3);
    ctx.fillStyle = gold; ctx.fillRect(-1, -60, 5, 12);
    ctx.fillStyle = b.phase === 2 ? '#ff5a3a' : body; ctx.fillRect(-12, -26, 24, 4);
    var sa = st === 'wind1' || st === 'wind2' ? -2.2 : (st === 'slash1' || st === 'slash2' ? 0.8 : (st === 'intro' && b.stateT > 0.5 ? -2.5 : -0.5));
    ctx.translate(14, -24); ctx.rotate(sa);
    ctx.fillStyle = metal; ctx.fillRect(0, -3, 52, 6); ctx.fillStyle = gold; ctx.fillRect(-4, -5, 7, 10);
    if (b.phase === 2 || (st === 'intro' && b.stateT > 0.5)) bGlow(ctx, 40, 0, 26, '#ff7a4a', 0.5);
    ctx.restore();
    ctx.restore();
    if (b.stun > 0) { ctx.save(); ctx.translate(cx, b.y - 8); ctx.fillStyle = '#ffe08a'; for (var i = 0; i < 4; i++) { var a = t * 6 + i * 1.6; ctx.fillRect(Math.cos(a) * 14 - 2, Math.sin(a) * 4 - 2, 4, 4); } ctx.restore(); }
    if (b.tele > 0) bFlare(ctx, cx + f * 20, b.cy() - 8, 1 - b.tele / b.teleMax, b.teleColor, 28);
    if (b.phase === 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 + Math.sin(t * 8) * 0.06; ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(cx, b.cy(), 44, 0, TAU); ctx.fill(); ctx.restore(); }
    bDeathPost(ctx, b);
  }

  // ---------------- Хозяйка Цистерн
  function drawSerpent(ctx, b) {
    var f = b.facing, t = b.t, st = b.state, px = b.px, fy = b.floor, rise = b.rise, fl = b.flash > 0, i;
    if (rise <= 0.02 && !b.dying) return;
    var u = b.teleMax > 0 ? clamp(1 - b.tele / b.teleMax, 0, 1) : 0, sT = b.stateT;
    bDeathPre(ctx, b);
    // телеграфы на полу (мировые координаты)
    if ((st === 'tailwind' || (st === 'tail' && sT < 0.3)) && !b.dying) {
      var ta = st === 'tailwind' ? 0.1 + u * 0.38 : 0.7 * (1 - sT / 0.3), tx0 = b.tailDir > 0 ? px : px - 250;
      ctx.fillStyle = 'rgba(255,60,40,' + ta + ')'; ctx.fillRect(tx0, fy - 26, 250, 26);
      ctx.fillStyle = 'rgba(255,120,90,' + (ta + 0.25) + ')'; ctx.fillRect(tx0, fy - 3, 250, 3);
    }
    if (st === 'wavewind') { ctx.fillStyle = 'rgba(255,60,40,' + (0.1 + u * 0.35) + ')'; ctx.fillRect(px + f * 20 - (f < 0 ? 330 : 0), fy - 8, 330, 8); }
    ctx.save();
    ctx.beginPath(); ctx.rect(px - 340, fy - 440, 680, 443); ctx.clip();
    ctx.translate(px, fy + (1 - rise) * 120); ctx.scale(f, 1);
    var skin = fl ? '#fff' : '#86d3c4', s1 = fl ? '#fff' : '#1b6e72', s2 = fl ? '#fff' : '#2fa39a', dark = fl ? '#fff' : '#0e4047', gold = fl ? '#fff' : '#e6c76a', hair = fl ? '#fff' : '#2fd0c4', belly = fl ? '#fff' : '#b8efe0';
    var lunge = 0, tw = 0, tl = 0, up = 0.25 + Math.sin(t * 2) * 0.08, spit = 0, lean = 0, mouth = 0;
    if (st === 'bitewind') { lunge = -14 * u; up = 0.1; mouth = u * 0.4; }
    else if (st === 'bite') { lunge = sT < 0.12 ? lerp(-14, 130, sT / 0.12) : (sT < 0.28 ? 130 : 130 * (1 - clamp((sT - 0.28) / 0.3, 0, 1))); up = 0.1; mouth = 1; }
    else if (st === 'tailwind') { tw = ease.outQuad(u); up = 0.5; lean = -6 * tw; }
    else if (st === 'tail') { tw = sT < 0.16 ? 1 - sT / 0.16 : 0; tl = sT < 0.16 ? sT / 0.16 : Math.max(0, 1 - (sT - 0.3) / 0.25); up = 0.3; lean = 5 * tl; }
    else if (st === 'spitwind') { spit = u; lunge = -8 * u; up = 0.6; mouth = 0.3 + u * 0.5; }
    else if (st === 'wavewind') { up = u; lunge = -4 * u; }
    else if (st === 'recover' && b.lastAtk === 'wave') { up = 0; }
    else if (st === 'roar' || st === 'summon' || st === 'intro') { up = 1; lunge = -6; mouth = st === 'intro' ? clamp((sT - 0.8) * 5, 0, 1) : 1; }
    else if (st === 'dive' || st === 'emerge') { up = 0.6; }
    else if (st === 'stunned' || b.stun > 0) { up = 0; lunge = 8; }
    if (b.recoil > 0) { lunge = 10; spit = 0; mouth = 0.5; }
    if (b.dying) { up = 0.8 + Math.sin(t * 20) * 0.2; mouth = 1; lunge = Math.sin(t * 9) * 10; }
    // хвост (за телом, на полу)
    var N = 14, j, tx, ty, r;
    for (j = N; j >= 0; j--) {
      var sj = j / N;
      var ix = -(8 + j * 13), iy = -(6 + Math.sin(t * 2.2 + j * 0.55) * (2 + j * 0.4));
      var wx = -(16 + j * 5.5), wy = -(12 + j * 9 - j * j * 0.38);
      tx = lerp(ix, wx, tw); ty = lerp(iy, wy, tw);
      if (tl > 0) { var lx = 14 + j * 17.5 * tl, ly = -(5 + Math.sin(j * 0.7 + t * 20) * 3 * tl) - sj * 3; tx = lerp(tx, lx, tl); ty = lerp(ty, ly, tl); }
      r = (11 * (1 - sj) + 2.5) * (1 + tl * 0.35);
      ctx.fillStyle = (j & 1) ? s1 : s2; ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.fill();
      ctx.fillStyle = belly; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(tx + 1, ty + r * 0.35, r * 0.45, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.35;
    }
    // змеиное тело до пояса
    var topX = 0, topY = -64;
    for (i = 0; i <= 10; i++) {
      var uu = i / 10, bx = Math.sin(t * 1.7 + uu * 3.2) * 4 * uu + lunge * uu * uu + lean * uu, by = -uu * 64, rr = 21 - 8 * uu;
      ctx.fillStyle = (i & 1) ? s1 : s2; ctx.beginPath(); ctx.arc(bx, by, rr, 0, TAU); ctx.fill();
      ctx.fillStyle = belly; ctx.globalAlpha *= 0.4; ctx.beginPath(); ctx.arc(bx + rr * 0.45, by, rr * 0.35, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.4;
      if (i === 10) topX = bx;
    }
    ctx.strokeStyle = gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(topX - 13, topY + 2); ctx.lineTo(topX + 13, topY + 2); ctx.stroke();
    // капюшон кобры
    var hx = topX + 4 + lunge * 0.12, hy = topY - 42 + (b.stun > 0 ? 6 : 0);
    ctx.fillStyle = fl ? '#fff' : '#14585c'; ctx.beginPath(); ctx.moveTo(hx - 30, hy + 8); ctx.arc(hx, hy + 8, 30, Math.PI, TAU); ctx.lineTo(hx + 12, hy + 28); ctx.lineTo(hx - 12, hy + 28); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy + 8, 30, Math.PI, TAU); ctx.stroke();
    ctx.strokeStyle = s2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy + 8, 21, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    ctx.fillStyle = fl ? '#fff' : '#f0dc7a'; ctx.beginPath(); ctx.arc(hx - 21, hy - 2, 4, 0, TAU); ctx.arc(hx + 21, hy - 2, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(hx - 21, hy - 2, 1.8, 0, TAU); ctx.arc(hx + 21, hy - 2, 1.8, 0, TAU); ctx.fill();
    // торс
    ctx.fillStyle = skin; ctx.beginPath(); ctx.moveTo(topX - 13, topY + 2); ctx.quadraticCurveTo(topX - 9, topY - 14, topX - 11, topY - 28); ctx.lineTo(topX + 11, topY - 28); ctx.quadraticCurveTo(topX + 9, topY - 14, topX + 13, topY + 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = gold; ctx.fillRect(topX - 10, topY - 23, 20, 7); ctx.fillRect(topX - 3, topY - 24, 6, 9);
    ctx.fillStyle = fl ? '#fff' : '#e8fffb'; ctx.beginPath(); ctx.arc(topX, topY - 19.5, 2.4, 0, TAU); ctx.fill();
    // волосы
    ctx.strokeStyle = hair; ctx.lineWidth = 3; ctx.globalAlpha *= 0.85; ctx.lineCap = 'round';
    for (i = -1; i <= 1; i += 2) {
      for (j = 0; j < 2; j++) {
        var sw = Math.sin(t * 2.4 + j + i) * 5;
        ctx.beginPath(); ctx.moveTo(hx + i * 5, hy - 6); ctx.bezierCurveTo(hx + i * (20 + j * 5) + sw, hy + 4, hx + i * (14 + j * 7) - sw, hy + 24, hx + i * (12 + j * 6) + sw * 0.6, topY - 6 + j * 6); ctx.stroke();
      }
    }
    ctx.globalAlpha /= 0.85;
    // голова
    ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(hx, hy, 8.5, 10.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = fl ? '#fff' : '#fff7b0'; ctx.fillRect(hx + 1, hy - 3, 5, 2.4); ctx.fillRect(hx - 6, hy - 3, 4, 2.4);
    bGlow(ctx, hx + 3, hy - 2, 10, '#fff7b0', 0.7);
    if (mouth > 0) { ctx.fillStyle = '#10343a'; ctx.beginPath(); ctx.ellipse(hx + 2, hy + 6, 3 + mouth * 2, 1 + mouth * 3.5, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(hx - 8, hy - 8); ctx.lineTo(hx - 6, hy - 18); ctx.lineTo(hx - 2, hy - 10); ctx.lineTo(hx, hy - 21); ctx.lineTo(hx + 3, hy - 10); ctx.lineTo(hx + 7, hy - 18); ctx.lineTo(hx + 8, hy - 8); ctx.closePath(); ctx.fill();
    // руки
    var shy = topY - 25;
    for (i = -1; i <= 1; i += 2) {
      var sx = topX + i * 11, hX, hY;
      if (spit > 0.01) { hX = i < 0 ? hx - 4 : hx + 16; hY = hy + (i < 0 ? 14 : 10); hX = lerp(topX + i * (24 + 12 * up), hX, spit); hY = lerp(topY - 14 - 34 * up, hY, spit); }
      else { hX = topX + i * (24 + 12 * up); hY = topY - 14 - 34 * up; if (st === 'wavewind' || st === 'wave') hY += 0; }
      ctx.strokeStyle = skin; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, shy); ctx.quadraticCurveTo((sx + hX) / 2 + i * 9, (shy + hY) / 2 + 6, hX, hY); ctx.stroke();
      ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(hX, hY + 1, 3.4, 0, TAU); ctx.fill();
      bGlow(ctx, hX, hY, 14 + up * 6 + spit * 6, '#7fe7ff', 0.7);
    }
    if (spit > 0.01) { bGlow(ctx, hx + 18, hy + 8, 8 + spit * 12, '#ffe27a', 0.5 + spit * 0.5); }
    ctx.restore();
    // передний край бассейна
    ctx.strokeStyle = 'rgba(170,250,240,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, fy + 1, 56, 8, 0, 0.05, Math.PI - 0.05); ctx.stroke();
    ctx.fillStyle = 'rgba(70,200,200,0.5)'; ctx.beginPath(); ctx.ellipse(px, fy + 2, 52, 6, 0, 0, Math.PI); ctx.fill();
    // геизер при появлении
    if (st === 'emerge' && sT < 0.5) {
      var gu = sT / 0.5, gh = 150 * ease.outCubic(Math.min(1, sT / 0.15)), gw = 72 * (1 - gu * 0.7);
      ctx.fillStyle = 'rgba(170,245,240,' + (0.5 * (1 - gu)) + ')'; ctx.fillRect(px - gw / 2, fy - gh, gw, gh);
      ctx.fillStyle = 'rgba(230,255,252,' + (0.7 * (1 - gu)) + ')'; ctx.fillRect(px - gw / 4, fy - gh, gw / 2, gh);
      bGlow(ctx, px, fy - 40, 60, '#4fd6c8', 1 - gu);
    }
    // флейры
    var mxW = px + f * (topX + 18), myW = fy + (hy - 6) + (1 - rise) * 120;
    if (!b.dying && b.tele > 0 && (st === 'bitewind' || st === 'spitwind')) bFlare(ctx, mxW, myW, u, TELE_Y, 26);
    if (!b.dying && (st === 'roar' || st === 'summon') && sT < 0.6) bFlare(ctx, px, fy - 64, sT / 0.6, '#7fe7ff', 36);
    if (!b.dying && st === 'wavewind') bFlare(ctx, px, fy - 40, u, TELE_R, 30);
    if (!b.dying && st === 'tailwind') bFlare(ctx, px - b.tailDir * 40, fy - 55, u, TELE_R, 24);
    if (b.stun > 0) { ctx.save(); ctx.translate(px, fy - 110 * rise); ctx.fillStyle = '#ffe08a'; for (i = 0; i < 4; i++) { var a = t * 6 + i * 1.6; ctx.fillRect(Math.cos(a) * 16 - 2, Math.sin(a) * 4 - 2, 4, 4); } ctx.restore(); }
    bDeathPost(ctx, b);
  }

  // ---------------- Песчаный Колосс
  function stoneBlock(ctx, x, y, w, h, c, hi, dk) {
    ctx.fillStyle = c; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = hi; ctx.fillRect(x, y, w, Math.max(2, h * 0.14)); ctx.fillRect(x, y, Math.max(2, w * 0.1), h);
    ctx.fillStyle = dk; ctx.fillRect(x, y + h - Math.max(2, h * 0.14), w, Math.max(2, h * 0.14)); ctx.fillRect(x + w - Math.max(2, w * 0.1), y, Math.max(2, w * 0.1), h);
  }
  function drawColossus(ctx, b) {
    var f = b.facing, cx = b.cx(), fy = b.floor, t = b.t, fl = b.flash > 0, st = b.state, kd = 44 * b.kneel, i, s;
    var c = fl ? '#fff' : '#b08a5c', hi = fl ? '#fff' : '#e0c38a', dk = fl ? '#fff' : '#6b4a32', dd = fl ? '#fff' : '#3d2a1c', gold = fl ? '#fff' : '#ffd27d';
    var u = b.teleMax > 0 ? clamp(1 - b.tele / b.teleMax, 0, 1) : 0, open = b.open;
    bDeathPre(ctx, b);
    // телеграфы (мир)
    if (!b.dying) {
      if (st === 'slamwind') {
        var fxw = cx + f * b.aim; ctx.save(); ctx.translate(fxw, fy - 1); ctx.scale(1, 0.2); ctx.fillStyle = 'rgba(255,60,40,' + (0.12 + u * 0.45) + ')'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,100,70,' + (0.4 + u * 0.5) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 44 * (1.3 - u * 0.3), 0, TAU); ctx.stroke(); ctx.restore();
        ctx.fillStyle = 'rgba(255,90,60,' + (0.08 + u * 0.18) + ')'; ctx.fillRect(fxw - 30, fy - 260, 60, 260);
      } else if (st === 'leapwind') {
        ctx.save(); ctx.translate(b.leapX, fy - 1); ctx.scale(1, 0.18); ctx.fillStyle = 'rgba(255,60,40,' + (0.12 + u * 0.45) + ')'; ctx.beginPath(); ctx.arc(0, 0, 64, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,100,70,0.8)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 64 * (1.3 - u * 0.3), 0, TAU); ctx.stroke(); ctx.restore();
      } else if (st === 'sweepwind' || st === 'sweep') {
        var sa = st === 'sweepwind' ? 0.06 + u * 0.16 : 0.2;
        ctx.fillStyle = 'rgba(255,216,74,' + sa + ')'; ctx.fillRect(f > 0 ? cx + 14 : cx - 200, fy - 120, 186, 116);
      }
    }
    ctx.save(); ctx.translate(cx, fy); ctx.scale(f, 1);
    var moving = Math.abs(b.vx) > 5, walk = Math.sin(t * 5.5);
    var legTop = -(66 - kd * 0.55);
    // ноги
    for (s = -1; s <= 1; s += 2) {
      var lift = moving ? Math.max(0, walk * s) * 7 : 0, lx = s * 25 - 15;
      stoneBlock(ctx, lx, legTop, 30, -legTop - 10 - lift, c, hi, dk);
      stoneBlock(ctx, lx - 4, legTop + (-legTop) * 0.45 - lift * 0.5, 38, 14, dk, c, dd);
      stoneBlock(ctx, lx - 5, -12 - lift, 40, 12, dk, c, dd);
    }
    // задняя рука
    var armsUp = st === 'beamwind' || st === 'rockwind' || st === 'roar' || st === 'beamfire' || st === 'vortexwind' || st === 'intro' || st === 'leap';
    var shx = 40, shy = -124 + kd;
    var bhx = -62 + Math.sin(t * 1.7) * 5, bhy = armsUp ? -190 : -46 + kd * 0.6;
    ik(-shx, shy, bhx, bhy, 88, 88, bhy - shy > 30 ? 1 : -1);
    drawArm(ctx, -shx, shy, c, hi, dk, dd, false, fl);
    // торс
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(-52, -132 + kd); ctx.lineTo(52, -132 + kd); ctx.lineTo(40, -70 + kd * 0.6); ctx.lineTo(-40, -70 + kd * 0.6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = hi; ctx.beginPath(); ctx.moveTo(-52, -132 + kd); ctx.lineTo(52, -132 + kd); ctx.lineTo(49, -122 + kd); ctx.lineTo(-49, -122 + kd); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(52, -132 + kd); ctx.lineTo(40, -70 + kd * 0.6); ctx.lineTo(32, -70 + kd * 0.6); ctx.lineTo(43, -132 + kd); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = dd; ctx.lineWidth = 2; ctx.globalAlpha *= 0.6;
    for (i = 1; i < 4; i++) { var ly = -132 + kd + i * (62 - kd * 0.4) / 4; ctx.beginPath(); ctx.moveTo(-50 + i * 2.5, ly); ctx.lineTo(46 - i * 2.5, ly); ctx.stroke(); }
    ctx.globalAlpha /= 0.6;
    ctx.strokeStyle = fl ? '#fff' : gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-30, -112 + kd); ctx.lineTo(-30, -84 + kd * 0.8); ctx.lineTo(-22, -78 + kd * 0.7); ctx.moveTo(34, -112 + kd); ctx.lineTo(34, -88 + kd * 0.8); ctx.stroke();
    stoneBlock(ctx, -40, -76 + kd * 0.6, 80, 12, dk, c, dd);
    // ядро
    var coreY = -100 + kd * 0.8, coreX = 6, pulse = 0.5 + 0.5 * Math.sin(t * (open > 0.1 ? 10 : 3));
    ctx.fillStyle = dd; ctx.beginPath(); ctx.arc(coreX, coreY, 18, 0, TAU); ctx.fill();
    var gemC = fl ? '#fff' : (open > 0.3 ? '#fff3b0' : '#c2501c');
    ctx.fillStyle = gemC; ctx.beginPath(); ctx.arc(coreX, coreY, 12 + open * 2 + pulse * (1 + open * 2), 0, TAU); ctx.fill();
    bGlow(ctx, coreX, coreY, 26 + open * 40, b.pal[0], 0.35 + open * 0.65);
    var plateX = open * 38;
    ctx.save(); ctx.translate(plateX, 0); stoneBlock(ctx, coreX - 17, coreY - 17, 34, 34, c, hi, dk);
    ctx.strokeStyle = fl ? '#fff' : gold; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(coreX - 9, coreY); ctx.lineTo(coreX, coreY - 9); ctx.lineTo(coreX + 9, coreY); ctx.lineTo(coreX, coreY + 9); ctx.closePath(); ctx.stroke(); ctx.restore();
    // голова
    var hy = -152 + kd, eyeC = (b.tele > 0 && !b.teleColor) ? '#ff4a3a' : (b.tele > 0 ? b.teleColor : (b.phase === 2 ? '#ff7a3a' : '#ffd27d'));
    stoneBlock(ctx, -8, hy - 14, 34, 28, c, hi, dk);
    ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(-8, hy - 14); ctx.lineTo(9, hy - 34); ctx.lineTo(26, hy - 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = fl ? '#fff' : gold; ctx.fillRect(7, hy - 30, 4, 14);
    ctx.fillStyle = dd; ctx.fillRect(8, hy - 6, 20, 7);
    ctx.fillStyle = eyeC; ctx.fillRect(13, hy - 4, 12, 3.5);
    bGlow(ctx, 20, hy - 2, 18, eyeC, 0.9);
    if (b.tele > 0 && (st === 'beamwind' || st === 'sweepwind' || st === 'slamwind')) bFlare(ctx, 20, hy - 2, u, b.teleColor, 26);
    // наплечники
    for (s = -1; s <= 1; s += 2) {
      stoneBlock(ctx, s * 52 - 20, -142 + kd, 40, 30, c, hi, dk);
      ctx.fillStyle = dk; ctx.beginPath(); ctx.moveTo(s * 52 - 10, -142 + kd); ctx.lineTo(s * 52, -160 + kd); ctx.lineTo(s * 52 + 10, -142 + kd); ctx.closePath(); ctx.fill();
    }
    // передняя рука
    ik(shx, shy, b.hl.x, b.hl.y, 88, 88, b.hl.y - shy > 30 ? -1 : 1);
    drawArm(ctx, shx, shy, c, hi, dk, dd, true, fl);
    // свечение запястья при застрявшем кулаке
    if (st === 'stuck' && b.weak > 0) {
      var wp = 0.6 + 0.4 * Math.sin(t * 14); bGlow(ctx, b.hl.x, b.hl.y, 50, '#fff3b0', wp);
      ctx.strokeStyle = '#fff3b0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(b.hl.x, b.hl.y, 34 + wp * 6, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff3b0'; var ay = b.hl.y - 58 - wp * 6; ctx.beginPath(); ctx.moveTo(b.hl.x, ay + 12); ctx.lineTo(b.hl.x - 8, ay); ctx.lineTo(b.hl.x + 8, ay); ctx.closePath(); ctx.fill();
    }
    if (open > 0.3 && st !== 'stuck') {
      var wp2 = 0.6 + 0.4 * Math.sin(t * 14), ay2 = -150 + kd * 0.8 - wp2 * 5; ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.moveTo(coreX, ay2 + 14); ctx.lineTo(coreX - 9, ay2); ctx.lineTo(coreX + 9, ay2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (b.stun > 0) { ctx.save(); ctx.translate(cx, fy - 150 + kd); ctx.fillStyle = '#ffe08a'; for (i = 0; i < 5; i++) { var a = t * 6 + i * 1.3; ctx.fillRect(Math.cos(a) * 24 - 2, Math.sin(a) * 6 - 2, 4, 4); } ctx.restore(); }
    if (b.phase === 2 && !b.dying) bGlow(ctx, cx, fy - 90, 90, '#ff7a3a', 0.12 + Math.sin(t * 6) * 0.04);
    bDeathPost(ctx, b);
  }
  // рука по результату ik(): плечо (sx,sy) -> локоть -> кисть-кулак
  function drawArm(ctx, sx, sy, c, hi, dk, dd, front, fl) {
    var ex = _ik.ex, ey = _ik.ey, hx = _ik.hx, hy = _ik.hy;
    ctx.lineCap = 'round';
    ctx.strokeStyle = dd; ctx.lineWidth = 27; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = 20; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = hi; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(ex, ey - 5); ctx.lineTo(hx, hy - 5); ctx.stroke();
    ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(ex, ey, 13, 0, TAU); ctx.fill(); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ex, ey, 9, 0, TAU); ctx.fill();
    stoneBlock(ctx, hx - 19, hy - 17, 38, 34, c, hi, dk);
    ctx.strokeStyle = dd; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx - 6, hy - 15); ctx.lineTo(hx - 6, hy + 15); ctx.moveTo(hx + 7, hy - 15); ctx.lineTo(hx + 7, hy + 15); ctx.stroke();
  }

  // ---------------- Часовщик
  function drawClockman(ctx, x, fy, f, o) {
    var A = o.alpha; if (A <= 0.01) return;
    var t = o.t, ph = o.ph, fl = o.fl, i;
    var cloak = fl ? '#fff' : (ph ? '#101a38' : '#2c1b52'), cloak2 = fl ? '#fff' : (ph ? '#1e3a6a' : '#4a2d86'), gold = fl ? '#fff' : (ph ? '#6fa0d8' : '#e2bd5f'), gc = ph ? '#7fe7ff' : '#c8a2ff';
    ctx.save(); ctx.translate(x, fy); ctx.scale(f, 1); ctx.globalAlpha *= A;
    ctx.translate(0, Math.sin(t * 2.4) * 3);
    // нимб-циферблат
    var hs = o.hs === undefined ? 1.5 : o.hs;
    bGlow(ctx, 0, -66, 66, gc, 0.55);
    ctx.fillStyle = 'rgba(14,8,34,0.88)'; ctx.beginPath(); ctx.arc(0, -66, 33, 0, TAU); ctx.fill();
    ctx.strokeStyle = gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -66, 33, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath();
    for (i = 0; i < 12; i++) { var an = i * TAU / 12; ctx.moveTo(Math.cos(an) * 27, -66 + Math.sin(an) * 27); ctx.lineTo(Math.cos(an) * 31, -66 + Math.sin(an) * 31); }
    ctx.stroke();
    var ma = -Math.PI / 2 + t * hs, ha = -Math.PI / 2 + t * hs / 12;
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, -66); ctx.lineTo(Math.cos(ma) * 27, -66 + Math.sin(ma) * 27); ctx.moveTo(0, -66); ctx.lineTo(Math.cos(ha) * 17, -66 + Math.sin(ha) * 17); ctx.stroke();
    // плащ
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.moveTo(-14, -54); ctx.quadraticCurveTo(-31, -30, -27, -4);
    for (i = 0; i <= 6; i++) ctx.lineTo(-27 + i * 9, -2 + ((i & 1) ? 9 : 0) + Math.sin(t * 3 + i) * 2);
    ctx.quadraticCurveTo(31, -30, 14, -54); ctx.closePath(); ctx.fill();
    ctx.fillStyle = cloak2; ctx.globalAlpha *= 0.85; ctx.beginPath(); ctx.moveTo(-7, -52); ctx.lineTo(-15, -5); ctx.lineTo(15, -5); ctx.lineTo(7, -52); ctx.closePath(); ctx.fill(); ctx.globalAlpha /= 0.85;
    ctx.strokeStyle = gold; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(-14, -54); ctx.quadraticCurveTo(-31, -30, -27, -4); ctx.moveTo(14, -54); ctx.quadraticCurveTo(31, -30, 27, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -52); ctx.lineTo(0, -8); ctx.stroke();
    if (!ph) bGear(ctx, 0, -38, 6.5, 8, t * 1.5, gold, '#2c1b52');
    // парящие шестерёнки
    if (!ph) for (i = 0; i < 3; i++) { var ga = t * 1.4 + i * 2.1; bGear(ctx, Math.cos(ga) * 36, -48 + Math.sin(ga) * 15, 6 + (i & 1) * 2, 8, -ga * 2, gold, '#2c1b52'); }
    // капюшон и лицо
    ctx.fillStyle = cloak; ctx.beginPath(); ctx.arc(3, -64, 12.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8, -68); ctx.lineTo(3, -86); ctx.lineTo(14, -68); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#05030c'; ctx.beginPath(); ctx.ellipse(6, -63, 7.5, 8.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = ph ? '#cfffff' : '#9ffcff'; ctx.beginPath(); ctx.ellipse(4, -65, 2.3, 1.6, 0, 0, TAU); ctx.ellipse(10, -65, 2.3, 1.6, 0, 0, TAU); ctx.fill();
    bGlow(ctx, 7, -65, 12, '#7fe7ff', 0.9);
    ctx.strokeStyle = gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(10, -65, 4.6, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(10, -60.5); ctx.quadraticCurveTo(12, -54, 7, -50); ctx.stroke();
    // рука и клинок-стрелка
    var pose = o.pose || 0, hX, hY, ang, p = o.p || 0;
    if (pose === 1) { hX = -4; hY = -66; ang = -2.5; }
    else if (pose === 2) { var pe = ease.outQuad(p); hX = lerp(-4, 36, pe); hY = lerp(-66, -36, pe); ang = lerp(-2.5, 0.35, pe); }
    else if (pose === 3) { hX = 24; hY = -62; ang = -1.3; }
    else if (pose === 4) { hX = 30; hY = -56 + Math.sin(t * 3) * 3; ang = -0.5; }
    else { hX = 24; hY = -40 + Math.sin(t * 2.4) * 2; ang = -1.0; }
    ctx.strokeStyle = cloak2; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(8, -50); ctx.quadraticCurveTo((8 + hX) / 2, (-50 + hY) / 2 + 8, hX, hY); ctx.stroke();
    ctx.fillStyle = gold; ctx.beginPath(); ctx.arc(hX, hY, 3.6, 0, TAU); ctx.fill();
    if (pose === 3 || pose === 4) {
      ctx.strokeStyle = cloak2; ctx.beginPath(); ctx.moveTo(-8, -50); ctx.quadraticCurveTo(-18, -66, -16, pose === 3 ? -86 : -70); ctx.stroke();
      if (pose === 3) bGlow(ctx, -16, -90, 18, gc, 0.9);
    }
    if (pose !== 4) {
      ctx.save(); ctx.translate(hX, hY); ctx.rotate(ang);
      ctx.fillStyle = gold; ctx.beginPath(); ctx.moveTo(-8, -2.5); ctx.lineTo(46, -2); ctx.lineTo(64, 0); ctx.lineTo(46, 2); ctx.lineTo(-8, 2.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = fl ? '#fff' : '#fff4cf'; ctx.fillRect(0, -0.8, 48, 1.6);
      bGear(ctx, 0, 0, 5.5, 6, t * 3, gold, '#3a2a60');
      if (pose === 1 || pose === 2) bGlow(ctx, 52, 0, 22, ph ? '#7fe7ff' : '#ffd27d', 0.7);
      ctx.restore();
    }
    ctx.restore();
  }
  function drawClockmaker(ctx, b) {
    var cx = b.cx(), fy = b.y + b.h, st = b.state, i, u = b.teleMax > 0 ? clamp(1 - b.tele / b.teleMax, 0, 1) : 0;
    // следы от телепорта
    for (i = 0; i < b.ghosts.length; i++) {
      var q = b.ghosts[i]; if (q.life > 0) drawClockman(ctx, q.x + b.w / 2, q.y + b.h, q.f, { t: b.t, alpha: (q.life / q.max) * 0.5, ph: 1, pose: 0, fl: false, hs: -4 });
    }
    // маркер появления после блинка
    if (st === 'blinkwait') {
      var wu = clamp(b.stateT / (0.55 / b.spd), 0, 1), dx = b.dest, fl = b.floor;
      ctx.save(); ctx.translate(dx, fl - 1); ctx.scale(1, 0.18); ctx.strokeStyle = 'rgba(159,232,255,' + (0.4 + wu * 0.5) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 40 * (1.4 - wu * 0.4), 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(159,232,255,' + (0.1 + wu * 0.3) + ')'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, TAU); ctx.fill();
      for (i = 0; i < 12; i++) { var an = i * TAU / 12 + b.t; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 34, Math.sin(an) * 34); ctx.lineTo(Math.cos(an) * 42, Math.sin(an) * 42); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(159,232,255,' + (wu * 0.18) + ')'; ctx.fillRect(dx - 20, fl - 100, 40, 100);
      drawClockman(ctx, dx, fl - b.hover, b.facing, { t: b.t, alpha: wu * 0.35, ph: 1, pose: 0, fl: false, hs: 3 });
    }
    if (b.alpha > 0.01) {
      bDeathPre(ctx, b);
      var pose = 0, p = 0, hs = 1.5 + (b.phase - 1) * 0.8;
      if (st === 'blinkin') pose = 1; else if (st === 'blinkslash') { pose = 2; p = clamp(b.stateT / 0.2, 0, 1); }
      else if (st === 'gearwind' || st === 'zonecast' || st === 'summon' || st === 'phase') pose = 3;
      else if (st === 'handsrun' || st === 'handsup' || st === 'handsdown') pose = 4;
      if (st === 'rewind') hs = -14; if (b.dying) { pose = 4; hs = -3 - b.dieT * 7; }
      drawClockman(ctx, cx, fy, b.facing, { t: b.t, alpha: b.alpha, ph: 0, pose: pose, p: p, fl: b.flash > 0, hs: hs });
      if (!b.dying) {
        if (st === 'blinkin' || st === 'gearwind') bFlare(ctx, cx + b.facing * 26, b.cy() - 14, u, TELE_Y, 28);
        else if (st === 'summon') bFlare(ctx, cx - b.facing * 16, b.cy() - 24, u, '#ffd84a', 30);
        else if (st === 'zonecast') bFlare(ctx, cx - b.facing * 16, b.cy() - 24, u, '#7fe7ff', 30);
        if (st === 'phase') bGlow(ctx, cx, b.cy(), 90, '#7fe7ff', 0.5 + Math.sin(b.t * 20) * 0.2);
        if (b.stun > 0) { ctx.save(); ctx.translate(cx, b.y - 8); ctx.fillStyle = '#ffe08a'; for (i = 0; i < 4; i++) { var a = b.t * 6 + i * 1.6; ctx.fillRect(Math.cos(a) * 16 - 2, Math.sin(a) * 4 - 2, 4, 4); } ctx.restore(); }
      }
      bDeathPost(ctx, b);
    }
  }
  return { drawGuardian: drawGuardian, drawSerpent: drawSerpent, drawColossus: drawColossus, drawClockman: drawClockman, drawClockmaker: drawClockmaker };
})();

// имена конструкторов для отладки (src.constructor.name)
[Wave, Rock, SandBeams, Vortex, WaterOrb, ArenaDeco, TimeZone, Phantom, GearShot, ClockHands, GearDebris].forEach(function (C) { C.prototype.constructor = C; });

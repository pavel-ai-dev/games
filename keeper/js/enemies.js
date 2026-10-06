'use strict';
// Враги. База Enemy + Стражник (s), Лучник (a), Огонёк (f), Тяжёлый (h), Маг (m), Зверь-прыгун (j).
// Реестр ENEMY_TYPES: символ карты -> конструктор.
//
// Соглашения (см. SPEC.md):
//  - update(dt): dt уже умножен на g.timeScale (замедление времени).
//  - Атака игроку: this.g.player.takeHit({dmg, x, parryable}) -> 'hit' | 'parried' | 'blocked' | 'miss'.
//    parryable=true: жёлтое предупреждение (tele, цвет TELE_Y) — можно парировать; false: красное (TELE_R) — только уворот/рывок.
//  - При 'parried' враг оглушается: this.parried() (длительная уязвимость, двойной урон).
//  - Получение удара: onHit(dmg, dir, info, attacker) вызывает g.strike(); возвращает true, если урон нанесён.
//  - Общие состояния: patrol -> aware -> chase/hover/creep -> windup/aim/cast -> strike/shoot/leap/dive -> recover; stunned после парирования.
var TELE_Y = '#ffd84a', TELE_R = '#ff4a3a';
var ATK_STATES = { windup: 1, strike: 1, aim: 1, shoot: 1, leap: 1, cast: 1, dive: 1 };

function Enemy(g, x, y, o) {
  o = o || {};
  var w = o.w || 24, h = o.h || 40;
  Ent.call(this, g, x - w / 2, y - h, w, h);
  this.maxHp = o.hp || 3; this.hp = this.maxHp; this.vx = 0; this.vy = 0; this.facing = -1;
  this.state = 'idle'; this.stateT = 0; this.stun = 0; this.flash = 0; this.tele = 0; this.teleColor = TELE_Y; this.teleMax = 0;
  this.hurt = true; this.layer = 2; this.home = { x: x, y: y }; this.knock = 0; this.armor = !!o.armor; this.touch = o.touch === undefined ? 1 : o.touch;
  this.flying = !!o.flying; this.uid = ++Chakram.uid; this.shard = o.shard === undefined ? 2 : o.shard; this.invulnT = 0; this.vulnMul = 1;
  this.id = o.id; this.boss = false; this.lightR = 0;
  this.isEnemy = true; this.ph = 0; this.alt = Math.random() < 0.5; this.dir = Math.random() < 0.5 ? -1 : 1;
  this.pauseT = 0; this.pauseMax = 1; this.walkT = rnd(0.2, 1.4); this.stuckX = this.x; this.stuckT = 0; this.lostT = 0; this.cool = rnd(0.4, 1.2);
}
Enemy.prototype = Object.create(Ent.prototype);
Enemy.prototype.box = function () { return this; };
Enemy.prototype.setState = function (s) { this.state = s; this.stateT = 0; };
Enemy.prototype.player = function () { return this.g.player; };
Enemy.prototype.dx = function () { return this.g.player.cx() - this.cx(); };
Enemy.prototype.dy = function () { return this.g.player.cy() - this.cy(); };
Enemy.prototype.face = function () { this.facing = this.dx() >= 0 ? 1 : -1; };
Enemy.prototype.canSee = function (range, dyMax) {
  var p = this.g.player; if (p.dead) return false;
  return Math.abs(this.dx()) < range && Math.abs(this.dy()) < (dyMax || 90) && this.g.level.lineClear(this.cx(), this.cy() - 8, p.cx(), p.cy() - 8);
};
Enemy.prototype.startTele = function (t, parryable) { this.tele = t; this.teleMax = t; this.teleColor = parryable === false ? TELE_R : TELE_Y; };
Enemy.prototype.interrupt = function () { };
// мягкое прерывание: атака срывается -> recover; спокойный враг разворачивается к игроку
Enemy.prototype.softInterrupt = function () {
  if (ATK_STATES[this.state]) this.setState('recover');
  else if (this.state === 'patrol' || this.state === 'idle') { this.face(); this.setState('aware'); }
};
Enemy.prototype.onHit = function (dmg, dir, info, attacker) {
  if (this.dead || this.invulnT > 0) return false;
  if (info && info.hit) { if (info.hit.indexOf(this.uid) >= 0) return false; info.hit.push(this.uid); }
  var d = dmg * (this.stun > 0 ? 2 : 1) * this.vulnMul;
  this.hp -= d; this.flash = 0.14;
  this.g.fx.burst(this.cx(), this.cy(), 7, '#ffd9a0', 190);
  this.g.fx.slash(this.cx(), this.cy(), dir, (info && info.stage) || 0);
  if (!this.armor && this.stun <= 0) { this.knock = 0.16; this.vx = dir * 170; if (!this.flying) this.vy = -140; this.tele = 0; this.interrupt(); }
  if (this.stun > 0) this.stun = Math.max(this.stun, 0.3);
  if (this.hp <= 0) { this.die(dir); if (attacker && attacker.onHitLanded) attacker.onHitLanded(info, this, true); return true; }
  if (attacker && attacker.onHitLanded) attacker.onHitLanded(info, this, false);
  return true;
};
Enemy.prototype.parried = function (t) { this.stun = t || 1.1; this.tele = 0; this.vx = -this.facing * 90; this.setState('stunned'); this.g.fx.text(this.cx(), this.y - 8, 'ПАРИРОВАНО', '#fff3b0'); };
Enemy.prototype.die = function (dir) {
  this.dead = true; var g = this.g;
  g.fx.burst(this.cx(), this.cy(), 22, '#ffb27d', 300); g.fx.ring(this.cx(), this.cy(), '#ffd9a0');
  var P = Enemies.pal(this);
  g.fx.burst(this.cx(), this.cy(), 12, P.glow, 240);
  for (var i = 0; i < 5; i++) g.fx.mote(this.cx() + rnd(-8, 8), this.cy() + rnd(-8, 8), P.trim, rnd(-60, -25));
  if (this.deathFx) this.deathFx(dir);
  g.shake(this.boss ? 14 : 4);
  for (i = 0; i < this.shard; i++) g.add(new Pickup(g, this.cx(), this.cy(), 'shard'));
  if (Math.random() < 0.18 && !this.boss) g.add(new Pickup(g, this.cx(), this.cy(), 'drop'));
  if (this.id) g.mark(this.id);
  g.enemyKilled(this);
};
// Физика наземных врагов: возвращает true, если стоит на земле.
Enemy.prototype.physics = function (dt) {
  var L = this.g.level;
  if (!this.flying) this.vy = Math.min(this.vy + 2200 * dt, 800);
  L.move(this, this.vx * dt, 0); if (this.hitL || this.hitR) { this.vx = 0; this.blocked = true; } else this.blocked = false;
  L.move(this, 0, this.vy * dt);
  var on = !this.flying && L.groundBelow(this);
  if (on && this.vy > 0) this.vy = 0;
  this.onGround = on;
  if (this.y > L.h * T + 200) this.dead = true;
  return on;
};
// Движение тела: наземное (с гравитацией) или летающее (без)
Enemy.prototype.moveBody = function (dt) {
  if (!this.flying) { this.physics(dt); return; }
  var L = this.g.level;
  L.move(this, this.vx * dt, 0); if (this.hitL || this.hitR) { this.vx *= -0.2; this.blocked = true; } else this.blocked = false;
  var gr = L.move(this, 0, this.vy * dt); this.hitV = gr || this.hitU;
  if (this.hitV) this.vy *= -0.2;
};
Enemy.prototype.ledgeAhead = function () {
  var L = this.g.level, x = this.facing > 0 ? this.x + this.w + 6 : this.x - 6;
  var tx = Math.floor(x / T);
  if (L.get(tx, Math.floor((this.y + this.h - 4) / T)) === TILE.SPIKE) return true;
  return !L.solid(tx, Math.floor((this.y + this.h + 4) / T), false) && L.get(tx, Math.floor((this.y + this.h + 4) / T)) !== TILE.ONEWAY;
};
// можно ли шагнуть в сторону dir (нет стены, края и шипов)
Enemy.prototype.canStep = function (dir) {
  var L = this.g.level, x = dir > 0 ? this.x + this.w + 8 : this.x - 8, tx = Math.floor(x / T);
  if (L.solid(tx, Math.floor((this.y + this.h - 6) / T), false) || L.solid(tx, Math.floor((this.y + 6) / T), false)) return false;
  if (L.get(tx, Math.floor((this.y + this.h - 4) / T)) === TILE.SPIKE) return false;
  var ty = Math.floor((this.y + this.h + 4) / T);
  return L.solid(tx, ty, false) || L.get(tx, ty) === TILE.ONEWAY;
};
// есть ли опора под точкой x (для прыжков: не прыгать в пропасть)
Enemy.prototype.groundAt = function (x) {
  var L = this.g.level, tx = Math.floor(x / T), ty0 = Math.floor((this.y + this.h - 2) / T);
  for (var ty = ty0; ty <= ty0 + 4; ty++) {
    var v = L.get(tx, ty);
    if (v === TILE.SPIKE) return false;
    if (L.solid(tx, ty, false) || v === TILE.ONEWAY) return true;
  }
  return false;
};
// другой наземный враг вплотную спереди (чтобы не толпиться)
Enemy.prototype.crowded = function () {
  var l = this.g.ents, f = this.facing, cx = this.cx(), cy = this.cy();
  for (var i = 0; i < l.length; i++) {
    var o = l[i]; if (o === this || !o.isEnemy || o.dead || o.flying || o.boss) continue;
    var d = (o.cx() - cx) * f;
    if (d > 0 && d < (this.w + o.w) / 2 + 6 && Math.abs(o.cy() - cy) < 30) return true;
  }
  return false;
};
// далеко от игрока: логику не считаем
Enemy.prototype.far = function () {
  var p = this.g.player;
  return Math.abs(p.cx() - this.cx()) > 780 || Math.abs(p.cy() - this.cy()) > 520;
};
// оглушение / отбрасывание: true, если кадр обработан
Enemy.prototype.stunTick = function (dt) {
  if (this.stun > 0) { this.vx = approach(this.vx, 0, 900 * dt); if (this.flying) this.vy = approach(this.vy, 40, 260 * dt); this.moveBody(dt); return true; }
  if (this.state === 'stunned') { this.face(); this.setState('aware'); }
  if (this.knock > 0) { if (this.flying) { this.vx = approach(this.vx, 0, 500 * dt); this.vy = approach(this.vy, 0, 500 * dt); } this.moveBody(dt); return true; }
  return false;
};
// Патруль: ходьба туда-сюда с паузами и осматриванием; не падает с краёв, не упирается в стены.
Enemy.prototype.patrol = function (dt, speed, range) {
  if (this.pauseT > 0) {
    var half = this.pauseMax * 0.5;
    this.pauseT -= dt; this.vx = approach(this.vx, 0, 700 * dt);
    if (this.pauseT <= half && this.pauseT + dt > half && Math.random() < 0.6) this.facing = -this.facing;
    if (this.pauseT <= 0) {
      this.dir = Math.random() < 0.5 ? 1 : -1;
      if (Math.abs(this.cx() - this.home.x) > range) this.dir = this.home.x > this.cx() ? 1 : -1;
      this.walkT = rnd(2, 4.5); this.stuckX = this.x; this.stuckT = 0;
    }
    return;
  }
  this.walkT -= dt;
  if (this.walkT <= 0) { this.pauseT = this.pauseMax = rnd(0.7, 1.8); this.vx = 0; return; }
  this.facing = this.dir;
  if (this.blocked || (this.onGround && this.ledgeAhead()) || this.crowded() || (Math.abs(this.cx() - this.home.x) > range && (this.home.x - this.cx()) * this.dir < 0)) {
    this.dir = -this.dir; this.facing = this.dir; this.stuckX = this.x; this.stuckT = 0;
  }
  this.vx = this.dir * speed;
  this.stuckT += dt;
  if (Math.abs(this.x - this.stuckX) > 4) { this.stuckX = this.x; this.stuckT = 0; }
  else if (this.stuckT > 0.7) { this.dir = -this.dir; this.stuckT = 0; this.stuckX = this.x; }
};
Enemy.prototype.animStep = function (dt) { this.ph += Math.abs(this.vx) * dt * 0.11; };
Enemy.prototype.touchDamage = function () {
  var p = this.g.player;
  if (this.touch > 0 && !p.dead && this.stun <= 0 && overlap(this, p)) p.takeHit({ dmg: this.touch, x: this.cx(), parryable: false });
};
Enemy.prototype.baseUpdate = function (dt) {
  this.t += dt; this.stateT += dt; this.flash -= dt; this.stun -= dt; this.knock -= dt; this.invulnT -= dt;
  if (this.tele > 0) this.tele -= dt;
};
Enemy.prototype.draw = function (ctx) { Enemies.drawGeneric(ctx, this); };

// ---------------- Стражник сада: меч-шамшир, парируемый удар (жёлтый)
function Guard(g, x, y, o) {
  Enemy.call(this, g, x, y, o || { hp: 3 });
  this.speed = rnd(64, 78); this.facing = this.dir; this.atkHit = false; this.windT = rnd(0.46, 0.6);
}
Guard.prototype = Object.create(Enemy.prototype);
Guard.prototype.interrupt = Enemy.prototype.softInterrupt;
Guard.prototype.update = function (dt) {
  this.baseUpdate(dt);
  var p = this.g.player;
  if (this.stunTick(dt)) return;
  if (this.far()) { this.vx = 0; this.physics(dt); return; }
  var s = this.state;
  if (s === 'idle' || s === 'patrol') {
    this.state = s = 'patrol';
    if (this.canSee(230)) { this.face(); this.setState('aware'); this.vx = 0; }
    else this.patrol(dt, this.speed * 0.5, 90);
  } else if (s === 'aware') {
    this.face(); this.vx = 0; if (this.stateT > 0.32) this.setState('chase');
  } else if (s === 'chase') {
    this.face();
    if (!this.canSee(320, 110)) { this.lostT += dt; this.vx = 0; if (this.lostT > 1.4) { this.lostT = 0; this.setState('patrol'); } }
    else {
      this.lostT = 0;
      if (Math.abs(this.dx()) < 52 && Math.abs(this.dy()) < 40) { this.vx = 0; this.setState('windup'); this.startTele(this.windT, true); }
      else if (this.onGround && this.ledgeAhead()) this.vx = 0;
      else if (this.crowded()) this.vx = 0;
      else this.vx = this.facing * this.speed;
    }
  } else if (s === 'windup') {
    this.vx = 0; if (this.tele <= 0) { this.setState('strike'); this.atkHit = false; this.vx = this.facing * 160; this.windT = rnd(0.46, 0.6); }
  } else if (s === 'strike') {
    this.vx = approach(this.vx, 0, 600 * dt);
    if (this.stateT > 0.05 && this.stateT < 0.2 && !this.atkHit) {
      var box = { x: this.facing > 0 ? this.x + this.w - 4 : this.x - 40, y: this.y + 4, w: 44, h: this.h - 8 };
      if (!p.dead && overlap(box, p)) {
        var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
        if (r !== 'miss') this.atkHit = true;
        if (r === 'parried') this.parried(1.2);
      }
    }
    if (this.stateT > 0.3) this.setState('recover');
  } else if (s === 'recover') {
    this.vx = 0; if (this.stateT > 0.55) this.setState('chase');
  }
  this.physics(dt); this.animStep(dt);
  this.touchDamage();
};
Guard.prototype.draw = function (ctx) { Enemies.drawGuard(ctx, this); };

// ---------------- Стрела лучника
function Arrow(g, x, y, vx, vy, o) { Projectile.call(this, g, x, y, vx, vy, o); this.kind = 'arrow'; }
Arrow.prototype = Object.create(Projectile.prototype);
Arrow.prototype.draw = function (ctx) { Enemies.drawArrow(ctx, this); };

// ---------------- Лучник: держит дистанцию, жёлтая стрела (парирование отражает её)
function Archer(g, x, y) {
  Enemy.call(this, g, x, y, { hp: 2, w: 22, h: 40, touch: 0, shard: 2 });
  this.facing = this.dir; this.aimA = 0;
}
Archer.prototype = Object.create(Enemy.prototype);
Archer.prototype.interrupt = Enemy.prototype.softInterrupt;
Archer.prototype.updAim = function () {
  var p = this.g.player, a = Math.atan2(p.cy() - (this.y + 16), Math.max(30, Math.abs(this.dx())));
  this.aimA = clamp(a, -0.55, 0.55);
};
Archer.prototype.fire = function () {
  var g = this.g, sp = 430, a = this.aimA, f = this.facing;
  var ox = this.cx() + f * 20, oy = this.y + 16 + Math.sin(a) * 12;
  if (g.level.solid(Math.floor(ox / T), Math.floor(oy / T), false)) { g.fx.burst(ox, oy, 5, '#ffd84a', 100); return; }
  g.add(new Arrow(g, ox, oy, f * Math.cos(a) * sp, Math.sin(a) * sp, { dmg: 1, color: TELE_Y, parryable: true, r: 4, life: 2.6 }));
  g.fx.burst(ox, oy, 4, '#ffe9a8', 90);
};
Archer.prototype.update = function (dt) {
  this.baseUpdate(dt); this.cool -= dt;
  if (this.stunTick(dt)) return;
  if (this.far()) { this.vx = 0; this.physics(dt); return; }
  var s = this.state, adx = Math.abs(this.dx());
  if (s === 'idle' || s === 'patrol') {
    this.state = 'patrol';
    if (this.canSee(400, 150)) { this.face(); this.setState('aware'); this.vx = 0; }
    else this.patrol(dt, 32, 70);
  } else if (s === 'aware') {
    this.face(); this.vx = 0; this.updAim(); if (this.stateT > 0.35) this.setState('chase');
  } else if (s === 'chase') {
    this.face(); this.updAim();
    if (!this.canSee(470, 170)) { this.lostT += dt; this.vx = 0; if (this.lostT > 1.5) { this.lostT = 0; this.setState('patrol'); } }
    else {
      this.lostT = 0;
      if (adx < 120 && this.canStep(-this.facing)) this.vx = -this.facing * 74;
      else if (adx > 340 && this.canStep(this.facing) && !this.crowded()) this.vx = this.facing * 46;
      else this.vx = approach(this.vx, 0, 700 * dt);
      if (this.cool <= 0 && adx > 36) { this.vx = 0; this.setState('aim'); this.startTele(rnd(0.55, 0.7), true); }
    }
  } else if (s === 'aim') {
    this.vx = 0;
    if (this.tele > 0.16) { this.face(); this.updAim(); }
    if (this.tele <= 0) { this.fire(); this.setState('shoot'); }
  } else if (s === 'shoot') {
    this.vx = 0; if (this.stateT > 0.18) this.setState('recover');
  } else if (s === 'recover') {
    this.vx = 0; if (this.stateT > 0.55) { this.cool = rnd(1.1, 1.9); this.setState('chase'); }
  }
  this.physics(dt); this.animStep(dt);
};
Archer.prototype.draw = function (ctx) { Enemies.drawArcher(ctx, this); };

// ---------------- Тяжёлый стражник: щит спереди, красный удар (2 урона, 0.75 с) и жёлтый удар щитом
function Heavy(g, x, y) {
  Enemy.call(this, g, x, y, { hp: 7, w: 30, h: 46, armor: true, touch: 0, shard: 4 });
  this.facing = this.dir; this.speed = 50; this.shU = 1; this.shFlash = 0; this.turnWait = -1; this.kind = 0; this.lastKind = -1; this.rep = 0; this.atkHit = false;
}
Heavy.prototype = Object.create(Enemy.prototype);
Heavy.prototype.shieldUp = function () {
  var s = this.state;
  return this.stun <= 0 && s !== 'strike' && s !== 'recover' && s !== 'stunned';
};
Heavy.prototype.onHit = function (dmg, dir, info, attacker) {
  if (this.dead || this.invulnT > 0) return false;
  var front = dir * this.facing < 0;
  if (front && this.shU > 0.6 && this.shieldUp() && !(info && info.stage === 3)) {
    if (info && info.hit) { if (info.hit.indexOf(this.uid) >= 0) return false; info.hit.push(this.uid); }
    var g = this.g;
    this.shFlash = 0.2;
    var sx = this.cx() + this.facing * 17, sy = this.y + 22;
    g.fx.burst(sx, sy, 9, '#fff0b8', 260); g.fx.burst(sx, sy, 4, '#ffffff', 140); g.fx.ring(sx, sy, '#ffe9a8');
    g.hitstop(0.04); g.shake(2.5);
    if (attacker === g.player) attacker.vx = -dir * 190;
    if (Math.random() < 0.5) g.fx.text(sx, this.y - 6, 'БЛОК', '#cfc7b2');
    return false;
  }
  return Enemy.prototype.onHit.call(this, dmg, dir, info, attacker);
};
Heavy.prototype.parried = function (t) { Enemy.prototype.parried.call(this, t); this.shFlash = 0.25; };
Heavy.prototype.deathFx = function () { this.g.fx.burst(this.cx(), this.cy(), 16, '#cfc7b2', 280); this.g.shake(3); };
Heavy.prototype.update = function (dt) {
  this.baseUpdate(dt); this.shFlash -= dt; this.cool -= dt;
  this.shU = approach(this.shU, this.shieldUp() ? 1 : 0, dt * 7);
  if (this.stunTick(dt)) { this.animStep(dt); return; }
  if (this.far()) { this.vx = 0; this.physics(dt); return; }
  var s = this.state, p = this.g.player, adx = Math.abs(this.dx());
  if (s === 'idle' || s === 'patrol') {
    this.state = 'patrol';
    if (this.canSee(300, 110)) { this.face(); this.setState('aware'); this.vx = 0; }
    else this.patrol(dt, 32, 90);
  } else if (s === 'aware') {
    this.vx = 0; this.face(); if (this.stateT > 0.45) this.setState('chase');
  } else if (s === 'chase') {
    var want = this.dx() >= 0 ? 1 : -1;
    if (want !== this.facing) { if (this.turnWait < 0) this.turnWait = 0.5; this.turnWait -= dt; if (this.turnWait <= 0) { this.facing = want; this.turnWait = -1; } }
    else this.turnWait = -1;
    if (!this.canSee(400, 130)) { this.lostT += dt; this.vx = 0; if (this.lostT > 1.6) { this.lostT = 0; this.setState('patrol'); } }
    else {
      this.lostT = 0;
      if (this.turnWait > 0) this.vx = approach(this.vx, 0, 600 * dt);
      else if (adx < 62 && Math.abs(this.dy()) < 52) {
        this.vx = 0;
        if (this.cool <= 0) {
          var k = Math.random() < 0.55 ? 0 : 1;
          if (k === this.lastKind && ++this.rep >= 2) { k = 1 - k; this.rep = 0; } else if (k !== this.lastKind) this.rep = 0;
          this.kind = this.lastKind = k;
          this.setState('windup');
          if (k === 0) this.startTele(0.75, false); else this.startTele(0.5, true);
        }
      }
      else if (this.onGround && this.ledgeAhead()) this.vx = 0;
      else if (this.crowded()) this.vx = 0;
      else this.vx = this.facing * this.speed;
    }
  } else if (s === 'windup') {
    this.vx = 0; if (this.tele <= 0) { this.setState('strike'); this.atkHit = false; if (this.kind === 1) this.vx = this.facing * 150; }
  } else if (s === 'strike') {
    this.vx = approach(this.vx, 0, 500 * dt);
    if (this.kind === 0) {
      if (this.stateT >= 0.04 && !this.shockT) { this.shockT = 1; this.g.shake(5); this.g.fx.dust(this.cx() + this.facing * 40, this.y + this.h, 10, 2); this.g.fx.ring(this.cx() + this.facing * 40, this.y + this.h - 2, '#ffe0a0'); }
      if (this.stateT > 0.04 && this.stateT < 0.2 && !this.atkHit && !p.dead) {
        var bx = { x: this.facing > 0 ? this.x + this.w - 6 : this.x - 64, y: this.y + this.h - 32, w: 70, h: 32 };
        if (overlap(bx, p) && p.takeHit({ dmg: 2, x: this.cx(), parryable: false, src: this }) === 'hit') this.atkHit = true;
      }
    } else if (this.stateT > 0.05 && this.stateT < 0.2 && !this.atkHit && !p.dead) {
      var bb = { x: this.facing > 0 ? this.x + this.w - 4 : this.x - 38, y: this.y + 4, w: 42, h: this.h - 8 };
      if (overlap(bb, p)) {
        var r = p.takeHit({ dmg: 1, x: this.cx(), parryable: true, src: this });
        if (r !== 'miss') this.atkHit = true;
        if (r === 'parried') { this.shockT = 0; this.parried(1.7); }
      }
    }
    if (this.stateT > 0.36 && this.state === 'strike') { this.shockT = 0; this.setState('recover'); }
  } else if (s === 'recover') {
    this.vx = 0; if (this.stateT > 0.9) { this.cool = rnd(0.3, 0.7); this.setState('chase'); }
  }
  this.physics(dt); this.animStep(dt);
};
Heavy.prototype.interrupt = function () { };
Heavy.prototype.draw = function (ctx) { Enemies.drawHeavy(ctx, this); };

// ---------------- Маг: телепорт, жёлтый шар (парируется, возвращается), красный веер и красная дуга
var ANG6 = [0.7, -0.7, 1.4, -1.4, 2.1, -2.1];
function Mage(g, x, y) {
  Enemy.call(this, g, x, y, { hp: 4, w: 22, h: 44, touch: 0, shard: 3 });
  this.facing = this.dir; this.alpha = 1; this.kind = 0; this.lastKind = -1; this.tpX = 0; this.tpY = 0; this.tpOk = false; this.cool = 0.3;
}
Mage.prototype = Object.create(Enemy.prototype);
Mage.prototype.interrupt = function () {
  if (this.state === 'cast') this.setState('recover');
  else if (this.state === 'idle' || this.state === 'patrol') { this.face(); this.setState('aware'); }
};
Mage.prototype.deathFx = function () {
  var P = Enemies.pal(this); this.g.fx.ring(this.cx(), this.cy(), P.trim); this.g.fx.burst(this.cx(), this.cy(), 14, P.trim, 300);
};
Mage.prototype.pickSpot = function () {
  var g = this.g, L = g.level, p = g.player, side0 = Math.random() < 0.5 ? 1 : -1;
  for (var i = 0; i < 10; i++) {
    var side = (i & 1) ? -side0 : side0;
    var x = p.cx() + side * rnd(150, 290);
    if (Math.abs(x - this.home.x) > 460) continue;
    var tx = Math.floor(x / T), tl = Math.floor((x - 11) / T), tr = Math.floor((x + 11) / T), ty0 = Math.floor(p.y / T) - 3;
    for (var ty = ty0; ty <= ty0 + 7; ty++) {
      var floor = L.solid(tx, ty, false) || L.get(tx, ty) === TILE.ONEWAY;
      if (!floor) continue;
      if (L.solid(tl, ty - 1, false) || L.solid(tr, ty - 1, false) || L.solid(tl, ty - 2, false) || L.solid(tr, ty - 2, false)) break;
      if (L.get(tx, ty - 1) === TILE.SPIKE) break;
      if (L.lineClear(x, ty * T - 24, p.cx(), p.cy() - 6)) { this.tpX = x; this.tpY = ty * T; return true; }
      break;
    }
  }
  return false;
};
Mage.prototype.orb = function (ox, oy, ang, sp, col, parry, r, grav) {
  var g = this.g;
  g.add(new Projectile(g, ox, oy, Math.cos(ang) * sp, Math.sin(ang) * sp, { dmg: 1, color: col, parryable: parry, r: r, life: 3, grav: grav || 0 }));
};
Mage.prototype.fire = function () {
  var g = this.g, p = g.player, f = this.facing, ox = this.cx() + f * 16, oy = this.y + 8, k = this.kind;
  if (g.level.solid(Math.floor(ox / T), Math.floor(oy / T), false)) { ox = this.cx(); }
  var ang = Math.atan2(p.cy() - oy, p.cx() - ox);
  if (k === 0) this.orb(ox, oy, ang, 290, TELE_Y, true, 6);
  else if (k === 1) { this.orb(ox, oy, ang - 0.34, 235, '#ff5a4a', false, 5); this.orb(ox, oy, ang, 235, '#ff5a4a', false, 5); this.orb(ox, oy, ang + 0.34, 235, '#ff5a4a', false, 5); }
  else {
    var G = 640, tf = clamp(Math.abs(p.cx() - ox) / 250, 0.7, 1.15);
    var vx = (p.cx() - ox) / tf, vy = (p.y + p.h - 8 - oy - 0.5 * G * tf * tf) / tf;
    g.add(new Projectile(g, ox, oy, vx, vy, { dmg: 1, color: '#ff5a4a', parryable: false, r: 7, life: 2.6, grav: G }));
  }
  g.fx.burst(ox, oy, 6, k === 0 ? '#ffe9a8' : '#ff9a8a', 120);
};
Mage.prototype.pickKind = function () {
  var adx = Math.abs(this.dx()), k;
  var r = Math.random();
  if (adx < 160) k = r < 0.5 ? 0 : (r < 0.8 ? 1 : 2); else k = r < 0.34 ? 0 : (r < 0.67 ? 1 : 2);
  if (k === this.lastKind && Math.random() < 0.7) k = (k + 1 + (Math.random() < 0.5 ? 1 : 0)) % 3;
  this.kind = this.lastKind = k;
};
Mage.prototype.startCast = function () {
  this.pickKind(); this.setState('cast');
  if (this.kind === 0) this.startTele(0.6, true); else if (this.kind === 1) this.startTele(0.75, false); else this.startTele(0.65, false);
};
Mage.prototype.update = function (dt) {
  this.baseUpdate(dt); this.cool -= dt;
  if (this.stun > 0) this.alpha = 1;
  if (this.stunTick(dt)) { this.animStep(dt); return; }
  if (this.far() && this.state === 'idle') { this.vx = 0; this.physics(dt); return; }
  var s = this.state, adx = Math.abs(this.dx()), g = this.g, P;
  if (s === 'idle' || s === 'patrol') {
    this.state = 'idle'; this.vx = 0;
    if (this.canSee(460, 200)) { this.face(); this.setState('aware'); }
  } else if (s === 'aware') {
    this.face(); this.vx = 0;
    if (adx < 90 && this.stateT > 0.2) this.setState('vanish');
    else if (this.stateT > 0.45) this.startCast();
  } else if (s === 'cast') {
    this.vx = 0; if (this.tele > 0.12) this.face();
    if (this.tele <= 0) { this.fire(); this.setState('recover'); }
  } else if (s === 'recover') {
    this.vx = 0; if (this.stateT > 0.5) this.setState('vanish');
  } else if (s === 'vanish') {
    this.vx = 0; this.alpha = clamp(1 - this.stateT / 0.25, 0, 1);
    if (this.stateT < dt * 1.5) { P = Enemies.pal(this); g.fx.burst(this.cx(), this.cy(), 12, P.glow, 170); g.fx.ring(this.cx(), this.cy(), P.trim); }
    if (this.stateT >= 0.25) { this.alpha = 0; this.invulnT = 0.5; this.tpOk = this.pickSpot(); this.setState('hidden'); }
  } else if (s === 'hidden') {
    this.vx = 0; this.alpha = 0; this.invulnT = Math.max(this.invulnT, 0.05);
    if (this.stateT >= 0.35) {
      if (this.tpOk) { this.x = this.tpX - this.w / 2; this.y = this.tpY - this.h; this.vy = 0; }
      this.face(); P = Enemies.pal(this);
      g.fx.burst(this.cx(), this.cy(), 12, P.glow, 170); g.fx.ring(this.cx(), this.cy() + 8, P.trim);
      this.setState('appear');
    }
  } else if (s === 'appear') {
    this.vx = 0; this.face(); this.alpha = clamp(this.stateT / 0.25, 0, 1);
    if (this.stateT >= 0.5) { this.alpha = 1; if (this.canSee(480, 220)) this.startCast(); else this.setState('idle'); }
  }
  this.physics(dt); this.animStep(dt);
};
Mage.prototype.draw = function (ctx) { Enemies.drawMage(ctx, this); };

// ---------------- Зверь-прыгун: подкрадывается, красный бросок
function Beast(g, x, y) {
  Enemy.call(this, g, x, y, { hp: 3, w: 42, h: 26, touch: 0, shard: 2 });
  this.facing = this.dir; this.speed = rnd(36, 44); this.cr = 0; this.leapR = rnd(150, 195); this.hitDone = false; this.creepT = 0;
}
Beast.prototype = Object.create(Enemy.prototype);
Beast.prototype.interrupt = Enemy.prototype.softInterrupt;
Beast.prototype.update = function (dt) {
  this.baseUpdate(dt); this.cool -= dt;
  var tgt = this.state === 'windup' ? 1 : (this.state === 'creep' ? 0.55 : (this.state === 'aware' ? 0.4 : 0));
  this.cr = approach(this.cr, tgt, dt * 5);
  if (this.stunTick(dt)) { this.animStep(dt); return; }
  if (this.far()) { this.vx = 0; this.physics(dt); return; }
  var s = this.state, p = this.g.player, adx = Math.abs(this.dx()), L = this.g.level;
  if (s === 'idle' || s === 'patrol') {
    this.state = 'patrol';
    if (this.canSee(330, 100)) { this.face(); this.setState('aware'); this.vx = 0; }
    else this.patrol(dt, this.speed, 110);
  } else if (s === 'aware') {
    this.face(); this.vx = 0; if (this.stateT > 0.38) { this.creepT = 0; this.setState('creep'); }
  } else if (s === 'creep') {
    this.face(); this.creepT += dt;
    if (!this.canSee(440, 120)) { this.lostT += dt; this.vx = 0; if (this.lostT > 1.4) { this.lostT = 0; this.setState('patrol'); } }
    else {
      this.lostT = 0;
      var landX = this.cx() + this.facing * (adx + 24);
      if (this.cool <= 0 && adx < this.leapR + (this.creepT > 2.4 ? 70 : 0) && adx > 50 && Math.abs(this.dy()) < 80 && this.groundAt(landX)) {
        this.vx = 0; this.setState('windup'); this.startTele(0.55, false);
      } else if (this.onGround && this.ledgeAhead()) this.vx = 0;
      else if (this.crowded() || adx < 50) this.vx = approach(this.vx, 0, 900 * dt);
      else this.vx = this.facing * 64;
    }
  } else if (s === 'windup') {
    this.vx = 0; if (this.tele > 0.1) this.face();
    if (this.tele <= 0) {
      var sp = clamp((adx + 24) / 0.35, 250, 520);
      this.vx = this.facing * sp; this.vy = -380; this.onGround = false; this.hitDone = false; this.setState('leap');
      this.g.fx.dust(this.cx(), this.y + this.h, 7, 1.3);
    }
  } else if (s === 'leap') {
    if (!this.hitDone && !p.dead && overlap(this, p)) { if (p.takeHit({ dmg: 1, x: this.cx(), parryable: false, src: this }) === 'hit') this.hitDone = true; }
    if (this.blocked) this.vx = 0;
    if ((this.onGround && this.stateT > 0.12 && this.vy >= 0) || this.stateT > 0.9) { this.setState('recover'); this.g.fx.dust(this.cx(), this.y + this.h, 7, 1.3); }
  } else if (s === 'recover') {
    this.vx = approach(this.vx, 0, 1500 * dt);
    if (this.stateT > 0.85) { this.cool = rnd(0.4, 1.0); this.creepT = 0; this.setState('creep'); }
  }
  this.physics(dt); this.animStep(dt);
};
Beast.prototype.draw = function (ctx) { Enemies.drawBeast(ctx, this); };

// ---------------- Призрак-огонёк: летает, плавает по синусоиде, красное пике после предупреждения
function Wisp(g, x, y) {
  Enemy.call(this, g, x, y, { hp: 2, w: 20, h: 20, flying: true, touch: 0, shard: 2 });
  var hx = x, hy = y - 56, L = g.level;
  if (L.solid(Math.floor(hx / T), Math.floor(hy / T), false) || L.solid(Math.floor(hx / T), Math.floor((hy - 12) / T), false)) hy = y - 30;
  this.x = hx - this.w / 2; this.y = hy - this.h / 2; this.base = { x: hx, y: hy };
  this.ph0 = Math.random() * 6.28; this.side = Math.random() < 0.5 ? -1 : 1; this.sideT = rnd(1.5, 3); this.cool = rnd(1, 2);
  this.tr = []; for (var i = 0; i < 6; i++) this.tr.push({ x: hx, y: hy }); this.trT = 0;
  this.pathT = 0; this.clear = true; this.wpOff = 0; this.aimX = hx; this.aimY = hy; this.hitDone = false; this.sx = this.x; this.sy = this.y; this.stuckT = 0; this.ang = 0; this.facing = this.dir;
}
Wisp.prototype = Object.create(Enemy.prototype);
Wisp.prototype.interrupt = Enemy.prototype.softInterrupt;
Wisp.prototype.deathFx = function () {
  var P = Enemies.pal(this); this.g.fx.ring(this.cx(), this.cy(), P.glow); this.g.fx.burst(this.cx(), this.cy(), 16, '#ffffff', 200);
};
Wisp.prototype.wall = function (x, y) { return this.g.level.solid(Math.floor(x / T), Math.floor(y / T), false); };
Wisp.prototype.steer = function (dt, tx, ty, speed, acc) {
  var cx = this.cx(), cy = this.cy(), dx = tx - cx, dy = ty - cy, L = this.g.level;
  // путь к цели перекрыт стеной: ищем ближайшую высоту, на которой можно обойти (раз в 0.25 с)
  this.pathT -= dt;
  if (this.pathT <= 0) {
    this.pathT = 0.25; this.clear = L.lineClear(cx, cy, tx, ty); this.wpOff = 0;
    if (!this.clear) {
      for (var i = 1; i <= 10 && !this.wpOff; i++) for (var s2 = -1; s2 <= 1; s2 += 2) {
        var off = s2 * i * 24;
        if (L.lineClear(cx, cy, cx, cy + off) && L.lineClear(cx, cy + off, tx, ty)) { this.wpOff = off; break; }
      }
    }
  }
  if (!this.clear && this.wpOff) { tx = cx + (dx >= 0 ? 60 : -60); ty = cy + this.wpOff; dx = tx - cx; dy = ty - cy; }
  var d = Math.sqrt(dx * dx + dy * dy) || 1;
  var sp = speed * Math.min(1, d / 50), ux = dx / d, uy = dy / d, look = 26 + sp * 0.25;
  if (this.wall(cx + ux * look, cy + uy * look) || this.wall(cx + ux * 14, cy + uy * 14)) {
    var k = 0;
    for (; k < 6; k++) {
      var a = ANG6[k], c = Math.cos(a), s = Math.sin(a), rx = ux * c - uy * s, ry = ux * s + uy * c;
      if (!this.wall(cx + rx * look, cy + ry * look) && !this.wall(cx + rx * 14, cy + ry * 14)) { ux = rx; uy = ry; break; }
    }
    if (k === 6) { ux = -ux; uy = -uy; }
  }
  this.vx = approach(this.vx, ux * sp, acc * dt); this.vy = approach(this.vy, uy * sp, acc * dt);
  var l = this.g.ents;
  for (var i = 0; i < l.length; i++) {
    var o = l[i]; if (o === this || !o.isEnemy || o.dead || !o.flying) continue;
    var ox = cx - o.cx(), oy = cy - o.cy(), dd = Math.sqrt(ox * ox + oy * oy);
    if (dd < 44 && dd > 0.1) { this.vx += ox / dd * 140 * dt; this.vy += oy / dd * 140 * dt; }
  }
};
Wisp.prototype.update = function (dt) {
  this.baseUpdate(dt); this.cool -= dt; this.sideT -= dt;
  this.trT -= dt;
  if (this.trT <= 0) { this.trT = 0.045; for (var i = 5; i > 0; i--) { this.tr[i].x = this.tr[i - 1].x; this.tr[i].y = this.tr[i - 1].y; } this.tr[0].x = this.cx(); this.tr[0].y = this.cy(); }
  if (this.stunTick(dt)) return;
  if (this.far()) { this.vx = this.vy = 0; return; }
  var s = this.state, p = this.g.player, cx = this.cx(), cy = this.cy();
  if (s === 'idle' || s === 'patrol') {
    this.state = 'patrol';
    var tx = this.base.x + Math.sin(this.t * 0.6 + this.ph0) * 70, ty = this.base.y + Math.sin(this.t * 1.7 + this.ph0) * 10;
    this.steer(dt, tx, ty, 52, 230);
    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
    if (this.canSee(300, 230)) { this.face(); this.setState('aware'); }
  } else if (s === 'aware') {
    this.face(); this.vx = approach(this.vx, 0, 500 * dt); this.vy = approach(this.vy, 0, 500 * dt);
    if (this.stateT > 0.4) this.setState('hover');
  } else if (s === 'hover') {
    if (!this.canSee(430, 270)) { this.lostT += dt; if (this.lostT > 2) { this.lostT = 0; this.setState('patrol'); } } else this.lostT = 0;
    if (this.sideT <= 0) { this.side = -this.side; this.sideT = rnd(1.6, 3); }
    this.steer(dt, p.cx() + this.side * 120, p.cy() - 74 + Math.sin(this.t * 2.2) * 12, 110, 380);
    this.facing = this.dx() >= 0 ? 1 : -1;
    if (this.cool <= 0 && this.canSee(300, 230)) { this.setState('windup'); this.startTele(0.62, false); this.aimX = p.cx(); this.aimY = p.cy(); }
  } else if (s === 'windup') {
    this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, 0, 700 * dt);
    if (this.tele > 0.18) { this.aimX = p.cx(); this.aimY = p.cy() - 4; }
    this.facing = this.aimX >= cx ? 1 : -1;
    if (this.tele <= 0) {
      var dx = this.aimX - cx, dy = this.aimY - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      this.vx = dx / d * 440; this.vy = dy / d * 440; this.hitDone = false; this.setState('dive');
      this.g.fx.burst(cx, cy, 6, Enemies.pal(this).glow, 150);
    }
  } else if (s === 'dive') {
    if (!this.hitDone && !p.dead && overlap(this, p)) { if (p.takeHit({ dmg: 1, x: cx, parryable: false, src: this }) === 'hit') { this.hitDone = true; this.setState('recover'); this.vx *= -0.3; this.vy = -80; } }
    if (this.state === 'dive' && (this.stateT > 0.46 || this.blocked || this.hitV)) { this.setState('recover'); this.cool = rnd(1.4, 2.2); }
  } else if (s === 'recover') {
    this.vx = approach(this.vx, 0, 700 * dt); this.vy = approach(this.vy, -30, 500 * dt);
    if (this.stateT > 0.75) { this.cool = Math.max(this.cool, rnd(1.2, 2)); this.setState('hover'); }
  }
  // застряли — вернуться на базу
  this.stuckT += dt;
  if (this.stuckT > 1.2) {
    if (s === 'hover' && Math.abs(this.x - this.sx) + Math.abs(this.y - this.sy) < 6) { this.vx = this.vy = 0; this.setState('patrol'); }
    this.sx = this.x; this.sy = this.y; this.stuckT = 0;
  }
  this.moveBody(dt);
  if (Math.abs(this.vx) > 12 && s !== 'windup') this.facing = this.vx > 0 ? 1 : -1;
};
Wisp.prototype.draw = function (ctx) { Enemies.drawWisp(ctx, this); };

var ENEMY_TYPES = { s: Guard, a: Archer, f: Wisp, h: Heavy, m: Mage, j: Beast };

var Enemies = (function () {
  // ---------- палитры по зонам: сад красно-золотой, цистерны бирюзовые, руины песочные, башня фиолетовая
  var PALS = {
    garden: { cloth: '#a0303c', cloth2: '#5c1b2a', trim: '#e8c26a', metal: '#cfc7b2', metal2: '#8b8574', glow: '#ffb15c', skin: '#c58a5c', dark: '#1a0a10' },
    cistern: { cloth: '#1f8a84', cloth2: '#0d4b55', trim: '#5fe0d0', metal: '#b4cfcf', metal2: '#6b8c92', glow: '#4fd6c8', skin: '#b98660', dark: '#04141a' },
    ruins: { cloth: '#b07a3f', cloth2: '#6a4527', trim: '#ffd27d', metal: '#dccfa8', metal2: '#9a8a68', glow: '#ffbf5c', skin: '#c48a5a', dark: '#1c1008' },
    tower: { cloth: '#6a46a8', cloth2: '#30205a', trim: '#c8a2ff', metal: '#c0b6d8', metal2: '#7e7498', glow: '#b48aff', skin: '#b48a76', dark: '#0e0620' }
  };
  function pal(e) { return PALS[e.g.themeKey] || PALS.garden; }
  var FL = false;
  function K(c) { return FL ? '#ffffff' : c; }

  // ---------- кэш спрайтов свечения (никаких градиентов в кадре)
  var GS = {};
  function glowSprite(col) {
    var s = GS[col]; if (s) return s;
    s = makeCanvas(64, 64); var x = s.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, col); g.addColorStop(0.45, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    GS[col] = s; return s;
  }
  function glow(ctx, x, y, r, col, a) {
    var o = ctx.globalCompositeOperation, oa = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * oa; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = o; ctx.globalAlpha = oa;
  }

  function teleGlow(ctx, e) {
    if (e.tele > 0) {
      var u = 1 - e.tele / e.teleMax, x = e.cx(), y = e.cy() - 6, r = 12 + u * 26;
      ctx.save();
      glow(ctx, x, y, r * 1.5, e.teleColor, 0.45 + u * 0.5);
      ctx.strokeStyle = e.teleColor; ctx.lineWidth = 2; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU * u); ctx.stroke();
      ctx.restore();
    }
  }
  function hpBar(ctx, e) {
    if (e.hp >= e.maxHp || e.boss) return;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(e.x, e.y - 8, e.w, 3);
    ctx.fillStyle = '#ff6b6b'; ctx.fillRect(e.x, e.y - 8, e.w * clamp(e.hp / e.maxHp, 0, 1), 3);
  }
  function stars(ctx, e, top) {
    if (e.stun <= 0) return;
    ctx.save(); ctx.translate(e.cx(), top); ctx.fillStyle = '#ffe08a';
    for (var i = 0; i < 3; i++) {
      var a = e.t * 6 + i * 2.1, sx = Math.cos(a) * 10, sy = Math.sin(a) * 3.5, r = 2.6 + Math.sin(a * 2) * 0.6;
      ctx.beginPath(); ctx.moveTo(sx, sy - r); ctx.lineTo(sx + r * 0.35, sy - r * 0.35); ctx.lineTo(sx + r, sy); ctx.lineTo(sx + r * 0.35, sy + r * 0.35);
      ctx.lineTo(sx, sy + r); ctx.lineTo(sx - r * 0.35, sy + r * 0.35); ctx.lineTo(sx - r, sy); ctx.lineTo(sx - r * 0.35, sy - r * 0.35); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  function bang(ctx, e, top) {
    if (e.state !== 'aware' || e.stateT > 0.42) return;
    var k = Math.min(1, e.stateT / 0.1), y = top - 12 - Math.sin(e.stateT * 20) * 1.5;
    ctx.save(); ctx.translate(e.cx(), y); ctx.scale(k, k);
    ctx.fillStyle = '#000'; ctx.fillRect(-2.5, -9, 5, 12); ctx.fillRect(-2.5, 5, 5, 5);
    ctx.fillStyle = '#ffd84a'; ctx.fillRect(-1.5, -8, 3, 10); ctx.fillRect(-1.5, 6, 3, 3);
    ctx.restore();
  }
  function begin(ctx, e) {
    FL = e.flash > 0;
    ctx.save(); ctx.translate(e.cx(), e.y + e.h); ctx.scale(e.facing, 1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }
  function leg(ctx, hx, hy, fx, fy, kf, w, col) {
    ctx.strokeStyle = K(col); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo((hx + fx) / 2 + kf, (hy + fy) / 2); ctx.lineTo(fx, fy); ctx.stroke();
  }
  function legs(ctx, hipY, e, mv, stride, lift, col, boot, w) {
    var s = mv ? Math.sin(e.ph) : 0, c = mv ? Math.cos(e.ph) : 0;
    var fx1 = s * stride, fy1 = -1 - Math.max(0, c) * lift, fx2 = -s * stride, fy2 = -1 - Math.max(0, -c) * lift;
    leg(ctx, -2, hipY, fx2 - 1, fy2, 3, w, col);
    ctx.fillStyle = K(boot); ctx.fillRect(fx2 - 3, fy2 - 3, 8, 4);
    leg(ctx, 2, hipY, fx1 + 1, fy1, 3, w, col);
    ctx.fillStyle = K(boot); ctx.fillRect(fx1 - 2, fy1 - 3, 8, 4);
  }
  function scimitar(ctx, len, metal, edge) {
    ctx.strokeStyle = K('#6b5a48'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(0, 0); ctx.stroke();
    ctx.strokeStyle = K(edge); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke();
    ctx.fillStyle = K(metal); ctx.beginPath(); ctx.moveTo(0, -1.8); ctx.quadraticCurveTo(len * 0.55, -6, len, 2.5); ctx.quadraticCurveTo(len * 0.55, -1.2, 0, 2); ctx.closePath(); ctx.fill();
    if (!FL) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(2, -1.6); ctx.quadraticCurveTo(len * 0.55, -5.4, len - 1, 2); ctx.stroke(); }
  }
  function diamond(ctx, x, y, r, col) {
    ctx.fillStyle = K(col); ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
  }

  // ---------- Стражник
  function drawGuard(ctx, e) {
    var P = pal(e), st = e.state, mv = Math.abs(e.vx) > 8, cl = e.alt ? P.cloth2 : P.cloth, cd = e.alt ? P.cloth : P.cloth2;
    var u = st === 'windup' && e.teleMax > 0 ? 1 - e.tele / e.teleMax : 0, k = st === 'strike' ? Math.min(1, e.stateT / 0.16) : 0;
    begin(ctx, e);
    legs(ctx, -17, e, mv, 6, 4, cd, '#2a1a14', 5);
    var lean = -0.22 * ease.outQuad(u) + 0.3 * k + (mv ? 0.07 : 0) + (st === 'recover' ? 0.12 : 0);
    var bob = mv ? -Math.abs(Math.sin(e.ph)) * 1.4 : Math.sin(e.t * 2.4 + e.uid) * 0.6;
    ctx.save(); ctx.translate(0, -17 + bob); ctx.rotate(lean);
    // набедренник и туловище
    ctx.fillStyle = K(cd); ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.lineTo(10, 10); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(P.trim); ctx.fillRect(-10, 8, 20, 2);
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-9, -20); ctx.lineTo(9, -20); ctx.lineTo(8, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(P.metal2); ctx.fillRect(-6.5, -19, 13, 12); ctx.fillStyle = K(P.metal); ctx.fillRect(-6.5, -19, 13, 4);
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1; ctx.strokeRect(-6.5, -19, 13, 12);
    diamond(ctx, 0, -12.5, 3.4, P.trim);
    ctx.fillStyle = K(P.trim); ctx.fillRect(-9, -5, 18, 3);
    // задняя рука
    ctx.strokeStyle = K(cd); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-5, -18); ctx.lineTo(-9 + (st === 'windup' ? 3 : 0), -9 + Math.sin(e.t * 2.4) * 0.8); ctx.stroke();
    // голова
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(1.5, -26, 5.2, 0, TAU); ctx.fill();
    ctx.fillStyle = K(P.metal2); ctx.fillRect(-6.5, -28, 5, 9);            // кольчужный назатыльник
    ctx.fillStyle = K(P.metal); ctx.beginPath(); ctx.moveTo(-7, -26); ctx.lineTo(1, -41); ctx.lineTo(8, -26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(P.trim); ctx.fillRect(-7, -29, 15.5, 2.4);
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1, -41); ctx.lineTo(1, -46); ctx.stroke();
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(1, -45); ctx.quadraticCurveTo(-6 + Math.sin(e.t * 5) * 2, -45, -9 + Math.sin(e.t * 5 + 1) * 2, -37); ctx.lineTo(-6, -38); ctx.quadraticCurveTo(-3, -43, 1, -43); ctx.fill();
    if (!FL) { ctx.fillStyle = st === 'windup' || st === 'strike' ? '#ff6a4a' : '#f3ead0'; ctx.fillRect(4, -27.5, 3, 1.8); ctx.fillStyle = P.dark; ctx.fillRect(3, -24, 5, 1.4); }
    // сабля
    var a;
    if (st === 'windup') a = lerp(-0.5, -2.55, ease.outQuad(u));
    else if (st === 'strike') a = lerp(-2.55, 0.95, ease.outQuad(k));
    else if (st === 'recover') a = lerp(0.95, -0.35, Math.min(1, e.stateT / 0.5));
    else a = -0.38 + Math.sin(e.t * 2.1) * 0.05 + (mv ? Math.sin(e.ph * 2) * 0.12 : 0);
    var hx = 5 + Math.cos(a) * 9, hy = -18 + Math.sin(a) * 9;
    ctx.strokeStyle = K(cl); ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(5, -18); ctx.lineTo(hx, hy); ctx.stroke();
    if (st === 'strike' && !FL) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * (1 - k); ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(5, -18, 30, -2.4, a, false); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a); scimitar(ctx, 27, P.metal, P.trim); ctx.restore();
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(hx, hy, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
    stars(ctx, e, e.y - 12); bang(ctx, e, e.y - 14); teleGlow(ctx, e); hpBar(ctx, e);
  }

  // ---------- Лучник
  function drawArcher(ctx, e) {
    var P = pal(e), st = e.state, mv = Math.abs(e.vx) > 8, cl = e.alt ? P.cloth2 : P.cloth, cd = e.alt ? P.cloth : P.cloth2;
    var aim = st === 'aim' ? (e.teleMax > 0 ? 1 - e.tele / e.teleMax : 1) : 0;
    var pull = st === 'aim' ? ease.outQuad(Math.min(1, aim * 1.4)) : (st === 'shoot' ? 0 : 0);
    var aimed = st === 'aim' || st === 'shoot' || st === 'chase' || st === 'aware';
    begin(ctx, e);
    legs(ctx, -16, e, mv, 5, 3.5, cd, '#2a1a14', 4);
    var bob = mv ? -Math.abs(Math.sin(e.ph)) * 1.2 : Math.sin(e.t * 2.6 + e.uid) * 0.6;
    ctx.save(); ctx.translate(0, -16 + bob); ctx.rotate(st === 'aim' ? -0.06 : (mv ? 0.05 : 0));
    // колчан
    ctx.save(); ctx.translate(-7, -16); ctx.rotate(-0.35);
    ctx.fillStyle = K(P.cloth2); ctx.fillRect(-3, -2, 6, 16); ctx.fillStyle = K(P.trim); ctx.fillRect(-3, 3, 6, 1.5);
    ctx.strokeStyle = K(P.metal); ctx.lineWidth = 1; for (var q = -1; q <= 1; q++) { ctx.beginPath(); ctx.moveTo(q * 1.8, -2); ctx.lineTo(q * 1.8, -9); ctx.stroke(); }
    ctx.fillStyle = K(cl); for (q = -1; q <= 1; q++) ctx.fillRect(q * 1.8 - 1, -9, 2, 3);
    ctx.restore();
    // халат
    ctx.fillStyle = K(cd); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(8, 11); ctx.lineTo(-8, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-6, 3); ctx.lineTo(-7, -19); ctx.lineTo(7, -19); ctx.lineTo(6, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(P.trim); ctx.fillRect(-7, -4, 14, 2.4); ctx.fillRect(-1, -19, 2, 15);
    diamond(ctx, 3.5, -12, 2.2, P.trim);
    // голова: тюрбан
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(2, -24, 4.6, 0, TAU); ctx.fill();
    var sway = Math.sin(e.t * 4) * 1.5;
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-5, -28); ctx.quadraticCurveTo(-12 + sway, -26, -13 + sway, -17); ctx.lineTo(-9, -22); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(1, -30, 7.5, 6.2, 0, 0, TAU); ctx.fill();
    if (!FL) { ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(1, -30, 5.5, 3.5, 5.6); ctx.moveTo(-5, -28); ctx.quadraticCurveTo(1, -24.5, 7, -29); ctx.stroke(); }
    ctx.fillStyle = K(P.trim); ctx.fillRect(-6, -27, 14, 1.8);
    diamond(ctx, 4.8, -29.5, 2.2, P.glow);
    if (!FL) { ctx.fillStyle = st === 'aim' ? '#ffd84a' : '#f3ead0'; ctx.fillRect(4.5, -24.6, 2.6, 1.6); ctx.fillStyle = P.dark; ctx.fillRect(3.5, -21.5, 4, 1.4); }
    // лук
    var sy = -16, a = aimed ? e.aimA : 0.1 + Math.sin(e.t * 2) * 0.03;
    var nockX = 17 - pull * 15;
    ctx.save(); ctx.translate(5, sy); ctx.rotate(a);
    ctx.strokeStyle = K(cl); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.stroke();
    // стрела на тетиве
    if (st === 'aim' || st === 'chase' || st === 'aware') {
      var ax0 = nockX - 5 + (st === 'aim' ? 0 : 3);
      ctx.strokeStyle = K('#e8d8b0'); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax0, 0); ctx.lineTo(29, 0); ctx.stroke();
      ctx.fillStyle = K(st === 'aim' ? '#ffd84a' : '#d8d0b0'); ctx.beginPath(); ctx.moveTo(33, 0); ctx.lineTo(28, -2.4); ctx.lineTo(28, 2.4); ctx.closePath(); ctx.fill();
      if (st === 'aim') glow(ctx, 32, 0, 8 + aim * 8, TELE_Y, 0.5 + aim * 0.5);
    }
    // дуга
    ctx.strokeStyle = K('#5a3a22'); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(15, -17); ctx.quadraticCurveTo(25, 0, 15, 17); ctx.stroke();
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(19, -8); ctx.quadraticCurveTo(21.5, 0, 19, 8); ctx.stroke();
    ctx.fillStyle = K(P.trim); ctx.fillRect(14, -19, 3, 3); ctx.fillRect(14, 16, 3, 3);
    // тетива
    ctx.strokeStyle = FL ? '#fff' : 'rgba(240,235,210,0.9)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(15.5, -17); ctx.lineTo(nockX, 0); ctx.lineTo(15.5, 17); ctx.stroke();
    ctx.restore();
    // тянущая рука
    ctx.save(); ctx.translate(5, sy); ctx.rotate(a);
    ctx.strokeStyle = K(cd); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-1, 1); ctx.lineTo(nockX - 1, 1); ctx.stroke();
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(nockX - 1, 0.5, 2.3, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.restore();
    ctx.restore();
    stars(ctx, e, e.y - 12); bang(ctx, e, e.y - 14); teleGlow(ctx, e); hpBar(ctx, e);
  }
  function drawArrow(ctx, pr) {
    var x = pr.cx(), y = pr.cy(), a = Math.atan2(pr.vy, pr.vx), refl = pr.friendly;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    glow(ctx, 8, 0, 12, refl ? '#fff3b0' : TELE_Y, 0.7);
    ctx.strokeStyle = '#e8d8b0'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(6, 0); ctx.stroke();
    ctx.fillStyle = refl ? '#ffffff' : '#ffd84a'; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -3); ctx.lineTo(5, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = refl ? '#fff3b0' : '#d8402f'; ctx.beginPath(); ctx.moveTo(-16, 0); ctx.lineTo(-20, -3); ctx.lineTo(-12, 0); ctx.lineTo(-20, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- Тяжёлый
  function drawHeavy(ctx, e) {
    var P = pal(e), st = e.state, mv = Math.abs(e.vx) > 8, cl = e.alt ? P.cloth2 : P.cloth, cd = e.alt ? P.cloth : P.cloth2;
    var u = st === 'windup' && e.teleMax > 0 ? 1 - e.tele / e.teleMax : 0, k = st === 'strike' ? Math.min(1, e.stateT / 0.14) : 0;
    var slam = e.kind === 0;
    begin(ctx, e);
    legs(ctx, -19, e, mv, 5, 2.5, P.metal2, '#26202a', 7);
    var lean = (st === 'windup' && slam ? -0.2 * ease.outQuad(u) : 0) + (st === 'strike' && slam ? 0.28 * k : 0) + (st === 'recover' ? 0.1 : 0) + (st === 'strike' && !slam ? 0.12 : 0);
    var bob = mv ? -Math.abs(Math.sin(e.ph)) * 1 : Math.sin(e.t * 1.8 + e.uid) * 0.7;
    ctx.save(); ctx.translate(0, -19 + bob); ctx.rotate(lean);
    // подол
    ctx.fillStyle = K(cd); ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(11, 0); ctx.lineTo(13, 12); ctx.lineTo(-13, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(P.trim); ctx.fillRect(-13, 10, 26, 2);
    // кираса
    ctx.fillStyle = K(P.metal2); ctx.beginPath(); ctx.moveTo(-11, 3); ctx.lineTo(-13, -22); ctx.lineTo(13, -22); ctx.lineTo(11, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(cl); ctx.fillRect(-11, -9, 22, 5);
    if (!FL) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; for (var b = 0; b < 3; b++) { ctx.beginPath(); ctx.moveTo(-11, -20 + b * 4); ctx.lineTo(11, -20 + b * 4); ctx.stroke(); } }
    ctx.fillStyle = K(P.metal); ctx.fillRect(-13, -22, 26, 4);
    ctx.fillStyle = K(P.trim); ctx.fillRect(-11, -4.5, 22, 2);
    diamond(ctx, 0, -13, 4.2, P.trim); diamond(ctx, 0, -13, 2, cl);
    // наплечник
    ctx.fillStyle = K(P.metal); ctx.beginPath(); ctx.arc(-11, -22, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1.2; ctx.stroke();
    // голова: шлем с бармицей и забралом
    ctx.fillStyle = K(P.metal2); ctx.fillRect(-9, -33, 18, 12);
    ctx.fillStyle = K(P.metal); ctx.beginPath(); ctx.arc(1, -31, 9, Math.PI, 0); ctx.fill();
    ctx.fillStyle = K(P.metal); ctx.fillRect(-8.5, -31, 18, 10);
    ctx.fillStyle = K(P.trim); ctx.fillRect(-9, -32, 20, 2);
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(1, -40); ctx.lineTo(1, -47); ctx.stroke();
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(1, -46); ctx.quadraticCurveTo(-8 + Math.sin(e.t * 4) * 2, -46, -10 + Math.sin(e.t * 4 + 1) * 2, -34); ctx.lineTo(-5, -36); ctx.quadraticCurveTo(-3, -43, 1, -43); ctx.fill();
    if (!FL) {
      var eyec = st === 'windup' || st === 'strike' ? '#ff4a3a' : P.glow;
      ctx.fillStyle = P.dark; ctx.fillRect(1, -28, 10, 3.2); ctx.fillStyle = eyec; ctx.fillRect(5, -27.4, 5, 1.8);
      ctx.fillStyle = P.dark; ctx.fillRect(4, -24, 2, 4); ctx.fillRect(8, -24, 2, 4);
    }
    // булава (задняя рука)
    var a;
    if (st === 'windup') a = slam ? lerp(0.9, -2.6, ease.outQuad(u)) : 0.9;
    else if (st === 'strike') a = slam ? lerp(-2.6, 1.15, ease.inQuad(k)) : 0.9;
    else if (st === 'recover') a = 1.15;
    else a = 0.95 + Math.sin(e.t * 1.8) * 0.04;
    var hx = -2 + Math.cos(a) * 12, hy = -22 + Math.sin(a) * 12;
    ctx.strokeStyle = K(cl); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-2, -22); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
    ctx.strokeStyle = K('#5a3a22'); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(24, 0); ctx.stroke();
    ctx.fillStyle = K(P.metal); ctx.beginPath(); ctx.arc(28, 0, 7, 0, TAU); ctx.fill();
    ctx.fillStyle = K(P.metal2); for (var sp = 0; sp < 6; sp++) { var sa = sp * TAU / 6 + 0.3; ctx.beginPath(); ctx.moveTo(28 + Math.cos(sa - 0.28) * 6, Math.sin(sa - 0.28) * 6); ctx.lineTo(28 + Math.cos(sa) * 11, Math.sin(sa) * 11); ctx.lineTo(28 + Math.cos(sa + 0.28) * 6, Math.sin(sa + 0.28) * 6); ctx.fill(); }
    ctx.fillStyle = K(P.trim); ctx.beginPath(); ctx.arc(28, 0, 2.5, 0, TAU); ctx.fill();
    if (st === 'windup' && !FL) glow(ctx, 28, 0, 14 + u * 10, e.teleColor, 0.35 + u * 0.5);
    ctx.restore();
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(hx, hy, 3, 0, TAU); ctx.fill();
    ctx.restore();
    // щит (отдельно от торса, поднят/опущен)
    var su = e.shU, bash = st === 'strike' && !slam ? Math.sin(k * 3.14) : 0, bw = st === 'windup' && !slam ? -u * 6 : 0;
    var sx = lerp(2, 14 + bash * 9 + bw, su), sy = lerp(-13, -27, su), sr = lerp(11, 16, su);
    ctx.save(); ctx.translate(sx, sy + bob);
    ctx.fillStyle = K(P.trim); ctx.beginPath(); ctx.arc(0, 0, sr + 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = K(cd); ctx.beginPath(); ctx.arc(0, 0, sr - 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.arc(0, 0, sr * 0.62, 0, TAU); ctx.fill();
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1.3;
    for (var r = 0; r < 8; r++) { var ra = r * TAU / 8 + 0.2; ctx.beginPath(); ctx.moveTo(Math.cos(ra) * sr * 0.38, Math.sin(ra) * sr * 0.38); ctx.lineTo(Math.cos(ra) * sr * 0.92, Math.sin(ra) * sr * 0.92); ctx.stroke(); }
    ctx.fillStyle = K(P.metal); ctx.beginPath(); ctx.arc(0, 0, sr * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = K(P.trim); ctx.beginPath(); ctx.arc(0, 0, sr * 0.14, 0, TAU); ctx.fill();
    if (e.shFlash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + Math.min(0.9, e.shFlash * 5) + ')'; ctx.beginPath(); ctx.arc(0, 0, sr + 2, 0, TAU); ctx.fill(); glow(ctx, 0, 0, sr * 2.4, '#fff0b8', Math.min(1, e.shFlash * 5)); }
    ctx.restore();
    ctx.restore();
    // ударная волна
    if (st === 'strike' && slam && e.stateT < 0.3 && !FL) {
      var wk = e.stateT / 0.3; ctx.save(); ctx.translate(e.cx() + e.facing * 34, e.y + e.h); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (1 - wk) * 0.8;
      ctx.strokeStyle = '#ff9a5a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.facing * wk * 22, 0, 12 + wk * 40, 6 + wk * 6, 0, Math.PI, TAU); ctx.stroke(); ctx.restore();
    }
    stars(ctx, e, e.y - 14); bang(ctx, e, e.y - 18); teleGlow(ctx, e); hpBar(ctx, e);
  }

  // ---------- Маг
  function drawMage(ctx, e) {
    var al = e.alpha; if (al <= 0.01) return;
    var P = pal(e), st = e.state, cl = e.alt ? P.cloth2 : P.cloth, cd = e.alt ? P.cloth : P.cloth2;
    var cast = st === 'cast', u = cast && e.teleMax > 0 ? 1 - e.tele / e.teleMax : 0, vs = 1 - al;
    // знак на земле во время заклинания
    if (cast) {
      ctx.save(); ctx.translate(e.cx(), e.y + e.h - 1); ctx.scale(1, 0.26); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + u * 0.55; ctx.strokeStyle = e.teleColor; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 18 + u * 14, 0, TAU); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 11 + u * 8, 0, TAU); ctx.stroke();
      ctx.rotate(e.t * 2.5); ctx.beginPath(); for (var i = 0; i < 6; i++) { var a = i * TAU / 6; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (22 + u * 12), Math.sin(a) * (22 + u * 12)); } ctx.stroke();
      ctx.restore();
    }
    ctx.save(); ctx.globalAlpha = al;
    begin(ctx, e);
    ctx.scale(1 - 0.5 * vs, 1 + 0.4 * vs);
    var fl = -5 + Math.sin(e.t * 2.3 + e.uid) * 2.2;
    ctx.translate(0, fl);
    var w = Math.sin(e.t * 3) * 1.6;
    // мантия
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-7, -34); ctx.lineTo(7, -34); ctx.quadraticCurveTo(12, -18, 13, -6 + w);
    ctx.quadraticCurveTo(6, -3 - w, 0, -6 + w); ctx.quadraticCurveTo(-6, -9 - w, -13, -6 - w); ctx.quadraticCurveTo(-12, -18, -7, -34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(cd); ctx.beginPath(); ctx.moveTo(-3, -33); ctx.lineTo(3, -33); ctx.lineTo(5.5, -6); ctx.lineTo(-5.5, -6); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-3, -33); ctx.lineTo(-5.5, -6); ctx.moveTo(3, -33); ctx.lineTo(5.5, -6); ctx.stroke();
    ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-12, -7.5 + w * 0.5); ctx.quadraticCurveTo(0, -4, 12, -7.5 + w * 0.5); ctx.stroke();
    diamond(ctx, 0, -26, 2.8, P.trim); diamond(ctx, 0, -17, 2, P.trim);
    ctx.fillStyle = K(P.trim); ctx.fillRect(-8, -21, 16, 2.4);
    // задняя рука
    var bhx = -10 - u * 2, bhy = -22 - u * 12 + Math.sin(e.t * 2) * 1;
    ctx.strokeStyle = K(cl); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-6, -31); ctx.lineTo(bhx, bhy); ctx.stroke();
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(bhx, bhy, 2.4, 0, TAU); ctx.fill();
    // голова
    ctx.fillStyle = K(P.dark); ctx.beginPath(); ctx.arc(1.5, -37, 5.2, 0, TAU); ctx.fill();
    ctx.fillStyle = K('#d8d4e0'); ctx.beginPath(); ctx.moveTo(-1, -35); ctx.lineTo(7, -35); ctx.lineTo(2.5, -27); ctx.closePath(); ctx.fill();   // борода
    ctx.fillStyle = K(cl); ctx.fillRect(-6.5, -45, 16, 5.5);                    // чалма
    ctx.fillStyle = K(P.trim); ctx.fillRect(-6.5, -41.5, 16, 1.8);
    ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-6.5, -45); ctx.quadraticCurveTo(-8, -55, 1.5, -62); ctx.quadraticCurveTo(11, -55, 9.5, -45); ctx.closePath(); ctx.fill();
    if (!FL) { ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4, -46); ctx.quadraticCurveTo(-3, -54, 1.5, -59); ctx.stroke(); }
    ctx.fillStyle = K(P.trim); ctx.beginPath(); ctx.moveTo(1.5, -62); ctx.lineTo(1.5, -66); ctx.strokeStyle = K(P.trim); ctx.lineWidth = 1.5; ctx.stroke();
    diamond(ctx, 2, -43.4, 2.3, P.glow);
    var tail = Math.sin(e.t * 3.5) * 2; ctx.fillStyle = K(cl); ctx.beginPath(); ctx.moveTo(-6, -43); ctx.quadraticCurveTo(-12 + tail, -38, -13 + tail, -30); ctx.lineTo(-8, -36); ctx.closePath(); ctx.fill();
    if (!FL) { ctx.fillStyle = cast ? e.teleColor : P.glow; ctx.fillRect(3.5, -38, 2.8, 1.8); }
    // посох
    var hx = 11 + u * 3, hy = -24 - u * 8, tilt = 0.12 + u * 0.25;
    ctx.strokeStyle = K(cl); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(5, -31); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(tilt);
    ctx.strokeStyle = K('#4a3426'); ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(0, 26); ctx.lineTo(0, -26); ctx.stroke();
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -29, 5, 0.5, TAU - 0.5 + 3.14 * 0); ctx.stroke();
    ctx.fillStyle = K(P.skin); ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, TAU); ctx.fill();
    ctx.restore();
    var ox = hx + Math.sin(tilt) * -29, oy = hy - Math.cos(tilt) * 29 - 5 - Math.sin(e.t * 4) * 1.5;
    ctx.restore();
    // сфера на посохе (рисуем в мировых координатах: после restore трансформаций нет, поэтому пересчёт)
    ctx.save(); ctx.translate(e.cx(), e.y + e.h); ctx.scale(e.facing, 1); ctx.translate(0, fl);
    var oc = cast ? e.teleColor : P.glow;
    glow(ctx, ox, oy, 12 + u * 14, oc, 0.7 + u * 0.3);
    ctx.fillStyle = FL ? '#fff' : '#ffffff'; ctx.globalAlpha = al; ctx.beginPath(); ctx.arc(ox, oy, 2.8 + u * 1.5, 0, TAU); ctx.fill();
    if (cast) glow(ctx, bhx, bhy, 6 + u * 8, oc, 0.7);
    ctx.restore();
    ctx.restore();
    stars(ctx, e, e.y - 22); bang(ctx, e, e.y - 24); teleGlow(ctx, e); hpBar(ctx, e);
  }

  // ---------- Зверь
  function drawBeast(ctx, e) {
    var P = pal(e), st = e.state, mv = Math.abs(e.vx) > 8, air = st === 'leap' && !e.onGround;
    var fur = e.alt ? P.cloth2 : '#3a2a30', fur2 = e.alt ? P.cloth : P.cloth2, cr = e.cr;
    if (!e.alt && P.cloth2 === '#0d4b55') fur = '#123c44';
    var shake = st === 'windup' ? Math.sin(e.t * 60) * 0.8 * cr : 0;
    var angry = st === 'windup' || st === 'leap';
    begin(ctx, e);
    var by = -15 + cr * 6 + (mv && !air ? -Math.abs(Math.sin(e.ph * 1.0)) * 1.8 : 0) + Math.sin(e.t * 2.5 + e.uid) * 0.3;
    var rot = air ? Math.max(-0.5, Math.min(0.5, Math.atan2(e.vy, Math.abs(e.vx) + 60) * 0.7)) : (st === 'windup' ? 0.07 * cr : 0);
    ctx.translate(shake, 0);
    // ноги (дальние, потом ближние)
    var hipsF = 11, hipsB = -13, hy = by + 4;
    for (var pass = 0; pass < 2; pass++) {
      var near = pass === 1, col = near ? fur : fur2, ph = e.ph + (near ? 0 : 1.9);
      for (var l = 0; l < 2; l++) {
        var front = l === 0, hx = front ? hipsF : hipsB, a = ph + (front ? 0 : Math.PI), fx, fy, kn;
        if (air) { fx = hx + (front ? 11 : -11); fy = hy + 7 - (front ? 2 : 0); kn = front ? 1 : -2; }
        else if (st === 'windup' || st === 'creep' || st === 'aware') { fx = hx + (mv ? Math.sin(a) * 4 : 0) + (front ? 2 : -3) * cr; fy = -1 - (mv ? Math.max(0, Math.cos(a)) * 3 : 0); kn = front ? -2 : 3; }
        else { fx = hx + (mv ? Math.sin(a) * 8 : 0); fy = -1 - (mv ? Math.max(0, Math.cos(a)) * 6 : 0); kn = front ? -2 : 3; }
        if (!near && !front) { fx -= 2; }
        leg(ctx, hx + (near ? 0 : -1.5), hy, fx, fy, kn, 4.4, col);
        ctx.fillStyle = K(near ? '#2a1c22' : '#20161a'); ctx.fillRect(fx - 2, fy - 1.5, 6, 3);
        if (near && !FL) { ctx.fillStyle = P.metal; ctx.fillRect(fx + 3.2, fy - 0.6, 2, 1.2); }
      }
    }
    ctx.save(); ctx.translate(0, by); ctx.rotate(rot);
    // хвост
    var tw = Math.sin(e.t * (angry ? 14 : 4) + e.uid) * 4;
    ctx.strokeStyle = K(fur); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(-18, -3); ctx.quadraticCurveTo(-30, -12 + tw, -33 - cr * 2, -16 + tw * 0.5 - (air ? 4 : 0)); ctx.stroke();
    ctx.fillStyle = K(P.trim); ctx.beginPath(); ctx.arc(-32.5 - cr * 2, -15.5 + tw * 0.5, 2.4, 0, TAU); ctx.fill();
    // корпус
    ctx.fillStyle = K(fur); ctx.beginPath(); ctx.ellipse(-12, -1, 10, 10, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-1, -2, 17, 9.5, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -3, 10, 10.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = K(fur2); ctx.beginPath(); ctx.ellipse(-1, 4, 15, 4.5, 0, 0, TAU); ctx.fill();
    // полосы
    if (!FL) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2; for (var s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(-14 + s * 7, -10); ctx.quadraticCurveTo(-12 + s * 7, -4, -15 + s * 7, 2); ctx.stroke(); } }
    // гребень
    ctx.fillStyle = K(fur2);
    for (var m = 0; m < 6; m++) { var mx = -14 + m * 5.6, mh = 5 + (m % 2) * 2 + (angry ? 3 : 0) + cr * 2; ctx.beginPath(); ctx.moveTo(mx - 2.5, -9.5 + (m > 3 ? 1 : 0)); ctx.lineTo(mx + 0.8, -9.5 - mh); ctx.lineTo(mx + 3, -9.5 + (m > 3 ? 1 : 0)); ctx.fill(); }
    // ошейник
    ctx.strokeStyle = K(P.trim); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(14.5, -12.5); ctx.quadraticCurveTo(19, -4, 16, 5); ctx.stroke();
    diamond(ctx, 18, -3, 2.6, P.glow);
    // голова
    var jaw = angry ? 0.55 : (st === 'aware' ? 0.2 : 0), hdx = 20 + (st === 'creep' ? 2 : 0), hdy = -9 + cr * 3;
    ctx.save(); ctx.translate(hdx, hdy); ctx.rotate(st === 'creep' ? 0.18 : (angry ? -0.1 : 0));
    ctx.fillStyle = K(fur); ctx.beginPath(); ctx.ellipse(1, 0, 8.5, 7, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(4, -5); ctx.lineTo(16, -1.5); ctx.lineTo(15.5, 3); ctx.lineTo(4, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = K(fur2); ctx.beginPath(); ctx.moveTo(-3, -5); ctx.lineTo(-8, -13); ctx.lineTo(1, -7); ctx.fill();   // уши
    ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(-1.5, -14); ctx.lineTo(6, -6); ctx.fill();
    ctx.save(); ctx.translate(4, 3); ctx.rotate(jaw); ctx.fillStyle = K(fur2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(12, 0); ctx.lineTo(11, 4); ctx.lineTo(0, 4.5); ctx.closePath(); ctx.fill();
    if (!FL && jaw > 0.1) { ctx.fillStyle = '#f4efe0'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(8.5, 3.5); ctx.lineTo(10, 0); ctx.fill(); }
    ctx.restore();
    if (!FL && jaw > 0.1) { ctx.fillStyle = '#f4efe0'; ctx.beginPath(); ctx.moveTo(9, 3); ctx.lineTo(10.5, 6.2); ctx.lineTo(12, 3); ctx.fill(); ctx.beginPath(); ctx.moveTo(13.5, 2.5); ctx.lineTo(14.6, 5.2); ctx.lineTo(15.5, 2.5); ctx.fill(); }
    ctx.fillStyle = K('#1a0e12'); ctx.beginPath(); ctx.arc(15.4, -1, 1.5, 0, TAU); ctx.fill();    // нос
    var ec = angry ? '#ff4a3a' : (st === 'creep' || st === 'aware' ? '#ffd84a' : P.glow);
    if (!FL) { glow(ctx, 6, -2.2, 6, ec, 0.8); ctx.fillStyle = '#fffbe8'; ctx.fillRect(4.5, -3.4, 4, 2.4); ctx.fillStyle = '#1a0a0a'; ctx.fillRect(6.5, -3.4, 1.4, 2.4); }
    ctx.restore();
    ctx.restore();
    ctx.restore();
    // «пыль» при броске
    if (st === 'leap' && !FL) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18; ctx.fillStyle = '#ff6a4a'; ctx.beginPath(); ctx.ellipse(e.cx() - e.facing * 22, e.cy(), 22, 6, 0, 0, TAU); ctx.fill(); ctx.restore(); }
    stars(ctx, e, e.y - 14); bang(ctx, e, e.y - 18); teleGlow(ctx, e); hpBar(ctx, e);
  }

  // ---------- Огонёк
  function drawWisp(ctx, e) {
    var P = pal(e), st = e.state, hot = st === 'windup' || st === 'dive', cx = e.cx(), cy = e.cy();
    var col = hot ? '#ff6a3a' : P.glow, FLw = e.flash > 0, i;
    var pulse = 1 + Math.sin(e.t * 7 + e.uid) * 0.08 + (st === 'windup' ? (1 - e.tele / Math.max(0.01, e.teleMax)) * 0.35 : 0);
    var jx = st === 'windup' ? Math.sin(e.t * 70) * 1.3 : 0, jy = st === 'windup' ? Math.cos(e.t * 63) * 1.3 : 0;
    // линия прицеливания
    if (st === 'windup' && e.tele > 0) {
      var dx = e.aimX - cx, dy = e.aimY - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, k = 1 - e.tele / e.teleMax;
      ctx.save(); ctx.strokeStyle = TELE_R; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.25 + k * 0.5; ctx.setLineDash([5, 6]);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx / d * 150, cy + dy / d * 150); ctx.stroke(); ctx.restore();
    }
    // шлейф
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (i = 5; i >= 0; i--) {
      var tp = e.tr[i], a = (1 - i / 6) * (st === 'dive' ? 0.7 : 0.4), r = 8 - i * 1.0;
      ctx.globalAlpha = a; ctx.fillStyle = FLw ? '#fff' : col; ctx.beginPath(); ctx.arc(tp.x, tp.y, Math.max(1.5, r), 0, TAU); ctx.fill();
    }
    ctx.restore();
    glow(ctx, cx + jx, cy + jy, 26 * pulse, col, hot ? 0.9 : 0.6);
    // пламя
    ctx.save(); ctx.translate(cx + jx, cy + jy); ctx.scale(pulse, pulse);
    var lean = clamp(e.vx * 0.004, -0.5, 0.5), fl = Math.sin(e.t * 13 + e.uid) * 1.8;
    ctx.rotate(lean);
    ctx.fillStyle = FLw ? '#fff' : col; ctx.beginPath(); ctx.moveTo(-8, 3); ctx.quadraticCurveTo(-10, -7, -1 + fl, -17 - fl); ctx.quadraticCurveTo(2, -9, 3 + fl, -8); ctx.quadraticCurveTo(7, -12, 4 - fl, -17); ctx.quadraticCurveTo(10, -6, 8, 3);
    ctx.quadraticCurveTo(0, 12, -8, 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = FLw ? '#fff' : (hot ? '#ffd0a0' : '#fff6d8'); ctx.beginPath(); ctx.moveTo(-4.5, 3); ctx.quadraticCurveTo(-5, -4, 0, -9 - fl * 0.5); ctx.quadraticCurveTo(5, -4, 4.5, 3); ctx.quadraticCurveTo(0, 8, -4.5, 3); ctx.fill();
    // золотое кольцо джинна
    if (!FLw) { ctx.strokeStyle = P.trim; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(0, 6, 9, 2.6, 0, 0, TAU); ctx.stroke(); }
    // лицо
    if (!FLw) {
      var ex = e.facing * 1.5, ang = hot || st === 'aware';
      ctx.fillStyle = ang ? '#5a0a0a' : '#2a1020';
      ctx.beginPath(); ctx.ellipse(-3 + ex, -1, 1.7, ang ? 2.8 : 2.2, ang ? 0.3 : 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3.5 + ex, -1, 1.7, ang ? 2.8 : 2.2, ang ? -0.3 : 0, 0, TAU); ctx.fill();
      if (ang) { ctx.beginPath(); ctx.moveTo(-2 + ex, 3.5); ctx.quadraticCurveTo(0.5 + ex, 5.5, 3 + ex, 3.5); ctx.strokeStyle = '#5a0a0a'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    ctx.restore();
    // искры вокруг при оглушении / подготовке
    if (st === 'windup' && !FLw) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffd0a0'; for (i = 0; i < 4; i++) { var sa = e.t * 9 + i * 1.57, sr = 20 - (1 - e.tele / e.teleMax) * 8; ctx.fillRect(cx + Math.cos(sa) * sr - 1, cy + Math.sin(sa) * sr - 1, 2.4, 2.4); } ctx.restore(); }
    stars(ctx, e, e.y - 14); bang(ctx, e, e.y - 12); teleGlow(ctx, e); hpBar(ctx, e);
  }

  function drawGeneric(ctx, e) {
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#a33'; ctx.fillRect(e.x, e.y, e.w, e.h); teleGlow(ctx, e); hpBar(ctx, e);
  }
  return {
    drawGuard: drawGuard, drawArcher: drawArcher, drawArrow: drawArrow, drawHeavy: drawHeavy, drawMage: drawMage, drawBeast: drawBeast, drawWisp: drawWisp,
    drawGeneric: drawGeneric, teleGlow: teleGlow, hpBar: hpBar, pal: pal, glow: glow, TELE_Y: TELE_Y, TELE_R: TELE_R
  };
})();

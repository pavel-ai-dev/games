'use strict';
// Герой: физика, бой, способности.
var P = {
  W: 18, H: 38, RUN: 250, JUMP: 690, G_UP: 1800, G_DOWN: 2700, FALL_MAX: 860,
  COYOTE: 0.1, JBUF: 0.12, DASH_T: 0.18, DASH_V: 790, DASH_CD: 0.45,
  ATK_DUR: [0.2, 0.2, 0.34], ATK_ACT: [[0.05, 0.13], [0.05, 0.13], [0.09, 0.2]], ATK_DMG: [1, 1, 2],
  PARRY_T: 0.42, PARRY_PERFECT: 0.2, PARRY_CD: 0.3
};

function Player(game, x, y) {
  this.g = game;
  this.w = P.W; this.h = P.H;
  this.x = x - this.w / 2; this.y = y - this.h;
  this.vx = 0; this.vy = 0; this.facing = 1;
  this.maxHp = 5; this.hp = 5; this.energy = 0; this.maxEnergy = 3;
  this.shards = 0;
  this.ab = { dash: false, djump: false, slow: false, rewind: false, wall: false, chakram: false, smash: false, hook: false };
  this.state = 'idle'; this.animT = 0; this.stateT = 0;
  this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.jumpsLeft = 0; this.airDash = false;
  this.dashT = 0; this.dashCd = 0; this.dashDir = 1; this.dashExtra = 0;
  this.atk = null; this.atkBuf = 0; this.comboT = 0; this.combo = 0;
  this.parryT = 0; this.parryCd = 0; this.parryFlash = 0;
  this.invuln = 0; this.hurtT = 0; this.lockT = 0; this.dropT = 0;
  this.glideT = 0; this.canCutJump = false; this.wallDir = 0; this.wallJumpT = 0;
  this.smashing = false; this.smashHitT = 0;
  this.hookT = 0; this.hookAnchor = null; this.hanging = false; this.hooking = false; this.hookCd = 0;
  this.chakram = null;
  this.dead = false; this.deadT = 0;
  this.lastSafe = { x: this.x, y: this.y }; this.safeT = 0;
  this.hist = []; this.histT = 0; this.rewinding = 0; this.rewindPath = null;
  this.slowT = 0; this.trail = []; this.squash = 0; this.hurtFlash = 0;
  this.cape = []; for (var i = 0; i < 7; i++) this.cape.push({ x: this.x, y: this.y });
}
Player.prototype.cx = function () { return this.x + this.w / 2; };
Player.prototype.cy = function () { return this.y + this.h / 2; };

Player.prototype.setState = function (s) { if (this.state !== s) { this.state = s; this.stateT = 0; } };

Player.prototype.update = function (dt) {
  var g = this.g, L = g.level, I = Input;
  this.animT += dt; this.stateT += dt;
  this.coyote -= dt; this.jumpBuf -= dt; this.dashCd -= dt; this.parryCd -= dt; this.invuln -= dt;
  this.hurtT -= dt; this.lockT -= dt; this.dropT -= dt; this.atkBuf -= dt; this.comboT -= dt;
  this.hookCd -= dt; this.wallJumpT -= dt; this.squash = approach(this.squash, 0, dt * 5); this.hurtFlash -= dt;
  this.parryFlash -= dt;
  if (this.dead) { this.deadT += dt; return; }

  if (this.rewinding > 0) { this.updateRewind(dt); return; }

  // история для перемотки (каждые 1/30 с, 3 секунды)
  this.histT += dt;
  if (this.histT >= 1 / 30) {
    this.histT = 0;
    this.hist.push({ x: this.x, y: this.y, hp: this.hp, f: this.facing });
    if (this.hist.length > 90) this.hist.shift();
  }

  var ax = this.lockT > 0 || this.hurtT > 0 ? 0 : I.axisX, ay = I.axisY;
  var wasGrounded = this.grounded;
  this.grounded = L.groundBelow(this, { drop: this.dropT > 0 });
  if (this.grounded) {
    this.coyote = P.COYOTE; this.jumpsLeft = this.ab.djump ? 1 : 0; this.airDash = false; this.glideT = 0;
    if (!wasGrounded && this.vy >= 0) { this.squash = 0.18; g.fx.dust(this.cx(), this.y + this.h, 5, 1); }
    this.safeT -= dt;
    if (this.safeT <= 0 && !L.hazardHit({ x: this.x - 20, y: this.y, w: this.w + 40, h: this.h })) { this.lastSafe = { x: this.x, y: this.y }; this.safeT = 0.25; }
  }
  if (I.hit.jump) this.jumpBuf = P.JBUF;
  if (I.hit.attack) this.atkBuf = 0.16;

  // ---- особые состояния
  if (this.hurtT > 0) { this.physics(dt, 0, false); this.setState('hurt'); return; }
  if (this.hooking) { this.updateHook(dt); return; }
  if (this.dashT > 0) { this.updateDash(dt); return; }

  // ---- парирование
  if (I.hit.parry && this.parryCd <= 0 && this.parryT <= 0 && !this.atk) { this.parryT = P.PARRY_T; this.parryCd = P.PARRY_CD + P.PARRY_T; }
  if (this.parryT > 0) this.parryT -= dt;

  // ---- рывок
  if (I.hit.dash && this.ab.dash && this.dashCd <= 0 && (this.grounded || !this.airDash) && !this.atkLocked()) {
    this.startDash(ax);
    this.updateDash(dt);
    return;
  }

  // ---- атака
  this.updateAttack(dt, ax, ay);

  // ---- способности
  this.updateAbilities(dt, ax, ay);

  // ---- горизонталь
  var target = ax * P.RUN;
  if (this.atk && this.grounded) target *= 0.25;
  if (this.parryT > 0 && this.grounded) target *= 0.2;
  var acc = this.grounded ? (ax ? 2800 : 3200) : 1750;
  if (this.wallJumpT > 0) acc = 500;
  this.vx = approach(this.vx, target, acc * dt);
  if (ax && !this.atk && this.parryT <= 0 && this.wallJumpT <= 0) this.facing = ax;

  // ---- прыжок
  var sliding = this.wallSlideCheck(ax);
  if (this.jumpBuf > 0) {
    if (ay > 0.5 && this.grounded && L.get(Math.floor(this.cx() / T), Math.floor((this.y + this.h + 2) / T)) === TILE.ONEWAY) {
      this.dropT = 0.22; this.jumpBuf = 0; this.vy = 60;
    } else if (this.coyote > 0) {
      this.vy = -P.JUMP; this.coyote = 0; this.jumpBuf = 0; this.canCutJump = true; this.squash = -0.2;
      g.fx.dust(this.cx(), this.y + this.h, 6, 1);
    } else if (sliding) {
      this.vy = -P.JUMP * 0.95; this.vx = -this.wallDir * 300; this.facing = -this.wallDir; this.jumpBuf = 0;
      this.wallJumpT = 0.18; this.canCutJump = true; this.jumpsLeft = this.ab.djump ? 1 : this.jumpsLeft;
      g.fx.burst(this.cx() + this.wallDir * 9, this.cy(), 6, '#e9d8a6', 90);
    } else if (!this.grounded && this.jumpsLeft > 0 && this.ab.djump) {
      this.vy = -P.JUMP * 0.9; this.jumpsLeft--; this.jumpBuf = 0; this.canCutJump = false; this.glideT = 0;
      g.fx.ring(this.cx(), this.y + this.h - 4, '#ffe9a8');
    }
  }
  if (I.rel.jump && this.canCutJump && this.vy < -220) { this.vy *= 0.5; this.canCutJump = false; }
  if (this.vy >= 0) this.canCutJump = false;

  // ---- гравитация
  var grav = this.vy < 0 ? P.G_UP : P.G_DOWN;
  if (this.smashing) grav = 0;
  this.vy = Math.min(this.vy + grav * dt, P.FALL_MAX);
  if (sliding && this.vy > 70 && !this.smashing) this.vy = 70;
  if (!this.grounded && this.ab.djump && I.down.jump && this.vy > 90 && this.jumpsLeft === 0 && this.glideT < 1.4 && !sliding) {
    this.vy = Math.min(this.vy, 90); this.glideT += dt; this.gliding = true;
  } else this.gliding = false;
  if (this.smashing) this.vy = 900;

  this.physics(dt, ax, sliding);
};

Player.prototype.atkLocked = function () { return false; };

Player.prototype.physics = function (dt, ax, sliding) {
  var L = this.g.level;
  var opts = { drop: this.dropT > 0, phase: this.dashT > 0 && this.ab.dash };
  var dx = this.vx * dt, dy = this.vy * dt;
  L.move(this, dx, 0, opts);
  if (this.hitL || this.hitR) { if (!(this.dashT > 0)) this.vx = 0; }
  var landed = L.move(this, 0, dy, opts);
  if (this.smashing && (landed || this.vy === 0)) this.endSmash(true);
  // падение в пропасть и шипы
  if (this.y > L.h * T + 160) this.hazard(true);
  else if (L.hazardHit(this) && this.invuln <= 0 && !(this.dashT > 0)) { if (this.smashing) this.smashContact(); else this.hazard(false); }
  L.markExplored(this.cx(), this.cy());
  // анимационное состояние
  if (this.hurtT > 0) this.setState('hurt');
  else if (this.smashing) this.setState('smash');
  else if (this.atk) this.setState('attack');
  else if (this.parryT > 0) this.setState('parry');
  else if (sliding) this.setState('wall');
  else if (!L.groundBelow(this, { drop: this.dropT > 0 })) this.setState(this.gliding ? 'glide' : (this.vy < 0 ? 'jump' : 'fall'));
  else this.setState(Math.abs(this.vx) > 30 ? 'run' : 'idle');
};

Player.prototype.wallSlideCheck = function (ax) {
  this.wallDir = 0;
  if (!this.ab.wall || this.grounded || this.vy < -50 || this.smashing) return false;
  var L = this.g.level;
  var dir = 0;
  if (L.wallSide(this, 1)) dir = 1; else if (L.wallSide(this, -1)) dir = -1;
  if (!dir) return false;
  if (ax !== dir && this.state !== 'wall') return false;   // липнем, когда жмём к стене
  if (ax === -dir) return false;
  this.wallDir = dir; this.facing = -dir;
  return true;
};

Player.prototype.startDash = function (ax) {
  var g = this.g;
  this.dashDir = ax ? ax : this.facing;
  this.facing = this.dashDir;
  this.dashT = P.DASH_T; this.dashCd = P.DASH_CD; this.dashExtra = 0;
  if (!this.grounded) this.airDash = true;
  this.vy = 0; this.atk = null; this.parryT = 0; this.invuln = Math.max(this.invuln, P.DASH_T + 0.06);
  g.fx.burst(this.cx(), this.cy(), 8, '#9ad1ff', 120);
  this.setState('dash'); this.trail.length = 0;
};
Player.prototype.updateDash = function (dt) {
  var L = this.g.level;
  this.dashT -= dt;
  this.vx = this.dashDir * P.DASH_V; this.vy = 0;
  this.trail.push({ x: this.x, y: this.y, f: this.facing, t: 0.25 });
  if (this.trail.length > 8) this.trail.shift();
  // не останавливаемся внутри тонкой стены
  if (this.dashT <= 0) {
    var inside = L.get(Math.floor(this.cx() / T), Math.floor(this.cy() / T)) === TILE.THIN ||
      L.get(Math.floor((this.x + 2) / T), Math.floor(this.cy() / T)) === TILE.THIN ||
      L.get(Math.floor((this.x + this.w - 2) / T), Math.floor(this.cy() / T)) === TILE.THIN;
    if (inside && this.dashExtra < 0.4) { this.dashT = 0.03; this.dashExtra += dt; }
  }
  var opts = { phase: this.ab.dash };
  L.move(this, this.vx * dt, 0, opts);
  if (this.hitL || this.hitR) { this.dashT = 0; }
  L.move(this, 0, 0, opts);
  if (L.hazardHit(this) && false) { /* неуязвим в рывке */ }
  if (this.dashT <= 0) { this.vx = this.dashDir * P.RUN * 0.9; this.setState('fall'); }
  L.markExplored(this.cx(), this.cy());
  this.setState('dash');
};

// ---------- атака
Player.prototype.updateAttack = function (dt, ax, ay) {
  var g = this.g, I = Input;
  if (this.atk) {
    var a = this.atk;
    a.t += dt;
    var act = a.act;
    if (a.t >= act[0] && a.t <= act[1]) this.strikeBox(a);
    if (a.t >= a.dur) { this.atk = null; this.comboT = 0.38; }
  }
  var canStart = !this.atk || (this.atk.t > this.atk.dur * 0.6);
  if (this.atkBuf > 0 && canStart && this.parryT <= 0 && !this.smashing) {
    // удар вниз в воздухе
    if (!this.grounded && ay > 0.5 && this.ab.smash && !this.atk) { this.startSmash(); this.atkBuf = 0; return; }
    var stage = this.atk ? Math.min(this.atk.stage + 1, 2) : (this.comboT > 0 ? (this.combo + 1) % 3 : 0);
    if (this.atk && this.atk.stage === 2) stage = 0;
    this.combo = stage;
    var dir = ay < -0.5 ? 'u' : 'f';
    this.atk = { stage: stage, t: 0, dur: P.ATK_DUR[stage], act: P.ATK_ACT[stage], dir: dir, hit: [], dmg: P.ATK_DMG[stage] };
    if (ax) this.facing = ax;
    if (this.grounded) this.vx += this.facing * (stage === 2 ? 120 : 60);
    this.atkBuf = 0; this.parryT = 0;
  }
};
Player.prototype.strikeBox = function (a) {
  var g = this.g, f = this.facing;
  var box;
  if (a.dir === 'u') box = { x: this.x - 8, y: this.y - 46, w: this.w + 16, h: 52 };
  else box = { x: f > 0 ? this.x + this.w - 4 : this.x - 50, y: this.y - 2, w: 54, h: this.h + 4 };
  a.box = box;
  g.strike(this, box, a.dmg, a, f);
};

Player.prototype.onHitLanded = function (a, target, killed) {
  var g = this.g;
  this.energy = Math.min(this.maxEnergy, this.energy + (killed ? 0.5 : 0.28));
  g.hitstop(0.045 + (a && a.stage === 2 ? 0.03 : 0));
  g.shake(a && a.stage === 2 ? 5 : 2.5);
};

// ---------- удар вниз
Player.prototype.startSmash = function () {
  this.smashing = true; this.vy = 900; this.vx *= 0.3; this.smashHitT = 0;
  this.atk = null; this.parryT = 0;
  this.g.fx.ring(this.cx(), this.cy(), '#ffb86b');
};
Player.prototype.endSmash = function (landed) {
  if (!this.smashing) return;
  this.smashing = false;
  if (landed) {
    var g = this.g, L = g.level;
    g.shake(7); g.hitstop(0.05);
    g.fx.dust(this.cx(), this.y + this.h, 14, 2);
    g.fx.ring(this.cx(), this.y + this.h, '#ffb86b');
    var tx = Math.floor(this.cx() / T), ty = Math.floor((this.y + this.h + 2) / T);
    for (var dx = -1; dx <= 1; dx++) if (L.get(tx + dx, ty) === TILE.CRACK) g.breakTile(tx + dx, ty);
    g.strike(this, { x: this.x - 50, y: this.y + this.h - 24, w: this.w + 100, h: 30 }, 2, { stage: 3, hit: [] }, this.facing);
  }
};
Player.prototype.smashContact = function () {
  // отскок от врага/шипов в падении
  if (!this.smashing) return;
  this.smashing = false; this.vy = -560; this.airDash = false; this.jumpsLeft = this.ab.djump ? 1 : 0;
  this.g.fx.burst(this.cx(), this.y + this.h, 8, '#ffb86b', 160);
};

// ---------- способности: время, перемотка, чакрам, крюк
Player.prototype.updateAbilities = function (dt, ax, ay) {
  var g = this.g, I = Input;
  if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) g.timeScale = 1; }
  // замедление времени: короткое нажатие. перемотка: удержание
  var canRewind = this.ab.rewind && this.energy >= 2 && this.hist.length > 8;
  if (this.ab.slow && I.rel.time && (I.lastHold < 0.35 || !this.ab.rewind) && this.energy >= 1 && this.slowT <= 0 && !this.skipSlow) {
    this.energy -= 1; this.slowT = 4; g.timeScale = 0.35; g.fx.ring(this.cx(), this.cy(), '#7fe7ff'); g.flash('#7fe7ff', 0.25);
  }
  this.skipSlow = false;
  if (canRewind && I.down.time && I.holdTime > 0.5) { this.startRewind(); this.skipSlow = true; I.virt.time = false; }
  if (I.rel.time && I.lastHold >= 0.5 && this.ab.rewind) this.skipSlow = true;
  // чакрам
  if (this.ab.chakram && I.hit.chakram && !this.chakram && this.parryT <= 0) {
    var dir = ay < -0.5 ? 'u' : 'f';
    this.chakram = new Chakram(g, this, this.cx(), this.cy() - 4, this.facing, dir);
    g.add(this.chakram);
  }
  // крюк
  var anchor = null;
  if (this.ab.hook && !this.grounded && this.hookCd <= 0) anchor = g.nearestAnchor(this.cx(), this.cy() - 20, 200);
  Input.hookVisible = !!anchor && this.ab.hook;
  if (anchor && I.hit.hook) { this.hookAnchor = anchor; this.hooking = true; this.hookT = 0; this.hanging = false; this.atk = null; this.vy = 0; this.vx = 0; }
};

Player.prototype.updateHook = function (dt) {
  var g = this.g, a = this.hookAnchor, L = g.level;
  if (!a) { this.hanging = false; this.hooking = false; return; }
  this.hookT += dt;
  var tx = a.x, ty = a.y + 30;
  if (!this.hanging) {
    var dx = tx - this.cx(), dy = ty - this.cy(), d = Math.sqrt(dx * dx + dy * dy);
    var sp = 720 * dt;
    if (d <= sp + 4) { this.hanging = true; this.hookT = 0; this.x = tx - this.w / 2; this.y = ty - this.h / 2; this.vx = this.vy = 0; g.fx.ring(tx, ty, '#ffe08a'); }
    else { this.x += dx / d * sp; this.y += dy / d * sp; this.facing = dx >= 0 ? 1 : -1; }
  } else {
    // висим на крюке, качаемся, прыжок отпускает с импульсом
    this.x = tx - this.w / 2 + Math.sin(this.hookT * 3.2) * 10 * Math.min(1, this.hookT * 3);
    this.y = ty - this.h / 2;
    var ax = Input.axisX; if (ax) this.facing = ax;
    if (this.jumpBuf > 0 || Input.hit.jump || this.hookT > 1.6 || Input.hit.dash) {
      this.hanging = false; this.hooking = false; this.hookCd = 0.25; this.jumpBuf = 0;
      this.vy = -P.JUMP * 1.02; this.vx = this.facing * 280; this.airDash = false; this.jumpsLeft = this.ab.djump ? 1 : 0;
      this.canCutJump = false; this.hookAnchor = null;
    }
  }
  this.setState('hook');
  L.markExplored(this.cx(), this.cy());
};

Player.prototype.startRewind = function () {
  this.energy -= 2;
  this.rewinding = 0.55; this.rewindPath = this.hist.slice(); this.hist.length = 0;
  this.rewindStart = this.rewindPath.length;
  this.g.flash('#c8a2ff', 0.5); this.g.timeScale = 1; this.slowT = 0;
};
Player.prototype.updateRewind = function (dt) {
  var p = this.rewindPath;
  this.rewinding -= dt;
  var t = 1 - Math.max(0, this.rewinding) / 0.55;
  var idx = Math.max(0, Math.floor((p.length - 1) * (1 - t)));
  var s = p[idx];
  this.x = s.x; this.y = s.y; this.vx = this.vy = 0; this.facing = s.f;
  if (this.rewinding <= 0) {
    this.hp = Math.max(this.hp, s.hp); this.invuln = 1.2; this.hist.length = 0; this.rewindPath = null;
    this.g.fx.ring(this.cx(), this.cy(), '#c8a2ff');
  }
  if (Math.random() < 0.6) this.g.fx.burst(this.cx(), this.cy(), 1, '#c8a2ff', 60);
  this.setState('fall');
};

// ---------- получение урона
// info: {dmg, x (источник по X), parryable, src}
// возвращает: 'hit' | 'parried' | 'blocked' | 'miss'
Player.prototype.takeHit = function (info) {
  if (this.dead || this.rewinding > 0) return 'miss';
  if (this.invuln > 0) return 'miss';
  var g = this.g;
  var from = info.x < this.cx() ? -1 : 1;           // откуда пришёл удар
  if (this.parryT > 0 && info.parryable !== false && this.facing === from) {
    var perfect = this.parryT > P.PARRY_T - P.PARRY_PERFECT;
    if (perfect) {
      this.parryFlash = 0.3; this.energy = Math.min(this.maxEnergy, this.energy + 1);
      this.invuln = 0.4; g.hitstop(0.12); g.shake(5); g.flash('#fff6c8', 0.18);
      g.fx.burst(this.cx() + from * 14, this.cy() - 4, 14, '#fff3b0', 260);
      g.fx.ring(this.cx() + from * 14, this.cy() - 4, '#fff3b0');
      return 'parried';
    }
    this.vx = -from * 160; g.shake(2); g.fx.burst(this.cx() + from * 14, this.cy(), 6, '#ffd27d', 140);
    this.invuln = 0.15;
    return 'blocked';
  }
  this.hp -= info.dmg; this.invuln = 1.15; this.hurtT = 0.26; this.hurtFlash = 0.3;
  this.vx = -from * 230; this.vy = -330; this.atk = null; this.parryT = 0; this.dashT = 0; this.hanging = false;
  this.smashing = false; this.wallJumpT = 0; this.hooking = false;
  g.hitstop(0.09); g.shake(8); g.flash('#ff3b3b', 0.2);
  g.fx.burst(this.cx(), this.cy(), 12, '#ff6b6b', 220);
  if (this.hp <= 0) this.die();
  return 'hit';
};
Player.prototype.hazard = function (pit) {
  var g = this.g;
  this.hp -= 1; this.g.shake(8); g.flash('#ff3b3b', 0.2);
  if (this.hp <= 0) { this.die(); return; }
  this.x = this.lastSafe.x; this.y = this.lastSafe.y; this.vx = this.vy = 0; this.invuln = 1.3; this.hurtFlash = 0.3;
  this.smashing = false; this.hanging = false; this.hooking = false; this.dashT = 0;
  g.fx.burst(this.cx(), this.cy(), 10, '#ff6b6b', 200);
};
Player.prototype.heal = function (n) { this.hp = Math.min(this.maxHp, this.hp + n); };
Player.prototype.die = function () {
  this.dead = true; this.deadT = 0; this.hp = 0; this.g.timeScale = 1; this.slowT = 0;
  this.g.fx.burst(this.cx(), this.cy(), 30, '#ff6b6b', 300);
  this.g.onPlayerDeath();
};
Player.prototype.respawn = function (x, y) {
  this.dead = false; this.hp = this.maxHp; this.x = x - this.w / 2; this.y = y - this.h; this.vx = this.vy = 0;
  this.invuln = 1.5; this.atk = null; this.parryT = 0; this.dashT = 0; this.hurtT = 0; this.hanging = false; this.hooking = false; this.smashing = false;
  this.lastSafe = { x: this.x, y: this.y }; this.hist.length = 0; this.chakram = null; this.energy = Math.min(this.energy, 1);
  this.cape.forEach(function (c) { c.x = x; c.y = y - 30; });
};

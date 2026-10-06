'use strict';
// Эффекты (частицы) и игровые объекты: снаряды, чакрам, предметы, рычаги, чекпойнты, порталы.

// ---------------- частицы
function FX(game) { this.g = game; this.p = []; this.rings = []; this.texts = []; this.slashes = []; }
FX.prototype.add = function (o) { if (this.p.length < 700) this.p.push(o); };
FX.prototype.burst = function (x, y, n, color, speed) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = rnd(0.25, 1) * speed;
    this.add({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.15, life: rnd(0.25, 0.55), max: 0.55, size: rnd(1.5, 3.2), color: color, grav: 500, drag: 2.2, glow: true });
  }
};
FX.prototype.dust = function (x, y, n, spread) {
  for (var i = 0; i < n; i++) {
    this.add({ x: x + rnd(-8, 8) * spread, y: y - 1, vx: rnd(-45, 45) * spread, vy: rnd(-40, -5), life: rnd(0.3, 0.6), max: 0.6, size: rnd(2, 4.5), color: this.g.theme.dust, grav: -20, drag: 3, glow: false, fade: true });
  }
};
FX.prototype.ring = function (x, y, color) { this.rings.push({ x: x, y: y, r: 4, life: 0.4, max: 0.4, color: color }); };
FX.prototype.slash = function (x, y, f, stage, color) { this.slashes.push({ x: x, y: y, f: f, stage: stage, life: 0.16, max: 0.16, color: color || '#fff4cf' }); };
FX.prototype.text = function (x, y, str, color) { this.texts.push({ x: x, y: y, str: str, color: color || '#fff', life: 0.9, max: 0.9 }); };
FX.prototype.mote = function (x, y, color, vy) {
  this.add({ x: x, y: y, vx: rnd(-8, 8), vy: vy === undefined ? rnd(-30, -10) : vy, life: rnd(0.8, 1.6), max: 1.6, size: rnd(1, 2.2), color: color, grav: 0, drag: 0.5, glow: true });
};
FX.prototype.update = function (dt) {
  var p = this.p;
  for (var i = p.length - 1; i >= 0; i--) {
    var q = p[i]; q.life -= dt;
    if (q.life <= 0) { p[i] = p[p.length - 1]; p.pop(); continue; }
    q.vy += q.grav * dt; var d = Math.exp(-q.drag * dt); q.vx *= d; q.vy *= d;
    q.x += q.vx * dt; q.y += q.vy * dt;
  }
  for (i = this.rings.length - 1; i >= 0; i--) { var r = this.rings[i]; r.life -= dt; r.r += 150 * dt; if (r.life <= 0) this.rings.splice(i, 1); }
  for (i = this.texts.length - 1; i >= 0; i--) { var t = this.texts[i]; t.life -= dt; t.y -= 24 * dt; if (t.life <= 0) this.texts.splice(i, 1); }
  for (i = this.slashes.length - 1; i >= 0; i--) { var s = this.slashes[i]; s.life -= dt; if (s.life <= 0) this.slashes.splice(i, 1); }
};
FX.prototype.draw = function (ctx) {
  var i, q;
  ctx.save();
  for (i = 0; i < this.p.length; i++) {
    q = this.p[i]; var a = clamp(q.life / q.max, 0, 1);
    ctx.globalAlpha = q.fade ? a * 0.55 : a;
    ctx.globalCompositeOperation = q.glow ? 'lighter' : 'source-over';
    ctx.fillStyle = q.color;
    var s = q.size * (q.fade ? (2 - a) : (0.5 + a * 0.5));
    ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < this.rings.length; i++) {
    var r = this.rings[i]; ctx.globalAlpha = clamp(r.life / r.max, 0, 1) * 0.9;
    ctx.strokeStyle = r.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, TAU); ctx.stroke();
  }
  for (i = 0; i < this.slashes.length; i++) Art.drawSlash(ctx, this.slashes[i]);
  ctx.restore();
  ctx.save();
  ctx.textAlign = 'center'; ctx.font = 'bold 12px sans-serif';
  for (i = 0; i < this.texts.length; i++) {
    var t = this.texts[i]; ctx.globalAlpha = clamp(t.life / t.max * 1.5, 0, 1);
    ctx.fillStyle = '#000'; ctx.fillText(t.str, t.x + 1, t.y + 1); ctx.fillStyle = t.color; ctx.fillText(t.str, t.x, t.y);
  }
  ctx.restore();
};

// ---------------- базовый объект
function Ent(g, x, y, w, h) { this.g = g; this.x = x; this.y = y; this.w = w || 16; this.h = h || 16; this.dead = false; this.t = 0; this.layer = 1; }
Ent.prototype.update = function (dt) { this.t += dt; };
Ent.prototype.draw = function () { };
Ent.prototype.cx = function () { return this.x + this.w / 2; };
Ent.prototype.cy = function () { return this.y + this.h / 2; };

// ---------------- снаряд врага/отражённый
// o: {dmg, color, parryable, r, life, grav, friendly, pierce}
function Projectile(g, x, y, vx, vy, o) {
  o = o || {};
  Ent.call(this, g, x - 5, y - 5, 10, 10);
  this.vx = vx; this.vy = vy; this.dmg = o.dmg || 1; this.color = o.color || '#ffcf6b'; this.parryable = o.parryable !== false;
  this.r = o.r || 5; this.life = o.life || 4; this.grav = o.grav || 0; this.friendly = !!o.friendly; this.layer = 3;
  this.w = this.h = this.r * 2; this.x = x - this.r; this.y = y - this.r; this.trailT = 0; this.kind = o.kind || 'orb';
  this.nowall = !!o.nowall;
}
Projectile.prototype = Object.create(Ent.prototype);
Projectile.prototype.update = function (dt) {
  var g = this.g, L = g.level;
  this.t += dt; this.life -= dt; if (this.life <= 0) { this.dead = true; return; }
  this.vy += this.grav * dt;
  this.x += this.vx * dt; this.y += this.vy * dt;
  this.trailT -= dt;
  if (this.trailT <= 0) { this.trailT = 0.04; g.fx.add({ x: this.cx(), y: this.cy(), vx: 0, vy: 0, life: 0.25, max: 0.25, size: this.r * 0.9, color: this.color, grav: 0, drag: 1, glow: true }); }
  if (!this.nowall && L.solid(Math.floor(this.cx() / T), Math.floor(this.cy() / T), false)) { this.hitWall(); return; }
  if (this.friendly) {
    var list = g.hittables;
    for (var i = 0; i < list.length; i++) { var h = list[i]; if (h.hurt && !h.dead && overlap(this, h.box ? h.box() : h)) { h.onHit(this.dmg * 2, this.vx >= 0 ? 1 : -1, { stage: 1, hit: [] }, g.player); this.dead = true; g.fx.burst(this.cx(), this.cy(), 8, this.color, 180); return; } }
  } else {
    var p = g.player;
    if (!p.dead && overlap(this, p)) {
      var res = p.takeHit({ dmg: this.dmg, x: this.cx() - this.vx * 0.02, parryable: this.parryable, src: this });
      if (res === 'parried') { this.friendly = true; this.vx = -this.vx * 1.4; this.vy = -this.vy * 1.4; this.color = '#fff3b0'; this.life = 3; }
      else if (res === 'hit' || res === 'blocked') { this.dead = true; g.fx.burst(this.cx(), this.cy(), 8, this.color, 160); }
    }
  }
};
Projectile.prototype.hitWall = function () { this.dead = true; this.g.fx.burst(this.cx(), this.cy(), 6, this.color, 120); };
Projectile.prototype.draw = function (ctx) { Art.drawProjectile(ctx, this); };

// ---------------- чакрам
function Chakram(g, owner, x, y, f, dir) {
  Ent.call(this, g, x - 11, y - 11, 22, 22);
  this.owner = owner; this.f = f; this.dir = dir; this.speed = 470; this.dist = 0; this.maxDist = 270; this.returning = false;
  this.vx = dir === 'u' ? 0 : f * this.speed; this.vy = dir === 'u' ? -this.speed : 0; this.hitT = {}; this.layer = 3; this.rot = 0;
}
Chakram.prototype = Object.create(Ent.prototype);
Chakram.prototype.update = function (dt) {
  var g = this.g, L = g.level, o = this.owner;
  this.t += dt; this.rot += dt * 22;
  if (!this.returning) {
    this.x += this.vx * dt; this.y += this.vy * dt; this.dist += this.speed * dt;
    if (this.dist >= this.maxDist) this.returning = true;
    if (L.solid(Math.floor(this.cx() / T), Math.floor(this.cy() / T), false)) { this.returning = true; g.fx.burst(this.cx(), this.cy(), 6, '#ffe9a8', 160); }
  } else {
    var dx = o.cx() - this.cx(), dy = o.cy() - this.cy(), d = Math.sqrt(dx * dx + dy * dy) || 1;
    var sp = 620 * dt;
    if (d < 24) { this.dead = true; o.chakram = null; return; }
    this.x += dx / d * sp; this.y += dy / d * sp;
  }
  // попадания
  var list = g.hittables;
  for (var i = 0; i < list.length; i++) {
    var h = list[i]; if (h.dead) continue;
    var bx = h.box ? h.box() : h;
    if (overlap(this, bx)) {
      var key = h.uid || (h.uid = ++Chakram.uid);
      if ((this.hitT[key] || 0) <= this.t) {
        this.hitT[key] = this.t + 0.28;
        if (h.onHit(1, this.vx >= 0 ? 1 : -1, { stage: 0, hit: [], chakram: true }, o)) { g.hitstop(0.03); g.fx.burst(this.cx(), this.cy(), 6, '#ffe9a8', 200); }
      }
    }
  }
  g.fx.add({ x: this.cx(), y: this.cy(), vx: 0, vy: 0, life: 0.2, max: 0.2, size: 4, color: '#ffe9a8', grav: 0, drag: 1, glow: true });
};
Chakram.uid = 0;
Chakram.prototype.draw = function (ctx) { Art.drawChakram(ctx, this); };

// ---------------- предметы
// type: 'shard' | 'heart' | 'orb' | 'drop'; id для уникальных
function Pickup(g, x, y, type, data) {
  Ent.call(this, g, x - 9, y - 9, 18, 18);
  this.type = type; this.data = data || {}; this.vy = 0; this.vx = 0; this.layer = 2;
  this.id = this.data.id; this.magnet = false; this.bob = Math.random() * 6; this.cx0 = x; this.cy0 = y; this.settle = type === 'shard' || type === 'drop';
  if (this.settle) { this.vx = rnd(-60, 60); this.vy = rnd(-220, -120); }
}
Pickup.prototype = Object.create(Ent.prototype);
Pickup.prototype.update = function (dt) {
  var g = this.g, p = g.player;
  this.t += dt;
  if (this.settle) {
    this.vy += 900 * dt; this.vx *= Math.exp(-2 * dt);
    g.level.move(this, this.vx * dt, 0); var gr = g.level.move(this, 0, this.vy * dt); if (gr) { this.vy = -this.vy * 0.35; if (Math.abs(this.vy) < 40) { this.vy = 0; } }
  }
  var d = dist(this.cx(), this.cy(), p.cx(), p.cy());
  if ((this.type === 'shard' || this.type === 'drop') && d < 90 && this.t > 0.35) {
    this.x += (p.cx() - this.cx()) * Math.min(1, dt * 9); this.y += (p.cy() - this.cy()) * Math.min(1, dt * 9); this.settle = false;
  }
  if (d < 22 && !p.dead) this.collect();
};
Pickup.prototype.collect = function () {
  var g = this.g, p = g.player; this.dead = true;
  if (this.type === 'shard') { p.shards++; g.fx.text(this.cx(), this.cy() - 6, '+1', '#ffe08a'); g.fx.burst(this.cx(), this.cy(), 4, '#ffe08a', 80); }
  else if (this.type === 'drop') { if (p.hp < p.maxHp) { p.heal(1); g.fx.text(this.cx(), this.cy() - 6, '♥', '#ff8a8a'); } else { p.energy = Math.min(p.maxEnergy, p.energy + 0.5); } g.fx.burst(this.cx(), this.cy(), 6, '#ff8a8a', 90); }
  else if (this.type === 'heart') { g.mark(this.id); p.maxHp++; p.hp = p.maxHp; g.toast('Сердце храбрости', 'Максимум здоровья +1'); g.fx.ring(this.cx(), this.cy(), '#ff8a8a'); g.save_(); }
  else if (this.type === 'orb') { g.mark(this.id); g.grantAbility(this.data.ab); }
};
Pickup.prototype.draw = function (ctx) { Art.drawPickup(ctx, this); };

// ---------------- чекпойнт (фонтан)
function Checkpoint(g, x, y) { Ent.call(this, g, x - 14, y - 40, 28, 40); this.active = false; this.layer = 0; this.flash = 0; }
Checkpoint.prototype = Object.create(Ent.prototype);
Checkpoint.prototype.update = function (dt) {
  var g = this.g, p = g.player; this.t += dt; this.flash -= dt;
  if (!p.dead && overlap(this, p) && !this.active) { this.activate(); }
  if (this.active && Math.random() < dt * 8) g.fx.mote(this.cx() + rnd(-8, 8), this.y + 8, '#ffcf6b');
  if (!p.dead && overlap(this, p) && (p.hp < p.maxHp) && this.healed !== p) { }
};
Checkpoint.prototype.activate = function () {
  var g = this.g, p = g.player;
  this.active = true; this.flash = 0.6;
  g.checkpoint = { zone: g.zoneIndex, x: this.cx(), y: this.y + this.h };
  p.hp = p.maxHp; p.energy = p.maxEnergy;
  g.fx.ring(this.cx(), this.cy(), '#ffe08a'); g.fx.burst(this.cx(), this.cy(), 16, '#ffe08a', 200);
  g.toast('Фонтан Часов', 'Точка возрождения сохранена'); g.save_();
  g.reviveEnemies();
};
Checkpoint.prototype.draw = function (ctx) { Art.drawCheckpoint(ctx, this); };

// ---------------- рычаг
function Lever(g, x, y, index) { Ent.call(this, g, x - 10, y - 30, 20, 30); this.index = index; this.on = false; this.layer = 0; this.uid = ++Chakram.uid; }
Lever.prototype = Object.create(Ent.prototype);
Lever.prototype.box = function () { return { x: this.x - 8, y: this.y - 6, w: this.w + 16, h: this.h + 6 }; };
Lever.prototype.onHit = function () {
  if (this.on) return false;
  this.on = true; this.g.fx.burst(this.cx(), this.cy(), 10, '#ffcf6b', 180); this.g.shake(4); this.g.hitstop(0.05);
  this.g.openDoor(this.index); this.g.mark('lever:' + this.g.zoneIndex + ':' + this.index);
  return true;
};
Lever.prototype.draw = function (ctx) { Art.drawLever(ctx, this); };

// ---------------- якорь для крюка
function Anchor(g, x, y) { Ent.call(this, g, x - 10, y - 10, 20, 20); this.layer = 0; }
Anchor.prototype = Object.create(Ent.prototype);
Anchor.prototype.draw = function (ctx) { Art.drawAnchor(ctx, this); };

// ---------------- портал между зонами
function Portal(g, x, y, dir) { Ent.call(this, g, x - 22, y - 70, 44, 70); this.dir = dir; this.layer = 0; this.cool = 0.5; }
Portal.prototype = Object.create(Ent.prototype);
Portal.prototype.update = function (dt) {
  var g = this.g, p = g.player; this.t += dt; this.cool -= dt;
  if (Math.random() < dt * 6) g.fx.mote(this.cx() + rnd(-10, 10), this.y + this.h - 4, '#9ad1ff', rnd(-40, -20));
  if (!p.dead && this.cool <= 0 && overlap(this, p) && (Input.down.up || Math.abs(p.vx) > 40) && !g.transition) g.changeZone(g.zoneIndex + this.dir, this.dir);
};
Portal.prototype.draw = function (ctx) { Art.drawPortal(ctx, this); };

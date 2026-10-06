'use strict';
// Игра: цикл, камера, мир, сохранение, интерфейс, боссы-арены, переходы между зонами.
var VIEW_H = 300;
var SAVE_KEY = 'keeper_save_v1';
var ENEMY_SYMS = 'sahfmj';

function Game(canvas) {
  this.canvas = canvas; this.ctx = canvas.getContext('2d');
  this.state = 'title'; this.time = 0; this.timeScale = 1; this.hitstopT = 0; this.shakeA = 0; this.flashC = null; this.flashT = 0; this.flashMax = 1;
  this.cam = { x: 0, y: 0, tx: 0, ty: 0, look: 0 };
  this.ents = []; this.hittables = []; this.anchors = []; this.lights = []; this.decor = [];
  this.enemies = []; this.fx = new FX(this);
  this.zoneIndex = 0; this.themeKey = 'garden'; this.theme = THEMES.garden; this.level = null; this.def = null;
  this.checkpoint = null; this.transition = null; this.toastQ = []; this.dialog = null; this.boss = null; this.bossFight = null;
  this.darkness = 0.6; this.titleT = 0; this.deathT = 0; this.mapScroll = { x: 0, y: 0 };
  this.save = this.loadSave();
  this.resize(); window.addEventListener('resize', this.resize.bind(this));
  window.addEventListener('orientationchange', this.resize.bind(this));
  this.last = performance.now(); this.acc = 0; this.step = 1 / 60; this.fps = 60; this.frames = 0; this.fpsT = 0;
  this.player = null;
  this.loadZone(this.save.zone || 0, 'start', true);
  var self = this;
  function frame(now) {
    var dt = Math.min(0.1, (now - self.last) / 1000); self.last = now; self.acc += dt;
    var n = 0;
    while (self.acc >= self.step && n < 5) { self.update(self.step); self.acc -= self.step; n++; }
    if (n === 5) self.acc = 0;
    self.render();
    self.frames++; self.fpsT += dt; if (self.fpsT >= 1) { self.fps = self.frames / self.fpsT; self.frames = 0; self.fpsT = 0; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ---------------- сохранение
Game.prototype.loadSave = function () {
  var d = { flags: {}, ab: {}, maxHp: 5, shards: 0, zone: 0, checkpoint: null, explored: {} };
  try { var s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) { d = s; d.flags = d.flags || {}; d.ab = d.ab || {}; d.explored = d.explored || {}; } } catch (e) { }
  return d;
};
Game.prototype.save_ = function () {
  var p = this.player; if (!p || this.debug) return;
  var s = this.save; s.ab = p.ab; s.maxHp = p.maxHp; s.shards = p.shards; s.zone = this.zoneIndex; s.checkpoint = this.checkpoint;
  s.explored[this.zoneIndex] = Array.prototype.slice.call(this.level.explored);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { }
};
Game.prototype.resetSave = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) { } this.save = this.loadSave(); this.checkpoint = null; this.loadZone(0, 'start', true); this.state = 'play'; };
Game.prototype.mark = function (id) { if (id) this.save.flags[id] = 1; };
Game.prototype.has = function (id) { return !!(id && this.save.flags[id]); };

// ---------------- размеры
Game.prototype.resize = function () {
  var w = window.innerWidth, h = window.innerHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.cw = w; this.ch = h; this.dpr = dpr;
  this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  this.S = this.canvas.height / VIEW_H; this.vw = this.canvas.width / this.S; this.vh = VIEW_H;
  Input.layout(w, h);
};

// ---------------- отладка: тестовый уровень (для тестов и разработки)
// opts: {theme, boss:'имя', enemies:['a','f',...], ab:['dash',...], len}
Game.prototype.debugLevel = function (opts) {
  opts = opts || {}; this.debug = true;
  var Z = new ZB(100, 34, opts.theme || 'garden', 9, 'Тест'); Z.cx = 2; Z.cy = 26;
  Z.flat(16); Z.ent('P', 4, Z.cy - 1); Z.ent('C', 9, Z.cy - 1);
  var en = opts.enemies || [];
  for (var i = 0; i < en.length; i++) Z.ent(en[i], 20 + i * 5, Z.cy - 1);
  Z.flat(en.length * 5 + 8);
  if (opts.boss) {
    var A0 = Z.cx, AW = opts.arenaW || 30;
    Z.carve(A0, Z.cy - 14, AW, 14); Z.rect(A0, Z.cy - 14, 1, 14, 'G');
    Z.arena = { x0: A0, y0: Z.cy - 14, x1: A0 + AW, y1: Z.cy }; Z.boss = opts.boss; Z.ent('B', A0 + AW - 6, Z.cy - 1);
    Z.ent('t', A0 + 5, Z.cy - 8); Z.ent('t', A0 + AW - 5, Z.cy - 8); Z.cx = A0 + AW;
  }
  Z.flat(6);
  ZONE_BUILDERS[99] = function () { return Z.build(); };
  this.save = { flags: {}, ab: {}, maxHp: 5, shards: 0, zone: 99, checkpoint: null, explored: {} }; this.checkpoint = null;
  this.player = null; this.loadZone(99, 'start', false);
  var ab = opts.ab || []; for (i = 0; i < ab.length; i++) this.player.ab[ab[i]] = true;
  if (opts.all) AB_LIST.forEach(function (a) { this.player.ab[a] = true; }, this);
  this.syncAbilities(); this.state = 'play'; this.zoneTitleT = 0; this.player.energy = 3;
  return this.player;
};

// ---------------- загрузка зоны
Game.prototype.loadZone = function (index, where, first) {
  var def = ZONE_BUILDERS[index](); this.def = def; this.zoneIndex = index;
  this.themeKey = def.theme; this.theme = THEMES[def.theme]; this.darkness = { garden: 0.42, cistern: 0.62, ruins: 0.32, tower: 0.62 }[def.theme] || 0.55;
  var L = new Level(def); this.level = L; L.onChange = function (tx, ty) { Art.invalidate(L, tx, ty); };
  if (this.save.explored[index]) { var ex = this.save.explored[index]; for (var i = 0; i < ex.length && i < L.explored.length; i++) L.explored[i] = ex[i]; }
  this.ents = []; this.anchors = []; this.lights = []; this.decor = []; this.boss = null; this.bossFight = null; this.timeScale = 1;
  this.fx = new FX(this); this.levers = []; this.doorGroups = def.doors; this.gates = def.gates; this.pendingPlayer = null;
  var start = null, portalL = null, portalR = null, leverN = 0;
  for (i = 0; i < def.ents.length; i++) {
    var e = def.ents[i], px = e.x * T + T / 2, py = (e.y + 1) * T;       // низ тайла
    switch (e.t) {
      case 'P': start = { x: px, y: py }; break;
      case 'C': this.add(new Checkpoint(this, px, py)); break;
      case '$': var sh = new Pickup(this, px, py - 10, 'shard'); sh.settle = false; sh.vy = 0; sh.vx = 0; this.add(sh); break;
      case 'H': var hid = 'heart:' + index + ':' + e.x + ',' + e.y; if (!this.has(hid)) this.add(new Pickup(this, px, py - 12, 'heart', { id: hid })); break;
      case 'A': var oid = 'orb:' + index + ':' + e.ab; if (!this.has(oid)) this.add(new Pickup(this, px, py - 14, 'orb', { id: oid, ab: e.ab })); break;
      case 'l': var lv = new Lever(this, px, py, leverN++); this.levers.push(lv); this.add(lv); break;
      case 'O': var an = new Anchor(this, px, py - 14); this.anchors.push(an); this.add(an); break;
      case 't': this.lights.push({ x: px, y: py - 18, r: 170, a: 0.85 }); this.decor.push({ x: px, y: py - 18, kind: 'torch' }); break;
      case '<': portalL = { x: px, y: py }; this.add(new Portal(this, px, py, -1)); break;
      case '>': portalR = { x: px, y: py }; this.add(new Portal(this, px, py, 1)); break;
      case 'B': this.bossSpawn = { x: px, y: py }; break;
      default:
        if (ENEMY_SYMS.indexOf(e.t) >= 0 && ENEMY_TYPES[e.t]) {
          var en = new ENEMY_TYPES[e.t](this, px, py); en.spawn = { x: px, y: py, t: e.t }; this.add(en);
        } else if (window.ZONE_ENT && ZONE_ENT[e.t]) ZONE_ENT[e.t](this, e, px, py);
    }
  }
  // двери, открытые ранее
  for (i = 0; i < def.doors.length; i++) if (this.has('lever:' + index + ':' + i)) this.setDoor(i, true);
  // ворота босса: если босс побеждён — открыты (по умолчанию уже пустые)
  var sp = start;
  if (this.checkpoint && this.checkpoint.zone === index && where !== 'portalL' && where !== 'portalR') sp = { x: this.checkpoint.x, y: this.checkpoint.y };
  else if (where === 'portalL' && portalL) sp = { x: portalL.x + 36, y: portalL.y };
  else if (where === 'portalR' && portalR) sp = { x: portalR.x - 36, y: portalR.y };
  else if (first && this.save.checkpoint && this.save.checkpoint.zone === index) { sp = { x: this.save.checkpoint.x, y: this.save.checkpoint.y }; this.checkpoint = this.save.checkpoint; }
  if (!sp) sp = start || { x: 100, y: 100 };
  var old = this.player;
  var p = new Player(this, sp.x, sp.y); this.player = p;
  if (old) { p.ab = old.ab; p.maxHp = old.maxHp; p.hp = old.hp; p.energy = old.energy; p.shards = old.shards; }
  else {
    var s = this.save; if (s.ab) for (var k in s.ab) p.ab[k] = s.ab[k]; p.maxHp = s.maxHp || 5; p.hp = p.maxHp; p.shards = s.shards || 0;
    if (first && s.checkpoint) this.checkpoint = s.checkpoint;
  }
  this.syncAbilities();
  this.cam.x = p.x - this.vw / 2; this.cam.y = p.y - this.vh * 0.6; this.clampCam(); this.cam.tx = this.cam.x; this.cam.ty = this.cam.y;
  this.zoneTitleT = 3;
};
Game.prototype.syncAbilities = function () {
  var a = this.player.ab; Input.avail.dash = a.dash; Input.avail.chakram = a.chakram; Input.avail.time = a.slow || a.rewind; Input.avail.hook = a.hook;
};
Game.prototype.changeZone = function (idx, dir) {
  if (idx < 0 || idx >= ZONE_BUILDERS.length || this.transition) return;
  var self = this;
  this.transition = { t: 0, phase: 'out', go: function () { self.loadZone(idx, dir > 0 ? 'portalL' : 'portalR'); self.save_(); } };
};

// ---------------- объекты
Game.prototype.add = function (e) { this.ents.push(e); return e; };
Game.prototype.setDoor = function (i, open) {
  var gp = this.doorGroups[i]; if (!gp) return;
  for (var k = 0; k < gp.length; k++) this.level.set(gp[k].x, gp[k].y, open ? TILE.AIR : TILE.DOOR);
};
Game.prototype.openDoor = function (i) {
  this.setDoor(i, true); var gp = this.doorGroups[i];
  if (gp && gp[0]) { this.fx.burst(gp[0].x * T + 16, gp[0].y * T + 16, 18, '#ffcf6b', 240); this.shake(6); }
};
Game.prototype.breakTile = function (tx, ty) {
  this.level.set(tx, ty, TILE.AIR);
  this.fx.burst(tx * T + 16, ty * T + 16, 16, this.theme.stoneLight, 260); this.fx.dust(tx * T + 16, ty * T + 24, 6, 2); this.shake(4);
};
Game.prototype.nearestAnchor = function (x, y, r) {
  var best = null, bd = r;
  for (var i = 0; i < this.anchors.length; i++) {
    var a = this.anchors[i], d = dist(x, y, a.cx(), a.cy());
    if (d < bd && this.level.lineClear(x, y, a.cx(), a.cy())) { bd = d; best = { x: a.cx(), y: a.cy() }; }
  }
  return best;
};
Game.prototype.hitstop = function (t) { this.hitstopT = Math.max(this.hitstopT, t); };
Game.prototype.shake = function (a) { this.shakeA = Math.max(this.shakeA, a); };
Game.prototype.flash = function (c, t) { this.flashC = c; this.flashT = t; this.flashMax = t; };
Game.prototype.toast = function (title, sub) { this.toastQ.push({ title: title, sub: sub, t: 0 }); };
Game.prototype.enemyKilled = function (e) { if (e.spawn) this.save.flags['dead:' + this.zoneIndex + ':' + e.spawn.x + ',' + e.spawn.y] = 0; };
Game.prototype.reviveEnemies = function () {
  // отдых у фонтана: враги возрождаются
  var alive = {}; for (var i = 0; i < this.ents.length; i++) if (this.ents[i].spawn && !this.ents[i].dead) alive[this.ents[i].spawn.x + ',' + this.ents[i].spawn.y] = 1;
  var def = this.def;
  for (i = 0; i < def.ents.length; i++) {
    var e = def.ents[i];
    if (ENEMY_SYMS.indexOf(e.t) >= 0 && ENEMY_TYPES[e.t]) {
      var px = e.x * T + T / 2, py = (e.y + 1) * T;
      if (!alive[px + ',' + py]) { var en = new ENEMY_TYPES[e.t](this, px, py); en.spawn = { x: px, y: py, t: e.t }; this.add(en); }
    }
  }
};
Game.prototype.grantAbility = function (ab) {
  var p = this.player; p.ab[ab] = true; this.syncAbilities();
  var info = AB_INFO[ab]; this.dialog = { title: info[0], text: info[1], ab: ab, t: 0 };
  this.state = 'dialog'; this.flash(Art.ORB_COL[ab] || '#fff', 0.6); this.save_();
};
Game.prototype.onPlayerDeath = function () { this.deathT = 0; this.state = 'dead'; };
Game.prototype.onFinalBossDefeated = function () {
  this.mark('victory'); this.victoryT = 0; this.timeScale = 0.3; var self = this;
  setTimeout(function () { self.timeScale = 1; self.state = 'victory'; self.save_(); }, 1800);
};
Game.prototype.menuRects = function () {
  var vw = this.vw, vh = this.vh, w = 200, h = 34, x = vw / 2 - w / 2, y0 = vh * 0.42;
  return [{ x: x, y: y0, w: w, h: h }, { x: x, y: y0 + 44, w: w, h: h }, { x: x, y: y0 + 88, w: w, h: h }];
};
Game.prototype.menuHit = function (ux, uy) {
  var r = this.menuRects();
  for (var i = 0; i < r.length; i++) if (ux >= r[i].x - 8 && ux <= r[i].x + r[i].w + 8 && uy >= r[i].y - 6 && uy <= r[i].y + r[i].h + 6) return i;
  return -1;
};

// удар игрока/объекта по целям (враги, рычаги)
Game.prototype.strike = function (attacker, box, dmg, info, dir) {
  var list = this.hittables, n = 0;
  for (var i = 0; i < list.length; i++) {
    var h = list[i]; if (h.dead) continue;
    var hb = h.box ? h.box() : h;
    if (overlap(box, hb)) {
      if (h.onHit(dmg, dir, info, attacker)) { n++; if (info && info.stage < 3 && attacker === this.player && !info.slashShown) { info.slashShown = true; this.fx.slash(this.player.cx() + dir * 28, this.player.cy() - 6, dir, info.stage); } }
    }
  }
  if (attacker === this.player && this.player.smashing && n > 0) this.player.smashContact();
  // удар по шипам вниз — отскок
  return n;
};

// ---------------- боссы
Game.prototype.startBoss = function () {
  var def = this.def, a = def.arena, self = this;
  var ctor = window.BOSS_TYPES && BOSS_TYPES[def.boss];
  if (!ctor) return;
  this.bossFight = { arena: { x0: a.x0 * T, y0: a.y0 * T, x1: a.x1 * T, y1: a.y1 * T }, t: 0 };
  for (var i = 0; i < this.gates.length; i++) this.level.set(this.gates[i].x, this.gates[i].y, TILE.DOOR);
  var b = new ctor(this, this.bossSpawn.x, this.bossSpawn.y, this.bossFight.arena); this.boss = b; this.add(b);
  this.shake(6); this.flash('#000', 0.4);
};
Game.prototype.endBoss = function () {
  var self = this; this.mark('boss:' + this.zoneIndex);
  for (var i = 0; i < this.gates.length; i++) this.level.set(this.gates[i].x, this.gates[i].y, TILE.AIR);
  this.bossFight = null; this.boss = null; this.save_(); this.toast('Страж повержен', 'Путь открыт');
};

// ---------------- камера
Game.prototype.clampCam = function () {
  var L = this.level, c = this.cam;
  var minX = 0, maxX = L.w * T - this.vw, minY = 0, maxY = L.h * T - this.vh;
  if (this.bossFight) { var a = this.bossFight.arena; minX = a.x0 - 8; maxX = a.x1 + 8 - this.vw; minY = a.y0 - 24; maxY = a.y1 + 40 - this.vh; if (maxX < minX) { minX = maxX = (a.x0 + a.x1) / 2 - this.vw / 2; } }
  if (maxX < minX) maxX = minX; if (maxY < minY) maxY = minY;
  c.x = clamp(c.x, minX, maxX); c.y = clamp(c.y, minY, maxY);
};

// ---------------- обновление
Game.prototype.update = function (dt) {
  Input.update(dt);
  this.time += dt; this.titleT += dt;
  if (this.transition) { this.updateTransition(dt); return; }
  var st = this.state;
  if (st === 'title') {
    if (Input.hit.attack || Input.hit.jump || Input.hit.pause || anyPointer()) { this.state = 'play'; }
    return;
  }
  if (st === 'dialog') { this.dialog.t += dt; if (this.dialog.t > 0.6 && (Input.hit.attack || Input.hit.jump || Input.hit.dash || Input.hit.parry || anyPointer(true))) { this.dialog = null; this.state = 'play'; Input.clearPointers && Input.clearPointers(); } return; }
  if (st === 'pause') {
    if (Input.hit.pause) this.state = 'play';
    if (Input.hit.map) this.state = 'map';
    var tp = Input.takeTap();
    if (tp) {
      var ux = tp.x / this.cw * this.vw, uy = tp.y / this.ch * this.vh, bi = this.menuHit(ux, uy);
      if (bi === 0) this.state = 'play';
      else if (bi === 1) this.state = 'map';
      else if (bi === 2) { if (this.confirmReset > 0) { this.confirmReset = 0; this.resetSave(); } else this.confirmReset = 3; }
    }
    if (this.confirmReset > 0) this.confirmReset -= dt;
    return;
  }
  if (st === 'victory') {
    this.victoryT += dt; this.fx.update(dt);
    if (this.victoryT > 4 && (Input.hit.attack || Input.hit.jump || Input.takeTap())) { this.state = 'title'; this.titleT = 0; }
    return;
  }
  if (st === 'map') { if (Input.hit.map || Input.hit.pause || Input.hit.jump) this.state = 'play'; return; }
  if (st === 'dead') {
    this.deathT += dt; this.fx.update(dt);
    if (this.deathT > 1.6 && (Input.hit.attack || Input.hit.jump || anyPointer() || this.deathT > 3.4)) this.respawn();
    return;
  }
  // play
  if (Input.hit.pause) { this.state = 'pause'; return; }
  if (Input.hit.map) { this.state = 'map'; return; }
  if (this.hitstopT > 0) { this.hitstopT -= dt; this.fx.update(dt * 0.1); return; }

  var wdt = dt * this.timeScale, p = this.player;
  // hittables: враги и рычаги
  var hl = this.hittables; hl.length = 0;
  for (var i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.onHit && !e.dead) hl.push(e); }
  p.update(dt);
  Art.updateCape(p, dt);
  for (i = 0; i < this.ents.length; i++) { var en = this.ents[i]; if (!en.dead) en.update(wdt); }
  for (i = this.ents.length - 1; i >= 0; i--) if (this.ents[i].dead) this.ents.splice(i, 1);
  this.fx.update(wdt);
  // арена босса
  var a = this.def.arena;
  if (a && this.def.boss && !this.bossFight && !this.has('boss:' + this.zoneIndex)) {
    var inside = p.cx() > (a.x0 + 3) * T && p.cx() < a.x1 * T && p.cy() > a.y0 * T && p.cy() < a.y1 * T;
    if (inside) this.startBoss();
  }
  if (this.boss && this.boss.dead) this.endBoss();
  // фоновые частицы
  if (Math.random() < dt * 5) this.fx.mote(this.cam.x + Math.random() * this.vw, this.cam.y + Math.random() * this.vh, this.theme.dust);
  // камера
  var c = this.cam, fx = p.facing * 48;
  c.look = smooth(c.look, fx, 3, dt);
  var tx = p.cx() + c.look - this.vw / 2, ty = p.cy() - this.vh * 0.55;
  if (!p.grounded && p.vy > 450) ty += 40;
  c.x = smooth(c.x, tx, 7, dt); c.y = smooth(c.y, ty, 5, dt);
  this.clampCam();
  this.shakeA = Math.max(0, this.shakeA - dt * 30);
  if (this.flashT > 0) this.flashT -= dt;
  if (this.zoneTitleT > 0) this.zoneTitleT -= dt;
  if (this.toastQ.length) { this.toastQ[0].t += dt; if (this.toastQ[0].t > 3.2) this.toastQ.shift(); }
  this.autosaveT = (this.autosaveT || 0) + dt; if (this.autosaveT > 20) { this.autosaveT = 0; this.save_(); }
};
function anyPointer(strict) { return !!Input.takeTap(); }

Game.prototype.respawn = function () {
  var cp = this.checkpoint;
  var idx = cp ? cp.zone : this.zoneIndex;
  var self = this;
  this.transition = { t: 0, phase: 'out', go: function () {
    if (idx !== self.zoneIndex) self.loadZone(idx, 'start');
    else { self.reviveEnemies(); self.bossReset(); }
    var p = self.player, def = self.def;
    var pos = cp && cp.zone === self.zoneIndex ? cp : null;
    if (!pos) { var s = def.ents.filter(function (e) { return e.t === 'P'; })[0]; pos = { x: s.x * T + T / 2, y: (s.y + 1) * T }; }
    p.respawn(pos.x, pos.y); self.state = 'play'; self.timeScale = 1;
    self.cam.x = p.x - self.vw / 2; self.cam.y = p.y - self.vh * 0.6; self.clampCam();
  } };
};
Game.prototype.bossReset = function () {
  if (this.bossFight) {
    for (var i = 0; i < this.gates.length; i++) this.level.set(this.gates[i].x, this.gates[i].y, TILE.AIR);
    if (this.boss) this.boss.dead = true; this.boss = null; this.bossFight = null;
  }
};
Game.prototype.updateTransition = function (dt) {
  var tr = this.transition; tr.t += dt;
  if (tr.phase === 'out' && tr.t >= 0.35) { tr.go(); tr.phase = 'in'; tr.t = 0; }
  else if (tr.phase === 'in' && tr.t >= 0.4) this.transition = null;
};

// ---------------- отрисовка
Game.prototype.render = function () {
  var ctx = this.ctx, S = this.S, cam = this.cam, p = this.player, L = this.level;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0710'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  if (this.cw < this.ch * 1.1) { this.drawRotate(); return; }
  var sx = (Math.random() - 0.5) * this.shakeA, sy = (Math.random() - 0.5) * this.shakeA;
  var cx = Math.round((cam.x + sx) * S) / S, cy = Math.round((cam.y + sy) * S) / S;
  var vw = this.vw, vh = this.vh;
  // небо (экранные координаты)
  ctx.setTransform(S, 0, 0, S, 0, 0);
  Art.drawBackground(ctx, cam, this.themeKey, this.time, vw, vh);
  Art.drawBackWall(ctx, L, cam, vw, vh, this.themeKey);
  // мир
  ctx.setTransform(S, 0, 0, S, -cx * S, -cy * S);
  var view = { x: cx, y: cy };
  Art.drawTiles(ctx, L, view, vw, vh, this.themeKey);
  for (var i = 0; i < this.decor.length; i++) { var d = this.decor[i]; if (d.kind === 'torch') Art.drawTorch(ctx, d, this.time); }
  var layers = [0, 1, 2, 3];
  for (var ly = 0; ly < layers.length; ly++) for (i = 0; i < this.ents.length; i++) { var e = this.ents[i]; if (e.layer === layers[ly] && e.draw && e.x + e.w > cx - 60 && e.x < cx + vw + 60) e.draw(ctx); }
  if (p) {
    Art.drawCape(ctx, p);
    if (p.dead) { if (this.deathT < 0.4) { ctx.globalAlpha = 1 - this.deathT / 0.4; Art.drawHero(ctx, p); ctx.globalAlpha = 1; } } else Art.drawHero(ctx, p);
    if (this.timeScale < 1) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = 'rgba(127,231,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.cx(), p.cy(), 20 + Math.sin(this.time * 6) * 3, 0, TAU); ctx.stroke(); ctx.restore(); }
  }
  this.fx.draw(ctx);
  Art.drawGlows(ctx, this);
  ctx.setTransform(S, 0, 0, S, 0, 0);
  // освещение (экранные координаты камеры)
  this.camDraw = { x: cx, y: cy };
  var saved = this.cam; this.cam = { x: cx, y: cy }; ctx.setTransform(1, 0, 0, 1, 0, 0); Art.drawLighting(ctx, this, vw * S, vh * S, S); this.cam = saved;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  this.drawPost(ctx);
  this.drawHUD(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  Input.draw(ctx, { dpr: this.dpr });
  if (this.transition) {
    var tr = this.transition, a = tr.phase === 'out' ? clamp(tr.t / 0.35, 0, 1) : 1 - clamp(tr.t / 0.4, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + a + ')'; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  if (window.__debug) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(this.fps.toFixed(0) + ' fps', 8, this.canvas.height - 8); }
};
Game.prototype.drawRotate = function () {
  var ctx = this.ctx; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#e8d8b0'; ctx.font = 'bold ' + Math.round(this.canvas.width * 0.06) + 'px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Поверни телефон', this.canvas.width / 2, this.canvas.height / 2 - 10);
  ctx.font = Math.round(this.canvas.width * 0.04) + 'px sans-serif'; ctx.fillText('(горизонтально)', this.canvas.width / 2, this.canvas.height / 2 + this.canvas.width * 0.07);
};
Game.prototype.drawPost = function (ctx) {
  var vw = this.vw, vh = this.vh;
  // виньетка
  var g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.35, vw / 2, vh / 2, vh * 0.95); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
  if (this.timeScale < 1) { ctx.fillStyle = 'rgba(40,120,160,0.16)'; ctx.fillRect(0, 0, vw, vh); }
  if (this.flashT > 0) { ctx.globalAlpha = clamp(this.flashT / this.flashMax, 0, 1) * 0.5; ctx.fillStyle = this.flashC; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = 1; }
  var p = this.player;
  if (p && p.hp === 1 && !p.dead) { var a = 0.12 + Math.sin(this.time * 6) * 0.05; var rg = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.4, vw / 2, vh / 2, vh); rg.addColorStop(0, 'rgba(255,0,0,0)'); rg.addColorStop(1, 'rgba(255,0,0,' + (a + 0.15) + ')'); ctx.fillStyle = rg; ctx.fillRect(0, 0, vw, vh); }
};
Game.prototype.drawHUD = function (ctx) {
  var p = this.player, vw = this.vw, vh = this.vh, st = this.state;
  ctx.save();
  if (st !== 'title') {
    // сердца
    for (var i = 0; i < p.maxHp; i++) {
      var x = 16 + i * 20, y = 18, full = i < p.hp;
      ctx.fillStyle = full ? '#ff5a5a' : 'rgba(40,16,24,0.7)'; ctx.strokeStyle = 'rgba(255,220,200,0.7)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.bezierCurveTo(x - 9, y - 4, x - 5, y - 10, x, y - 4); ctx.bezierCurveTo(x + 5, y - 10, x + 9, y - 4, x, y + 4); ctx.fill(); ctx.stroke();
    }
    // песчинки (энергия)
    for (i = 0; i < p.maxEnergy; i++) {
      var ex = 16 + i * 20, ey = 38, f = clamp(p.energy - i, 0, 1);
      ctx.strokeStyle = 'rgba(255,225,160,0.8)'; ctx.fillStyle = 'rgba(20,14,28,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ex - 6, ey - 8); ctx.lineTo(ex + 6, ey - 8); ctx.lineTo(ex, ey); ctx.lineTo(ex + 6, ey + 8); ctx.lineTo(ex - 6, ey + 8); ctx.lineTo(ex, ey); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (f > 0) { ctx.fillStyle = '#ffd27d'; ctx.fillRect(ex - 4 * f, ey + 8 - 6 * f, 8 * f, 6 * f); }
    }
    ctx.fillStyle = '#ffe08a'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('◆ ' + p.shards, 16, 62);
    if (this.timeScale < 1) { ctx.fillStyle = '#7fe7ff'; ctx.fillText('⌛ ' + p.slowT.toFixed(1), 70, 62); }
  }
  // название зоны
  if (this.zoneTitleT > 0 && st === 'play') {
    var za = clamp(this.zoneTitleT / 1.0, 0, 1) * clamp((3 - this.zoneTitleT) / 0.6, 0, 1);
    ctx.globalAlpha = za; ctx.textAlign = 'center'; ctx.fillStyle = '#f2e3bd'; ctx.font = 'bold 26px serif'; ctx.fillText(this.def.name, vw / 2, vh * 0.28);
    ctx.fillStyle = this.theme.trim; ctx.fillRect(vw / 2 - 70, vh * 0.28 + 10, 140, 2); ctx.globalAlpha = 1;
  }
  // полоса босса
  if (this.boss && !this.boss.dead) {
    var b = this.boss, bw = Math.min(360, vw * 0.5), bx = vw / 2 - bw / 2, by = vh - 34;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx - 2, by - 2, bw + 4, 12);
    ctx.fillStyle = '#b3262e'; ctx.fillRect(bx, by, bw * clamp(b.hp / b.maxHp, 0, 1), 8);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(bx, by, bw, 2);
    ctx.fillStyle = '#f2e3bd'; ctx.font = 'bold 12px serif'; ctx.textAlign = 'center'; ctx.fillText(b.name || 'Босс', vw / 2, by - 6);
  }
  // тост
  if (this.toastQ.length) {
    var t = this.toastQ[0], ta = clamp(Math.min(t.t / 0.3, (3.2 - t.t) / 0.4), 0, 1);
    ctx.globalAlpha = ta; ctx.fillStyle = 'rgba(10,6,18,0.78)'; ctx.fillRect(vw / 2 - 150, 24, 300, 46); ctx.strokeStyle = this.theme.trim; ctx.lineWidth = 1.5; ctx.strokeRect(vw / 2 - 150, 24, 300, 46);
    ctx.textAlign = 'center'; ctx.fillStyle = '#f6e7bd'; ctx.font = 'bold 15px serif'; ctx.fillText(t.title, vw / 2, 44); ctx.fillStyle = '#cdbf9a'; ctx.font = '12px sans-serif'; ctx.fillText(t.sub, vw / 2, 61); ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (st === 'title') this.drawTitle(ctx);
  if (st === 'pause') this.drawPause(ctx);
  if (st === 'map') this.drawMap(ctx);
  if (st === 'dialog') this.drawDialog(ctx);
  if (st === 'dead') this.drawDead(ctx);
  if (st === 'victory') this.drawVictory(ctx);
};
Game.prototype.drawTitle = function (ctx) {
  var vw = this.vw, vh = this.vh, t = this.titleT;
  ctx.fillStyle = 'rgba(8,4,14,0.55)'; ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2d99a'; ctx.font = 'bold 46px serif'; ctx.fillText('ХРАНИТЕЛЬ ЧАСОВ', vw / 2, vh * 0.38);
  ctx.fillStyle = this.theme.trim; ctx.fillRect(vw / 2 - 150, vh * 0.38 + 12, 300, 2);
  ctx.fillStyle = '#d6c6a0'; ctx.font = '15px sans-serif'; ctx.fillText('Песок времени утекает. Только хранитель может его остановить.', vw / 2, vh * 0.38 + 40);
  ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.4; ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif';
  ctx.fillText(Object.keys(this.save.flags).length || this.save.checkpoint ? 'Коснись экрана, чтобы продолжить' : 'Коснись экрана, чтобы начать', vw / 2, vh * 0.78); ctx.globalAlpha = 1;
};
Game.prototype.drawPause = function (ctx) {
  var vw = this.vw, vh = this.vh;
  ctx.fillStyle = 'rgba(8,4,14,0.7)'; ctx.fillRect(0, 0, vw, vh); ctx.textAlign = 'center';
  ctx.fillStyle = '#f2d99a'; ctx.font = 'bold 28px serif'; ctx.fillText('Пауза', vw / 2, vh * 0.3);
  var rects = this.menuRects(), labels = ['Продолжить', 'Карта', this.confirmReset > 0 ? 'Точно? Коснись ещё раз' : 'Новая игра'];
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    ctx.fillStyle = i === 2 && this.confirmReset > 0 ? 'rgba(120,30,30,0.85)' : 'rgba(30,20,50,0.85)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = this.theme.trim; ctx.lineWidth = 1.5; ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = '#f2e3bd'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(labels[i], r.x + r.w / 2, r.y + r.h / 2 + 5);
  }
  var p = this.player, ab = AB_LIST.filter(function (a) { return p.ab[a]; }).map(function (a) { return AB_INFO[a][0]; });
  ctx.fillStyle = '#b8a98a'; ctx.font = '12px sans-serif';
  wrapText(ctx, 'Способности: ' + (ab.length ? ab.join(', ') : 'пока нет'), vw / 2, vh * 0.42 + 140, Math.min(560, vw - 40), 16);
};
Game.prototype.drawDialog = function (ctx) {
  var vw = this.vw, vh = this.vh, d = this.dialog, a = clamp(d.t / 0.4, 0, 1), col = Art.ORB_COL[d.ab] || '#fff';
  ctx.fillStyle = 'rgba(6,3,12,' + 0.7 * a + ')'; ctx.fillRect(0, 0, vw, vh); ctx.globalAlpha = a; ctx.textAlign = 'center';
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; var g = ctx.createRadialGradient(vw / 2, vh * 0.34, 0, vw / 2, vh * 0.34, 120); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.5 * a; ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh); ctx.restore();
  ctx.globalAlpha = a; ctx.fillStyle = '#fff6d8'; ctx.font = 'bold 30px serif'; ctx.fillText(d.title, vw / 2, vh * 0.38);
  ctx.fillStyle = '#d9cba8'; ctx.font = '15px sans-serif'; wrapText(ctx, d.text, vw / 2, vh * 0.38 + 36, Math.min(440, vw - 60), 21);
  if (d.t > 0.6) { ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.4; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('Коснись, чтобы продолжить', vw / 2, vh * 0.86); }
  ctx.globalAlpha = 1;
};
function wrapText(ctx, text, x, y, maxW, lh) {
  var words = text.split(' '), line = '';
  for (var i = 0; i < words.length; i++) { var test = line + words[i] + ' '; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = words[i] + ' '; y += lh; } else line = test; }
  ctx.fillText(line, x, y);
}
Game.prototype.drawVictory = function (ctx) {
  var vw = this.vw, vh = this.vh, a = clamp(this.victoryT / 2, 0, 1);
  ctx.fillStyle = 'rgba(10,6,22,' + (0.85 * a) + ')'; ctx.fillRect(0, 0, vw, vh); ctx.textAlign = 'center'; ctx.globalAlpha = a;
  ctx.fillStyle = '#f6e2a0'; ctx.font = 'bold 36px serif'; ctx.fillText('Время спасено', vw / 2, vh * 0.34);
  ctx.fillStyle = '#d9cba8'; ctx.font = '16px sans-serif';
  wrapText(ctx, 'Часы вновь идут. Песок больше не утекает. Шапур, хранитель часов, исполнил свой долг.', vw / 2, vh * 0.34 + 38, Math.min(480, vw - 60), 22);
  ctx.fillStyle = '#ffe08a'; ctx.fillText('Осколков собрано: ' + this.player.shards, vw / 2, vh * 0.7);
  if (this.victoryT > 4) { ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.4; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('Коснись, чтобы вернуться на заставку', vw / 2, vh * 0.88); }
  ctx.globalAlpha = 1;
};
Game.prototype.drawDead = function (ctx) {
  var vw = this.vw, vh = this.vh, a = clamp(this.deathT / 1.2, 0, 1);
  ctx.fillStyle = 'rgba(30,0,4,' + a * 0.75 + ')'; ctx.fillRect(0, 0, vw, vh);
  ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = '#ff9a8a'; ctx.font = 'bold 34px serif'; ctx.fillText('Время остановилось', vw / 2, vh * 0.45);
  if (this.deathT > 1.6) { ctx.globalAlpha = 0.6 + Math.sin(this.time * 4) * 0.4; ctx.fillStyle = '#fff'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('Коснись, чтобы вернуться к фонтану', vw / 2, vh * 0.58); }
  ctx.globalAlpha = 1;
};
Game.prototype.drawMap = function (ctx) {
  var vw = this.vw, vh = this.vh, L = this.level, p = this.player;
  ctx.fillStyle = 'rgba(6,3,12,0.92)'; ctx.fillRect(0, 0, vw, vh);
  var cells = Math.ceil(L.w / 4), rows = Math.ceil(L.h / 4), cs = Math.min((vw - 40) / cells, (vh - 70) / rows, 12);
  var ox = vw / 2 - cells * cs / 2, oy = 46;
  ctx.fillStyle = '#f2d99a'; ctx.font = 'bold 18px serif'; ctx.textAlign = 'center'; ctx.fillText(this.def.name, vw / 2, 28);
  for (var cy = 0; cy < rows; cy++) for (var cx = 0; cx < cells; cx++) {
    if (!L.explored[cy * L.exW + cx]) continue;
    var solid = 0, tot = 0;
    for (var yy = 0; yy < 4; yy++) for (var xx = 0; xx < 4; xx++) { var t = L.get(cx * 4 + xx, cy * 4 + yy); tot++; if (t === TILE.SOLID) solid++; }
    var fill = solid / tot;
    ctx.fillStyle = fill > 0.8 ? 'rgba(40,30,60,0.9)' : 'rgba(110,90,150,' + (0.35 + (1 - fill) * 0.4) + ')'; ctx.fillRect(ox + cx * cs, oy + cy * cs, cs - 0.5, cs - 0.5);
  }
  var mx = ox + p.cx() / T / 4 * cs, my = oy + p.cy() / T / 4 * cs;
  ctx.fillStyle = '#ffd27d'; ctx.beginPath(); ctx.arc(mx, my, 3 + Math.sin(this.time * 6), 0, TAU); ctx.fill();
  for (var i = 0; i < this.ents.length; i++) {
    var e = this.ents[i]; var ex = ox + e.cx() / T / 4 * cs, ey = oy + e.cy() / T / 4 * cs;
    if (e instanceof Checkpoint) { ctx.fillStyle = '#6fd3ff'; ctx.fillRect(ex - 2, ey - 2, 4, 4); }
    else if (e instanceof Portal) { ctx.fillStyle = '#c8a2ff'; ctx.fillRect(ex - 2, ey - 3, 4, 6); }
  }
  ctx.fillStyle = '#d6c6a0'; ctx.font = '12px sans-serif'; ctx.fillText('▦ — закрыть карту', vw / 2, vh - 12);
};

// ---------------- старт
window.addEventListener('load', function () {
  var canvas = document.getElementById('c');
  window.game = new Game(canvas);
});

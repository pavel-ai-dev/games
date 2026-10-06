'use strict';
// Зоны (уровни). Строитель ZB собирает карту из сегментов; ZONES[i]() возвращает определение зоны.
//
// Карта собирается из «кусков» (chunk): ASCII-комнаты склеиваются слева направо, вертикальное смещение подбирается автоматически
// по полу на стыке (см. parseChunk/layoutZone). Символы ASCII-куска:
//   тайлы:    # стена  . воздух  = платформа  ^ шипы  T тонкая стена  x трещина  D дверь  G ворота босса (пусто, закрываются в бою)
//   сущности: P старт  C фонтан  $ осколок  H сердце  A/1/2 орб (по chunk.orbs)  l рычаг  O якорь  t факел  < > порталы
//             s a f h m j враги  B босс  k давилка (потолок→пол)  w капель (декор)
//   «~» в строке растягивает предыдущий символ до ширины куска: '#..P.~...C' (левая часть + заполнение + правая часть).
// Символы карты (внутри ZB.rows): # стена, . воздух, = проходимая снизу платформа, ^ шипы, T тонкая стена (рывок сквозь),
//   x трещина (ломается ударом вниз), D дверь (открывается рычагом), G ворота босса (пусто, закрываются в бою).
// Сущности добавляются методом ent(sym, x, y): P старт, C фонтан, $ осколок, H сердце, A орб способности (ab),
//   l рычаг, O якорь для крюка, t факел, < > порталы, s/a/f/h/m/j враги, B босс, k давилка.
var AB_LIST = ['dash', 'djump', 'slow', 'rewind', 'wall', 'chakram', 'smash', 'hook'];
var AB_INFO = {
  dash: ['Рывок-тень', 'Быстрый рывок вперёд. Неуязвим во время рывка, проходит сквозь тонкие стены.'],
  djump: ['Двойной прыжок', 'Второй прыжок в воздухе. Зажми прыжок при падении, чтобы парить.'],
  slow: ['Замедление времени', 'Короткое нажатие ⌛: время вокруг замедляется. Стоит 1 песчинку.'],
  rewind: ['Перемотка', 'Удерживай ⌛: вернуться на 3 секунды назад. Стоит 2 песчинки.'],
  wall: ['Стенолаз', 'Прижмись к стене в падении, чтобы скользить, и прыгай от неё.'],
  chakram: ['Чакрам', 'Метни ⟲: бьёт врагов, включает рычаги и возвращается.'],
  smash: ['Удар вниз', 'В воздухе вниз + удар: пробивает трещины в полу, отскок от врагов.'],
  hook: ['Крюк', 'Рядом с якорем появится ⚓: притянет тебя к нему, прыжок отпустит.']
};

function ZB(w, h, theme, seed, name) {
  this.w = w; this.h = h; this.theme = theme; this.seed = seed; this.name = name;
  this.rows = []; for (var y = 0; y < h; y++) { var r = []; for (var x = 0; x < w; x++) r.push('#'); this.rows.push(r); }
  this.ents = []; this.cx = 2; this.cy = Math.floor(h * 0.7); this.arena = null; this.boss = null; this.start = null; this.CEIL = 9;
}
ZB.prototype.put = function (x, y, ch) { if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.rows[y][x] = ch; };
ZB.prototype.rect = function (x, y, w, h, ch) { for (var j = y; j < y + h; j++) for (var i = x; i < x + w; i++) this.put(i, j, ch); };
ZB.prototype.carve = function (x, y, w, h) { this.rect(x, y, w, h, '.'); };
ZB.prototype.plat = function (x, y, len) { this.rect(x, y, len, 1, '='); };
ZB.prototype.ent = function (sym, x, y, o) { var e = { t: sym, x: x, y: y }; if (o) for (var k in o) e[k] = o[k]; this.ents.push(e); return e; };
ZB.prototype.orb = function (ab, x, y) { return this.ent('A', x, y, { ab: ab }); };
// ------ сегменты (курсор: cx — левый край, cy — строка верхнего тайла пола)
ZB.prototype.flat = function (len) {
  this.carve(this.cx, this.cy - this.CEIL, len, this.CEIL); this.cx += len; return this;
};
ZB.prototype.gap = function (len, spikes) {
  this.carve(this.cx, this.cy - this.CEIL, len, this.CEIL + 6);
  this.rect(this.cx, this.cy + 5, len, 1, spikes === false ? '#' : '^');
  this.cx += len; return this;
};
// провал с плавающими платформами (по 3 тайла)
ZB.prototype.platGap = function (len, n, dy) {
  var x0 = this.cx; this.gap(len, true);
  var step = Math.floor(len / n);
  for (var i = 0; i < n; i++) this.plat(x0 + 1 + i * step, this.cy - 1 - (dy || 0) * (i % 2), 3);
  return this;
};
ZB.prototype.stepsUp = function (n, run) {
  run = run || 3;
  for (var i = 0; i < n; i++) { this.cy -= 1; this.carve(this.cx, this.cy - this.CEIL, run, this.CEIL); this.cx += run; }
  return this;
};
ZB.prototype.stepsDown = function (n, run) {
  run = run || 3;
  for (var i = 0; i < n; i++) { this.carve(this.cx, this.cy - this.CEIL, run, this.CEIL + 1); this.cy += 1; this.cx += run; }
  return this;
};
// вертикальная шахта высотой h тайлов: зигзаг из платформ, итоговый пол выше на h
ZB.prototype.shaft = function (h, width) {
  width = width || 9; var top = this.cy - h;
  this.carve(this.cx, top - this.CEIL, width, h + this.CEIL);
  var left = true;
  for (var y = this.cy - 3; y > top; y -= 3) {
    this.plat(left ? this.cx : this.cx + width - 3, y, 3); left = !left;
  }
  this.plat(left ? this.cx : this.cx + width - 3, top, 3);
  this.cx += width; this.cy = top;
  this.carve(this.cx - 1, top - this.CEIL, 1, this.CEIL);
  return this;
};

ZB.prototype.build = function () {
  var w = this.w, h = this.h, tiles = new Uint8Array(w * h), ents = this.ents.slice(), gates = [];
  var MAP = { '#': TILE.SOLID, '.': 0, '=': TILE.ONEWAY, '^': TILE.SPIKE, 'T': TILE.THIN, 'x': TILE.CRACK, 'D': TILE.DOOR, 'G': 0 };
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var ch = this.rows[y][x];
    tiles[y * w + x] = MAP[ch] || 0;
    if (ch === 'G') gates.push({ x: x, y: y });
  }
  // рычаги нумеруются в порядке сущностей (game.js) — упорядочиваем их слева направо, как двери
  var li = [], lv = [];
  ents.forEach(function (e, i) { if (e.t === 'l') { li.push(i); lv.push(e); } });
  lv.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
  li.forEach(function (i, k) { ents[i] = lv[k]; });
  // двери: связные компоненты 'D' -> группы по порядку слева направо
  var seen = {}, groups = [];
  for (x = 0; x < w; x++) for (y = 0; y < h; y++) {
    if (this.rows[y][x] === 'D' && !seen[x + ',' + y]) {
      var st = [[x, y]], g = [];
      seen[x + ',' + y] = 1;
      while (st.length) {
        var c = st.pop(); g.push({ x: c[0], y: c[1] });
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var nx = c[0] + d[0], ny = c[1] + d[1]; if (nx >= 0 && ny >= 0 && nx < w && ny < h && this.rows[ny][nx] === 'D' && !seen[nx + ',' + ny]) { seen[nx + ',' + ny] = 1; st.push([nx, ny]); } }, this);
      }
      groups.push(g);
    }
  }
  return { w: w, h: h, tiles: tiles, ents: ents, theme: this.theme, seed: this.seed, name: this.name, arena: this.arena, boss: this.boss, doors: groups, gates: gates, rows: this.rows };
};

// ======================================================================= СБОРКА ИЗ КУСКОВ
var TILE_CH = '#.=^TxDG';
var ENT_CH = 'PC$HAl Ot<>sahfmjBkw12'.replace(' ', '');
// строка куска: «левая~правая» растягивает последний символ левой части; иначе длина обязана равняться w
function expandRow(row, w, name, ri) {
  var k = row.indexOf('~');
  if (k >= 0) {
    var left = row.slice(0, k), right = row.slice(k + 1), n = w - left.length - right.length;
    if (n < 0 || !left.length) throw new Error('кусок «' + name + '» строка ' + ri + ': слишком длинная (' + (left.length + right.length) + ' > ' + w + ')');
    return left + new Array(n + 1).join(left.charAt(left.length - 1)) + right;
  }
  if (row.length !== w) throw new Error('кусок «' + name + '» строка ' + ri + ': длина ' + row.length + ' ≠ ' + w + ' «' + row + '»');
  return row;
}
// пол на краю куска: первая твёрдая клетка после участка воздуха (потолок из # сверху пропускаем)
function edgeFloor(rows, col) {
  var seenAir = false;
  for (var r = 0; r < rows.length; r++) {
    var c = rows[r].charAt(col);
    var solid = c === '#' || c === '=' || c === 'T' || c === 'x' || c === 'D';
    if (!solid) seenAir = true; else if (seenAir) return r;
  }
  return -1;
}
// c: {n, w, r:[строки], orbs:{A:'dash'}, arena:true, in, out}
function parseChunk(c) {
  var rows = c.r.map(function (r, i) { return expandRow(r, c.w, c.n, i); });
  var p = { n: c.n, w: c.w, h: rows.length, rows: rows, orbs: c.orbs || {}, arena: !!c.arena };
  p['in'] = c['in'] !== undefined ? c['in'] : edgeFloor(rows, 0);
  p.out = c.out !== undefined ? c.out : edgeFloor(rows, c.w - 1);
  if (p['in'] < 0 || p.out < 0) throw new Error('кусок «' + c.n + '»: не найден пол на краю (задай in/out)');
  return p;
}
// куски идут слева направо; пол правого края предыдущего == пол левого края следующего
function layoutZone(theme, seed, name, chunks) {
  var P = chunks.map(parseChunk), y0 = [0], i, W = 0;
  for (i = 1; i < P.length; i++) y0[i] = y0[i - 1] + P[i - 1].out - P[i]['in'];
  var mn = Math.min.apply(null, y0), mx = 0;
  for (i = 0; i < P.length; i++) { y0[i] += 1 - mn; mx = Math.max(mx, y0[i] + P[i].h); W += P[i].w; }
  var Z = new ZB(W, mx + 2, theme, seed, name), x0 = 0;
  Z.placed = [];
  P.forEach(function (c, ci) {
    var orbSeq = 0;
    for (var r = 0; r < c.h; r++) for (var q = 0; q < c.w; q++) {
      var ch = c.rows[r].charAt(q), X = x0 + q, Y = y0[ci] + r;
      if (TILE_CH.indexOf(ch) >= 0) { Z.put(X, Y, ch); continue; }
      if (ENT_CH.indexOf(ch) < 0) throw new Error('кусок «' + c.n + '» неизвестный символ «' + ch + '» @' + q + ',' + r);
      Z.put(X, Y, '.');
      if (ch === 'A' || ch === '1' || ch === '2') {
        var ab = c.orbs[ch]; if (!ab) throw new Error('кусок «' + c.n + '»: нет орба для «' + ch + '»');
        Z.orb(ab, X, Y);
      } else if (ch === 'w') Z.ent('w', X, Y);
      else if (ch === 'k') Z.ent('k', X, Y, { ph: ((X * 7) % 5) * 0.45 });
      else Z.ent(ch, X, Y);
    }
    if (c.arena) Z.arena = { x0: x0, y0: y0[ci] + 1, x1: x0 + c.w, y1: y0[ci] + 15 };
    Z.placed.push({ n: c.n, x: x0, y: y0[ci], w: c.w, h: c.h });
    x0 += c.w;
  });
  return Z;
}
// арена босса: ворота G по краям, ровный пол, высота 14. B — точка появления босса.
function arenaRows(W, torchCols) {
  var rows = ['#~'], r, i;
  for (r = 1; r <= 14; r++) {
    var a = []; for (i = 0; i < W; i++) a.push('.'); a[0] = 'G'; a[W - 1] = 'G';
    if (r === 6) torchCols.forEach(function (c) { a[c] = 't'; });
    if (r === 14) a[W - 7] = 'B';
    rows.push(a.join(''));
  }
  rows.push('#~'); rows.push('#~');
  return rows;
}

// ======================================================================= СУЩНОСТИ ЗОН (ZONE_ENT): давилка k, капель w
var ZONE_ENT = {};
var _zoneCls = null;
function zoneClasses() {
  if (_zoneCls) return _zoneCls;
  // Давилка: висит под потолком, раз в 2.2 с падает на пол. Опасна только внизу (пересечение с героем).
  function Crusher(g, px, py, e) {
    Ent.call(this, g, px - 20, py - 32, 40, 26);
    var L = g.level, tx = Math.floor(px / T), ty = Math.floor((py - 4) / T), a = ty, b = ty;
    while (a > 0 && !L.solid(tx, a - 1, false)) a--;
    while (b < L.h - 1 && !L.solid(tx, b + 1, false)) b++;
    this.ceilY = a * T; this.floorY = (b + 1) * T; this.cxm = px; this.ph = e.ph || 0; this.f = 0; this.layer = 1; this.slammed = false;
    this.stroke = Math.max(0, this.floorY - this.ceilY - this.h);
  }
  Crusher.prototype = Object.create(Ent.prototype);
  Crusher.prototype.update = function (dt) {
    var g = this.g, p = g.player; this.t += dt;
    var u = (this.t + this.ph) % 2.2, f;
    if (u < 0.9) f = 0;
    else if (u < 1.15) f = 0.06 * ((u - 0.9) / 0.25);
    else if (u < 1.3) f = 0.06 + 0.94 * ((u - 1.15) / 0.15);
    else if (u < 1.75) f = 1;
    else f = 1 - (u - 1.75) / 0.45;
    this.f = f; this.warn = u >= 0.9 && u < 1.15;
    this.y = this.ceilY + f * this.stroke;
    if (f >= 1 && !this.slammed) {
      this.slammed = true;
      if (Math.abs(p.cx() - this.cxm) < 360) { g.shake(3); g.fx.dust(this.cxm, this.floorY, 6, 2); }
    }
    if (u < 1.3) this.slammed = false;
    if (f > 0.25 && !p.dead && overlap(this, p)) p.takeHit({ dmg: 1, x: this.cxm + (p.cx() >= this.cxm ? -1 : 1) * 0.1, parryable: false, src: this });
  };
  Crusher.prototype.draw = function (ctx) {
    var x = this.cxm, y = this.y;
    ctx.fillStyle = '#4a3f33'; ctx.fillRect(x - 5, this.ceilY, 10, Math.max(0, y - this.ceilY));
    ctx.fillStyle = '#6b5a48'; ctx.fillRect(x - 20, y, 40, this.h);
    ctx.fillStyle = '#a8946a'; ctx.fillRect(x - 20, y, 40, 4);
    ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 20, y + this.h - 6, 40, 6);
    ctx.fillStyle = this.warn && (Math.floor(this.t * 20) % 2 === 0) ? '#ff5a4a' : '#d9d2c0';
    for (var i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - 20 + i * 10, y + this.h); ctx.lineTo(x - 15 + i * 10, y + this.h + 7); ctx.lineTo(x - 10 + i * 10, y + this.h); ctx.fill(); }
    ctx.fillStyle = '#c9b88a'; ctx.fillRect(x - 3, y + 8, 6, 6);
  };
  // Капель: вода капает с потолка, чисто декор
  function Drip(g, px, py) {
    Ent.call(this, g, px - 2, py - 30, 4, 4);
    var L = g.level, tx = Math.floor(px / T), ty = Math.floor((py - 4) / T), b = ty;
    while (b < L.h - 1 && !L.solid(tx, b + 1, false) && L.get(tx, b + 1) !== TILE.ONEWAY) b++;
    this.fy = (b + 1) * T; this.px = px; this.layer = 0; this.next = Math.random() * 1.5;
  }
  Drip.prototype = Object.create(Ent.prototype);
  Drip.prototype.update = function (dt) {
    var g = this.g, p = g.player; this.t += dt; this.next -= dt;
    if (this.next > 0) return;
    this.next = 0.8 + Math.random() * 1.6;
    if (Math.abs(p.cx() - this.px) > 520) return;
    var d = Math.max(8, this.fy - this.y), life = Math.sqrt(2 * d / 600);
    g.fx.add({ x: this.px, y: this.y, vx: 0, vy: 0, life: life, max: life, size: 2.2, color: '#9ad1ff', grav: 600, drag: 0, glow: true });
  };
  Drip.prototype.draw = function () { };
  _zoneCls = { Crusher: Crusher, Drip: Drip };
  return _zoneCls;
}
ZONE_ENT.k = function (g, e, px, py) { var C = zoneClasses(); g.add(new C.Crusher(g, px, py, e)); };
ZONE_ENT.w = function (g, e, px, py) { var C = zoneClasses(); g.add(new C.Drip(g, px, py)); };

// ======================================================================= ЗОНА 1: Дворцовый сад
function buildZone1() {
  var CH = [];
  // A. Врата сада: разбег, первые препятствия (прыжок через ступень), осколки, фонтан
  CH.push({ n: 'Врата сада', w: 22, 'in': 10, r: [
    '#~',
    '#.~',
    '#.~',
    '#.~',
    '#.....t.~...t....',
    '#.~',
    '#.~',
    '#.~$......',
    '#.........$$..###.....',
    '#..P..$$$.##..###..C..',
    '#~',
    '#~'
  ] });
  // B. Первая пропасть над шипами (3 тайла) и одинокий страж — учимся бить и парировать
  CH.push({ n: 'Первый прыжок', w: 16, r: [
    '#~',
    '#~',
    '.~',
    '.~',
    '.....t.~t...',
    '.~',
    '.~',
    '....$.~',
    '...$.$.~',
    '.~s...',
    '###...#~',
    '###...#~',
    '###^^^#~',
    '#~'
  ] });
  // C. Колоннада: низ — страж между колоннами, галерея наверху (стрелки), ниша на высоте — только с двойным прыжком
  CH.push({ n: 'Колоннада', w: 30, r: [
    '#~',
    '.........##........##.........',
    '.........##........##.........',
    '.........##..$$$$..##.........',
    '.........##..====..##.........',
    '.~',
    '........t.............t.......',
    '.~',
    '....$$$$........a........a....',
    '...======...======...======...',
    '.~',
    '.~',
    '.....##.......##.......##.....',
    '.....##.......##.......##.....',
    '.....##...s...##...s...##...C.',
    '#~',
    '#~',
    '#~'
  ] });
  // D. Террасы: ступени вверх по 2 тайла, на каждой — свой противник; наверху фонтан
  CH.push({ n: 'Террасы', w: 16, r: [
    '#~',
    '.~',
    '.~',
    '.~',
    '.........f.~t..',
    '.~',
    '.~C.',
    '.~####',
    '.~s.####',
    '.~########',
    '.~a.########',
    '.~############',
    '.~s.############',
    '#~',
    '#~'
  ] });
  // E. Висячий сад: три платформы над шипами
  CH.push({ n: 'Висячий сад', w: 20, r: [
    '#~',
    '.~',
    '.~',
    '.~f.........',
    '.t.~.t.',
    '.~',
    '.........$$$........',
    '....$$$..===..$$$.a.',
    '###.===.......===###',
    '###.~###',
    '###.~###',
    '###.~###',
    '###^~^###',
    '#~'
  ] });
  // F. Беседка: шахта-зигзаг вверх на 18 тайлов; на середине в стене — тайник за тонкой стеной (нужен рывок): сердце
  CH.push({ n: 'Беседка', w: 16, r: [
    '#~',
    '####............',
    '####............',
    '####............',
    '####............',
    '####..........a.',
    '####.....===####',
    '####........####',
    '####t.......####',
    '####===.....#..t',
    '####........T...',
    '####........T.H.',
    '####.....===####',
    '####........####',
    '####........####',
    '####===.....####',
    '####...f....####',
    '####.......t####',
    '####.....===####',
    '####........####',
    '............####',
    '....===.....####',
    '............####',
    '............####',
    '#~',
    '#~'
  ] });
  // G. Святилище рывка: алтарь с орбом, страж у входа, фонтан после
  CH.push({ n: 'Святилище рывка', w: 18, orbs: { A: 'dash' }, r: [
    '#~',
    '.~',
    '.~',
    '.~',
    '.....t.~t.....',
    '........A.~',
    '.......####.......',
    '..s..########...C.',
    '#~',
    '#~'
  ] });
  // H. Бездна: пропасть в 7 тайлов — только рывком в воздухе
  CH.push({ n: 'Бездна рывка', w: 16, r: [
    '#~',
    '.~',
    '.~',
    '.~',
    '...t.~t..',
    '.......$$$.~',
    '......$...$.~',
    '.....$.....$.~.a.',
    '#####.......####',
    '#####.......####',
    '#####.......####',
    '#####.......####',
    '#####^^^^^^^####',
    '#~'
  ] });
  // I. Сад теней: ступень, провал с платформой, галерея стрелка, зверь-здоровяк, спуск к фонтану у арены
  CH.push({ n: 'Сад теней', w: 24, r: [
    '#~',
    '.~',
    '.~',
    '.~',
    '...t.~f.......',
    '..............$$.a......',
    '..............======....',
    '........s...............',
    '......####.........h....',
    '##########.==.######....',
    '##########....########C.',
    '##########....##########',
    '##########^^^^##########',
    '#~'
  ] });
  // K. Арена Стража Сада
  CH.push({ n: 'Арена Стража', w: 30, arena: true, r: arenaRows(30, [5, 24]) });
  // L. Святилище прыжка: орб двойного прыжка, уступ с сердцем (нужен двойной прыжок), портал дальше
  CH.push({ n: 'Святилище прыжка', w: 12, out: 12, orbs: { A: 'djump' }, r: [
    '#~',
    '.~#',
    '.~#',
    '.~#',
    '.......H...#',
    '.....=====.#',
    '.t.~#',
    '.~#',
    '.~#',
    '...A.......#',
    '..###......#',
    '..###....>.#',
    '#~',
    '#~'
  ] });
  var Z = layoutZone('garden', 101, 'Дворцовый сад', CH);
  Z.boss = 'guardian';
  return Z.build();
}
// ======================================================================= ЗОНА 2: Подземные цистерны
function buildZone2() {
  var CH = [];
  // 1. Шлюз: вход из портала, фонтан, спокойный старт
  CH.push({ n: 'Шлюз', w: 20, 'in': 10, r: [
    '#~',
    '#......w.~..w.....',
    '#.~',
    '#.~',
    '#...t.~t.....',
    '#.~',
    '#.~',
    '#.~',
    '#.~',
    '#..<..P.~.C..',
    '#~',
    '#~'
  ] });
  // 2. Водосток: низкий коридор, канал с шипами, перемычки-платформы, страж
  CH.push({ n: 'Водосток', w: 22, r: [
    '#~',
    '#~',
    '...w.......w..........',
    '.~',
    '.~',
    '.....t.~t..',
    '.~',
    '.~',
    '.~',
    '.......$$.$$....s.....',
    '######.==.==.#########',
    '######.~#########',
    '######.~#########',
    '######^~#########',
    '#~'
  ] });
  // 3. Колодец: спуск на 15 тайлов, зигзаг платформ (по ним же можно вернуться наверх)
  CH.push({ n: 'Колодец', w: 14, r: [
    '#~',
    '###.......####',
    '###.......####',
    '..........####',
    '.t........####',
    '..........####',
    '..........####',
    '.s........####',
    '###.......####',
    '###.......####',
    '###.......####',
    '###===....####',
    '###.......####',
    '###.......####',
    '###....===####',
    '###.......####',
    '###...f...####',
    '###===....####',
    '###.......####',
    '###...........',
    '###....===....',
    '###...........',
    '###.........C.',
    '#~',
    '#~'
  ] });
  // 4. Нижний зал: рычаг на уступе открывает первую дверь; страж, тяжёлый, стрелок
  CH.push({ n: 'Нижний зал', w: 28, r: [
    '#~',
    '#~',
    '.....w...........w......####',
    '.~####',
    '.....t.~t...####',
    '.~####',
    '.~####',
    '.~D.',
    '....l.........a...........D.',
    '...======....##...........D.',
    '.............##...........D.',
    '..........s..##.....h.....D.',
    '#~',
    '#~',
    '#~'
  ] });
  // 5. Святилище чакрама: алтарь с орбом, засада мага и стражника
  CH.push({ n: 'Святилище чакрама', w: 20, orbs: { A: 'chakram' }, r: [
    '#~',
    '.~',
    '..w.......w.........',
    '.~',
    '..t.~t..',
    '.~',
    '.~',
    '.........A.~',
    '........####........',
    '...s....####...m.C..',
    '#~',
    '#~'
  ] });
  // 6. Зал решёток: рычаги заперты в глухой камере с узкой щелью — достать только чакрамом. Люк-тайник в полу открывает сердце.
  CH.push({ n: 'Зал решёток', w: 26, r: [
    '#~',
    '#~',
    '....w.......w.........####',
    '.~####',
    '....t.~t....####',
    '............a.........####',
    '.........########.....####',
    '.........########.......D.',
    '......$$$########$$$....D.',
    '......===########===....D.',
    '.........########.......D.',
    '............l.l##..s....D.',
    '####DD#~',
    '###....#~',
    '###.H..#~',
    '#~',
    '#~'
  ] });
  // 7. Башня насосов: подъём на 18 тайлов по платформам
  CH.push({ n: 'Башня насосов', w: 16, r: [
    '#~',
    '####.w..........',
    '####............',
    '####......C...a.',
    '####.....===####',
    '####........####',
    '####t.......####',
    '####===.....####',
    '####........####',
    '####......m.####',
    '####.....===####',
    '####........####',
    '####........####',
    '####===.....####',
    '####...f....####',
    '####........####',
    '####.....===####',
    '####.......t####',
    '............####',
    '....===.....####',
    '............####',
    '............####',
    '#~',
    '#~'
  ] });
  // 8. Верхний ход: в потолке — шахта со стенами (для стенолаза): наверху сердце
  CH.push({ n: 'Шахта стенолаза', w: 22, r: [
    '#~',
    '####..w.....##########',
    '####.t......##########',
    '####.H......##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '########....##########',
    '.~',
    '..t.~',
    '...s.............j....',
    '#~',
    '#~',
    '#~'
  ] });
  // 9. Галерея сифонов: канал с шипами, тяжёлый страж, спуск к фонтану у арены
  CH.push({ n: 'Галерея сифонов', w: 22, r: [
    '#~',
    '#~',
    '.~',
    '...w.......w..........',
    '..........f.~',
    '.t.~.t.',
    '.~',
    '.~',
    '.~',
    '...a...$$.$$..h.......',
    '######.==.==####.s....',
    '######......#######.C.',
    '######......##########',
    '######^^^^^^##########',
    '#~',
    '#~'
  ] });
  // 10. Арена Змея
  CH.push({ n: 'Арена Змея', w: 34, arena: true, r: arenaRows(34, [6, 27]) });
  // 11. Награда: орб стенолаза, портал
  CH.push({ n: 'Святилище стены', w: 14, out: 12, orbs: { A: 'wall' }, r: [
    '#~',
    '.~#',
    '.~#',
    '.~#',
    '.t.~#',
    '.~#',
    '.~#',
    '.~#',
    '.~#',
    '....A........#',
    '...###.......#',
    '...###....>..#',
    '#~',
    '#~'
  ] });
  var Z = layoutZone('cistern', 202, 'Подземные цистерны', CH);
  Z.boss = 'serpent';
  return Z.build();
}
function buildZoneStub(theme, seed, name, ab1, ab2) {
  var Z = new ZB(140, 44, theme, seed, name);
  Z.cx = 2; Z.cy = 30;
  Z.flat(14); Z.ent('<', 4, Z.cy - 1); Z.ent('P', 8, Z.cy - 1); Z.ent('C', 12, Z.cy - 1);
  Z.gap(3, true); Z.flat(12); Z.ent('s', Z.cx - 6, Z.cy - 1); Z.stepsUp(2, 3); Z.flat(16);
  Z.ent('s', Z.cx - 8, Z.cy - 1); Z.orb(ab1, Z.cx - 3, Z.cy - 2);
  Z.flat(10); Z.ent('>', Z.cx - 2, Z.cy - 1);
  return Z.build();
}
var ZONE_BUILDERS = [
  buildZone1,
  buildZone2,
  function () { return buildZoneStub('ruins', 303, 'Пустынные руины', 'smash'); },
  function () { return buildZoneStub('tower', 404, 'Башня Часов', 'rewind'); }
];

import { LEVELS } from './levels.js';
import { DT, LOOP_STEPS, MAX_SPEED, buildStatic, makeCrystals, updatePlates, touchCrystals, stepOrb, predict } from './physics.js';
import * as W from './world.js';
import { save, persist } from './save.js';
import { sfx, unlockAudio, suspendAudio, resumeAudio } from './audio.js';
import * as UI from './ui.js';

const G = {
  mode: 'menu', li: 0, L: null, S: null, C: null,
  echoes: [], used: 0, step: 0, live: null, aiming: null, timeScale: 1,
  idle: 0, rewindT: 0, winT: 0, whispered: false, noLaunchWarned: false,
};

function newLive() {
  const [x, z] = G.L.start;
  return { x, z, y: 0, vx: 0, vz: 0, vy: 0, fall: false, lost: false, still: true, launched: false, launchStep: -1, rec: [] };
}

function startLevel(i) {
  G.li = i; G.L = LEVELS[i]; G.S = buildStatic(G.L);
  G.echoes = []; G.used = 0; G.whispered = false; G.noLaunchWarned = false;
  W.buildLevel(G.L, G.S);
  UI.showScreen('play');
  startLoop(true);
  if (G.L.hint) UI.toast(G.L.hint, 3200);
  else UI.toast(`${i + 1}. ${G.L.name}`, 1600, 'title');
}

function startLoop(first) {
  G.C = makeCrystals(G.L); W.buildCrystals(G.C);
  G.step = 0; G.idle = 0; G.live = newLive(); G.aiming = null; G.timeScale = 1;
  W.syncGhosts(G.echoes.length);
  W.resetTrail(W.view.orb); W.view.ghosts.forEach(W.resetTrail);
  updatePlates(G.S, []);
  G.mode = 'play';
  UI.setHud(G.L, G.used, G.L.loops);
  if (!first && G.echoes.length === 1 && !save.seen.echo) { save.seen.echo = 1; persist(); UI.toast('Твоё прошлое повторяется', 2600); }
}

// Положение призрака на шаге s.
function ghostAt(e, s) {
  const i = s - e.launchStep;
  if (i < 0) return { x: e.sx, z: e.sz, y: 0, vx: 0, vz: 0, active: false, waiting: true, moving: false };
  const n = e.rec.length / 3, k = Math.min(i, n - 1), p = Math.max(k - 1, 0);
  const x = e.rec[k * 3], z = e.rec[k * 3 + 1], y = e.rec[k * 3 + 2];
  const moving = i < n;
  return { x, z, y, vx: moving ? (x - e.rec[p * 3]) / DT : 0, vz: moving ? (z - e.rec[p * 3 + 1]) / DT : 0, active: y > -0.4, waiting: false, moving, done: i >= n - 1 };
}

function onEvent(type, a, b, k) {
  const ghost = typeof b === 'string' && b[0] === 'g';
  switch (type) {
    case 'break':
      W.burst(a.x, 0.6, a.z, W.COLORS[a.type], 26, 5); W.ring(a.x, a.z, W.COLORS[a.type], 2.4);
      W.shake(ghost ? 0.12 : 0.22); sfx.break(ghost);
      if (navigator.vibrate && !ghost) navigator.vibrate(12);
      if (G.C.every(c => c.dead)) win();
      break;
    case 'deny': W.burst(a.x, 0.6, a.z, W.COLORS.g, 8, 2); sfx.deny(); W.shake(0.08); break;
    case 'charge': W.ring(a.x, a.z, W.COLORS.d, 1.6); sfx.charge(); break;
    case 'wall': sfx.wall(a === G.live ? k : 0); if (k > 5) W.shake(0.05 + k * 0.01); break;
    case 'bump': W.burst(a.x, 0.4, a.z, W.COLORS.bump, 10, 3); W.ring(a.x, a.z, W.COLORS.bump, 1.4); sfx.bump(); W.shake(0.15); break;
    case 'ghosthit': W.burst(G.live.x, 0.3, G.live.z, W.COLORS.ghost, 8, 2.5); sfx.ghosthit(); break;
    case 'fall': sfx.fall(); break;
  }
}

function fixedStep() {
  const s = G.step, t = s * DT, lv = G.live;
  const gs = G.echoes.map(e => ghostAt(e, s));
  updatePlates(G.S, [lv, ...gs.filter(g => !g.waiting)]);
  if (lv.launched) {
    stepOrb(lv, G.S, gs, onEvent);
    lv.rec.push(lv.x, lv.z, lv.y);
    touchCrystals(G.C, 'L', lv, true, t, onEvent);
  }
  gs.forEach((g, i) => { if (!g.waiting && g.active) touchCrystals(G.C, 'g' + i, g, false, t, onEvent); });
  G.step++;
  if (G.mode !== 'play') return;
  const ghostsDone = gs.every(g => g.done || (!g.active && !g.waiting));
  if (lv.launched && (lv.still || lv.lost) && ghostsDone) G.idle++; else G.idle = 0;
  if (G.step >= LOOP_STEPS || G.idle > 60) endLoop();
}

function endLoop(manual) {
  if (G.mode !== 'play') return;
  G.aiming = null; W.showAim(null);
  if (!G.live.launched) {
    if (manual) return;
    if (!G.noLaunchWarned) { G.noLaunchWarned = true; UI.toast('Петля без броска не считается', 2000); }
    startLoop(); return;
  }
  G.echoes.push({ launchStep: G.live.launchStep, rec: G.live.rec, sx: G.L.start[0], sz: G.L.start[1] });
  G.used++;
  if (G.used >= G.L.loops) return fail();
  if (G.used >= 2 && G.L.whisper && !G.whispered) { G.whispered = true; setTimeout(() => UI.toast(G.L.whisper, 3600, 'whisper'), 900); }
  G.mode = 'rewind'; G.rewindT = 0; G.rwFrom = { x: G.live.x, z: G.live.z, y: Math.max(G.live.y, -3) };
  sfx.rewind(); UI.flash('rewind');
  UI.setHud(G.L, G.used, G.L.loops);
}

function win() {
  if (G.mode !== 'play') return;
  G.mode = 'win'; G.winT = 0;
  const loops = G.used + 1, stars = loops <= G.L.par ? 3 : loops <= G.L.par + 1 ? 2 : 1;
  G.lastStars = stars;
  save.stars[G.li] = Math.max(save.stars[G.li] || 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, G.li + 2)); persist();
  sfx.win(); UI.flash('win'); W.shake(0.35);
  for (const c of G.C) W.burst(c.x, 0.6, c.z, 0xffffff, 10, 6);
}

function showWin() {
  const last = G.li === LEVELS.length - 1, loops = G.used + 1;
  UI.panel({
    title: last ? 'Все петли замкнуты' : 'Петля замкнута', stars: G.lastStars,
    text: `Петель: ${loops} · мастерство: ${G.L.par}${last ? '<br>Ты прошёл «Эхо». Попробуй собрать все звёзды.' : ''}`,
    buttons: [
      { t: '↺ Ещё раз', fn: () => { UI.closePanel(); startLevel(G.li); } },
      last ? { t: 'В меню', main: true, fn: toMenu } : { t: 'Дальше →', main: true, fn: () => { UI.closePanel(); startLevel(G.li + 1); } },
    ],
  });
}

function fail() {
  G.mode = 'fail'; sfx.fail(); UI.hideToast();
  UI.panel({
    title: 'Петли кончились', text: G.L.whisper && G.whispered ? `«${G.L.whisper}»` : 'Прошлое не сложилось. Попробуй иначе.',
    buttons: [{ t: 'Меню', fn: toMenu }, { t: '↺ Заново', main: true, fn: () => { UI.closePanel(); startLevel(G.li); } }],
  });
}

function toMenu() { G.mode = 'menu'; UI.hideToast(); UI.renderMenu(i => startLevel(i)); UI.showScreen('menu'); }

function pause() {
  if (G.mode !== 'play') return;
  G.mode = 'pause'; G.aiming = null; W.showAim(null); suspendAudio();
  UI.panel({ title: 'Пауза', buttons: [{ t: 'Меню', fn: toMenu }, { t: '↺ Уровень', fn: () => { UI.closePanel(); startLevel(G.li); } }, { t: '▶ Дальше', main: true, fn: resume }] });
}
function resume() { UI.closePanel(); resumeAudio(); G.mode = 'play'; last = performance.now(); }

// ——— Ввод: оттянуть и отпустить ———
const canvas = W.renderer.domElement;
let pid = null;
function aimUpdate(e) {
  const a = G.aiming, lv = G.live;
  const dx = e.clientX - a.sx, dy = e.clientY - a.sy, len = Math.hypot(dx, dy);
  const power = Math.min(1, len / (0.3 * Math.min(innerWidth, innerHeight)));
  let ux = -dx, uz = -dy;
  const p0 = W.screenToGround(a.sx, a.sy), p1 = W.screenToGround(e.clientX, e.clientY);
  if (p0 && p1 && Math.hypot(p0.x - p1.x, p0.z - p1.z) > 0.01) { ux = p0.x - p1.x; uz = p0.z - p1.z; }
  const ul = Math.hypot(ux, uz) || 1;
  a.vx = ux / ul * power * MAX_SPEED; a.vz = uz / ul * power * MAX_SPEED; a.power = power;
  if (Math.abs(power - (a.lp || 0)) > 0.08) { sfx.aim(power); a.lp = power; }
  W.showAim(power > 0.08 ? predict(G.S, lv.x, lv.z, a.vx, a.vz) : null, power, lv.x, lv.z);
}
canvas.addEventListener('pointerdown', e => {
  unlockAudio();
  if (G.mode !== 'play' || G.live.launched || pid !== null) return;
  pid = e.pointerId; try { canvas.setPointerCapture(pid); } catch {}
  G.aiming = { sx: e.clientX, sy: e.clientY, vx: 0, vz: 0, power: 0 }; G.timeScale = 0.25;
});
canvas.addEventListener('pointermove', e => { if (e.pointerId === pid && G.aiming) aimUpdate(e); });
function release(e, cancel) {
  if (e.pointerId !== pid) return;
  pid = null; const a = G.aiming; G.aiming = null; G.timeScale = 1; W.showAim(null);
  if (!a || cancel || G.mode !== 'play' || a.power < 0.1) return;
  launch(a.vx, a.vz, a.power);
}
canvas.addEventListener('pointerup', e => release(e, false));
canvas.addEventListener('pointercancel', e => release(e, true));

function launch(vx, vz, power = Math.hypot(vx, vz) / MAX_SPEED) {
  const lv = G.live; if (lv.launched || G.mode !== 'play') return;
  lv.launched = true; lv.launchStep = G.step; lv.vx = vx; lv.vz = vz; lv.still = false;
  sfx.launch(power); W.ring(lv.x, lv.z, W.COLORS.orb, 1.2 + power); W.shake(0.05 + power * 0.1);
  if (navigator.vibrate) navigator.vibrate(8);
}

document.getElementById('pausebtn').onclick = () => { sfx.click(); pause(); };
document.getElementById('rwbtn').onclick = () => { sfx.click(); if (G.mode === 'play' && G.live.launched) endLoop(true); };
document.getElementById('play').onclick = () => { unlockAudio(); sfx.click(); startLevel(Math.min(save.unlocked, LEVELS.length) - 1); };
document.getElementById('snd').onclick = () => { unlockAudio(); save.sound = !save.sound; persist(); UI.renderMenu(startLevel); sfx.click(); };
document.getElementById('qlt').onclick = () => { save.quality = save.quality === 'high' ? 'fast' : 'high'; persist(); W.setQuality(save.quality); UI.renderMenu(startLevel); sfx.click(); };
addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === 'p') G.mode === 'pause' ? resume() : pause();
  if (e.key === 'r' && (G.mode === 'play' || G.mode === 'fail')) { UI.closePanel(); startLevel(G.li); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => pause());

// ——— Главный цикл ———
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.mode === 'play' || G.mode === 'win') {
    const ts = G.mode === 'win' ? 0.3 : G.timeScale;
    acc += dt * ts;
    let n = 0; while (acc >= DT && n++ < 20) { acc -= DT; fixedStep(); }
    if (G.mode === 'win') { G.winT += dt; if (G.winT > 1.3 && G.winT - dt <= 1.3) showWin(); }
  }
  if (G.mode === 'rewind') {
    G.rewindT += dt; const k = Math.min(1, G.rewindT / 0.8), e = k * k * (3 - 2 * k), f = G.rwFrom;
    W.placeOrb(W.view.orb, f.x + (G.L.start[0] - f.x) * e, f.y * (1 - e) + Math.sin(e * Math.PI) * 1.2, f.z + (G.L.start[1] - f.z) * e, dt, true);
    if (k >= 1) startLoop();
  }
  if (G.L && G.mode !== 'rewind' && G.live) {
    const lv = G.live, bob = lv.launched ? 0 : Math.sin(now / 300) * 0.04 + 0.04;
    W.placeOrb(W.view.orb, lv.x, lv.y + bob, lv.z, dt, lv.launched && !lv.still);
    G.echoes.forEach((e, i) => {
      const g = ghostAt(e, Math.max(0, G.step - 1)), v = W.view.ghosts[i];
      v.m.visible = g.y > -8; v.mat.opacity = g.waiting ? 0.25 : 0.6;
      W.placeOrb(v, g.x, g.y, g.z, dt, g.moving && !g.waiting);
    });
    UI.setBar(G.step / LOOP_STEPS);
    if (G.aiming && G.mode === 'play') { /* прицел обновляется в pointermove */ }
  }
  W.render(dt, G.S, G.C, G.mode === 'win' ? 0.3 : G.timeScale);
}

// Меню-сцена: первый уровень как фон.
G.L = LEVELS[0]; G.S = buildStatic(G.L); W.buildLevel(G.L, G.S);
G.C = makeCrystals(G.L); W.buildCrystals(G.C); G.live = newLive();
UI.renderMenu(i => startLevel(i)); UI.showScreen('menu');
requestAnimationFrame(frame);

// Тест-хук.
window.__echo = { G, startLevel, launch, endLoop, LEVELS, fixedStep, toMenu };

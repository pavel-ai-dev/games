import { LEVELS } from './levels.js';
import { save, persist, totalStars } from './save.js';
import { sfx } from './audio.js';

const $ = id => document.getElementById(id);
export const el = { menu: $('menu'), hud: $('hud'), bar: $('bar'), pips: $('pips'), lname: $('lname'), toast: $('toast'), panel: $('panel'), flash: $('flash'), grid: $('grid') };

let toastT = 0;
export function toast(text, ms = 2600, cls = '') {
  el.toast.textContent = text; el.toast.className = 'show ' + cls;
  clearTimeout(toastT); toastT = setTimeout(() => el.toast.className = '', ms);
}
export function hideToast() { clearTimeout(toastT); el.toast.className = ''; }

export function flash(cls = 'rewind') { el.flash.className = ''; void el.flash.offsetWidth; el.flash.className = cls; }

export function setHud(L, used, loops) {
  el.lname.textContent = L.name;
  el.pips.innerHTML = Array.from({ length: loops }, (_, i) => `<i class="${i < used ? 'used' : i === used ? 'cur' : ''}"></i>`).join('');
}
export function setBar(k) { el.bar.style.transform = `scaleX(${k})`; }

export function showScreen(name) {
  el.menu.classList.toggle('on', name === 'menu');
  el.hud.classList.toggle('on', name === 'play');
  if (name !== 'panel') el.panel.classList.remove('on');
}

export function renderMenu(onPick) {
  $('stars').textContent = `★ ${totalStars()} / ${LEVELS.length * 3}`;
  el.grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const b = document.createElement('button'); const st = save.stars[i] || 0; const locked = i + 1 > save.unlocked;
    b.className = 'lv' + (locked ? ' locked' : '') + (st ? ' done' : '');
    b.innerHTML = `<b>${i + 1}</b><span>${locked ? '🔒' : L.name}</span><em>${'★'.repeat(st)}${'☆'.repeat(3 - st)}</em>`;
    if (!locked) b.onclick = () => { sfx.click(); onPick(i); };
    el.grid.appendChild(b);
  });
  $('snd').textContent = save.sound ? '🔊 Звук' : '🔇 Звук';
  $('qlt').textContent = save.quality === 'high' ? '✨ Графика: высокая' : '⚡ Графика: быстрая';
}

// Модальная панель: title, text, stars (или null), кнопки [{t, fn, main}]
export function panel({ title, text = '', stars = null, buttons }) {
  el.panel.innerHTML = `<div class="card"><h2>${title}</h2>${stars !== null ? `<div class="big-stars">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.15 + i * 0.18}s">★</i>`).join('')}</div>` : ''}<p>${text}</p><div class="btns"></div></div>`;
  const box = el.panel.querySelector('.btns');
  for (const b of buttons) {
    const x = document.createElement('button'); x.textContent = b.t; x.className = b.main ? 'main' : '';
    x.onclick = () => { sfx.click(); b.fn(); }; box.appendChild(x);
  }
  el.panel.classList.add('on');
}
export function closePanel() { el.panel.classList.remove('on'); }
export { persist };

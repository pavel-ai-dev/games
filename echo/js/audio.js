import { save } from './save.js';

let ctx = null, master = null, noiseBuf = null;
export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}
export function suspendAudio() { ctx && ctx.state === 'running' && ctx.suspend(); }
export function resumeAudio() { ctx && ctx.state === 'suspended' && ctx.resume(); }

function tone(f, dur, { type = 'sine', vol = 0.3, to = null, delay = 0, attack = 0.005 } = {}) {
  if (!ctx || !save.sound || !isFinite(f) || !isFinite(vol) || (to !== null && !isFinite(to))) return;
  vol = Math.max(0.001, vol);
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, { vol = 0.2, freq = 1200, q = 1, to = null, delay = 0 } = {}) {
  if (!ctx || !save.sound || !isFinite(vol)) return;
  vol = Math.max(0.001, vol);
  const t = ctx.currentTime + delay, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
const PENTA = [523, 587, 659, 784, 880, 1047, 1175, 1319];
let combo = 0, comboT = 0;
export const sfx = {
  aim: p => tone(200 + p * 500, 0.05, { type: 'triangle', vol: 0.04 }),
  launch: p => { noise(0.35, { vol: 0.25 * p + 0.05, freq: 600, to: 3000, q: 0.7 }); tone(180, 0.25, { type: 'sine', vol: 0.2, to: 90 }); },
  wall: k => tone(90 + k * 8, 0.09, { type: 'triangle', vol: Math.min(0.25, k * 0.03) }),
  bump: () => { tone(220, 0.25, { type: 'sine', vol: 0.3, to: 660 }); tone(330, 0.2, { type: 'triangle', vol: 0.1, to: 990 }); },
  ghosthit: () => { tone(740, 0.3, { type: 'sine', vol: 0.12, to: 370 }); },
  break: (ghost) => {
    const now = performance.now(); combo = now - comboT < 900 ? combo + 1 : 0; comboT = now;
    const f = PENTA[Math.min(combo, PENTA.length - 1)] * (ghost ? 0.5 : 1);
    tone(f, 0.5, { vol: 0.22 }); tone(f * 1.5, 0.4, { vol: 0.1, delay: 0.02 }); tone(f * 2.01, 0.6, { vol: 0.06, delay: 0.03 });
    noise(0.18, { vol: 0.12, freq: 5000, q: 2 });
  },
  deny: () => { tone(160, 0.2, { type: 'square', vol: 0.05, to: 120 }); tone(1200, 0.4, { vol: 0.04, to: 1800 }); },
  charge: () => { tone(440, 0.6, { type: 'sine', vol: 0.15, to: 880 }); },
  fall: () => tone(400, 0.9, { type: 'sine', vol: 0.15, to: 60 }),
  rewind: () => { noise(0.7, { vol: 0.18, freq: 4000, to: 300, q: 1.5 }); tone(900, 0.7, { type: 'sine', vol: 0.08, to: 200 }); },
  loopEnd: () => tone(300, 0.15, { type: 'triangle', vol: 0.08 }),
  win: () => [0, 1, 2, 3, 5].forEach((n, i) => tone(PENTA[n], 0.7, { vol: 0.18, delay: i * 0.09 })),
  fail: () => [3, 2, 0].forEach((n, i) => tone(PENTA[n] / 2, 0.5, { type: 'triangle', vol: 0.15, delay: i * 0.14 })),
  click: () => tone(880, 0.06, { type: 'triangle', vol: 0.08 }),
};

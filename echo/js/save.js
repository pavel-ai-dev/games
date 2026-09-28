const KEY = 'echo_v1';
const def = { unlocked: 1, stars: {}, sound: true, quality: 'high', seen: {} };
export const save = Object.assign({}, def, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })());
export function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch {} }
export const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);

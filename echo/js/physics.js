// Детерминированная 2.5D-физика: движение по XZ, падение по Y.
export const R = 0.3;
export const DT = 1 / 120;
export const LOOP = 7;
export const LOOP_STEPS = Math.round(LOOP / DT);
export const GOLD_WINDOW = 0.6;
export const MAX_SPEED = 13;

const box = ([x, z, w, d]) => ({ x, z, w, d, x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });

export function buildStatic(L) {
  return {
    floors: L.floor.map(box),
    walls: (L.walls || []).map(box),
    gates: (L.gates || []).map(g => ({ ...box(g.r), plate: g.plate, open: false })),
    bridges: (L.bridges || []).map(g => ({ ...box(g.r), plate: g.plate, open: false })),
    plates: (L.plates || []).map(p => ({ x: p[0], z: p[1], r: p[2] || 0.8, pressed: false })),
    bumpers: (L.bumpers || []).map(b => ({ x: b[0], z: b[1], r: b[2] || 0.45, kick: 0 })),
    wells: (L.wells || []).map(w => ({ x: w[0], z: w[1], r: w[2] || 3, s: w[3] || 16 })),
  };
}

export function makeCrystals(L) {
  return L.crystals.map(([x, z, type], i) => ({ i, x, z, type, r: type === 'd' ? 0.36 : 0.3, dead: false, hits: {}, touching: {}, charge: 0 }));
}

const inBox = (b, x, z) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

export function onFloor(S, x, z) {
  for (const f of S.floors) if (inBox(f, x, z)) return true;
  for (const b of S.bridges) if (b.open && inBox(b, x, z)) return true;
  return false;
}

function collideBox(o, b, e) {
  const cx = Math.max(b.x0, Math.min(o.x, b.x1)), cz = Math.max(b.z0, Math.min(o.z, b.z1));
  const dx = o.x - cx, dz = o.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= R * R) return 0;
  let d = Math.sqrt(d2), nx, nz;
  if (d < 1e-6) {
    const pl = o.x - b.x0, pr = b.x1 - o.x, pt = o.z - b.z0, pb = b.z1 - o.z, m = Math.min(pl, pr, pt, pb);
    if (m === pl) { nx = -1; nz = 0; d = -pl; } else if (m === pr) { nx = 1; nz = 0; d = -pr; }
    else if (m === pt) { nx = 0; nz = -1; d = -pt; } else { nx = 0; nz = 1; d = -pb; }
  } else { nx = dx / d; nz = dz / d; }
  o.x += nx * (R - d); o.z += nz * (R - d);
  const vn = o.vx * nx + o.vz * nz;
  if (vn < 0) { o.vx -= (1 + e) * vn * nx; o.vz -= (1 + e) * vn * nz; return -vn; }
  return 0.001;
}

// Отскок от круга (cvx/cvz — скорость препятствия, для призраков).
function collideCircle(o, cx, cz, r, e, cvx = 0, cvz = 0, minOut = 0) {
  const dx = o.x - cx, dz = o.z - cz, d = Math.hypot(dx, dz), m = R + r;
  if (d >= m) return 0;
  const nx = d > 1e-6 ? dx / d : 0, nz = d > 1e-6 ? dz / d : 1;
  o.x = cx + nx * m; o.z = cz + nz * m;
  const vn = (o.vx - cvx) * nx + (o.vz - cvz) * nz;
  if (vn < 0) { o.vx -= (1 + e) * vn * nx; o.vz -= (1 + e) * vn * nz; }
  if (minOut) {
    const v2 = o.vx * nx + o.vz * nz;
    if (v2 < minOut) { o.vx += (minOut - v2) * nx; o.vz += (minOut - v2) * nz; }
  }
  return Math.max(-vn, 0.001);
}

export function updatePlates(S, orbs) {
  for (const p of S.plates) {
    p.pressed = false;
    for (const o of orbs) if (o.y > -0.3 && Math.hypot(o.x - p.x, o.z - p.z) < p.r) { p.pressed = true; break; }
  }
  for (const g of S.gates) g.open = !!S.plates[g.plate]?.pressed;
  for (const b of S.bridges) b.open = !!S.plates[b.plate]?.pressed;
}

// Касание кристаллов: общий код для живого шара и призраков.
export function touchCrystals(C, id, o, live, t, ev) {
  for (const c of C) {
    if (c.dead) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z);
    const over = o.y > -0.4 && d < R + c.r + 0.03;
    if (!over) { c.touching[id] = false; continue; }
    const first = !c.touching[id];
    c.touching[id] = true;
    if (c.type === 'n') { c.dead = true; ev('break', c, id); if (live) { o.vx *= 0.85; o.vz *= 0.85; } continue; }
    if (c.type === 'g') {
      if (live) { const k = collideCircle(o, c.x, c.z, c.r, 0.8); if (first) ev('deny', c, id, k); }
      else { c.dead = true; ev('break', c, id); }
      continue;
    }
    if (c.type === 'd') {
      if (live) collideCircle(o, c.x, c.z, c.r, 0.8);
      if (!first) continue;
      c.hits[id] = t;
      let ok = false;
      for (const k in c.hits) if (k !== id && Math.abs(c.hits[k] - t) <= GOLD_WINDOW) ok = true;
      if (ok) { c.dead = true; ev('break', c, id); } else { c.charge = 1; ev('charge', c, id); }
    }
  }
}

// Шаг живого шара. ghosts: [{x,z,vx,vz,y,active}]
export function stepOrb(o, S, ghosts, ev, preview = false) {
  if (o.fall) {
    o.vy -= 22 * DT; o.y += o.vy * DT; o.x += o.vx * DT * 0.6; o.z += o.vz * DT * 0.6;
    if (o.y < -9 && !o.lost) { o.lost = true; ev && ev('lost', o); }
    return;
  }
  let sticky = false;
  for (const p of S.plates) if (Math.hypot(o.x - p.x, o.z - p.z) < p.r) sticky = true;
  let inWell = false;
  for (const w of S.wells) {
    const dx = w.x - o.x, dz = w.z - o.z, d = Math.hypot(dx, dz);
    if (d < w.r && d > 0.02) { const a = w.s * (1 - d / w.r); o.vx += dx / d * a * DT; o.vz += dz / d * a * DT; inWell = true; }
  }
  let sp = Math.hypot(o.vx, o.vz);
  if (sp > 0) {
    const k = sticky ? 9 : 0.85, c = sticky ? 4 : (inWell ? 0.15 : 0.5);
    const ns = Math.max(0, sp - c * DT) * Math.exp(-k * DT);
    o.vx *= ns / sp; o.vz *= ns / sp; sp = ns;
  }
  if (sp > MAX_SPEED * 1.4) { o.vx *= MAX_SPEED * 1.4 / sp; o.vz *= MAX_SPEED * 1.4 / sp; }
  o.x += o.vx * DT; o.z += o.vz * DT;
  for (const b of S.walls) { const k = collideBox(o, b, 0.72); if (k > 0.5 && ev) ev('wall', o, k); }
  for (const g of S.gates) if (!g.open) { const k = collideBox(o, g, 0.72); if (k > 0.5 && ev) ev('wall', o, k); }
  for (const b of S.bumpers) {
    const k = collideCircle(o, b.x, b.z, b.r, 1, 0, 0, 7.5);
    if (k && !preview) { b.kick = 1; ev && ev('bump', b, k); }
  }
  if (ghosts) for (const g of ghosts) {
    if (!g.active) continue;
    const k = collideCircle(o, g.x, g.z, R * 0.98, 0.9, g.vx, g.vz);
    if (k > 0.4 && ev) ev('ghosthit', o, k);
  }
  if (!onFloor(S, o.x, o.z)) { o.fall = true; o.vy = 0; ev && ev('fall', o); }
  o.still = sp < 0.06 && !inWell;
  if (o.still && !inWell) { o.vx = 0; o.vz = 0; }
}

// Предсказание траектории для прицела (по текущей статике).
export function predict(S, x, z, vx, vz, steps = 150, every = 6) {
  const o = { x, z, y: 0, vx, vz, vy: 0, fall: false };
  const pts = [];
  for (let i = 0; i < steps; i++) {
    stepOrb(o, S, null, null, true);
    if (o.fall) { pts.push([o.x, -0.3, o.z]); break; }
    if (i % every === 0) pts.push([o.x, 0, o.z]);
    if (o.still) break;
  }
  return pts;
}

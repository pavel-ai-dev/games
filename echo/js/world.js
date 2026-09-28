import * as THREE from './three.module.min.js';
import { R } from './physics.js';
import { save } from './save.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = save.quality === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').prepend(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
scene.fog = new THREE.Fog(0x0a0d24, 22, 60);

// Фон — вертикальный градиент.
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#05061a'); gr.addColorStop(0.55, '#141a4a'); gr.addColorStop(1, '#3a1f5c');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}

scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1840, 0.9));
const sun = new THREE.DirectionalLight(0xfff0dd, 1.6);
sun.position.set(-6, 14, 6); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);

// Звёздная пыль вокруг острова.
const dust = (() => {
  const n = 400, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 50; p[i * 3 + 1] = -12 + Math.random() * 24; p[i * 3 + 2] = (Math.random() - 0.5) * 50; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb4ff, size: 0.08, transparent: true, opacity: 0.7, depthWrite: false }));
  scene.add(m); return m;
})();

// Радиальная текстура для «свечения» без постобработки.
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
})();
export function glow(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
  s.renderOrder = 5;
  s.scale.setScalar(size); return s;
}

export const COLORS = { n: 0x7ff6ff, g: 0xb46bff, d: 0xffc84a, orb: 0xfff2d6, ghost: 0x5fd8ff, gate: 0xff8a3d, plate: 0x6dffb0, bump: 0xff5fa8, well: 0x7a6bff };

const level = new THREE.Group(); scene.add(level);
const gridTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#2a3368'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(140,160,255,.22)'; g.lineWidth = 2; g.strokeRect(1, 1, 126, 126);
  g.fillStyle = 'rgba(140,160,255,.35)'; g.fillRect(62, 62, 4, 4);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
})();
const M = {
  floorTop: new THREE.MeshStandardMaterial({ color: 0xffffff, map: gridTex, roughness: 0.8, metalness: 0.05 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x1a1535, roughness: 1, flatShading: true }),
  wall: new THREE.MeshStandardMaterial({ color: 0x3b4a8c, roughness: 0.5, metalness: 0.2 }),
  edge: new THREE.LineBasicMaterial({ color: 0x7c8cff, transparent: true, opacity: 0.55 }),
};
export const view = { crystals: [], gates: [], bridges: [], plates: [], bumpers: [], wells: [], orb: null, ghosts: [], center: new THREE.Vector3(), size: [7, 13] };

function clearLevel() {
  level.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  level.clear();
  Object.assign(view, { crystals: [], gates: [], bridges: [], plates: [], bumpers: [], wells: [], ghosts: [] });
}

function slab(b, h, mat, y) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, h, b.d), mat);
  m.position.set(b.x, y, b.z); m.castShadow = m.receiveShadow = true; return m;
}

export function buildLevel(L, S) {
  clearLevel();
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const f of S.floors) {
    x0 = Math.min(x0, f.x0); x1 = Math.max(x1, f.x1); z0 = Math.min(z0, f.z0); z1 = Math.max(z1, f.z1);
    const mt = M.floorTop.clone(); mt.map = gridTex.clone(); mt.map.repeat.set(f.w, f.d); mt.map.needsUpdate = true;
    const top = slab(f, 0.4, mt, -0.2); level.add(top);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(top.geometry), M.edge); e.position.copy(top.position); level.add(e);
    // Скальное «днище» парящего острова.
    const g = new THREE.ConeGeometry(Math.max(f.w, f.d) * 0.62, 3.2, 7, 3); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 1.5 && y > -1.5) { p.setX(i, p.getX(i) * (0.85 + Math.random() * 0.3)); p.setZ(i, p.getZ(i) * (0.85 + Math.random() * 0.3)); } }
    g.computeVertexNormals();
    const rock = new THREE.Mesh(g, M.rock); rock.rotation.x = Math.PI; rock.scale.set(f.w / Math.max(f.w, f.d), 1, f.d / Math.max(f.w, f.d));
    rock.position.set(f.x, -2, f.z); level.add(rock);
  }
  for (const w of S.walls) level.add(slab(w, 0.5, M.wall, 0.25));
  for (const g of S.gates) {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.gate, emissive: COLORS.gate, emissiveIntensity: 0.8, transparent: true, opacity: 0.9 });
    const m = slab(g, 0.6, mat, 0.3); level.add(m); view.gates.push({ m, y: 0.3 });
  }
  for (const b of S.bridges) {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.plate, emissive: COLORS.plate, emissiveIntensity: 0.4, transparent: true, opacity: 0.15 });
    const m = slab(b, 0.3, mat, -0.15); m.castShadow = false; level.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: COLORS.plate, transparent: true, opacity: 0.6 }));
    m.add(e); view.bridges.push({ m, e, k: 0 });
  }
  for (const p of S.plates) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d4a3a, emissive: COLORS.plate, emissiveIntensity: 0.15 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, 0.06, 32), mat); m.position.set(p.x, 0.03, p.z); m.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(p.r, 0.04, 8, 48), new THREE.MeshBasicMaterial({ color: COLORS.plate }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; m.add(ring);
    level.add(m); view.plates.push({ m, mat, k: 0 });
  }
  for (const b of S.bumpers) {
    const mat = new THREE.MeshStandardMaterial({ color: COLORS.bump, emissive: COLORS.bump, emissiveIntensity: 0.5, roughness: 0.3 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r * 1.1, 0.45, 28), mat); m.position.set(b.x, 0.22, b.z); m.castShadow = true;
    const top = new THREE.Mesh(new THREE.TorusGeometry(b.r * 0.8, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    top.rotation.x = Math.PI / 2; top.position.y = 0.24; m.add(top);
    level.add(m); view.bumpers.push({ m, mat });
  }
  for (const w of S.wells) {
    const grp = new THREE.Group(); grp.position.set(w.x, 0.02, w.z);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(w.r * (0.25 + i * 0.22), w.r * (0.25 + i * 0.22) + 0.05, 48),
        new THREE.MeshBasicMaterial({ color: COLORS.well, transparent: true, opacity: 0.5 - i * 0.1, depthWrite: false }));
      r.rotation.x = -Math.PI / 2; grp.add(r);
    }
    const core = glow(COLORS.well, 1.6); core.position.y = 0.3; grp.add(core);
    level.add(grp); view.wells.push({ grp, w });
  }
  view.center.set((x0 + x1) / 2, 0, (z0 + z1) / 2); view.size = [x1 - x0, z1 - z0];
  sun.target.position.copy(view.center);
  view.orb = makeOrb(COLORS.orb, 1, true);
  resize();
}

function crystalGeo(type) {
  return type === 'd' ? new THREE.OctahedronGeometry(0.42, 0) : type === 'g' ? new THREE.TetrahedronGeometry(0.44, 0) : new THREE.OctahedronGeometry(0.34, 0);
}
export function buildCrystals(C) {
  for (const v of view.crystals) level.remove(v.grp);
  view.crystals = C.map(c => {
    const col = COLORS[c.type];
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, transparent: c.type === 'g', opacity: c.type === 'g' ? 0.6 : 1, flatShading: true });
    const m = new THREE.Mesh(crystalGeo(c.type), mat); m.castShadow = true;
    const grp = new THREE.Group(); grp.position.set(c.x, 0.55, c.z); grp.add(m);
    const g = glow(col, c.type === 'd' ? 2.2 : 1.6); grp.add(g);
    level.add(grp); return { grp, m, mat, g, c, t: Math.random() * 6 };
  });
}

function makeOrb(color, opacity, isLive) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: isLive ? 1.2 : 0.9, roughness: 0.2, transparent: !isLive, opacity });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 24, 16), mat); m.castShadow = true;
  const g = glow(color, isLive ? 2 : 1.4); m.add(g);
  if (isLive) { const l = new THREE.PointLight(color, 6, 5, 1.6); l.position.y = 0.2; m.add(l); }
  // След.
  const N = 40, pos = new Float32Array(N * 3), tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ color, transparent: true, opacity: isLive ? 0.5 : 0.35 }));
  trail.frustumCulled = false;
  level.add(m, trail);
  return { m, mat, g, trail, N, n: 0 };
}
export function syncGhosts(count) {
  while (view.ghosts.length < count) view.ghosts.push(makeOrb(COLORS.ghost, 0.55, false));
}
export function placeOrb(v, x, y, z, dt, moving) {
  v.m.position.set(x, R + y, z);
  const tp = v.trail.geometry.attributes.position;
  if (moving) {
    tp.array.copyWithin(3, 0, (v.N - 1) * 3);
    tp.array[0] = x; tp.array[1] = R * 0.6 + y; tp.array[2] = z;
    v.n = Math.min(v.N, v.n + 1);
  } else if (v.n > 0) { tp.array.copyWithin(3, 0, (v.N - 1) * 3); v.n--; }
  for (let i = v.n; i < v.N; i++) { tp.array[i * 3] = tp.array[(Math.max(v.n - 1, 0)) * 3]; tp.array[i * 3 + 1] = tp.array[(Math.max(v.n - 1, 0)) * 3 + 1]; tp.array[i * 3 + 2] = tp.array[(Math.max(v.n - 1, 0)) * 3 + 2]; }
  if (v.n === 0) for (let i = 0; i < v.N; i++) { tp.array[i * 3] = x; tp.array[i * 3 + 1] = R * 0.6 + y; tp.array[i * 3 + 2] = z; }
  tp.needsUpdate = true;
}
export function resetTrail(v) { v.n = 0; }

// Точки прицела.
const aimMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false, map: glowTex });
const aimGeo = new THREE.BufferGeometry(); aimGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(90), 3));
const aim = new THREE.Points(aimGeo, aimMat); aim.frustumCulled = false; aim.visible = false; scene.add(aim);
const arrow = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }));
arrow.rotation.x = -Math.PI / 2; arrow.visible = false; scene.add(arrow);
export function showAim(pts, power, x, z) {
  aim.visible = arrow.visible = !!pts;
  if (!pts) return;
  const a = aimGeo.attributes.position.array; const n = Math.min(pts.length, 30);
  for (let i = 0; i < 30; i++) { const p = pts[Math.min(i, n - 1)] || [x, 0, z]; a[i * 3] = p[0]; a[i * 3 + 1] = p[1] + 0.12; a[i * 3 + 2] = p[2]; }
  aimGeo.attributes.position.needsUpdate = true; aimGeo.setDrawRange(0, n);
  aimMat.color.setHSL(0.55 - power * 0.5, 1, 0.7);
  arrow.position.set(x, 0.03, z); arrow.scale.setScalar(0.6 + power * 0.6); arrow.material.color.copy(aimMat.color);
}

// Частицы-осколки.
const PN = 260;
const shards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.09), new THREE.MeshBasicMaterial({ color: 0xffffff }), PN);
shards.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shards.frustumCulled = false; scene.add(shards);
const P = Array.from({ length: PN }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, s: 1 }));
let pi = 0; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function burst(x, y, z, color, n = 24, speed = 5) {
  _c.set(color);
  for (let k = 0; k < n; k++) {
    const idx = pi, p = P[idx]; pi = (pi + 1) % PN;
    const a = Math.random() * Math.PI * 2, u = Math.random();
    Object.assign(p, { life: 0.7 + Math.random() * 0.6, x, y, z, vx: Math.cos(a) * speed * (0.3 + u), vz: Math.sin(a) * speed * (0.3 + u), vy: 2 + Math.random() * speed, r: Math.random() * 6, s: 0.6 + Math.random() * 1.2 });
    shards.setColorAt(idx, _c);
  }
  if (shards.instanceColor) shards.instanceColor.needsUpdate = true;
}
const rings = [];
export function ring(x, z, color, size = 2) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.06, z); scene.add(m); rings.push({ m, t: 0, size });
}
function updateFx(dt) {
  for (let i = 0; i < PN; i++) {
    const p = P[i];
    if (p.life > 0) {
      p.life -= dt; p.vy -= 14 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.r += dt * 8;
      if (p.y < 0.05 && p.vy < 0 && p.y > -0.5) { p.vy *= -0.4; p.vx *= 0.7; p.vz *= 0.7; p.y = 0.05; }
    }
    const s = p.life > 0 ? p.s * Math.min(1, p.life * 2) : 0;
    _m.compose(_v.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.r, p.r * 1.3, 0)), _s.set(s, s, s));
    shards.setMatrixAt(i, _m);
  }
  shards.instanceMatrix.needsUpdate = true;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt * 2.2;
    r.m.scale.setScalar(0.2 + r.t * r.size); r.m.material.opacity = Math.max(0, 0.9 * (1 - r.t));
    if (r.t >= 1) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); rings.splice(i, 1); }
  }
}

// Камера: весь уровень в кадре, наклон ~58°, тряска.
let shakeA = 0; const camBase = new THREE.Vector3(), look = new THREE.Vector3();
export function shake(a) { shakeA = Math.min(0.5, shakeA + a); }
export function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h); camera.aspect = w / h;
  const tilt = 58 * Math.PI / 180, half = Math.tan(camera.fov * Math.PI / 360);
  const [W, D] = view.size;
  const dW = (W / 2 + 0.6) / (half * camera.aspect), dD = (D / 2 * Math.sin(tilt) + 1.4) / half;
  const dist = Math.max(dW, dD, 9);
  camBase.set(view.center.x, view.center.y + Math.sin(tilt) * dist, view.center.z + Math.cos(tilt) * dist + 0.4);
  look.copy(view.center).add(new THREE.Vector3(0, 0, 0.4));
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

let time = 0;
export function render(dt, S, C, slow) {
  time += dt;
  shakeA *= Math.exp(-dt * 9);
  const sx = (Math.random() - 0.5) * shakeA, sy = (Math.random() - 0.5) * shakeA;
  camera.position.set(camBase.x + sx + Math.sin(time * 0.3) * 0.15, camBase.y + sy, camBase.z + Math.cos(time * 0.23) * 0.1);
  camera.lookAt(look);
  dust.rotation.y += dt * 0.02;
  if (S) {
    S.gates.forEach((g, i) => { const v = view.gates[i]; const ty = g.open ? -0.35 : 0.3; v.y += (ty - v.y) * Math.min(1, dt * 12); v.m.position.y = v.y; v.m.material.opacity = g.open ? 0.35 : 0.9; });
    S.bridges.forEach((b, i) => { const v = view.bridges[i]; v.k += ((b.open ? 1 : 0) - v.k) * Math.min(1, dt * 10); v.m.material.opacity = 0.12 + v.k * 0.7; v.m.material.emissiveIntensity = 0.3 + v.k; });
    S.plates.forEach((p, i) => { const v = view.plates[i]; v.k += ((p.pressed ? 1 : 0) - v.k) * Math.min(1, dt * 10); v.mat.emissiveIntensity = 0.15 + v.k * 1.2; v.m.position.y = 0.03 - v.k * 0.025; });
    S.bumpers.forEach((b, i) => { const v = view.bumpers[i]; b.kick = Math.max(0, b.kick - dt * 5); const s = 1 + b.kick * 0.35; v.m.scale.set(s, 1 - b.kick * 0.2, s); v.mat.emissiveIntensity = 0.5 + b.kick * 2; });
    view.wells.forEach(v => { v.grp.rotation.y -= dt * 1.5; v.grp.children.forEach((c, i) => { if (c.isMesh) c.scale.setScalar(1 + Math.sin(time * 3 - i) * 0.04); }); });
  }
  if (C) view.crystals.forEach(v => {
    v.t += dt; const c = v.c;
    if (c.dead) { v.grp.visible = false; return; }
    v.grp.visible = true;
    v.m.rotation.y += dt * (c.type === 'd' ? 1.4 : 0.9); v.m.rotation.x = Math.sin(v.t) * 0.3;
    v.grp.position.y = 0.6 + Math.sin(v.t * 2) * 0.08;
    c.charge = Math.max(0, c.charge - dt / 0.6 * (slow || 1));
    const e = 0.6 + c.charge * 3; v.mat.emissiveIntensity = e; v.g.scale.setScalar((c.type === 'd' ? 2.2 : 1.6) * (1 + c.charge * 0.8));
  });
  updateFx(dt);
  renderer.render(scene, camera);
}

// Экран → точка на плоскости y=0.
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), hit = new THREE.Vector3();
export function screenToGround(px, py) {
  ndc.set(px / innerWidth * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
export function setQuality(q) { renderer.shadowMap.enabled = q === 'high'; renderer.setPixelRatio(q === 'high' ? Math.min(devicePixelRatio, 2) : 1); level.traverse(o => { if (o.material) o.material.needsUpdate = true; }); resize(); }

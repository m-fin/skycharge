// Procedural island world: terrain height grid, water, sky, clouds, trees, landmarks, charging stations.
// Physics and rendering share one height grid (heightAt uses the same triangles as the mesh), so nothing clips.
import * as THREE from '../vendor/three.module.js';
import { createKit } from './kit.mjs';

export const S = 8000, N = 256, CELL = S / N, OCEAN_FLOOR = -60;
const ORANGE = 0xf7931a;

function hash(i, j, seed) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, z, seed) { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
function fbm(x, z, seed) { let s = 0, a = 0.5, f = 1, n = 0; for (let o = 0; o < 5; o++) { s += a * vnoise(x * f, z * f, seed + o * 17); n += a; a *= 0.5; f *= 2.03; } return s / n; }
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

function rawHeight(x, z, seed) {
  const wob = (fbm(x / 520 + 3, z / 520 - 9, seed + 7) - 0.5) * 1100;
  const mask = smooth(3300, 1500, Math.hypot(x, z * 1.12) + wob);
  const n = fbm(x / 1150 + 11.3, z / 1150 - 4.7, seed);
  const ridge = 1 - Math.abs(fbm(x / 620, z / 620, seed + 99) * 2 - 1);
  const land = Math.pow(n, 2.1) * 560 + ridge * ridge * 110 * n + 10;
  return mask * land - (1 - mask) * 60;
}

// Station rectangle helpers. heading hd: 0 = north (-Z), clockwise. Runway long axis along heading.
export function stationLocal(st, x, z) { const dx = x - st.x, dz = z - st.z, s = Math.sin(st.hd), c = Math.cos(st.hd); return { along: dx * s - dz * c, side: dx * c + dz * s }; }
function rectDist(st, x, z) { const l = stationLocal(st, x, z); return Math.hypot(Math.max(Math.abs(l.along) - st.len / 2, 0), Math.max(Math.abs(l.side) - st.wid / 2, 0)); }

const STATION_SPOTS = [[0, 0, 'Home Field'], [1500, -800, 'Ridge Skycharger'], [-1400, -900, 'North Cove Solar'], [-700, 1500, 'Lagoon Pad'], [1200, 1300, 'Harbor Field']];

// ---- Perf 1.0.8.1 (Flow): merge static meshes that look the same into one mesh each (fewer draw calls, same pixels).
// Meshes are grouped by an identical-material signature (or by material identity for shared animated materials), their
// geometry is baked into root's local frame and concatenated. Skipped: anything named, instanced, multi-material,
// textured, transparent (unless keyed by identity), non-zero renderOrder, hidden, mirrored, or under a skipped subtree.
const hx = (c) => (c && c.isColor ? c.getHex() : null);
function matSig(m) {
  if (m.map || m.emissiveMap || m.alphaMap || m.lightMap || m.aoMap || m.envMap || m.onBeforeCompile.toString() !== THREE.Material.prototype.onBeforeCompile.toString()) return null;
  return JSON.stringify([m.type, hx(m.color), hx(m.emissive), hx(m.specular), m.shininess, m.side, m.transparent, m.opacity, m.depthWrite, m.depthTest, m.blending, m.fog, m.vertexColors,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.toneMapped, m.flatShading, m.wireframe, m.alphaTest, m.colorWrite, m.emissiveIntensity]);
}
export function mergeStatic(root, { skip = new Set(), byId = new Set(), vertexColors = true } = {}) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map();
  const walk = (o) => { if (skip.has(o)) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && o !== root && !o.name && o.visible && o.renderOrder === 0 && o.frustumCulled && !Array.isArray(o.material) && !(o.geometry.morphAttributes && o.geometry.morphAttributes.position) && o.matrixWorld.determinant() > 0) {
      const m = o.material, key = byId.has(m) ? 'id:' + m.uuid : (!m.transparent && (vertexColors || !m.vertexColors) ? matSig(m) : null);
      if (key) { if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(o); } }
    for (const c of o.children) walk(c); };
  walk(root); let removed = 0, made = 0; const rel = new THREE.Matrix4();
  bucket: for (const list of buckets.values()) { if (list.length < 2) continue; const m = list[0].material, want = ['position', 'normal', ...(m.vertexColors ? ['color'] : [])];
    const geos = list.map((o) => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld)); return g; });
    const names = want.filter((n) => geos.every((g) => g.getAttribute(n))); if (!names.includes('position') || (m.vertexColors && !names.includes('color'))) { for (const g of geos) g.dispose(); continue; }
    const out = new THREE.BufferGeometry();
    for (const n of names) { const sz = geos[0].getAttribute(n).itemSize; if (!geos.every((g) => g.getAttribute(n).itemSize === sz)) { for (const g of geos) g.dispose(); continue bucket; } let len = 0; for (const g of geos) len += g.getAttribute(n).count * sz;
      const arr = new Float32Array(len); let off = 0; for (const g of geos) { const a = g.getAttribute(n); for (let i = 0; i < a.count; i++) for (let k = 0; k < sz; k++) arr[off++] = a.getComponent(i, k); } out.setAttribute(n, new THREE.BufferAttribute(arr, sz)); }
    for (const g of geos) g.dispose(); out.computeBoundingSphere(); out.computeBoundingBox();
    const merged = new THREE.Mesh(out, m); merged.matrixAutoUpdate = false; merged.userData.merged = list.length; root.add(merged); merged.updateMatrixWorld(true); made++;
    for (const o of list) { o.parent.remove(o); removed++; } }
  return { removed, made };
}

export function createWorld(seed = 1) {
  // ---- pick flat land for each station (cheap grid search)
  const stations = [];
  for (const [sx, sz, name] of STATION_SPOTS) {
    let best = null;
    for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) for (let k = 0; k < 4; k++) {
      const st = { x: sx + i * 150, z: sz + j * 150, hd: k * Math.PI / 4, len: 360, wid: 36 }; const hs = [];
      for (let a = -3; a <= 3; a++) for (let b = -1; b <= 1; b++) { const al = a / 3 * (st.len / 2 + 40), sd = b * (st.wid / 2 + 40), s = Math.sin(st.hd), c = Math.cos(st.hd); hs.push(rawHeight(st.x + al * s + sd * c, st.z - al * c + sd * s, seed)); }
      const mn = Math.min(...hs), mx = Math.max(...hs), mean = hs.reduce((p, q) => p + q, 0) / hs.length;
      const cost = (mx - mn) + 0.08 * mean + (mn < 6 ? 1e4 : 0) + Math.hypot(i, j) * 4;
      if (!best || cost < best.cost) best = { ...st, cost, h: Math.max(8, mean) };
    }
    stations.push({ name, x: best.x, z: best.z, hd: best.hd, len: best.len, wid: best.wid, h: best.h });
  }
  const finalHeight = (x, z) => { let h = rawHeight(x, z, seed); for (const st of stations) { const t = smooth(30, 150, rectDist(st, x, z)); h = st.h + (h - st.h) * t; } return h; };

  // ---- height grid shared by mesh + physics
  const H = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = finalHeight(-S / 2 + i * CELL, -S / 2 + j * CELL);
  const hAt = (i, j) => H[j * (N + 1) + i];
  function heightAt(x, z) {
    const gx = (x + S / 2) / CELL, gz = (z + S / 2) / CELL; if (gx < 0 || gz < 0 || gx >= N || gz >= N) return OCEAN_FLOOR;
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, a = hAt(i, j), b = hAt(i, j + 1), c = hAt(i + 1, j + 1), d = hAt(i + 1, j);
    return fx + fz <= 1 ? a + (d - a) * fx + (b - a) * fz : c + (b - c) * (1 - fx) + (d - c) * (1 - fz);
  }
  const groundAt = (x, z) => { const h = heightAt(x, z); return { h: Math.max(h, 0), water: h < 0.3 }; };

  const group = new THREE.Group(); const col = new THREE.Color();
  // Shoreline blend: wet sand at the waterline, then the seabed fades to the water's own colour, so if the depth buffer
  // ever lets the shallow seabed poke through the water (z-fighting at a distance, low-precision WebGL1 depth on Xbox)
  // it is the same colour as the water instead of bright sand flicker.
  const WET = new THREE.Color(0xb8a676), SHALLOW = new THREE.Color(0x74b8b0), DEEP = new THREE.Color(0x4287a5); // DEEP = what the water looked like over the old sand seabed
  const terrainColor = (h, slope) => {
    if (h < 0) return h > -2 ? col.copy(WET).lerp(SHALLOW, -h / 2) : col.copy(SHALLOW).lerp(DEEP, Math.min(1, (-h - 2) / 22));
    if (h < 1.2) return col.copy(WET).lerp(new THREE.Color(0xd9c690), h / 1.2);
    if (h < 3) return col.setHex(0xd9c690);
    if (slope > 0.75 && h > 20) return col.setHex(0x7b7466);
    if (h < 70) return col.setHex(0x5f9a45).lerp(new THREE.Color(0x4f8a3c), h / 70);
    if (h < 190) return col.setHex(0x447a36).lerp(new THREE.Color(0x6a7350), (h - 70) / 120);
    if (h < 300) return col.setHex(0x82796a);
    return col.setHex(0xf2f4f6);
  };
  // Render-only: the seabed drops away faster just below the waterline (2.5 m lower by 2 m depth), so the terrain crosses the
  // water plane at a steeper angle and the two surfaces are never nearly coplanar over wide shallow flats (that is what
  // flickered). Land at 0.4 m and above is untouched; physics (heightAt / groundAt) still uses the real grid, and anything
  // below 0.3 m counts as water there anyway.
  const SEABED_DROP = (h) => 2.5 * smooth(0.4, -2.0, h);
  { // terrain mesh
    const pos = new Float32Array((N + 1) * (N + 1) * 3), cols = new Float32Array(pos.length), idx = [];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * (N + 1) + i, h = H[k]; pos.set([-S / 2 + i * CELL, h - SEABED_DROP(h), -S / 2 + j * CELL], k * 3);
      const sx = (hAt(Math.min(i + 1, N), j) - hAt(Math.max(i - 1, 0), j)) / (2 * CELL), sz = (hAt(i, Math.min(j + 1, N)) - hAt(i, Math.max(j - 1, 0))) / (2 * CELL);
      const v = 0.94 + 0.12 * hash(i, j, seed + 5);
      // underwater vertices next to dry land keep wet-sand colour: a 31 m cell blends its colour across the waterline, so this is what draws the beach
      const coast = h < 0 && Math.max(hAt(Math.min(i + 1, N), j), hAt(Math.max(i - 1, 0), j), hAt(i, Math.min(j + 1, N)), hAt(i, Math.max(j - 1, 0))) > 0;
      terrainColor(coast ? 0.01 : h, Math.hypot(sx, sz)); cols.set([col.r * v, col.g * v, col.b * v], k * 3);
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + N + 1, c = b + 1, d = a + 1; idx.push(a, b, d, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
    { const tm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); tm.name = 'terrain'; group.add(tm); } // weather.mjs adds the cloud shadows to this material
  }
  { // water
    // polygonOffset pulls the water two depth steps toward the camera, so where it and the shallow seabed are within depth
    // precision of each other the water wins every frame instead of flickering. Units only (no slope factor), so it doesn't
    // swallow the dock pontoons or the beach at grazing angles. renderOrder 1: drawn after the terrain.
    const w = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshPhongMaterial({ color: 0x3a84a8, shininess: 80, specular: 0x88aacc, transparent: true, opacity: 0.88,
      polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 }));
    w.rotation.x = -Math.PI / 2; w.position.y = 0; w.renderOrder = 1; w.name = 'water'; group.add(w);
  }
  { // sky dome
    const g = new THREE.SphereGeometry(20000, 32, 16), m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d7cc9) }, mid: { value: new THREE.Color(0x9fc8ec) }, bot: { value: new THREE.Color(0xdbe9f5) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0. ? mix(mid, top, pow(min(h*2.2,1.),0.8)) : bot; if(h>-0.02&&h<0.) c = mix(bot, mid, (h+0.02)/0.02); gl_FragColor = vec4(c,1.); }' });
    const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; sky.name = 'sky'; group.add(sky);
  }
  const R = rng(seed * 31 + 7);
  { // clouds (instanced puffs)
    const puffs = 60 * 6, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6, transparent: true, opacity: 0.92 }), puffs); const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let n = 0; for (let c = 0; c < 60; c++) { const cx = (R() - 0.5) * 9000, cz = (R() - 0.5) * 9000, cy = 520 + R() * 260, sc = 30 + R() * 45;
      for (let p = 0; p < 6; p++) { const s = sc * (0.6 + R() * 0.6); m.compose(new THREE.Vector3(cx + (R() - 0.5) * sc * 3, cy + (R() - 0.3) * sc * 0.5, cz + (R() - 0.5) * sc * 1.6), q, new THREE.Vector3(s * 1.4, s * 0.6, s)); im.setMatrixAt(n++, m); } }
    group.add(im);
  }
  const nearStation = (x, z, d) => stations.some(st => rectDist(st, x, z) < d);
  const trees = []; // {x,z,h,r,top} for the glider/seaplane tree collision
  { // trees
    const max = 1600, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 5), new THREE.MeshLambertMaterial({ color: 0x6b4a2e }), max), crown = new THREE.InstancedMesh(new THREE.ConeGeometry(4, 11, 6), new THREE.MeshLambertMaterial({ color: 0x2f6b34 }), max);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), tint = new THREE.Color(); let n = 0; trees.length = 0;
    for (let t = 0; t < 9000 && n < max; t++) { const x = (R() - 0.5) * 6400, z = (R() - 0.5) * 6400, h = heightAt(x, z); if (h < 6 || h > 230 || nearStation(x, z, 70)) continue;
      if (fbm(x / 300, z / 300, seed + 50) < 0.5) continue; const s = 0.8 + R() * 0.9; m.compose(new THREE.Vector3(x, h + 2 * s, z), q, new THREE.Vector3(s, s, s)); trunk.setMatrixAt(n, m);
      m.compose(new THREE.Vector3(x, h + 8.5 * s, z), q, new THREE.Vector3(s, s, s)); crown.setMatrixAt(n, m); crown.setColorAt(n, tint.setHSL(0.3 + R() * 0.06, 0.45, 0.24 + R() * 0.08)); trees.push({ x, z, h, r: 3.4 * s, top: h + 14 * s }); n++; }
    trunk.count = crown.count = n; group.add(trunk, crown);
  }
  const spinners = [], landmarks = { turbines: [], lighthouse: null };
  { // wind turbines on high open ground
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }); let n = 0;
    for (let t = 0; t < 4000 && n < 7; t++) { const x = (R() - 0.5) * 5000, z = (R() - 0.5) * 5000, h = heightAt(x, z); if (h < 90 || h > 260 || nearStation(x, z, 200)) continue;
      const g = new THREE.Group(); g.position.set(x, h, z); const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.2, 70, 8), white); tower.position.y = 35; g.add(tower);
      const hub = new THREE.Group(); hub.position.set(0, 70, -2.5); const nac = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 7), white); nac.position.z = 2.5; hub.add(nac);
      for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 30, 0.4), white); bl.geometry.translate(0, 15, 0); bl.rotation.z = b * 2 * Math.PI / 3; hub.add(bl); }
      g.rotation.y = R() * 6.28; g.add(hub); group.add(g); spinners.push(hub); landmarks.turbines.push({ x, z, h, top: h + 100 }); n++; }
  }
  { // lighthouse on the coast
    for (let a = 0; a < 64; a++) { const ang = a / 64 * Math.PI * 2 + 0.7; let found = null;
      for (let r = 3600; r > 800; r -= 20) { const x = Math.cos(ang) * r, z = Math.sin(ang) * r; if (heightAt(x, z) > 4) { found = [x, z, heightAt(x, z)]; break; } }
      if (found && found[2] < 25) { landmarks.lighthouse = { x: found[0], z: found[1], h: found[2], top: found[2] + 34 }; const g = new THREE.Group(); g.position.set(found[0], found[2], found[1]);
        for (let s = 0; s < 4; s++) { const seg = new THREE.Mesh(new THREE.CylinderGeometry(3.2 - s * 0.35, 3.5 - s * 0.35, 7, 12), new THREE.MeshLambertMaterial({ color: s % 2 ? 0xc8322b : 0xf5f5f5 })); seg.position.y = 3.5 + s * 7; g.add(seg); }
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 3, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a8 })); lamp.position.y = 29.5; g.add(lamp);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3, 10), new THREE.MeshLambertMaterial({ color: 0x222222 })); cap.position.y = 32.5; g.add(cap); group.add(g); break; } }
  }
  // ---- skycharger plaza beside each runway (original design): solar canopy over 7 tall glowing charger posts with drive-in
  // bays for the roadster / scooter, a little cafe with lights, people at the tables and a few AI vehicles charging.
  // Everything is merged into two meshes per station (one lit, one glow). Local frame = the station group (x = side, -z = heading).
  const PZ = { postX: 33, bayX: 39.5, z0: 86, dz: 8, n: 7, ai: [1, 4, 6], spawnBay: 3 };
  const toWorld = (st, lx, lz) => { const s = Math.sin(st.hd), c = Math.cos(st.hd); return { x: st.x + lx * c - lz * s, z: st.z + lx * s + lz * c }; };
  function parkedCar(K, x, z, color, scooter) { // simple low-poly charging AI vehicle, nose toward the post (-x)
    if (scooter) { K.box(1.7, 0.1, 0.34, x, 0.35, z, 0x17181c); K.box(0.8, 0.5, 0.42, x + 0.4, 0.62, z, color); K.box(0.12, 0.8, 0.32, x - 0.55, 0.7, z, color); K.box(0.06, 0.06, 0.62, x - 0.68, 1.15, z, 0x9aa0a8);
      for (const wx of [-0.62, 0.62]) K.cyl(0.28, 0.28, 0.14, 10, x + wx, 0.28, z, 0x141414, PI2, 0, 0); return; }
    K.box(4.3, 0.5, 1.84, x, 0.62, z, color); K.box(1.9, 0.42, 1.5, x + 0.3, 1.05, z, 0x223a52); K.box(1.2, 0.08, 1.6, x + 0.35, 1.28, z, color);
    for (const wx of [-1.35, 1.35]) for (const wz of [-0.86, 0.86]) K.cyl(0.36, 0.36, 0.28, 12, x + wx, 0.36, z + wz, 0x141414, PI2, 0, 0);
    K.box(0.05, 0.08, 1.5, x - 2.16, 0.7, z, 0xf4f7ff); K.box(0.05, 0.08, 1.5, x + 2.16, 0.75, z, 0xff3a2a); }
  function person(K, x, z, shirt, sitting) { const y = sitting ? 0.45 : 0; K.cyl(0.18, 0.2, 0.75, 7, x, y + 0.95, z, shirt); K.add(new THREE.SphereGeometry(0.15, 8, 6), 0xe0b08a, [x, y + 1.48, z]);
    if (!sitting) { K.box(0.13, 0.6, 0.14, x - 0.09, 0.3, z, 0x2b3445); K.box(0.13, 0.6, 0.14, x + 0.09, 0.3, z, 0x2b3445); } else K.box(0.32, 0.12, 0.45, x, 0.5, z + 0.15, 0x2b3445); }
  const PI2 = Math.PI / 2;
  function buildPlaza(g, st) {
    const K = createKit(), L = createKit(), white = 0xeeeeea, conc = 0xb9b6ad, dark = 0x1d1f24, panel = 0x1c2c4a;
    K.box(24, 0.12, 66, 40, 0.0, 110, conc); // slab
    for (let i = 0; i <= PZ.n; i++) K.box(9.5, 0.03, 0.18, PZ.bayX, 0.08, PZ.z0 - PZ.dz / 2 + i * PZ.dz, 0xf2f2f2); // bay lines
    for (let i = 0; i < PZ.n; i++) { const z = PZ.z0 + i * PZ.dz; L.box(1.6, 0.03, 0.5, PZ.bayX + 2.2, 0.08, z, 0xf7931a); L.box(0.5, 0.03, 1.4, PZ.bayX + 2.2, 0.085, z, 0xf7931a); // bay marker
      // tall charger post: body, glowing strip facing the bay, little screen, cable holster
      K.box(0.55, 2.5, 0.4, PZ.postX, 1.3, z, white); K.box(0.6, 0.12, 0.45, PZ.postX, 2.6, z, dark); K.box(0.7, 0.2, 0.6, PZ.postX, 0.1, z, dark);
      L.box(0.03, 2.0, 0.1, PZ.postX + 0.29, 1.35, z, 0xffa531); L.box(0.02, 0.28, 0.24, PZ.postX + 0.29, 1.9, z - 0.13, 0x3a7fb0);
      K.add(new THREE.TorusGeometry(0.2, 0.035, 5, 12), 0x111111, [PZ.postX, 1.0, z + 0.25], [0, 0, 0]); }
    // canopy: columns, roof, solar panels on top, warm light strips underneath
    for (const x of [31, 48]) for (const z of [82, 110, 138]) K.cyl(0.22, 0.22, 5.6, 8, x, 2.8, z, 0x3a3d42);
    K.box(19.5, 0.35, 62, 39.5, 5.7, 110, 0xdedbd2); K.box(19.7, 0.12, 62.2, 39.5, 5.5, 110, 0xf7931a);
    for (let x = 31.5; x < 47.5; x += 3.1) for (let z = 80.5; z < 140; z += 1.9) K.box(2.95, 0.06, 1.75, x + 1.5, 5.93 + (x - 31.5) * 0.02, z + 0.9, panel);
    L.box(19.3, 0.02, 61.6, 39.5, 5.425, 110, 0xd6d0c4); // light canopy underside (unlit: a down-facing lit panel turns muddy olive)
    for (let z = 82; z < 140; z += 8) L.box(14, 0.04, 0.25, 39.5, 5.4, z + 4, 0xfff0cf);
    // cafe / lounge: walls, big warm windows toward the runway, orange roof trim, sign, outdoor tables with umbrellas
    K.box(9, 4.2, 12, 44, 2.1, 162, 0xe6e0d4); K.box(9.6, 0.4, 12.6, 44, 4.4, 162, 0x2a2c31); K.box(9.7, 0.15, 12.7, 44, 4.65, 162, 0xf7931a);
    L.box(0.05, 2.2, 9.5, 39.47, 1.8, 162, 0xffd59a); for (let z = 157.5; z <= 166.5; z += 3) K.box(0.1, 2.3, 0.12, 39.45, 1.8, z, 0x2a2c31);
    L.box(0.05, 0.6, 4.2, 39.4, 3.6, 162, 0xf7931a); K.box(0.05, 1.6, 0.05, 39.45, 0.8, 168, 0x2a2c31);
    for (const [tx, tz] of [[34.5, 158], [34.5, 165], [35.5, 171]]) { K.cyl(0.6, 0.6, 0.06, 10, tx, 0.75, tz, white); K.cyl(0.05, 0.05, 0.75, 5, tx, 0.38, tz, dark); K.cyl(0.04, 0.04, 2.4, 5, tx, 1.2, tz, dark);
      K.add(new THREE.ConeGeometry(1.6, 0.6, 8), (tz | 0) % 2 ? 0xf7931a : 0xf4f2ec, [tx, 2.5, tz]); }
    // people (sitting at tables, chatting near the posts) + AI vehicles charging with their cables plugged in
    const shirts = [0x2f6f73, 0xb8402e, 0xf7931a, 0x2f4f7f, 0x6a4a8a, 0xe8e2d0];
    person(K, 33.7, 158, shirts[0], true); person(K, 35.3, 158.3, shirts[1], true); person(K, 34.2, 165.6, shirts[2], true); person(K, 37.2, 171, shirts[3], false); person(K, 37.8, 170.6, shirts[4], false);
    person(K, 31.5, PZ.z0 + 2 * PZ.dz + 2, shirts[5], false);
    const cols = [0xb8402e, 0xf4f4f2, 0x2f4f7f];
    PZ.ai.forEach((bi, k) => { const z = PZ.z0 + bi * PZ.dz, sc = k === 2; parkedCar(K, sc ? PZ.postX + 2.4 : PZ.postX + 3.2 + 1.2, z, cols[k], sc);
      const ax = PZ.postX + 0.25, tx = sc ? PZ.postX + 1.7 : PZ.postX + 1.95; K.add(new THREE.CylinderGeometry(0.035, 0.035, tx - ax, 5), 0x111111, [(ax + tx) / 2, 1.0 - (sc ? 0.25 : 0.2), z], [0, 0, PI2 + (sc ? 0.4 : 0.25)]); });
    const lit = K.mesh('lambert'), glow = L.mesh('basic'); g.add(lit, glow);
    // world-space bays (drive-in charging), post holster anchors, spawn bay
    st.bays = []; for (let i = 0; i < PZ.n; i++) { if (PZ.ai.includes(i)) continue; const z = PZ.z0 + i * PZ.dz, b = toWorld(st, PZ.bayX, z), a = toWorld(st, PZ.postX + 0.3, z); st.bays.push({ x: b.x, z: b.z, ax: a.x, ay: st.h + 0.12 + 1.0, az: a.z, i }); }
    const sb = st.bays.find((b) => b.i === PZ.spawnBay) || st.bays[0]; st.hoverSpawn = { x: sb.x, z: sb.z, hd: st.hd + PI2 };
    const py = toWorld(st, st.wid / 2 + 6, st.len / 2 - 28); st.pylon = { x: py.x, y: st.h + 0.12 + 3.6, z: py.z };
  }
  // ---- charging stations: runway + glowing charger pad + beacon
  const beacons = [], merged = {};
  for (const st of stations) {
    const g = new THREE.Group(); g.position.set(st.x, st.h + 0.12, st.z); g.rotation.y = -st.hd;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(st.wid, 0.2, st.len), new THREE.MeshLambertMaterial({ color: 0x2b2d31 })); g.add(strip);
    const dash = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 }); for (let z = -st.len / 2 + 70; z < st.len / 2 - 20; z += 24) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 10), dash); d.position.set(0, 0.03, z); g.add(d); }
    const edge = new THREE.MeshBasicMaterial({ color: ORANGE }); for (let z = -st.len / 2; z <= st.len / 2; z += 20) for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.7), edge); l.position.set(sx * (st.wid / 2 + 0.6), 0.3, z); g.add(l); }
    // charger pad at the start end (+Z local = behind heading)
    const pad = new THREE.Group(); pad.position.set(0, 0.14, st.len / 2 - 28);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ color: 0x3a2405 })); disc.rotation.x = -Math.PI / 2; pad.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(11.2, 13, 48), new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; pad.add(ring);
    const bolt = new THREE.Shape([[1.5, 7], [-3.5, -0.8], [0, -0.8], [-1.5, -7], [3.5, 0.8], [0, 0.8]].map(p => new THREE.Vector2(...p)));
    const bm = new THREE.Mesh(new THREE.ShapeGeometry(bolt), new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide })); bm.rotation.x = -Math.PI / 2; bm.position.y = 0.03; pad.add(bm);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 1.4), new THREE.MeshLambertMaterial({ color: 0x111111 })); pylon.position.set(st.wid / 2 + 6, 2.5, 0); pad.add(pylon);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 1.5), new THREE.MeshBasicMaterial({ color: ORANGE })); glow.position.set(st.wid / 2 + 6, 4.2, 0); pad.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 700, 12, 1, true), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.set(st.wid / 2 + 6, 356, 0); pad.add(beam); beacons.push({ ring, beam, glow }); g.add(pad);
    buildPlaza(g, st);
    // world-space pad centre + plane spawn
    const s = Math.sin(st.hd), c = Math.cos(st.hd), back = -(st.len / 2 - 28); st.padX = st.x + back * s; st.padZ = st.z - back * c;
    const sp = -(st.len / 2 - 34); st.spawnX = st.x + sp * s; st.spawnZ = st.z - sp * c; group.add(g);
  }

  // ---- soaring air (hang glider) + lagoon seaplane dock. Own RNG so the older layout (trees, turbines, coins) is unchanged.
  const R2 = rng(seed * 53 + 11), WIND = { x: 1, z: 0, speed: 7 }; // a steady westerly: the wind blows toward +X (east), so west-facing slopes are windward
  const slopeX = (x, z) => (heightAt(x + 30, z) - heightAt(x - 30, z)) / 60;
  // hilltop launch: the highest summit with open, falling ground ahead into the wind
  let launch = null; { let best = null; for (let x = -3200; x <= 3200; x += 40) for (let z = -3200; z <= 3200; z += 40) { const h = heightAt(x, z); if (!best || h > best.h) best = { x, z, h }; }
    // nudge onto the west (windward) shoulder a little below the summit, and face west (into the wind), checking the run-out ahead is clear
    let hd = 3 * Math.PI / 2, okHd = null; for (const cand of [3 * Math.PI / 2, 3 * Math.PI / 2 - 0.4, 3 * Math.PI / 2 + 0.4, Math.PI, 0, Math.PI / 2]) { let clear = true;
      for (let d = 30; d <= 500; d += 20) if (heightAt(best.x + Math.sin(cand) * d, best.z - Math.cos(cand) * d) > best.h - 4 - d * 0.06) { clear = false; break; } if (clear) { okHd = cand; break; } }
    hd = okHd ?? hd; launch = { x: best.x, z: best.z, h: best.h, hd, y: best.h + 18 }; }
  // thermals: 3 near turbines (closest to the launch first) + 3 over warm, open, low ground; cores about +3 m/s
  const thermals = []; const farFromThermals = (x, z, d) => thermals.every(t => Math.hypot(t.x - x, t.z - z) > d);
  const turbSorted = [...landmarks.turbines].sort((a, b) => Math.hypot(a.x - launch.x, a.z - launch.z) - Math.hypot(b.x - launch.x, b.z - launch.z));
  for (const T of turbSorted) { if (thermals.length >= 3) break; const a = R2() * 6.28, x = T.x + Math.cos(a) * 150, z = T.z + Math.sin(a) * 150; if (!farFromThermals(x, z, 500)) continue;
    thermals.push({ x, z, r: 85 + R2() * 20, core: 2.9 + R2() * 0.5, base: Math.max(0, heightAt(x, z)), top: Math.max(0, heightAt(x, z)) + 620 + R2() * 120, kind: 'turbine' }); }
  for (let t = 0; t < 6000 && thermals.length < 6; t++) { const ang = R2() * 6.28, rad = 300 + R2() * 1700, x = launch.x + Math.cos(ang) * rad, z = launch.z + Math.sin(ang) * rad, h = heightAt(x, z);
    if (h < 12 || h > 140 || nearStation(x, z, 220) || !farFromThermals(x, z, 650)) continue;
    if (Math.abs(heightAt(x + 60, z) - h) > 12 || Math.abs(heightAt(x, z + 60) - h) > 12) continue; // open, fairly flat (sun-warmed fields)
    thermals.push({ x, z, r: 80 + R2() * 25, core: 2.8 + R2() * 0.6, base: h, top: h + 600 + R2() * 150, kind: 'field' }); }
  // vertical air speed (m/s) at a point: thermal columns (Gaussian core, faint sink ring outside) + ridge lift on windward slopes of the highest hills
  function liftAt(x, y, z) {
    let w = 0;
    for (const t of thermals) { const d = Math.hypot(x - t.x, z - t.z); if (d > t.r * 2.6) continue; const k = d / t.r, vert = smooth(t.base - 5, t.base + 40, y) * smooth(t.top + 60, t.top - 120, y);
      w += (t.core * Math.exp(-k * k * 1.6) - 0.35 * smooth(0.9, 1.5, k) * smooth(2.6, 1.9, k)) * vert; }
    let ridge = 0; for (const d of [0, 50, 100]) { const xs = x + d, g = heightAt(xs, z); if (g < 200) continue; ridge = Math.max(ridge, Math.min(0.7, Math.max(0, slopeX(xs, z))) * smooth(200, 260, g)); }
    if (ridge > 0) { const agl = y - heightAt(x, z); w += Math.min(2.6, WIND.speed * ridge) * smooth(260, 90, agl); }
    return w;
  }
  // thermal visuals: a faint tapered translucent column + slowly spiralling soft particles (shown only for the glider)
  const thermalGroup = new THREE.Group(); thermalGroup.visible = false; const thermalParts = [];
  { const cv = document.createElement('canvas'); cv.width = 8; cv.height = 128; const c2 = cv.getContext('2d'), gr = c2.createLinearGradient(0, 128, 0, 0);
    gr.addColorStop(0, 'rgba(255,240,215,0)'); gr.addColorStop(0.12, 'rgba(255,240,215,0.9)'); gr.addColorStop(0.7, 'rgba(255,248,235,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c2.fillStyle = gr; c2.fillRect(0, 0, 8, 128);
    const colTex = new THREE.CanvasTexture(cv); colTex.colorSpace = THREE.SRGBColorSpace;
    const pc = document.createElement('canvas'); pc.width = pc.height = 64; const p2 = pc.getContext('2d'), rg = p2.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(255,246,228,0.55)'); rg.addColorStop(1, 'rgba(255,240,220,0)'); p2.fillStyle = rg; p2.fillRect(0, 0, 64, 64);
    const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
    for (const t of thermals) { const H = t.top - t.base;
      for (const [rf, op] of [[0.42, 0.12], [0.3, 0.08]]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(t.r * rf * 1.4, t.r * rf, H, 28, 1, true), new THREE.MeshBasicMaterial({ map: colTex, color: 0xfff1dc, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
        col.position.set(t.x, t.base + H / 2, t.z); col.renderOrder = 2; thermalGroup.add(col); }
      const n = 240, pos = new Float32Array(n * 3), seeds = []; for (let i = 0; i < n; i++) seeds.push({ a: R2() * 6.28, r: Math.pow(R2(), 0.8) * t.r * 0.6, ph: R2(), w: 0.25 + R2() * 0.25 });
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: ptex, size: 4.5, sizeAttenuation: true, transparent: true, opacity: 0.6, depthWrite: false, color: 0xfff4e4 })); pts.frustumCulled = false; pts.renderOrder = 3;
      thermalGroup.add(pts); thermalParts.push({ t, pts, seeds, H }); }
    group.add(thermalGroup); }
  function updateThermals(time) { if (!thermalGroup.visible) return; for (const P of thermalParts) { const a = P.pts.geometry.attributes.position, t = P.t;
    for (let i = 0; i < P.seeds.length; i++) { const s = P.seeds[i], f = (s.ph + time * 0.012 * (0.6 + s.w)) % 1, y = t.base + 10 + f * (P.H - 30), ang = s.a + time * s.w * 0.6, rr = s.r * (0.8 + 0.45 * f);
      a.setXYZ(i, t.x + Math.cos(ang) * rr, y, t.z + Math.sin(ang) * rr); } a.needsUpdate = true; } }
  // launch marker: small wooden ramp + windsock pointing downwind
  { const g = new THREE.Group(), wood = new THREE.MeshLambertMaterial({ color: 0x8a5a36 }); g.position.set(launch.x, launch.h, launch.z); g.rotation.y = -launch.hd;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 18), wood); ramp.position.set(0, 0.6, 0); ramp.rotation.x = 0.06; g.add(ramp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd })); pole.position.set(6, 3.5, 0); g.add(pole); group.add(g);
    const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: ORANGE, side: THREE.DoubleSide })); sock.rotation.z = -Math.PI / 2; // tip points +X = downwind
    const sp = new THREE.Vector3(6, 6.6, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), -launch.hd); sock.position.set(launch.x + sp.x + 1.6, launch.h + sp.y, launch.z + sp.z); group.add(sock); }
  // ---- lagoon seaplane dock: the sheltered water closest to Lagoon Pad with a clear open-water takeoff run
  const lagoonSt = stations.find(st => /lagoon/i.test(st.name)) || stations[0];
  let dock = null; { let best = null;
    const deep = (x, z, r) => { for (let a = 0; a < 8; a++) if (heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) > -2) return false; return heightAt(x, z) < -2; };
    for (let r = 120; r < 1600 && !best; r += 30) for (let k = 0; k < 72; k++) { const a = k / 72 * 6.283, x = lagoonSt.padX + Math.cos(a) * r, z = lagoonSt.padZ + Math.sin(a) * r; if (!deep(x, z, 45)) continue;
      let bestHd = null, bestRun = 0; for (let h = 0; h < 16; h++) { const hd = h / 16 * 6.283; let run = 0; for (let d = 20; d <= 1400; d += 20) { if (heightAt(x + Math.sin(hd) * d, z - Math.cos(hd) * d) > -1) break; run = d; } if (run > bestRun) { bestRun = run; bestHd = hd; } }
      if (bestRun >= 900) { const c = r + (1400 - bestRun) * 0.2; if (!best || c < best.c) best = { x, z, hd: bestHd, c }; } }
    best = best || { x: lagoonSt.padX, z: lagoonSt.padZ + 600, hd: Math.PI };
    dock = { x: best.x, z: best.z, hd: best.hd, name: 'Lagoon Dock' };
    const s = Math.sin(dock.hd), c = Math.cos(dock.hd); // seaplane moors alongside: 10 m to the right of the pontoon, nose along the open-water heading
    dock.spawnX = dock.x + c * 11; dock.spawnZ = dock.z + s * 11; dock.chargeX = dock.spawnX; dock.chargeZ = dock.spawnZ;
    dock.anchor = { x: dock.x + 2.4 * c - 2 * s, y: 3.2, z: dock.z + 2.4 * s + 2 * c }; } // charger pylon on the pontoon (cable start)
  const dockGroup = new THREE.Group(); let dockBeacon = null;
  { const g = dockGroup; g.position.set(dock.x, 0, dock.z); g.rotation.y = -dock.hd;
    const deckM = new THREE.MeshLambertMaterial({ color: 0x9a6a40 }), floatM = new THREE.MeshLambertMaterial({ color: 0xe8e4da }), dark = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(7, 0.35, 34), deckM); deck.position.y = 0.75; g.add(deck);
    for (let z = -15; z <= 15; z += 3) { const pl = new THREE.Mesh(new THREE.BoxGeometry(7.1, 0.06, 0.12), new THREE.MeshLambertMaterial({ color: 0x6b4a2e })); pl.position.set(0, 0.95, z); g.add(pl); }
    for (const x of [-2.6, 2.6]) for (const z of [-12, 0, 12]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 10), floatM); f.rotation.x = Math.PI / 2; f.position.set(x, 0.25, z); g.add(f); }
    const edge = new THREE.MeshBasicMaterial({ color: ORANGE }); for (let z = -16; z <= 16; z += 8) for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), edge); l.position.set(sx * 3.5, 1.15, z); g.add(l); }
    for (const z of [-16.5, 16.5]) for (const x of [-3.2, 3.2]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.2, 6), deckM); post.position.set(x, 1.6, z); g.add(post); }
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4, 1.2), dark); pylon.position.set(2.4, 2.9, 2); g.add(pylon);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.3), new THREE.MeshBasicMaterial({ color: ORANGE })); glow.position.set(2.4, 4.6, 2); g.add(glow);
    // charge ring: opaque and drawn after the water (renderOrder 2) with a stronger depth pull than the water's (-2), so it
    // stays solid orange on top of the transparent water instead of being washed grey (1.0.7 fix). Sits 0.22 m up.
    // It is static (not on the bobbing / rolling pontoon, whose roll dipped the far side into the water), sits 0.3 m up and is
    // drawn in the transparent pass after the water (renderOrder 2 > 1) at full opacity, so the water can never wash it grey.
    const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 12.6, 64), new THREE.MeshBasicMaterial({ color: 0xffa531, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -6 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(dock.chargeX, 0.3, dock.chargeZ); ring.renderOrder = 2; group.add(ring);
    { // floating charging dock: solar canopy over the pontoon, a second float with two glowing posts and a kiosk
      const K = createKit(), L = createKit();
      for (const z of [-10, 0, 10]) for (const x of [-3.2, 3.2]) K.cyl(0.12, 0.12, 3.2, 6, x, 2.5, z, 0x3a3d42);
      K.box(7.6, 0.2, 26, 0, 4.15, 0, 0xdedbd2); K.box(7.7, 0.1, 26.1, 0, 4.0, 0, 0xf7931a);
      for (let x = -3.4; x < 3.3; x += 2.3) for (let z = -12.6; z < 12.6; z += 1.8) K.box(2.15, 0.05, 1.65, x + 1.1, 4.29, z + 0.9, 0x1c2c4a);
      L.box(5, 0.04, 0.2, 0, 3.94, -6, 0xfff0cf); L.box(5, 0.04, 0.2, 0, 3.94, 6, 0xfff0cf);
      K.box(3.2, 1.6, 2.6, -1.4, 1.75, -13.5, 0xe6e0d4); L.box(0.05, 0.8, 2, 0.21, 1.9, -13.5, 0xffd59a); K.box(3.4, 0.12, 2.8, -1.4, 2.6, -13.5, 0xf7931a);
      for (const z of [-6, 8]) { K.box(0.5, 2.2, 0.38, 3.0, 2.0, z, 0xeeeeea); L.box(0.03, 1.7, 0.1, 3.27, 2.0, z, 0xffa531); }
      const lit = K.mesh('lambert'), glow = L.mesh('basic'); g.add(lit, glow); }
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 700, 12, 1, true), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.set(2.4, 355, 2); g.add(beam); dockBeacon = { ring, beam, glow }; group.add(g); }
  const nearDock = (x, z, r = 22) => Math.hypot(x - dock.chargeX, z - dock.chargeZ) <= r;
  // trees as cylinders (crown radius, top height) on a 100 m grid
  const TG = new Map(), tkey = (i, j) => i * 100003 + j; for (const t of trees) { const k = tkey(Math.floor(t.x / 100), Math.floor(t.z / 100)); if (!TG.has(k)) TG.set(k, []); TG.get(k).push(t); }
  function treeHit(x, y, z, pad = 1) { const i = Math.floor(x / 100), j = Math.floor(z / 100);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const L = TG.get(tkey(i + a, j + b)); if (L) for (const t of L) if (y < t.top + pad && y > t.h - 2 && Math.hypot(x - t.x, z - t.z) < t.r + pad) return t; } return null; }
  // ---- minimap base image (north up)
  const mm = document.createElement('canvas'); mm.width = mm.height = 128; { const ctx = mm.getContext('2d'), img = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const h = heightAt((x / 128 - 0.5) * S * 0.85, (y / 128 - 0.5) * S * 0.85), k = (y * 128 + x) * 4;
      let c = h < 0.3 ? [24, 64, 92] : h < 3 ? [196, 178, 128] : h < 190 ? [62, 112, 54] : h < 300 ? [110, 104, 90] : [220, 224, 228]; img.data.set([...c, 255], k); }
    ctx.putImageData(img, 0, 0); }
  const MM_SPAN = S * 0.85;
  function update(t) { updateThermals(t); dockGroup.position.y = Math.sin(t * 1.1) * 0.08; dockGroup.rotation.z = Math.sin(t * 0.8) * 0.006;
    { const k = 0.5 + 0.5 * Math.sin(t * 2.4); dockBeacon.beam.material.opacity = 0.14 + 0.12 * k; dockBeacon.glow.material.color.setHSL(0.09, 1, 0.45 + 0.15 * k); }
    for (const s of spinners) s.rotation.z = t * 1.1; for (const b of beacons) { const k = 0.5 + 0.5 * Math.sin(t * 2.4); b.beam.material.opacity = 0.14 + 0.12 * k; b.glow.material.color.setHSL(0.09, 1, 0.45 + 0.15 * k); } }
  function inStation(x, z, margin = 0) { for (const st of stations) { const l = stationLocal(st, x, z); if (Math.abs(l.along) <= st.len / 2 + margin && Math.abs(l.side) <= st.wid / 2 + margin) return st; } return null; }
  function onPad(x, z, r = 13) { return stations.find(st => Math.hypot(x - st.padX, z - st.padZ) <= r) || null; }
  function chargeBay(x, z, r = 4.5) { for (const st of stations) { if (Math.abs(x - st.x) > 400 || Math.abs(z - st.z) > 400) continue; for (const b of st.bays) if (Math.hypot(x - b.x, z - b.z) <= r) return b; } return null; }
  function nearest(x, z) { let b = null, bd = 1e9; for (const st of stations) { const d = Math.hypot(x - st.padX, z - st.padZ); if (d < bd) { bd = d; b = st; } } return { st: b, d: bd }; }
  // Perf (cheap, big on Xbox): nothing in the world moves except the turbine hubs, the bobbing dock and the thermal
  // particles, so bake every other matrix once instead of recomposing ~900 of them each frame.
  group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  for (const live of [dockGroup, thermalGroup, ...spinners]) live.traverse((o) => { o.matrixAutoUpdate = true; });
  group.updateMatrixWorld(true);
  // Perf 1.0.8.1 (Flow): merge the static runway / pad / tower / lighthouse / marker pieces across the whole world (small
  // primitives, so one always-drawn mesh per look is cheaper than ~60 draws per station). Plaza kit meshes (vertex
  // colours) stay per station so off-screen plazas are still culled. The station beacons share one beam and one glow
  // material (they always animated in lockstep): glows merge, beams stay separate (transparent, keeps their sort order).
  { const beamM = beacons[0].beam.material, glowM = beacons[0].glow.material; for (const b of beacons) { if (b.beam.material !== beamM) b.beam.material.dispose(); if (b.glow.material !== glowM) b.glow.material.dispose(); b.beam.material = beamM; b.glow.material = glowM; }
    const keepLive = new Set([dockGroup, thermalGroup, ...spinners]);
    merged.world = mergeStatic(group, { skip: keepLive, byId: new Set([glowM]), vertexColors: false });
    merged.dock = mergeStatic(dockGroup, { skip: new Set([dockBeacon.glow, dockBeacon.beam]) });
    merged.hubs = spinners.map((h) => mergeStatic(h)); beacons.splice(1); } // all beacons share both materials: one update is enough
  return { group, merged, stations, landmarks, heightAt, groundAt, update, inStation, onPad, nearest, minimap: mm, MM_SPAN,
    trees, treeHit, wind: WIND, launch, thermals, liftAt, thermalGroup, dock, nearDock, lagoonStation: lagoonSt, chargeBay };
}

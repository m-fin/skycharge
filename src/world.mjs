// Open sky: no island, no terrain mesh, no water, no ground. Clouds, the sky dome, charge rings and
// sky beacons are the world. heightAt is the soft sky floor everywhere (finite, never a void).
import * as THREE from '../vendor/three.module.js';

export const S = 8000, N = 256, CELL = S / N, OCEAN_FLOOR = -60;
export const SKY_FLOOR = 0, SKY_CEILING = 2600;
const ORANGE = 0xf7931a;

function hash(i, j, seed) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 982451653)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

// Soft bounds: a NaN or a fall through the floor is pulled back into the sky. Never a crash.
export function keepInSky(pos) {
  if (!pos) return false;
  if (!isFinite(pos.x) || !isFinite(pos.y) || !isFinite(pos.z)) { pos.set(0, 120, 0); return true; }
  const r = Math.hypot(pos.x, pos.z);
  if (r > 7800) { const k = 7800 / r; pos.x *= k; pos.z *= k; }
  if (pos.y < SKY_FLOOR) pos.y = SKY_FLOOR;
  if (pos.y > SKY_CEILING) pos.y = SKY_CEILING;
  return false;
}

// Station rectangle helpers. heading hd: 0 = north (-Z), clockwise. The long axis is the charge-ring approach.
export function stationLocal(st, x, z) { const dx = x - st.x, dz = z - st.z, s = Math.sin(st.hd), c = Math.cos(st.hd); return { along: dx * s - dz * c, side: dx * c + dz * s }; }

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
  // Charge rings float on the soft sky floor. Positions are fixed: there is no land to fit them to.
  const HEADS = [0.15, 0.95, 2.15, 3.4, 4.7];
  const stations = STATION_SPOTS.map(([x, z, name], i) => ({ name, x, z, hd: HEADS[i], len: 360, wid: 36, h: SKY_FLOOR }));
  function heightAt() { return SKY_FLOOR; }
  const groundAt = () => ({ h: SKY_FLOOR, water: false, sky: true });

  const group = new THREE.Group();
  { // sky dome: open sky above and below, pale at the horizon, deeper blue toward the nadir (no ground)
    const g = new THREE.SphereGeometry(20000, 32, 16), m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3d7cc9) }, mid: { value: new THREE.Color(0x9fc8ec) }, bot: { value: new THREE.Color(0xdbe9f5) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 zenith = mix(mid, top, pow(min(max(h,0.)*2.2,1.),0.8)); vec3 below = mix(bot, mid, clamp(-h*1.6,0.,1.)); vec3 c = h > 0.02 ? zenith : h < -0.02 ? below : mix(below, zenith, (h+0.02)/0.04); gl_FragColor = vec4(c,1.); }' });
    const sky = new THREE.Mesh(g, m); sky.renderOrder = -1; sky.name = 'sky'; group.add(sky);
  }
  const R = rng(seed * 31 + 7);
  { // clouds (instanced puffs)
    const puffs = 60 * 6, im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc3ccd6, transparent: true, opacity: 0.92 }), puffs); const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    let n = 0; for (let c = 0; c < 60; c++) { const cx = (R() - 0.5) * 9000, cz = (R() - 0.5) * 9000, cy = 520 + R() * 260, sc = 30 + R() * 45;
      for (let p = 0; p < 6; p++) { const s = sc * (0.6 + R() * 0.6); m.compose(new THREE.Vector3(cx + (R() - 0.5) * sc * 3, cy + (R() - 0.3) * sc * 0.5, cz + (R() - 0.5) * sc * 1.6), q, new THREE.Vector3(s * 1.4, s * 0.6, s)); im.setMatrixAt(n++, m); } }
    group.add(im);
  }

  // Sky beacons stand in for the old lighthouse and turbines: points in the air, not structures on land.
  const landmarks = {
    lighthouse: { x: -2600, z: 2100, h: 160, top: 210 },
    turbines: [
      { x: 2400, z: -2200, h: 140, top: 230 },
      { x: 2600, z: 400, h: 100, top: 190 },
      { x: -2400, z: -2500, h: 180, top: 270 },
      { x: 800, z: 2700, h: 90, top: 180 },
      { x: -1800, z: 2700, h: 120, top: 210 },
      { x: 2700, z: 1800, h: 150, top: 240 },
      { x: -2700, z: -600, h: 110, top: 200 },
    ],
  };
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, side: THREE.DoubleSide });
  const lh = landmarks.lighthouse;
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(18, 1.1, 8, 28), markMat); ring.position.set(lh.x, lh.top, lh.z); group.add(ring); }
  for (const T of landmarks.turbines) { const ring = new THREE.Mesh(new THREE.TorusGeometry(14, 0.9, 8, 24), markMat); ring.position.set(T.x, T.top - 20, T.z); group.add(ring); }

  // Logical bays (hover spawn + charge cable) without a plaza or any ground slab.
  const PZ = { postX: 33, bayX: 39.5, z0: 86, dz: 8, n: 7, ai: [1, 4, 6], spawnBay: 3 };
  const toWorld = (st, lx, lz) => { const s = Math.sin(st.hd), c = Math.cos(st.hd); return { x: st.x + lx * c - lz * s, z: st.z + lx * s + lz * c }; };
  function placeBays(st) {
    st.bays = [];
    for (let i = 0; i < PZ.n; i++) { if (PZ.ai.includes(i)) continue; const z = PZ.z0 + i * PZ.dz, b = toWorld(st, PZ.bayX, z), a = toWorld(st, PZ.postX + 0.3, z);
      st.bays.push({ x: b.x, z: b.z, ax: a.x, ay: st.h + 0.12 + 1.0, az: a.z, i }); }
    const sb = st.bays.find((b) => b.i === PZ.spawnBay) || st.bays[0];
    st.hoverSpawn = { x: sb.x, z: sb.z, hd: st.hd + Math.PI / 2 };
    const py = toWorld(st, st.wid / 2 + 6, st.len / 2 - 28);
    st.pylon = { x: py.x, y: st.h + 0.12 + 3.6, z: py.z };
  }
  const beacons = [], beamMat = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), glowMat = new THREE.MeshBasicMaterial({ color: ORANGE });
  const bolt = new THREE.Shape([[1.5, 7], [-3.5, -0.8], [0, -0.8], [-1.5, -7], [3.5, 0.8], [0, 0.8]].map((p) => new THREE.Vector2(...p)));
  for (const st of stations) {
    const g = new THREE.Group(); g.position.set(st.x, st.h + 0.12, st.z); g.rotation.y = -st.hd;
    const padZ = st.len / 2 - 28;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshBasicMaterial({ color: 0x3a2405 })); disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.16, padZ); g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(11.2, 13, 48), new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.2, padZ); g.add(ring);
    const bm = new THREE.Mesh(new THREE.ShapeGeometry(bolt), new THREE.MeshBasicMaterial({ color: ORANGE, side: THREE.DoubleSide })); bm.rotation.x = -Math.PI / 2; bm.position.set(0, 0.24, padZ); g.add(bm);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 5, 1.4), new THREE.MeshLambertMaterial({ color: 0x111111 })); pylon.position.set(st.wid / 2 + 6, 2.6, padZ); g.add(pylon);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 1.5), glowMat); glow.position.set(st.wid / 2 + 6, 4.3, padZ); g.add(glow);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 700, 12, 1, true), beamMat); beam.position.set(st.wid / 2 + 6, 356, padZ); g.add(beam);
    beacons.push({ ring, beam, glow }); placeBays(st);
    const s = Math.sin(st.hd), c = Math.cos(st.hd), back = -(st.len / 2 - 28); st.padX = st.x + back * s; st.padZ = st.z - back * c;
    const sp = -(st.len / 2 - 34); st.spawnX = st.x + sp * s; st.spawnZ = st.z - sp * c; group.add(g);
  }

  // Thermals live in open sky (no ridges, no hills). Three sit near sky beacons, three farther out.
  const R2 = rng(seed * 53 + 11), WIND = { x: 1, z: 0, speed: 7 };
  const launch = { x: 200, z: -3200, h: 560, hd: Math.PI, y: 578 };
  const thermals = []; const farFromThermals = (x, z, d) => thermals.every((t) => Math.hypot(t.x - x, t.z - z) > d);
  for (let i = 0; i < 3; i++) { const T = landmarks.turbines[i], a = R2() * 6.28, x = T.x + Math.cos(a) * 150, z = T.z + Math.sin(a) * 150;
    if (!farFromThermals(x, z, 500)) continue;
    thermals.push({ x, z, r: 85 + R2() * 20, core: 2.9 + R2() * 0.5, base: 80, top: 820 + R2() * 80, kind: 'turbine' }); }
  for (let i = 0; i < 3; i++) { const ang = (i / 3) * 6.283 + R2() * 0.4, rad = 3000 + R2() * 500, x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
    thermals.push({ x, z, r: 80 + R2() * 25, core: 2.8 + R2() * 0.6, base: 60, top: 760 + R2() * 80, kind: 'field' }); }
  function liftAt(x, y, z) {
    let w = 0;
    for (const t of thermals) { const d = Math.hypot(x - t.x, z - t.z); if (d > t.r * 2.6) continue; const k = d / t.r, vert = smooth(t.base - 5, t.base + 40, y) * smooth(t.top + 60, t.top - 120, y);
      w += (t.core * Math.exp(-k * k * 1.6) - 0.35 * smooth(0.9, 1.5, k) * smooth(2.6, 1.9, k)) * vert; }
    return w;
  }
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
  { const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 10, 1, true), new THREE.MeshLambertMaterial({ color: ORANGE, side: THREE.DoubleSide })); sock.position.set(launch.x + 6, launch.y, launch.z); sock.rotation.z = -Math.PI / 2; group.add(sock); }

  // Floating charge ring where the lagoon dock used to sit. No pontoon, no water.
  const lagoonSt = stations.find((st) => /lagoon/i.test(st.name)) || stations[0];
  const dock = { x: lagoonSt.x + 520, z: lagoonSt.z - 80, hd: 0.6, name: 'Lagoon Dock' };
  { const s = Math.sin(dock.hd), c = Math.cos(dock.hd);
    dock.spawnX = dock.x + c * 11; dock.spawnZ = dock.z + s * 11; dock.chargeX = dock.spawnX; dock.chargeZ = dock.spawnZ;
    dock.anchor = { x: dock.x + 2.4 * c - 2 * s, y: 3.2, z: dock.z + 2.4 * s + 2 * c }; }
  const dockGroup = new THREE.Group(); dockGroup.position.set(dock.x, 0, dock.z); dockGroup.rotation.y = -dock.hd;
  const dockBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 700, 12, 1, true), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.22, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  dockBeam.position.set(2.4, 355, 2); dockGroup.add(dockBeam);
  const dockGlow = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 1.3), new THREE.MeshBasicMaterial({ color: ORANGE })); dockGlow.position.set(2.4, 4.6, 2); dockGroup.add(dockGlow);
  const dockPylon = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4, 1.2), new THREE.MeshLambertMaterial({ color: 0x111111 })); dockPylon.position.set(2.4, 2.9, 2); dockGroup.add(dockPylon);
  const dockBeacon = { beam: dockBeam, glow: dockGlow };
  const ring = new THREE.Mesh(new THREE.RingGeometry(11.6, 12.6, 64), new THREE.MeshBasicMaterial({ color: 0xffa531, side: THREE.DoubleSide, transparent: true, opacity: 1, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(dock.chargeX, 0.35, dock.chargeZ); ring.renderOrder = 2; ring.name = 'dock-ring'; group.add(ring); group.add(dockGroup);
  const nearDock = (x, z, r = 22) => Math.hypot(x - dock.chargeX, z - dock.chargeZ) <= r;
  const trees = [];
  function treeHit() { return null; }

  // Minimap is sky, not a land heightmap: pale blue with a few cloud specks. Stations are drawn by the HUD.
  const mm = document.createElement('canvas'); mm.width = mm.height = 128; { const ctx = mm.getContext('2d'), img = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) { const k = (y * 128 + x) * 4, haze = 0.55 + 0.35 * (1 - Math.min(1, Math.hypot(x - 64, y - 64) / 70));
      let r = 140 + haze * 80, g = 186 + haze * 40, b = 214 + haze * 30; if (hash(x, y, seed + 3) > 0.93) { r = 236; g = 242; b = 248; } img.data.set([r, g, b, 255], k); }
    ctx.putImageData(img, 0, 0); }
  const MM_SPAN = S * 0.85;
  function update(t) { updateThermals(t); dockGroup.position.y = Math.sin(t * 1.1) * 0.35; dockGroup.rotation.z = Math.sin(t * 0.7) * 0.01;
    { const k = 0.5 + 0.5 * Math.sin(t * 2.4); dockBeacon.beam.material.opacity = 0.14 + 0.12 * k; dockBeacon.glow.material.color.setHSL(0.09, 1, 0.45 + 0.15 * k); }
    for (const b of beacons) { const k = 0.5 + 0.5 * Math.sin(t * 2.4); b.beam.material.opacity = 0.14 + 0.12 * k; b.glow.material.color.setHSL(0.09, 1, 0.45 + 0.15 * k); } }
  function inStation(x, z, margin = 0) { for (const st of stations) { const l = stationLocal(st, x, z); if (Math.abs(l.along) <= st.len / 2 + margin && Math.abs(l.side) <= st.wid / 2 + margin) return st; } return null; }
  function onPad(x, z, r = 13) { return stations.find((st) => Math.hypot(x - st.padX, z - st.padZ) <= r) || null; }
  function chargeBay(x, z, r = 4.5) { for (const st of stations) { if (Math.abs(x - st.x) > 400 || Math.abs(z - st.z) > 400) continue; for (const b of st.bays) if (Math.hypot(x - b.x, z - b.z) <= r) return b; } return null; }
  function nearest(x, z) { let b = null, bd = 1e9; for (const st of stations) { const d = Math.hypot(x - st.padX, z - st.padZ); if (d < bd) { bd = d; b = st; } } return { st: b, d: bd }; }
  group.traverse((o) => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  for (const live of [dockGroup, thermalGroup]) live.traverse((o) => { o.matrixAutoUpdate = true; });
  group.updateMatrixWorld(true);
  const merged = {};
  { const keepLive = new Set([dockGroup, thermalGroup]);
    merged.world = mergeStatic(group, { skip: keepLive, byId: new Set([glowMat]), vertexColors: false });
    merged.dock = mergeStatic(dockGroup, { skip: new Set([dockGlow, dockBeam]) });
    merged.hubs = []; beacons.splice(1); }
  return { group, merged, stations, landmarks, heightAt, groundAt, update, inStation, onPad, nearest, minimap: mm, MM_SPAN,
    trees, treeHit, wind: WIND, launch, thermals, liftAt, thermalGroup, dock, nearDock, lagoonStation: lagoonSt, chargeBay,
    openSky: true, skyFloor: SKY_FLOOR };
}

// SKYCHARGE weather (1.0.8): always daytime. Four moods that blend smoothly into each other:
//   clear (bright clear) · cloudy (breezy, big cumulus, sun shafts) · rain (showers under specific dark clouds) · fog (valley mist)
// Everything is a handful of draw calls and WebGL1 / three r162-safe:
//   cumulus  : one InstancedMesh of puffs (layered under the old high cloud deck), fly-through = white-out fog
//   wisps    : one big textured plane high up, drifting
//   shadows  : the terrain material samples a small canvas of blobs drawn from the real cloud positions (offset along the sun)
//   shafts   : one additive InstancedMesh of slanted light quads under cloud edges
//   showers  : one InstancedMesh of open cylinders with a scrolling streak texture under the shower clouds, + camera rain lines
//   mist     : three flat soft planes at valley height (hills occlude them, so the mist pools in the low ground)
//   breeze   : wind drifts all of the above; createWeather().wind is also used by main for a gentle push on blimp / glider
import * as THREE from '../vendor/three.module.js';

export const WEATHERS = ['clear', 'cloudy', 'rain', 'fog'];
const P = {
  clear:  { cover: 0.32, wisp: 0.6, shadow: 0.32, shaft: 0.35, rain: 0, mist: 0,    breeze: 0.25, fogN: 1600, fogF: 9000, fog: 0xcfe2f2, sun: 2.6, hemi: 1.5,  top: 0x3d7cc9, mid: 0x9fc8ec, dark: 0 },
  cloudy: { cover: 0.85, wisp: 0.85, shadow: 0.55, shaft: 0.9, rain: 0.12, mist: 0, breeze: 1,    fogN: 1400, fogF: 8000, fog: 0xd3dde6, sun: 2.2, hemi: 1.45, top: 0x5185c2, mid: 0xb1cbe2, dark: 0.15 },
  rain:   { cover: 1,    wisp: 0.25, shadow: 0.62, shaft: 0.3, rain: 1,    mist: 0.3,  breeze: 0.6,  fogN: 800,  fogF: 5200, fog: 0xb7c3cf, sun: 1.5, hemi: 1.3,  top: 0x6b86a6, mid: 0xb4c2d0, dark: 0.55 },
  fog:    { cover: 0.42, wisp: 0.45, shadow: 0.22, shaft: 0.65, rain: 0,   mist: 1,    breeze: 0.1,  fogN: 450,  fogF: 3400, fog: 0xdfe6ec, sun: 2.25, hemi: 1.6, top: 0x5d8fc6, mid: 0xc9dbea, dark: 0 },
};
const NUM = ['cover', 'wisp', 'shadow', 'shaft', 'rain', 'mist', 'breeze', 'fogN', 'fogF', 'sun', 'hemi', 'dark'], COL = ['fog', 'top', 'mid'];
const NC = 40, PUFF = 9, TILE = 7200, SHOW = 6, SHAFTS = 8, SPAN = 4800, SUN = new THREE.Vector3(0.55, 0.8, 0.25).normalize();

function rng(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function canvasTex(n, draw, wrap) { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createWeather({ scene, world, sun, hemi, camera, seed = 1, start = 'clear', auto = true }) {
  const R = rng(seed * 7919 + 3), cur = {}, tgt = {};
  const setT = (o, name) => { const p = P[name]; for (const k of NUM) o[k] = p[k]; for (const k of COL) o[k] = (o[k] || new THREE.Color()).set(p[k]); };
  setT(cur, start); setT(tgt, start);
  const W = { name: start, auto, held: false, nextAt: 150 + R() * 110, t: 0, wind: new THREE.Vector3(), windDir: R() * Math.PI * 2, drift: new THREE.Vector2(),
    inCloud: 0, rainHere: 0, cur, clouds: [], showers: [], group: new THREE.Group() };
  W.group.name = 'weather'; scene.add(W.group);

  // ---- cumulus: NC clouds of PUFF puffs, flat-ish bottoms, wrapped around the player in a TILE square, drifting with the wind
  for (let i = 0; i < NC; i++) { const s = 48 + R() * 62, base = 250 + R() * 190, puffs = [];
    for (let p = 0; p < PUFF; p++) { const a = R() * Math.PI * 2, r = R() * 1.3; puffs.push([Math.cos(a) * r * s * 1.2, (0.35 + R() * 0.7) * s * (1 - r * 0.35), Math.sin(a) * r * s * 0.8, s * (0.55 + R() * 0.5)]); }
    W.clouds.push({ i, x: (R() - 0.5) * TILE, z: (R() - 0.5) * TILE, base, s, rank: R(), shower: i % 5 === 0, puffs, k: 0, wx: 0, wz: 0 }); }
  const cumMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xb9c4d0, transparent: true, opacity: 0.94 }), emBright = new THREE.Color(0xb9c4d0), emDark = new THREE.Color(0x4f5761);
  const cum = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cumMat, NC * PUFF); cum.name = 'cumulus';
  cum.instanceMatrix.setUsage(THREE.DynamicDrawUsage); cum.frustumCulled = false; W.group.add(cum);
  const white = new THREE.Color(1, 1, 1), grey = new THREE.Color(0.52, 0.56, 0.62); for (let i = 0; i < NC * PUFF; i++) cum.setColorAt(i, white);

  // ---- high wisps
  const wispTex = canvasTex(512, (c, n) => { c.clearRect(0, 0, n, n); for (let i = 0; i < 26; i++) { const x = R() * n, y = R() * n, l = 90 + R() * 200, w = 3 + R() * 9;
    const g = c.createLinearGradient(x, y, x + l, y + l * 0.15); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.18 + R() * 0.25})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.strokeStyle = g; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + l * 0.5, y - 10 + R() * 20, x + l, y + l * 0.15); c.stroke(); } }, true);
  wispTex.repeat.set(4, 4);
  const wisp = new THREE.Mesh(new THREE.PlaneGeometry(36000, 36000), new THREE.MeshBasicMaterial({ map: wispTex, transparent: true, opacity: 0.5, depthWrite: false, fog: true, side: THREE.DoubleSide }));
  wisp.rotation.x = -Math.PI / 2; wisp.position.y = 2200; wisp.renderOrder = -0.5; wisp.name = 'wisps'; W.group.add(wisp);

  // ---- cloud shadows on the terrain (canvas of blobs drawn from cloud positions, re-drawn every 0.5 s, slid by the wind between)
  const shC = document.createElement('canvas'); shC.width = shC.height = 256; const shX = shC.getContext('2d');
  const shTex = new THREE.CanvasTexture(shC); shTex.minFilter = THREE.LinearFilter; shTex.generateMipmaps = false;
  const csU = { csTex: { value: shTex }, csOrigin: { value: new THREE.Vector2() }, csScale: { value: 1 / SPAN }, csStr: { value: 0 } };
  const terrain = world.group.getObjectByName('terrain');
  const shade = (m) => { m.onBeforeCompile = (sh) => { Object.assign(sh.uniforms, csU);
    sh.vertexShader = 'varying vec2 vCsW;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vCsW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'uniform sampler2D csTex; uniform vec2 csOrigin; uniform float csScale; uniform float csStr; varying vec2 vCsW;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
      '{ vec2 cuv = (vCsW - csOrigin) * csScale; float cs = (cuv.x > 0.0 && cuv.x < 1.0 && cuv.y > 0.0 && cuv.y < 1.0) ? texture2D(csTex, cuv).a : 0.0; gl_FragColor.rgb *= 1.0 - csStr * cs; }\n#include <fog_fragment>'); };
    m.customProgramCacheKey = () => 'cloudshadow'; m.needsUpdate = true; };
  if (terrain) shade(terrain.material);
  let shCenter = new THREE.Vector2(), shDrift = new THREE.Vector2();
  function drawShadows(px, pz) {
    shX.clearRect(0, 0, 256, 256); shCenter.set(px, pz); shDrift.set(0, 0); const k = 256 / SPAN;
    for (const c of W.clouds) { if (c.k < 0.05) continue; const off = c.base / SUN.y, sx = (c.wx - SUN.x * off - px + SPAN / 2) * k, sz = (c.wz - SUN.z * off - pz + SPAN / 2) * k, r = c.s * 1.7 * k * c.k;
      const g = shX.createRadialGradient(sx, sz, 0, sx, sz, r); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.6, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); shX.fillStyle = g; shX.fillRect(sx - r, sz - r, 2 * r, 2 * r); }
    shTex.needsUpdate = true; }

  // ---- sun shafts (additive slanted quads; instance colour = brightness)
  const shaftTex = canvasTex(64, (c, n) => { const g = c.createLinearGradient(0, 0, 0, n); g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(0.12, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, n, n);
    const h = c.createLinearGradient(0, 0, n, 0); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = h; c.fillRect(0, 0, n, n); });
  const shafts = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shaftTex, color: 0xfff1cc, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }), SHAFTS);
  shafts.name = 'sunshafts'; shafts.frustumCulled = false; shafts.instanceMatrix.setUsage(THREE.DynamicDrawUsage); W.group.add(shafts); for (let i = 0; i < SHAFTS; i++) shafts.setColorAt(i, new THREE.Color(0, 0, 0));

  // ---- showers: streak cylinders under the shower clouds + camera rain
  // shower curtain: grey veil, denser near the cloud, fading to the ground, with streaks (wraps horizontally only)
  const streakTex = canvasTex(64, (c, n) => { c.clearRect(0, 0, n, n); const g = c.createLinearGradient(0, 0, 0, n); g.addColorStop(0, 'rgba(150,160,175,0.55)'); g.addColorStop(0.7, 'rgba(160,170,185,0.32)'); g.addColorStop(1, 'rgba(170,180,195,0.04)');
    c.fillStyle = g; c.fillRect(0, 0, n, n); for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(200,210,224,${0.2 + R() * 0.4})`; c.fillRect(Math.floor(R() * n), R() * n * 0.8, 1, 10 + R() * 24); } }, false);
  streakTex.wrapS = THREE.RepeatWrapping; streakTex.repeat.set(6, 1);
  const showerMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.15, 1, 14, 1, true), new THREE.MeshBasicMaterial({ map: streakTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, color: 0xc4ced8 }), SHOW);
  showerMesh.name = 'showers'; showerMesh.frustumCulled = false; showerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); W.group.add(showerMesh);
  const NR = 700, rp = new Float32Array(NR * 6); for (let i = 0; i < NR; i++) { const x = R() * 70, y = Math.floor(R() * 50), z = R() * 70; rp.set([x, y, z, x, y + 0.75, z], i * 6); }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rainU = { t: { value: 0 }, cam: { value: new THREE.Vector3() }, amt: { value: 0 }, slant: { value: new THREE.Vector2() } };
  const rainLines = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: rainU, transparent: true, depthWrite: false, fog: false,
    vertexShader: 'uniform float t; uniform vec3 cam; uniform vec2 slant; varying float vA; void main(){ vec3 p = position;\n' +
      ' float top = mod(floor(p.y) - t * 24.0, 50.0); float isTip = step(0.5, p.y - floor(p.y));\n vec3 w = vec3(mod(p.x - cam.x, 70.0) - 35.0, top - 25.0 + isTip * 1.4, mod(p.z - cam.z, 70.0) - 35.0);\n' +
      ' w.xz += slant * (isTip * 1.4); vA = 0.55 - isTip * 0.35; gl_Position = projectionMatrix * viewMatrix * vec4(cam + w, 1.0); }',
    fragmentShader: 'uniform float amt; varying float vA; void main(){ gl_FragColor = vec4(0.82, 0.86, 0.92, vA * amt); }' }));
  rainLines.frustumCulled = false; rainLines.name = 'rainlines'; rainLines.visible = false; W.group.add(rainLines);

  // ---- valley mist
  const mistTex = canvasTex(256, (c, n) => { c.clearRect(0, 0, n, n); for (let i = 0; i < 90; i++) { const x = R() * n, y = R() * n, r = 18 + R() * 50;
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) { const g = c.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r); } } }, true);
  mistTex.repeat.set(9, 9); const mists = [];
  for (const [y, op] of [[10, 0.9], [22, 0.75], [36, 0.55]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshBasicMaterial({ map: mistTex, color: 0xf4f7fa, transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; m.userData.op = op; m.userData.y = y; m.renderOrder = 3; m.name = 'mist'; m.visible = false; W.group.add(m); mists.push(m); }

  const sky = world.group.getObjectByName('sky'), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), tmpC = new THREE.Color();
  const fogBase = new THREE.Color(), whiteFog = new THREE.Color(0xf2f5f8);
  let refreshT = 0, frame = 0, mistBase = 0;
  const valleyFloor = (x, z) => { const hs = []; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) { const h = world.heightAt(x + i * 400, z + j * 400); if (h > 2) hs.push(h); } if (hs.length < 5) return 0; hs.sort((a, b) => a - b); return hs[Math.floor(hs.length * 0.3)]; };

  function layoutClouds(px, pz, dt) {
    let n = 0; const vis = W.cur.cover;
    for (const c of W.clouds) {
      c.x += W.wind.x * dt; c.z += W.wind.z * dt; // drift, then wrap into the TILE around the player
      c.wx = px + ((((c.x - px) % TILE) + TILE * 1.5) % TILE) - TILE / 2; c.wz = pz + ((((c.z - pz) % TILE) + TILE * 1.5) % TILE) - TILE / 2;
      const want = c.rank < vis ? 1 : 0; c.k += (want - c.k) * Math.min(1, dt * 0.35); // clouds grow / dissolve over a few seconds
      const dark = c.shower ? W.cur.dark + W.cur.rain * 0.35 : W.cur.dark * 0.5;
      for (const p of c.puffs) { const s = p[3] * Math.max(0.0001, c.k); v.set(c.wx + p[0], c.base + p[1] * c.k, c.wz + p[2]); sc.set(s * 1.25, s * 0.72, s); m4.compose(v, q, sc); cum.setMatrixAt(n, m4);
        cum.setColorAt(n, tmpC.copy(white).lerp(grey, Math.min(1, dark) * (p[1] < c.s * 0.6 ? 1 : 0.55))); n++; }
    }
    cum.instanceMatrix.needsUpdate = true; if (cum.instanceColor) cum.instanceColor.needsUpdate = true;
    cumMat.emissive.copy(emBright).lerp(emDark, Math.min(1, W.cur.dark)); // grey rain days: emissive is not tinted per instance, so dim it for all
  }
  function placeShowersAndShafts(cam) {
    // showers: the nearest visible shower clouds (only these rain), radius ~ the cloud
    const cand = W.clouds.filter((c) => c.shower && c.k > 0.3).sort((a, b) => Math.hypot(a.wx - cam.x, a.wz - cam.z) - Math.hypot(b.wx - cam.x, b.wz - cam.z));
    const nShow = Math.round(Math.min(SHOW, W.cur.rain * SHOW + (W.cur.rain > 0.05 ? 1 : 0))); W.showers.length = 0;
    for (let i = 0; i < SHOW; i++) { const c = cand[i]; if (c && i < nShow) { const r = c.s * 1.25 * c.k, h = c.base + 4, g = world.heightAt(c.wx, c.wz);
        const top = c.base + 6, bot = Math.max(0, g) - 2, hh = top - bot; m4.compose(v.set(c.wx, bot + hh / 2, c.wz), q, sc.set(r, hh, r)); W.showers.push({ x: c.wx, z: c.wz, r, top: h });
      } else m4.compose(v.set(0, -999, 0), q, sc.set(0.001, 0.001, 0.001)); showerMesh.setMatrixAt(i, m4); }
    showerMesh.instanceMatrix.needsUpdate = true; showerMesh.material.opacity = 0.8 * Math.min(1, W.cur.rain * 1.5 + 0.2) * (1 - 0.75 * W.rainHere); // from inside, the camera rain carries it
    // shafts: under the edges of visible clouds near the camera, on the sun side
    const near = W.clouds.filter((c) => c.k > 0.5 && Math.hypot(c.wx - cam.x, c.wz - cam.z) < 2200).sort((a, b) => a.rank - b.rank);
    const zc = new THREE.Vector3(), xa = new THREE.Vector3();
    for (let i = 0; i < SHAFTS; i++) { const c = near[i % Math.max(1, near.length)], on = c && i < near.length * 2 && W.cur.shaft > 0.05;
      if (!on) { shafts.setColorAt(i, tmpC.setRGB(0, 0, 0)); m4.compose(v.set(0, -999, 0), q, sc.set(0.001, 0.001, 0.001)); shafts.setMatrixAt(i, m4); continue; }
      const len = Math.max(80, c.base - Math.max(0, world.heightAt(c.wx, c.wz))), side = (i % 2 ? 1 : -1) * c.s * 1.1, mid = v.set(c.wx + side * 0.6, c.base - 4, c.wz + side * 0.3).addScaledVector(SUN, -len / 2);
      zc.copy(cam).sub(mid); zc.addScaledVector(SUN, -zc.dot(SUN)).normalize(); xa.crossVectors(SUN, zc).normalize(); m4.makeBasis(xa, SUN, zc); m4.scale(sc.set(c.s * (0.9 + (i % 3) * 0.35), len, 1)); m4.setPosition(mid);
      shafts.setMatrixAt(i, m4); const b = 0.07 * W.cur.shaft * (1 - W.cur.rain * 0.6); shafts.setColorAt(i, tmpC.setRGB(b, b * 0.95, b * 0.82)); }
    shafts.instanceMatrix.needsUpdate = true; if (shafts.instanceColor) shafts.instanceColor.needsUpdate = true;
  }

  W.set = (name, { hold = true, instant = false } = {}) => { if (!P[name]) return false; W.name = name; setT(tgt, name); if (instant) setT(cur, name); if (hold) W.held = true; W.nextAt = W.t + 150 + R() * 110; return true; };
  W.update = (dt, playerPos) => {
    W.t += dt; frame++;
    if (W.auto && !W.held && W.t > W.nextAt) { let n = W.name; while (n === W.name) n = WEATHERS[Math.floor(R() * WEATHERS.length)]; W.set(n, { hold: false }); }
    const a = Math.min(1, dt / 7); // visuals blend over ~7 s
    for (const k of NUM) cur[k] += (tgt[k] - cur[k]) * a; for (const k of COL) cur[k].lerp(tgt[k], a);
    W.windDir += dt * 0.01; const ws = 2 + cur.breeze * 10; W.wind.set(Math.cos(W.windDir) * ws, 0, Math.sin(W.windDir) * ws);
    const cam = camera.position, px = playerPos ? playerPos.x : cam.x, pz = playerPos ? playerPos.z : cam.z;
    layoutClouds(px, pz, dt);
    refreshT -= dt; if (refreshT <= 0) { refreshT = 0.5; drawShadows(px, pz); placeShowersAndShafts(cam); if (cur.mist > 0.02) mistBase += (valleyFloor(cam.x, cam.z) - mistBase) * (frame < 3 ? 1 : 0.25); }
    shDrift.x += W.wind.x * dt; shDrift.y += W.wind.z * dt; csU.csOrigin.value.set(shCenter.x - SPAN / 2 + shDrift.x, shCenter.y - SPAN / 2 + shDrift.y); csU.csStr.value = cur.shadow * 0.6;
    // wisps + mist drift
    wisp.position.x = cam.x; wisp.position.z = cam.z; wispTex.offset.set((cam.x + W.t * W.wind.x * 3) / 36000 * 4, -(cam.z + W.t * W.wind.z * 3) / 36000 * 4); wisp.material.opacity = 0.45 * cur.wisp; wisp.visible = cur.wisp > 0.02;
    for (const m of mists) { m.position.x = Math.round(cam.x / 1000) * 1000; m.position.z = Math.round(cam.z / 1000) * 1000; m.position.y = mistBase + m.userData.y; m.material.opacity = cur.mist * m.userData.op;
      m.visible = cur.mist > 0.02; mistTex.offset.set((W.t * W.wind.x * 0.4 + m.position.x) / 1000, (-W.t * W.wind.z * 0.4 - m.position.z) / 1000); }
    // fly-through: inside a cloud ellipsoid -> white-out fog
    let inC = 0; for (const c of W.clouds) { if (c.k < 0.3) continue; const dx = (cam.x - c.wx) / (c.s * 1.9 * c.k), dy = (cam.y - (c.base + c.s * 0.45 * c.k)) / (c.s * 0.75 * c.k), dz = (cam.z - c.wz) / (c.s * 1.5 * c.k);
      const d = dx * dx + dy * dy + dz * dz; if (d < 1) inC = Math.max(inC, Math.min(1, (1 - d) * 2.5)); }
    W.inCloud += (inC - W.inCloud) * Math.min(1, dt * 3);
    // rain where the camera is under a shower (+ light drizzle anywhere when it's a rain day)
    let under = 0; for (const s of W.showers) { const d = Math.hypot(cam.x - s.x, cam.z - s.z) / s.r; if (d < 1.15 && cam.y < s.top) under = Math.max(under, Math.min(1, (1.15 - d) * 4)); }
    W.rainHere += (Math.max(under, cur.rain * 0.18) - W.rainHere) * Math.min(1, dt * 1.5);
    rainU.t.value = W.t; rainU.cam.value.copy(cam); rainU.amt.value = W.rainHere; rainU.slant.value.set(-W.wind.x * 0.03, -W.wind.z * 0.03); rainLines.visible = W.rainHere > 0.03;
    streakTex.offset.x = (W.t * 0.004 * (1 + cur.breeze)) % 1; // the veil drifts; the camera rain lines carry the falling motion up close
    // light, fog, sky
    const shadeK = 1 - 0.18 * W.rainHere; sun.intensity = cur.sun * shadeK; hemi.intensity = cur.hemi * (1 - 0.1 * W.rainHere);
    fogBase.copy(cur.fog); scene.fog.color.copy(fogBase).lerp(whiteFog, W.inCloud);
    scene.fog.near = cur.fogN * (1 - W.inCloud) + 4 * W.inCloud; scene.fog.far = cur.fogF * (1 - W.inCloud) + 150 * W.inCloud;
    if (sky && sky.material.uniforms) { sky.material.uniforms.top.value.copy(cur.top); sky.material.uniforms.mid.value.copy(cur.mid); sky.material.uniforms.bot.value.copy(cur.fog); }
  };
  W.info = () => ({ name: W.name, held: W.held, cover: +cur.cover.toFixed(2), rain: +cur.rain.toFixed(2), mist: +cur.mist.toFixed(2), breeze: +cur.breeze.toFixed(2), wind: +W.wind.length().toFixed(1),
    inCloud: +W.inCloud.toFixed(2), rainHere: +W.rainHere.toFixed(2), showers: W.showers.length, visibleClouds: W.clouds.filter((c) => c.k > 0.5).length, fogFar: Math.round(scene.fog.far) });
  W.update(0.016, null); drawShadows(camera.position.x, camera.position.z);
  return W;
}

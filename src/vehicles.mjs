// Vehicles: electric plane, blimp, hang glider, electric seaplane. Meshes face -Z (forward), +Y up, +X right.
// Input: { pitch (+ = nose up), roll (+ = right), yaw (+ = right), up (0..1), down (0..1) }.
import * as THREE from '../vendor/three.module.js';
const ORANGE = 0xf7931a, G = 9.8;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
export const MODS = { drain: 1, charge: 1 }; // upgrades: battery pack lowers drain, fast charger raises charge rate
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const PLANE = { name: 'E-PLANE', gear: 1.7, stall: 24, rotate: 27, maxThrust: 15, drainIdle: 0.04, drainThr: 0.45 };
export const BLIMP = { name: 'BLIMP', clear: 9.5, maxSpeed: 13, drainIdle: 0.03, drainThr: 0.32, ceiling: 900 };
// hang glider: no motor, no battery. Polar sink(v) = (c1 v^3 + c2 / v) / g -> about 1.0 m/s at the 41 km/h trim speed, best ~0.97 m/s near 36 km/h.
export const GLIDER = { name: 'HANG GLIDER', clear: 1.3, stall: 8.0, trim: 11.5, c1: 0.00237, c2: 71, vne: 15.5, climbFull: 1.6 };
// seaplane: like the e-plane, a little heavier (less thrust per drag, higher stall), floats instead of wheels
export const SEAPLANE = { name: 'SEAPLANE', float: 2.15, stall: 25, rotate: 28, maxThrust: 13, drag: 0.0042, drainIdle: 0.05, drainThr: 0.5, touchSink: 3, touchSpeed: 120 / 3.6 };
export const VEHICLES = ['plane', 'blimp', 'glider', 'seaplane'];

export function buildPlaneMesh() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, metalness: 0.1, flatShading: true }), orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.45, 8.5, 12), white); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), white); nose.scale.set(1, 1, 1.4); nose.position.z = -4.25; g.add(nose);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 10), orange); spinner.rotation.x = -Math.PI / 2; spinner.position.z = -5.6; g.add(spinner);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 8), new THREE.MeshStandardMaterial({ color: 0x1b3550, roughness: 0.1, metalness: 0.6 })); canopy.scale.set(1, 0.75, 2.2); canopy.position.set(0, 0.6, -1.8); g.add(canopy);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.22, 7.2), orange); stripe.position.set(0, -0.05, 0.2); g.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(12, 0.18, 1.7), white); wing.position.set(0, 0.05, -0.6); g.add(wing);
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.22, 1.72), orange); tip.position.set(s * 6.2, 0.05, -0.6); g.add(tip); }
  const hs = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.0), white); hs.position.set(0, 0.25, 4.0); g.add(hs);
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 1.3), orange); vf.position.set(0, 1.1, 4.0); g.add(vf);
  const prop = new THREE.Group(); prop.position.z = -5.45; for (let b = 0; b < 2; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.2, 0.06), dark); bl.rotation.z = b * Math.PI / 2 + 0.3; prop.add(bl); } g.add(prop);
  for (const [x, z] of [[-1.3, -0.9], [1.3, -0.9], [0, 3.6]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10), dark); w.rotation.z = Math.PI / 2; w.position.set(x, -1.35, z); g.add(w);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), white); strut.position.set(x, -0.95, z); g.add(strut); }
  g.userData.prop = prop; return g;
}
export function buildBlimpMesh() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.7, flatShading: false }), orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5 }), dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const env = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), white); env.scale.set(6, 6, 15); g.add(env);
  for (const z of [-4, 4]) { const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 40), orange); const r = 6 * Math.sqrt(1 - (z / 15) ** 2); band.scale.set(r, r, r); band.position.z = z; g.add(band); }
  for (let k = 0; k < 4; k++) { const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.2, 4), orange); fin.geometry.translate(0, 4.2, 0); fin.position.z = 12; fin.rotation.z = k * Math.PI / 2; g.add(fin); }
  const gon = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.2, 7.5), new THREE.MeshStandardMaterial({ color: 0x1d1f24, roughness: 0.5 })); gon.position.y = -6.9; g.add(gon);
  const win = new THREE.Mesh(new THREE.BoxGeometry(2.86, 0.7, 5.5), new THREE.MeshStandardMaterial({ color: 0xffc27a, emissive: 0x8a4a10, roughness: 0.2 })); win.position.set(0, -6.7, -0.3); g.add(win);
  const props = []; for (const s of [-1, 1]) { const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10), orange); pod.rotation.x = Math.PI / 2; pod.position.set(s * 2.4, -6.4, 1.5); g.add(pod);
    const p = new THREE.Group(); p.position.set(s * 2.4, -6.4, 2.4); for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.05), dark); bl.rotation.z = b * 2.09; p.add(bl); } g.add(p); props.push(p); }
  g.userData.props = props; return g;
}

export function buildGliderMesh() {
  const g = new THREE.Group(), sail = new THREE.MeshStandardMaterial({ color: 0xf4f2ec, emissive: 0x3a3833, roughness: 0.7, side: THREE.DoubleSide, flatShading: true }), orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.5, side: THREE.DoubleSide, flatShading: true }),
    tube = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.6, roughness: 0.35 }), suit = new THREE.MeshStandardMaterial({ color: 0x1d2a3a, roughness: 0.8 }), skin = new THREE.MeshStandardMaterial({ color: 0xffb03a, roughness: 0.5 });
  // delta wing: nose at -Z, trailing edge swept back, slight anhedral-free billow. Built as two halves (left white, right with an orange band)
  const half = (sx, m) => { const geo = new THREE.BufferGeometry(); const v = [0, 0.35, -2.6, sx * 5.2, -0.05, 1.3, 0, 0.15, 1.0, sx * 5.2, -0.05, 1.3, sx * 2.0, 0.12, 1.75, 0, 0.15, 1.0];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals(); return new THREE.Mesh(geo, m); };
  g.add(half(-1, sail), half(1, sail));
  const band = (sx) => { const geo = new THREE.BufferGeometry(); const v = [sx * 3.6, 0.04, 0.5, sx * 5.2, -0.04, 1.3, sx * 3.2, 0.08, 1.2]; geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, orange); m.position.y = 0.02; return m; };
  g.add(band(-1), band(1));
  const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.8, 6), tube); keel.rotation.x = Math.PI / 2; keel.position.set(0, 0.2, -0.6); g.add(keel);
  // A-frame control bar + pilot hanging prone below
  for (const sx of [-1, 1]) { const up = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.9, 6), tube); up.position.set(sx * 0.45, -0.75, -0.55); up.rotation.z = sx * 0.25; g.add(up); }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), tube); bar.rotation.z = Math.PI / 2; bar.position.set(0, -1.65, -0.55); g.add(bar);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.25, 4, 8), suit); body.rotation.x = Math.PI / 2; body.position.set(0, -1.35, 0.25); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); head.position.set(0, -1.28, -0.55); g.add(head);
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), tube); strap.position.set(0, -0.6, 0.1); g.add(strap);
  return g;
}
export function buildSeaplaneMesh() {
  const g = new THREE.Group(), white = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.5, metalness: 0.1, flatShading: true }), teal = new THREE.MeshStandardMaterial({ color: 0x1f7f8c, roughness: 0.45, flatShading: true }),
    orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.45, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 9, 12), white); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 8), white); nose.scale.set(1, 1, 1.3); nose.position.z = -4.5; g.add(nose);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 10), orange); spinner.rotation.x = -Math.PI / 2; spinner.position.z = -5.8; g.add(spinner);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.66, 14, 8), new THREE.MeshStandardMaterial({ color: 0x1b3550, roughness: 0.1, metalness: 0.6 })); canopy.scale.set(1, 0.75, 2.2); canopy.position.set(0, 0.7, -2.0); g.add(canopy);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.24, 7.6), teal); stripe.position.set(0, -0.05, 0.2); g.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13, 0.2, 1.8), white); wing.position.set(0, 0.95, -0.8); g.add(wing); // high wing
  for (const s of [-1, 1]) { const tip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.24, 1.82), teal); tip.position.set(s * 6.7, 0.95, -0.8); g.add(tip);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.2), white); ws.position.set(s * 2.3, 0.35, -0.8); ws.rotation.z = s * 1.1; ws.rotation.y = 0; g.add(ws); }
  const hs = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.1), white); hs.position.set(0, 0.3, 4.3); g.add(hs);
  const vf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.0, 1.4), teal); vf.position.set(0, 1.2, 4.3); g.add(vf);
  const prop = new THREE.Group(); prop.position.z = -5.65; for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.7, 0.06), dark); bl.geometry.translate(0, 0.85, 0); bl.rotation.z = b * 2.094 + 0.3; prop.add(bl); } g.add(prop);
  // twin floats (bottom at y = -2.3) on struts
  for (const sx of [-1.55, 1.55]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 7.2, 12), white); fl.rotation.x = Math.PI / 2; fl.scale.set(1, 1, 0.82); fl.position.set(sx, -1.95, -0.3); g.add(fl);
    const tipF = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.3, 12), white); tipF.rotation.x = -Math.PI / 2; tipF.scale.set(1, 1, 0.82); tipF.position.set(sx, -1.9, -4.55); g.add(tipF);
    const keelS = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 7.0), orange); keelS.position.set(sx, -1.78, -0.3); g.add(keelS);
    for (const z of [-2.0, 1.3]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.12), dark); st.position.set(sx * 0.75, -1.15, z); st.rotation.z = -Math.sign(sx) * 0.55; g.add(st); } }
  g.userData.prop = prop; return g;
}

export function newPlane() { return { kind: 'plane', pos: new THREE.Vector3(), quat: new THREE.Quaternion(), v: 0, vel: new THREE.Vector3(), throttle: 0, battery: 100, grounded: true, stalled: false, charging: false, crashed: null }; }
export function newGlider() { return { kind: 'glider', pos: new THREE.Vector3(), quat: new THREE.Quaternion(), v: 0, vel: new THREE.Vector3(), throttle: 0, battery: 100, noBattery: true, grounded: false, stalled: false, charging: false, crashed: null, lift: 0 }; }
export function newSeaplane() { return { kind: 'seaplane', pos: new THREE.Vector3(), quat: new THREE.Quaternion(), v: 0, vel: new THREE.Vector3(), throttle: 0, battery: 100, grounded: true, onWater: true, stalled: false, charging: false, crashed: null, hd: 0 }; }
export function newBlimp() { return { kind: 'blimp', pos: new THREE.Vector3(), yaw: 0, v: 0, vy: 0, yr: 0, battery: 100, charging: false, thrust: 0, tilt: 0, bank: 0, bob: 0, landed: false }; }
export function headingOf(s) { if (!s.quat) return s.yaw; /* blimp, roadster, scooter steer by yaw */ _f.set(0, 0, -1).applyQuaternion(s.quat); return Math.atan2(_f.x, -_f.z); }
export function setPlaneAttitude(s, hd, pitch = 0, roll = 0) { _e.set(pitch, -hd, roll, 'YXZ'); s.quat.setFromEuler(_e); }

// returns event string or null ('crash:reason')
export function stepPlane(s, inp, world, dt) {
  if (s.crashed) return null;
  const P = PLANE, hasPower = s.battery > 0;
  s.throttle = clamp(s.throttle + (inp.up - inp.down) * 0.8 * dt, 0, 1);
  const thrust = hasPower ? s.throttle * P.maxThrust : 0, brake = inp.down;
  _f.set(0, 0, -1).applyQuaternion(s.quat); _r.set(1, 0, 0).applyQuaternion(s.quat);
  if (hasPower) s.battery = Math.max(0, s.battery - (P.drainIdle + P.drainThr * s.throttle) * MODS.drain * dt);
  if (!s.grounded) {
    s.charging = false;
    const eff = clamp(s.v / 40, 0.3, 1.15);
    let rollRate = inp.roll * 2.0 * eff; if (Math.abs(inp.roll) < 0.05) rollRate += -_r.y * 0.9; // gentle auto-level when hands off
    const pitchRate = inp.pitch * 1.05 * eff, yawRate = inp.yaw * 0.45 * eff;
    _q.setFromAxisAngle(X, pitchRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Z, -rollRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Y, -yawRate * dt); s.quat.multiply(_q);
    _q.setFromAxisAngle(Y, _r.y * 0.75 * eff * dt); s.quat.premultiply(_q); // bank -> coordinated turn
    const lift = clamp(s.v / P.stall, 0, 1); s.stalled = lift < 1;
    if (s.stalled && _f.y > -0.6) { _q.setFromAxisAngle(X, -(1 - lift) * 0.9 * dt); s.quat.multiply(_q); }
    s.quat.normalize(); _f.set(0, 0, -1).applyQuaternion(s.quat);
    s.v = Math.max(0, s.v + (thrust - 0.0036 * s.v * s.v - brake * 0.012 * s.v * s.v - G * _f.y) * dt);
    s.vel.copy(_f).multiplyScalar(s.v); s.vel.y -= (1 - lift) * 14;
    s.pos.addScaledVector(s.vel, dt);
    const gr = world.groundAt(s.pos.x, s.pos.z);
    if (s.pos.y < gr.h + P.gear) {
      _r.set(1, 0, 0).applyQuaternion(s.quat);
      const gentle = s.vel.y > -7 && _f.y > -0.22 && _f.y < 0.4 && Math.abs(_r.y) < 0.3 && s.v < 60;
      if (gr.water) return crash(s, 'splash');
      if (!gentle) return crash(s, 'hard');
      s.grounded = true; s.pos.y = gr.h + P.gear; setPlaneAttitude(s, Math.atan2(_f.x, -_f.z), 0); s.vel.y = 0;
      return 'touchdown';
    }
    if (s.pos.y > 2600) { s.pos.y = 2600; }
    s.charging = false; return null;
  }
  // grounded: taxi / takeoff roll
  let hd = Math.atan2(_f.x, -_f.z); hd += (inp.yaw + inp.roll * 0.6) * 0.9 * clamp(s.v / 6 + 0.25, 0, 1) * dt;
  s.v = Math.max(0, s.v + (thrust - 0.0025 * s.v * s.v - 0.35 - brake * 6) * dt); if (s.v < 0.05 && thrust === 0) s.v = 0;
  const nx = s.pos.x + Math.sin(hd) * s.v * dt, nz = s.pos.z - Math.cos(hd) * s.v * dt, gr = world.groundAt(nx, nz);
  if (gr.water) return crash(s, 'splash');
  const rise = gr.h + P.gear - s.pos.y;
  if (rise > Math.max(1.2, s.v * dt * 0.7) && s.v > 8) return crash(s, 'terrain');
  s.pos.x = nx; s.pos.z = nz;
  let pitch = 0;
  if (inp.pitch > 0.2 && s.v > P.rotate) { s.grounded = false; pitch = 0.14; s.pos.y = Math.max(s.pos.y, gr.h + P.gear) + 0.3; setPlaneAttitude(s, hd, pitch); return 'liftoff'; }
  if (rise < -2.5) { s.grounded = false; setPlaneAttitude(s, hd, 0); return null; } // rolled off an edge
  s.pos.y = gr.h + P.gear; setPlaneAttitude(s, hd, 0); s.vel.set(Math.sin(hd) * s.v, 0, -Math.cos(hd) * s.v);
  s.charging = !!world.inStation(s.pos.x, s.pos.z, 20) && s.v < 6;
  if (s.charging) s.battery = Math.min(100, s.battery + 9 * MODS.charge * dt);
  return null;
}
export function crash(s, why) { s.crashed = { why, t: 0, pos: s.pos.clone() }; s.v = 0; s.vel.set(0, 0, 0); s.charging = false; return 'crash:' + why; }

// ---- hang glider: stick = pitch + bank, no thrust. vel = forward * v + rising air (world.liftAt) - stall / turn sink.
export function stepGlider(s, inp, world, dt) {
  if (s.crashed) return null;
  const P = GLIDER; s.throttle = 0; s.charging = false; s.battery = 100;
  _f.set(0, 0, -1).applyQuaternion(s.quat); _r.set(1, 0, 0).applyQuaternion(s.quat);
  if (s.grounded) { s.v = Math.max(0, s.v - 6 * dt); s.vel.set(0, 0, 0); s.lift = 0; return null; } // landed: wait for a relaunch (A / R)
  const eff = clamp(s.v / 11, 0.45, 1.1);
  let rollRate = inp.roll * 1.15 * eff; if (Math.abs(inp.roll) < 0.05) rollRate += -_r.y * 0.6;
  let pitchRate = inp.pitch * 0.75 * eff; if (Math.abs(inp.pitch) < 0.05) pitchRate += clamp((s.v - P.trim) * 0.06 - (_f.y + 0.087) * 0.9, -0.3, 0.3); // speed-stable: hands off it settles into its trim glide
  const yawRate = inp.yaw * 0.25 * eff;
  _q.setFromAxisAngle(X, pitchRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Z, -rollRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Y, -yawRate * dt); s.quat.multiply(_q);
  _r.set(1, 0, 0).applyQuaternion(s.quat); const bankSin = clamp(-_r.y, -0.85, 0.85);
  _q.setFromAxisAngle(Y, -bankSin * 0.9 * eff * dt); s.quat.premultiply(_q); // bank -> turn (about 25 m radius at 30°)
  // keep the bank and pitch inside a sane hang-glider envelope
  if (Math.abs(_r.y) > 0.8) { _q.setFromAxisAngle(Z, -Math.sign(_r.y) * 1.2 * dt); s.quat.multiply(_q); }
  s.quat.normalize(); _f.set(0, 0, -1).applyQuaternion(s.quat);
  if (_f.y > 0.45) { _q.setFromAxisAngle(X, -0.8 * dt); s.quat.multiply(_q); } if (_f.y < -0.32) { _q.setFromAxisAngle(X, 0.8 * dt); s.quat.multiply(_q); }
  s.quat.normalize(); _f.set(0, 0, -1).applyQuaternion(s.quat);
  const lift = clamp((s.v - P.stall * 0.75) / (P.stall * 0.25), 0, 1); s.stalled = s.v < P.stall;
  if (s.stalled && _f.y > -0.5) { _q.setFromAxisAngle(X, -(1 - lift * 0.5) * 0.7 * dt); s.quat.multiply(_q); s.quat.normalize(); _f.set(0, 0, -1).applyQuaternion(s.quat); }
  const vv = Math.max(s.v, 4), drag = P.c1 * vv * vv + P.c2 / (vv * vv) + (s.v > P.vne ? 0.5 * (s.v - P.vne) ** 2 : 0);
  s.v = clamp(s.v + (-G * _f.y - drag) * dt, 6.5, 30); // never below a 23 km/h mush
  s.lift = world.liftAt(s.pos.x, s.pos.y, s.pos.z);
  const turnSink = 0.9 * (1 / Math.sqrt(1 - bankSin * bankSin) - 1);
  s.vel.copy(_f).multiplyScalar(s.v); s.vel.y += s.lift - turnSink - (1 - lift) * 3;
  s.pos.addScaledVector(s.vel, dt);
  if (s.pos.y > 2600) s.pos.y = 2600;
  if (world.treeHit(s.pos.x, s.pos.y, s.pos.z, 1.2)) return crash(s, 'tree');
  const gr = world.groundAt(s.pos.x, s.pos.z);
  if (s.pos.y < gr.h + P.clear) {
    if (gr.water) return crash(s, 'splash');
    _r.set(1, 0, 0).applyQuaternion(s.quat);
    if (s.vel.y < -3 || s.v > 16 || Math.abs(_r.y) > 0.35) return crash(s, 'hard');
    s.grounded = true; s.pos.y = gr.h + P.clear; setPlaneAttitude(s, Math.atan2(_f.x, -_f.z), 0); s.vel.set(0, 0, 0); s.lift = 0; return 'touchdown';
  }
  return null;
}
// ---- seaplane: the e-plane's flight model with SEAPLANE numbers. Floats on water (gentle touchdown), any land / tree contact or a hard splash is a crash.
export function stepSeaplane(s, inp, world, dt, t = 0) {
  if (s.crashed) return null;
  const P = SEAPLANE, hasPower = s.battery > 0;
  s.throttle = clamp(s.throttle + (inp.up - inp.down) * 0.8 * dt, 0, 1);
  const thrust = hasPower ? s.throttle * P.maxThrust : 0, brake = inp.down;
  _f.set(0, 0, -1).applyQuaternion(s.quat); _r.set(1, 0, 0).applyQuaternion(s.quat);
  if (hasPower) s.battery = Math.max(0, s.battery - (P.drainIdle + P.drainThr * s.throttle) * MODS.drain * dt);
  if (!s.grounded) {
    s.charging = false; s.onWater = false;
    const eff = clamp(s.v / 40, 0.3, 1.1);
    let rollRate = inp.roll * 1.8 * eff; if (Math.abs(inp.roll) < 0.05) rollRate += -_r.y * 0.9;
    const pitchRate = inp.pitch * 0.95 * eff, yawRate = inp.yaw * 0.42 * eff;
    _q.setFromAxisAngle(X, pitchRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Z, -rollRate * dt); s.quat.multiply(_q); _q.setFromAxisAngle(Y, -yawRate * dt); s.quat.multiply(_q);
    _q.setFromAxisAngle(Y, _r.y * 0.7 * eff * dt); s.quat.premultiply(_q);
    const lift = clamp(s.v / P.stall, 0, 1); s.stalled = lift < 1;
    if (s.stalled && _f.y > -0.6) { _q.setFromAxisAngle(X, -(1 - lift) * 0.9 * dt); s.quat.multiply(_q); }
    s.quat.normalize(); _f.set(0, 0, -1).applyQuaternion(s.quat);
    s.v = Math.max(0, s.v + (thrust - P.drag * s.v * s.v - brake * 0.012 * s.v * s.v - G * _f.y) * dt);
    s.vel.copy(_f).multiplyScalar(s.v); s.vel.y -= (1 - lift) * 14;
    s.pos.addScaledVector(s.vel, dt);
    if (s.pos.y > 2600) s.pos.y = 2600;
    if (world.treeHit(s.pos.x, s.pos.y - 1, s.pos.z, 3)) return crash(s, 'tree');
    const gr = world.groundAt(s.pos.x, s.pos.z);
    if (s.pos.y < gr.h + P.float) {
      if (!gr.water) return crash(s, 'terrain');
      _r.set(1, 0, 0).applyQuaternion(s.quat);
      const gentle = s.vel.y > -P.touchSink && s.v < P.touchSpeed && _f.y > -0.25 && _f.y < 0.4 && Math.abs(_r.y) < 0.35;
      // any open water works as a runway. A hard hit or nose-dive never crashes (cozy): it bounces and splashes down on the floats.
      const hitVy = s.vel.y; s.grounded = true; s.onWater = true; s.hd = Math.atan2(_f.x, -_f.z); s.pos.y = P.float; s.vel.y = 0; setPlaneAttitude(s, s.hd, 0); s.bounceT = 0;
      if (!gentle) { s.v *= 0.45; s.bounce = clamp(0.5 + (-hitVy) * 0.04, 0.5, 1.4); s.splash = 1; return 'splashdown:hard'; }
      s.v *= 0.8; s.bounce = 0.12; s.splash = 0.6; return 'splashdown';
    }
    return null;
  }
  // floating: taxi with water drag, gentle bobbing; rotate above SEAPLANE.rotate to take off again
  s.onWater = true;
  let hd = s.hd; hd += (inp.yaw + inp.roll * 0.6) * 0.7 * clamp(s.v / 5 + 0.3, 0, 1) * dt; s.hd = hd;
  s.v = Math.max(0, s.v + (thrust - 0.0034 * s.v * s.v - 0.05 * s.v - 0.3 - 7 * Math.exp(-(((s.v - 13) / 7) ** 2)) - brake * 3) * dt); // water drag with a 'hump' before the floats get on the step if (s.v < 0.05 && thrust === 0) s.v = 0;
  const nx = s.pos.x + Math.sin(hd) * s.v * dt, nz = s.pos.z - Math.cos(hd) * s.v * dt, gr = world.groundAt(nx, nz);
  if (!gr.water) { if (s.v > 2.5) return crash(s, 'terrain'); s.v = 0; } // ran aground: slow nudges just stop, fast ones crash
  else { s.pos.x = nx; s.pos.z = nz; }
  const plane = s.v / P.rotate, bob = 1 - clamp(plane, 0, 0.8);
  s.bounceT = (s.bounceT || 0) + dt; const bnc = (s.bounce || 0) * Math.exp(-2.5 * s.bounceT) * Math.abs(Math.sin(s.bounceT * 5.5));
  s.pos.y = P.float + Math.sin(t * 1.5) * 0.14 * bob + bnc;
  let pitch = Math.sin(t * 1.1 + 0.6) * 0.012 * bob + clamp(s.throttle * 0.05 - plane * 0.03, -0.02, 0.04), roll = Math.sin(t * 0.9) * 0.02 * bob;
  if (inp.pitch > 0.2 && s.v > P.rotate) { s.grounded = false; s.onWater = false; s.pos.y += 0.6; setPlaneAttitude(s, hd, 0.14); s.vel.set(Math.sin(hd) * s.v, 0, -Math.cos(hd) * s.v); return 'liftoff'; }
  setPlaneAttitude(s, hd, pitch, roll); s.vel.set(Math.sin(hd) * s.v, 0, -Math.cos(hd) * s.v);
  s.charging = world.nearDock(s.pos.x, s.pos.z, 22) && s.v < 6;
  if (s.charging) s.battery = Math.min(100, s.battery + 9 * MODS.charge * dt);
  return null;
}

export function stepBlimp(s, inp, world, dt, t) {
  const B = BLIMP, hasPower = s.battery > 0;
  const fwd = hasPower ? clamp(-inp.pitch, -1, 1) : 0, lift = hasPower ? inp.up - inp.down : 0, yawIn = clamp(inp.roll + inp.yaw, -1, 1);
  s.thrust = fwd;
  if (hasPower) s.battery = Math.max(0, s.battery - (B.drainIdle + B.drainThr * (Math.abs(fwd) + Math.abs(lift) * 0.5)) * MODS.drain * dt);
  s.v += (fwd * 2.0 - 0.1 * s.v - 0.006 * s.v * Math.abs(s.v)) * dt; s.v = clamp(s.v, -5, B.maxSpeed);
  s.yr += (yawIn * (hasPower ? 0.32 : 0.15) - s.yr) * 1.2 * dt; s.yaw += s.yr * dt;
  s.vy += (lift * 2.6 - s.vy * 0.9 - (hasPower ? 0 : 0.45)) * dt;
  s.pos.x += Math.sin(s.yaw) * s.v * dt; s.pos.z -= Math.cos(s.yaw) * s.v * dt; s.pos.y += s.vy * dt;
  const gr = world.groundAt(s.pos.x, s.pos.z); s.landed = false;
  if (s.pos.y < gr.h + B.clear) { s.pos.y = gr.h + B.clear; s.vy = Math.max(0, s.vy); s.landed = true; s.v *= 1 - 0.8 * dt; }
  if (s.pos.y > B.ceiling) { s.pos.y = B.ceiling; s.vy = Math.min(0, s.vy); }
  s.tilt += (-fwd * 0.05 - s.tilt) * 1.5 * dt; s.bank += (s.yr * 0.25 - s.bank) * 1.5 * dt; s.bob = Math.sin(t * 0.7) * 0.35;
  const pad = world.onPad(s.pos.x, s.pos.z, 22); s.charging = !!pad && s.pos.y - gr.h < 16 && Math.abs(s.v) < 3;
  if (s.charging) s.battery = Math.min(100, s.battery + 9 * MODS.charge * dt);
  return null;
}

// ---- hover roadster + flying scooter: drive on the wheels, cold-gas air jets (unlimited compressed air, no tank drain)
// lift them into a hover and push them around the sky, then they settle back onto the wheels.
// Controls follow the blimp: left stick forward/back = drive (jets in the air), stick left/right (and LB/RB) = steer,
// RT = lift jets (take off / climb), LT = brake on the ground, sink in the air. Air jets also boost (rear), brake (front)
// and help corners (side) like a cold-gas thruster pack. Battery only powers the wheel motors; the air never runs out.
export const ROADSTER = { name: 'ROADSTER', clear: 0.55, maxDrive: 56, boostTop: 86, accel: 10, boostAccel: 12, brake: 16, jetBrake: 10, turn: 1.25, airTop: 70, airAccel: 9, climb: 9, ceiling: 1500, drainIdle: 0.02, drainDrive: 0.3, wheelR: 0.36 };
export const SCOOTER = { name: 'SKY SCOOTER', clear: 0.46, maxDrive: 24, boostTop: 40, accel: 6.5, boostAccel: 6, brake: 10, jetBrake: 6, turn: 1.7, airTop: 34, airAccel: 6, climb: 7, ceiling: 1200, drainIdle: 0.015, drainDrive: 0.22, wheelR: 0.28 };
export const HOVER = { roadster: ROADSTER, scooter: SCOOTER };
export function newHover(kind) { return { kind, pos: new THREE.Vector3(), yaw: 0, v: 0, vy: 0, battery: 100, charging: false, crashed: null, landed: true, grounded: true, hover: false,
  lean: 0, pitchVis: 0, rollVis: 0, wheel: 0, bob: 0, steer: 0, jets: { rear: 0, front: 0, left: 0, right: 0, down: 0 }, air: Infinity, onWater: false }; }
const lerp = (a, b, k) => a + (b - a) * k;
export function stepHover(s, inp, world, dt, t = 0) {
  const C = HOVER[s.kind], fwd = clamp(-inp.pitch, -1, 1), turn = clamp(inp.roll + inp.yaw * 0.7, -1, 1), up = inp.up || 0, down = inp.down || 0, power = s.battery > 0;
  const J = s.jets; let ev = null; J.rear = J.front = J.left = J.right = 0; J.down = 0;
  const gr = world.groundAt(s.pos.x, s.pos.z), floor = gr.h + C.clear + (gr.water ? 0.5 : 0);
  if (!s.hover) {
    // ---- on the wheels (on water the down jets keep it skimming on an air cushion)
    const top = C.maxDrive;
    if (fwd > 0.02) { if (s.v < 0) s.v = Math.min(0, s.v + C.brake * fwd * dt); else if (power) s.v += fwd * C.accel * Math.max(0, 1 - (s.v / top) ** 4) * dt; } // electric: strong pull right up to the motor's top speed
    else if (fwd < -0.02) { if (s.v > 0.5) s.v = Math.max(0, s.v + fwd * C.brake * dt); else if (power) s.v = Math.max(-8, s.v + fwd * C.accel * 0.5 * dt); }
    // air-jet boost past the motor's top speed, jet braking, side jets for tight corners
    if (fwd > 0.85 && s.v > top * 0.7) { J.rear = 1; s.v = Math.min(C.boostTop, s.v + C.boostAccel * dt * Math.max(0, 1 - (s.v / C.boostTop) ** 2)); }
    if ((fwd < -0.3 || down > 0.3) && s.v > 10) { J.front = 1; s.v = Math.max(0, s.v - C.jetBrake * dt); }
    if (down > 0.05) s.v = s.v > 0 ? Math.max(0, s.v - C.brake * down * dt) : Math.min(0, s.v + C.brake * down * dt);
    s.v -= (0.25 + 0.0009 * s.v * s.v + (gr.water ? 0.3 : 0)) * Math.sign(s.v) * dt; if (Math.abs(s.v) < 0.08 && Math.abs(fwd) < 0.02) s.v = 0;
    const side = Math.abs(turn) > 0.4 && Math.abs(s.v) > 12 ? 1 : 0; if (side) { if (turn > 0) J.left = 1; else J.right = 1; }
    const rate = C.turn * turn * clamp(Math.abs(s.v) / 6, 0, 1) / (1 + Math.abs(s.v) / 45) * (1 + 0.7 * side) * Math.sign(s.v || 1);
    s.yaw += rate * dt; s.steer = lerp(s.steer, turn, Math.min(1, dt * 8));
    const nx = s.pos.x + Math.sin(s.yaw) * s.v * dt, nz = s.pos.z - Math.cos(s.yaw) * s.v * dt, ng = world.groundAt(nx, nz), nfloor = ng.h + C.clear + (ng.water ? 0.5 : 0);
    if (world.treeHit(nx, nfloor + 0.5, nz, 0.6)) { s.v = -s.v * 0.3; ev = 'bump'; } // trees: a soft bump, never a crash
    else if (nfloor - s.pos.y > Math.max(0.9, Math.abs(s.v) * dt * 1.2)) { s.v *= 0.5; ev = 'bump'; } // too steep to drive up: stop gently
    else { s.pos.x = nx; s.pos.z = nz; s.pos.y = nfloor; }
    if (ng.water || gr.water) J.down = 0.5;
    s.onWater = !!(ng.water || gr.water);
    if (power) s.battery = Math.max(0, s.battery - (C.drainIdle + C.drainDrive * Math.abs(fwd)) * MODS.drain * dt);
    // slope attitude (visual only): sample the ground ahead and to the side
    const h0 = world.groundAt(s.pos.x + Math.sin(s.yaw) * 1.5, s.pos.z - Math.cos(s.yaw) * 1.5).h, h1 = world.groundAt(s.pos.x - Math.sin(s.yaw) * 1.5, s.pos.z + Math.cos(s.yaw) * 1.5).h;
    const hr = world.groundAt(s.pos.x + Math.cos(s.yaw) * 0.9, s.pos.z + Math.sin(s.yaw) * 0.9).h, hl = world.groundAt(s.pos.x - Math.cos(s.yaw) * 0.9, s.pos.z - Math.sin(s.yaw) * 0.9).h;
    s.pitchVis = lerp(s.pitchVis, s.onWater ? 0 : Math.atan2(h0 - h1, 3), Math.min(1, dt * 6)); s.rollVis = lerp(s.rollVis, s.onWater ? 0 : Math.atan2(hr - hl, 1.8), Math.min(1, dt * 6));
    s.vy = 0; s.bob = s.onWater ? Math.sin(t * 2.2) * 0.04 : 0;
    s.landed = s.grounded = true;
    if (up > 0.1) { s.hover = true; s.landed = s.grounded = false; s.vy = 3 + up * 2; s.pos.y += 0.15; ev = 'liftoff'; }
  } else {
    // ---- hovering / flying on the air jets: holds its height hands-off (unlimited air), RT climbs, LT sinks
    const wantVy = (up - down) * C.climb, kVy = Math.abs(wantVy) < Math.abs(s.vy) ? 6 : 2.2; s.vy = lerp(s.vy, wantVy, Math.min(1, dt * kVy)); // ease into a climb (2.2/s), settle to a hold fast (6/s, ~0.5 s)
    J.down = 0.35 + 0.65 * Math.max(up, 0) + (down > 0.1 ? -0.2 : 0);
    if (fwd > 0.02) { s.v += fwd * C.airAccel * Math.max(0, 1 - s.v / C.airTop) * dt; J.rear = fwd; }
    else if (fwd < -0.02) { if (s.v > 0) { s.v = Math.max(0, s.v + fwd * C.jetBrake * dt); J.front = -fwd; } else { s.v = Math.max(-8, s.v + fwd * C.airAccel * 0.4 * dt); J.front = -fwd * 0.6; } }
    s.v -= (0.12 + 0.0012 * s.v * s.v) * Math.sign(s.v) * dt; if (Math.abs(s.v) < 0.05) s.v = 0;
    s.yaw += C.turn * 0.8 * turn * dt; if (turn > 0.3) J.left = Math.abs(turn); else if (turn < -0.3) J.right = Math.abs(turn); s.steer = lerp(s.steer, turn * 0.4, Math.min(1, dt * 6));
    s.pos.x += Math.sin(s.yaw) * s.v * dt; s.pos.z -= Math.cos(s.yaw) * s.v * dt; s.pos.y += s.vy * dt;
    if (s.pos.y > C.ceiling) { s.pos.y = C.ceiling; s.vy = Math.min(0, s.vy); }
    if (world.treeHit(s.pos.x, s.pos.y, s.pos.z, 0.8)) { s.pos.y += 0.8; s.vy = Math.max(s.vy, 2); s.v *= 0.6; ev = 'bump'; }
    s.bob = Math.sin(t * 1.6) * 0.12; s.pitchVis = lerp(s.pitchVis, -fwd * 0.08 - s.vy * 0.006, Math.min(1, dt * 3)); s.rollVis = lerp(s.rollVis, 0, Math.min(1, dt * 3));
    const g2 = world.groundAt(s.pos.x, s.pos.z), fl2 = g2.h + C.clear + (g2.water ? 0.5 : 0);
    s.onWater = false;
    if (s.pos.y <= fl2) { s.pos.y = fl2; if (g2.water && down < 0.1) { s.vy = Math.max(0, s.vy); } else { s.hover = false; s.landed = s.grounded = true; s.vy = 0; s.v *= 0.85; ev = 'touchdown'; } }
    if (power) s.battery = Math.max(0, s.battery - C.drainIdle * MODS.drain * dt);
  }
  // lean into turns, wheels spin with ground speed
  s.lean = lerp(s.lean, -turn * clamp(Math.abs(s.v) / 20, 0, 1) * (s.kind === 'scooter' ? 0.45 : 0.06) * (s.hover ? 1.4 : 1), Math.min(1, dt * 5));
  if (!s.hover) s.wheel -= s.v / C.wheelR * dt; else s.wheel -= s.v / C.wheelR * dt * 0.1;
  const pad = world.onPad(s.pos.x, s.pos.z, 22), bay = world.chargeBay ? world.chargeBay(s.pos.x, s.pos.z) : null;
  s.charging = (!!bay && !s.hover && Math.abs(s.v) < 2) || (!!pad && s.pos.y - gr.h < 6 && Math.abs(s.v) < 2);
  s.chargeAt = s.charging ? (bay || null) : null;
  if (s.charging) s.battery = Math.min(100, s.battery + 12 * MODS.charge * dt);
  return ev;
}

// ---- meshes. Both: -Z forward, origin at the ride height (wheels touch y = -clear). userData: wheels[], jets[] (local pos + dir), body
function jetNozzle(g, mat, pos, dir, kind, list) { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.16, 8), mat); n.position.set(...pos);
  n.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize()); g.add(n); list.push({ kind, pos: new THREE.Vector3(...pos), dir: new THREE.Vector3(...dir).normalize() }); }
export function buildRoadsterMesh(color = 0x15171c) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.6 }), orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.4, metalness: 0.3 }),
    glass = new THREE.MeshStandardMaterial({ color: 0x223a52, roughness: 0.05, metalness: 0.7, transparent: true, opacity: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.7 }),
    tan = new THREE.MeshStandardMaterial({ color: 0xc9b08a, roughness: 0.8 }), tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }), rim = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.3 }),
    lightW = new THREE.MeshBasicMaterial({ color: 0xf4f7ff }), lightR = new THREE.MeshBasicMaterial({ color: 0xff3a2a }), metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 });
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; body.add(o); return o; };
  add(new THREE.BoxGeometry(1.86, 0.42, 3.3), paint, 0, -0.02, 0.15);
  add(new THREE.SphereGeometry(1, 16, 10), paint, 0, 0.0, -1.55, 0.93, 0.27, 0.95); // long low nose
  add(new THREE.SphereGeometry(1, 16, 10), paint, 0, 0.04, 1.75, 0.93, 0.3, 0.6); // rounded tail
  for (const sx of [-1, 1]) { add(new THREE.SphereGeometry(1, 12, 8), paint, sx * 0.78, 0.0, -1.35, 0.2, 0.3, 0.55); add(new THREE.SphereGeometry(1, 12, 8), paint, sx * 0.8, 0.04, 1.4, 0.2, 0.32, 0.55); // wheel arches
    add(new THREE.BoxGeometry(0.03, 0.06, 3.0), orange, sx * 0.94, 0.08, 0.1); } // orange pinstripes
  add(new THREE.BoxGeometry(1.4, 0.06, 1.4), dark, 0, 0.2, 0.35); // open cockpit tub
  for (const sx of [-1, 1]) { add(new THREE.BoxGeometry(0.5, 0.55, 0.12), tan, sx * 0.36, 0.42, 0.9, 1, 1, 1, -0.2); add(new THREE.BoxGeometry(0.5, 0.1, 0.5), tan, sx * 0.36, 0.22, 0.62); }
  const ws = add(new THREE.BoxGeometry(1.5, 0.5, 0.03), glass, 0, 0.42, -0.42, 1, 1, 1, -0.95); add(new THREE.BoxGeometry(1.56, 0.04, 0.06), dark, 0, 0.62, -0.28, 1, 1, 1, -0.95);
  add(new THREE.BoxGeometry(1.5, 0.05, 0.06), lightW, 0, 0.06, -2.47); add(new THREE.BoxGeometry(1.5, 0.05, 0.05), lightR, 0, 0.14, 2.32);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.03), new THREE.MeshStandardMaterial({ color: 0xeeeeea })); plate.geometry.translate(0, -0.08, 0); plate.position.set(0, 0.06, 2.36); body.add(plate); // drops down to uncover the main rear jet
  add(new THREE.BoxGeometry(0.9, 0.1, 0.5), dark, 0, -0.26, 2.05); // diffuser
  const jets = []; jetNozzle(body, metal, [0, -0.04, 2.33], [0, 0, 1], 'rear', jets);
  for (const sx of [-1, 1]) { jetNozzle(body, metal, [sx * 0.55, 0.02, -2.35], [0, 0, -1], 'front', jets); jetNozzle(body, metal, [sx * 0.95, -0.05, sx > 0 ? -0.4 : -0.4], [sx, 0, 0], sx > 0 ? 'right' : 'left', jets); jetNozzle(body, metal, [sx * 0.95, -0.05, 1.0], [sx, 0, 0], sx > 0 ? 'right' : 'left', jets);
    for (const z of [-1.0, 1.1]) jetNozzle(body, metal, [sx * 0.62, -0.24, z], [0, -1, 0], 'down', jets); }
  const wheels = []; for (const [x, z] of [[-0.86, -1.35], [0.86, -1.35], [-0.86, 1.4], [0.86, 1.4]]) { const w = new THREE.Group(); w.position.set(x, -0.19, z);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18), tire); tr.rotation.z = Math.PI / 2; w.add(tr); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.3, 5), rim); r.rotation.z = Math.PI / 2; w.add(r);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), orange); hub.rotation.z = Math.PI / 2; w.add(hub); g.add(w); wheels.push(w); }
  g.userData = { wheels, jets, body, plate, front: [wheels[0], wheels[1]] }; return g;
}
export function buildScooterMesh(color = 0xf4f4f2) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.3 }), orange = new THREE.MeshStandardMaterial({ color: ORANGE, roughness: 0.4 }), dark = new THREE.MeshStandardMaterial({ color: 0x17181c, roughness: 0.7 }),
    tire = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }), metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.3 }), seat = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.8 }),
    lightW = new THREE.MeshBasicMaterial({ color: 0xf4f7ff }), lightR = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  const add = (geo, m, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.x = rx; body.add(o); return o; };
  add(new THREE.BoxGeometry(0.34, 0.08, 0.8), dark, 0, -0.08, 0.0); // footboard
  add(new THREE.SphereGeometry(1, 14, 10), paint, 0, 0.18, 0.5, 0.22, 0.26, 0.42); // rear body cowl
  add(new THREE.BoxGeometry(0.28, 0.08, 0.5), seat, 0, 0.44, 0.45); // seat
  add(new THREE.BoxGeometry(0.32, 0.7, 0.14), paint, 0, 0.22, -0.48, 1, 1, 1, 0.25); // front shield / leg guard
  add(new THREE.BoxGeometry(0.06, 0.6, 0.06), metal, 0, 0.62, -0.6, 1, 1, 1, 0.3); // steering stem
  add(new THREE.SphereGeometry(0.09, 10, 8), lightW, 0, 0.62, -0.72, 1, 1, 0.5); // headlight
  add(new THREE.BoxGeometry(0.2, 0.05, 0.03), lightR, 0, 0.3, 0.86);
  add(new THREE.BoxGeometry(0.02, 0.05, 0.6), orange, 0.23, 0.2, 0.5); add(new THREE.BoxGeometry(0.02, 0.05, 0.6), orange, -0.23, 0.2, 0.5);
  const bars = new THREE.Group(); bars.position.set(0, 0.9, -0.68); body.add(bars); { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), metal); b.rotation.z = Math.PI / 2; bars.add(b);
    for (const sx of [-1, 1]) { const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 8), dark); gr.rotation.z = Math.PI / 2; gr.position.x = sx * 0.27; bars.add(gr); } }
  // jetpack-style air pods behind the seat, nozzles angled down/back
  const jets = []; for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), metal, sx * 0.17, 0.32, 0.72, 1, 1, 1, 0.35); add(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), orange, sx * 0.17, 0.5, 0.65, 1, 1, 1, 0.35);
    jetNozzle(body, dark, [sx * 0.17, 0.1, 0.8], [0, -0.7, 0.7], 'rear', jets); jetNozzle(body, dark, [sx * 0.15, -0.14, 0.2], [0, -1, 0], 'down', jets); jetNozzle(body, dark, [sx * 0.2, -0.12, -0.35], [0, -1, 0], 'down', jets);
    jetNozzle(body, dark, [sx * 0.2, 0.05, -0.6], [0, 0, -1], 'front', jets); jetNozzle(body, dark, [sx * 0.24, 0.15, 0.3], [sx, 0, 0], sx > 0 ? 'right' : 'left', jets); }
  const wheels = []; const fork = new THREE.Group(); fork.position.set(0, -0.18, -0.66); g.add(fork);
  for (const [grp, z] of [[fork, 0], [g, 0.62]]) { const w = new THREE.Group(); if (grp === g) w.position.set(0, -0.18, z); const tr = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.07, 8, 18), tire); tr.rotation.y = Math.PI / 2; w.add(tr);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8), orange); hub.rotation.z = Math.PI / 2; w.add(hub); grp.add(w); wheels.push(w); }
  g.userData = { wheels, jets, body, bars, fork, front: [fork] }; return g;
}

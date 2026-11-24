// Missions: started from a station pad (B / Enter), one active at a time.
import * as THREE from '../vendor/three.module.js';
const ORANGE = 0xf7931a;
export const fmt = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };

export function createMissions(world) {
  const st = world.stations, L = world.landmarks, gnd = (x, z) => world.groundAt(x, z).h, group = new THREE.Group();
  // ---- ring course out of Home Field: 8 rings on a gentle right-hand sweep
  const s0 = st[0], rings = []; let hd = s0.hd, x = s0.x + Math.sin(hd) * (s0.len / 2 + 420), z = s0.z - Math.cos(hd) * (s0.len / 2 + 420);
  for (let k = 0; k < 8; k++) {
    if (k) { hd += 0.34; x += Math.sin(hd) * 400; z -= Math.cos(hd) * 400; }
    let m = 0; for (let d = -150; d <= 150; d += 50) m = Math.max(m, gnd(x + Math.sin(hd) * d, z - Math.cos(hd) * d), gnd(x + Math.cos(hd) * d, z + Math.sin(hd) * d));
    const y = Math.max(s0.h + 70 + k * 6, m + 55);
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(16, 1.3, 10, 40), new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.35 })); mesh.position.set(x, y, z); mesh.rotation.y = -hd; group.add(mesh);
    rings.push({ x, y, z, mesh });
  }
  group.visible = false;
  // ---- sightseeing tour: lighthouse + the two turbines closest to the start station
  const nearLH = L.lighthouse ? world.nearest(L.lighthouse.x, L.lighthouse.z).st : st[0], tourStart = st.indexOf(nearLH);
  const turbs = [...L.turbines].sort((a, b) => Math.hypot(a.x - nearLH.padX, a.z - nearLH.padZ) - Math.hypot(b.x - nearLH.padX, b.z - nearLH.padZ)).slice(0, 2);
  const stops = [...(L.lighthouse ? [{ ...L.lighthouse, label: 'the lighthouse' }] : []), ...turbs.map((t, i) => ({ ...t, label: `wind turbine ${i + 1}` }))];
  const tour = []; let cx = nearLH.padX, cz = nearLH.padZ; while (stops.length) { stops.sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)); const s = stops.shift(); tour.push(s); cx = s.x; cz = s.z; }
  const dist = (a, b) => Math.hypot(st[a].padX - st[b].padX, st[a].padZ - st[b].padZ);
  const defs = [
    { id: 'rings', name: 'Ring Run', vehicle: 'plane', start: 0, reward: 60, limit: 150, desc: 'Fly through all 8 rings in order before the clock runs out.' },
    { id: 'delivery', name: 'Express Delivery', vehicle: 'plane', start: 1, to: 3, reward: 80, limit: Math.round(dist(1, 3) / 38 + 70), desc: `Rush a parcel from ${st[1].name} to ${st[3].name}. Land and stop before time runs out.` },
    { id: 'tour', name: 'Island Sightseeing', vehicle: 'blimp', start: tourStart, reward: 100, desc: `Blimp tour: ${tour.map((t) => t.label).join(', ')}, then back to ${nearLH.name}.` },
    { id: 'eco', name: 'Eco Flight', vehicle: 'plane', start: 2, to: 4, reward: 120, minStart: 95, minEnd: 70, desc: `Long hop from ${st[2].name} to ${st[4].name} with no charging stops. Land with at least 70% battery.` },
  ];
  const landedAt = (v, sIdx) => v.grounded && v.v < 6 && world.inStation(v.pos.x, v.pos.z, 20) === st[sIdx];
  function start(def, v) { const m = { def, t: 0, idx: 0 }; if (def.id === 'rings') { group.visible = true; paintRings(0); } return m; }
  function stop() { group.visible = false; }
  function paintRings(i) { rings.forEach((r, k) => { r.mesh.visible = k >= i; r.mesh.material.opacity = k === i ? 0.95 : 0.3; r.mesh.material.color.setHex(k === i ? 0xffa733 : ORANGE); r.mesh.scale.setScalar(k === i ? 1.08 : 1); }); }
  function update(m, kind, v, dt) {
    const d = m.def; m.t += dt;
    if (d.vehicle !== kind) return { state: 'fail', reason: 'Wrong vehicle' };
    if (d.limit && m.t > d.limit) return { state: 'fail', reason: 'Out of time' };
    if (d.id === 'rings') {
      const r = rings[m.idx]; if (Math.hypot(v.pos.x - r.x, v.pos.y - r.y, v.pos.z - r.z) < 17) { m.idx++; m.ringFlash = 0.4; if (m.idx >= rings.length) return { state: 'done' }; paintRings(m.idx); }
      const n = rings[m.idx]; return { state: 'run', objective: `Ring ${m.idx + 1}/${rings.length} · ${fmt(d.limit - m.t)} left`, target: { x: n.x, y: n.y, z: n.z, label: `Ring ${m.idx + 1}` } };
    }
    if (d.id === 'delivery') { const to = st[d.to]; if (landedAt(v, d.to)) return { state: 'done' };
      return { state: 'run', objective: `Deliver to ${to.name} · land & stop · ${fmt(d.limit - m.t)} left`, target: { x: to.padX, y: to.h, z: to.padZ, label: to.name } }; }
    if (d.id === 'eco') { const to = st[d.to];
      if (!v.grounded) m.left = true;
      if (m.left && v.charging && !landedAt(v, d.to)) return { state: 'fail', reason: 'No charging stops on the eco flight' };
      if (v.battery < d.minEnd) return { state: 'fail', reason: `Battery fell below ${d.minEnd}%` };
      if (landedAt(v, d.to)) return { state: 'done' };
      return { state: 'run', objective: `Land at ${to.name} with ≥${d.minEnd}% · now ${Math.floor(v.battery)}% · ${fmt(m.t)}`, target: { x: to.padX, y: to.h, z: to.padZ, label: to.name } }; }
    if (d.id === 'tour') {
      if (m.idx < tour.length) { const w = tour[m.idx]; if (Math.hypot(v.pos.x - w.x, v.pos.z - w.z) < 80 && v.pos.y < w.top + 140) m.idx++; }
      if (m.idx < tour.length) { const w = tour[m.idx]; return { state: 'run', objective: `Fly past ${w.label} (${m.idx + 1}/${tour.length}) · ${fmt(m.t)}`, target: { x: w.x, y: w.top, z: w.z, label: w.label } }; }
      const s = st[d.start]; if (v.charging && world.onPad(v.pos.x, v.pos.z, 22) === s) return { state: 'done' };
      return { state: 'run', objective: `Return to the ${s.name} pad and settle on it · ${fmt(m.t)}`, target: { x: s.padX, y: s.h, z: s.padZ, label: s.name } };
    }
    return { state: 'run', objective: '' };
  }
  return { defs, rings, tour, group, start, stop, update };
}

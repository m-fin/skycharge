// Per-vehicle FLYABLE cockpits (1.0.8.2, SKYCHARGE Look). The cabin / cockpit view is where you fly from, so every
// interior looks forward: horizon a little under mid-screen, a clear windscreen over the middle of the screen, and a
// nose / frame / handlebar cue for heading. Rules (STYLE_GUIDE.md "First-Person Cockpits", HOUSE_STYLE.md, PERF.md):
//  - NO lights of any kind in here (a cabin point light cost 78.9 ms vs 12.6 ms on first entry, Flow). Warmth is baked
//    into vertex colours; down-facing panels go in the unlit "glow" mesh so they don't pick up the green ground light.
//  - Every cockpit is <= 4 draw calls: one merged Lambert mesh (vertex colours), one merged unlit mesh, one live gauge
//    canvas (256 px wide), plus the scooter's turning handlebars. Triangle counts are in CHANGES.md.
//  - Live gauges: ONE small CanvasTexture per cockpit (attitude disc, heading tape, speed, altitude, battery / air /
//    vario), redrawn at most 10x a second by updateCockpit(cab, state). No text on any other surface.
// Each builder returns { group, eye, look, setGauge(pct, label, info), gauge, kind } (setGauge kept for main.mjs today).
import * as THREE from '../vendor/three.module.js';
import { createKit } from './kit.mjs';
const ORANGE = 0xf7931a, PI = Math.PI, D2R = PI / 180;
// palette (STYLE_GUIDE.md section 2 / 7)
const DARK = 0x15171c, CREAM = 0xe9dcc6, FABRIC = 0xcfc2aa, WOOD = 0x8a5a36, WOOD_D = 0x6b4a2e, WHITE = 0xf4f4f2, GLASS = 0x1b3550, TEAL = 0x1f7f8c, GREY = 0x9aa0a8, HEADLINER = 0xe9dfcf;
const LIT_OPTS = { side: THREE.DoubleSide }; // every cockpit shares ONE Lambert program and ONE Basic program (prewarm compiles them once)

// ---------------------------------------------------------------- helpers
const ySight = (E, dz, deg) => E.y - dz * Math.tan(deg * D2R); // height of the eye's sight line `deg` below level, dz ahead
function faceRot(P, E) { const dx = E.x - P[0], dy = E.y - P[1], dz = E.z - P[2]; return [Math.atan2(-dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0]; } // YXZ euler that turns +Z toward the eye
function rrect(w, h, r, seg = 3) { const s = new THREE.Shape(), x = -w / 2, y = -h / 2; s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return new THREE.ShapeGeometry(s, seg); }
const along = (P, rot, d) => { const n = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')); return [P[0] + n.x * d, P[1] + n.y * d, P[2] + n.z * d]; };
// cheap paint depth: on vertices that carry the paint colour, lift up-facing faces toward a cool sheen and darken the
// lower / side faces, plus a gentle front-to-back gradient. Pure vertex colours: no lights, no extra draw calls.
function paintSheen(geo, hex) {
  const c0 = new THREE.Color(hex), hi = new THREE.Color(0x4a5566), lo = new THREE.Color(0x0b0c0f), col = geo.getAttribute('color'), nor = geo.getAttribute('normal'), pos = geo.getAttribute('position'), t = new THREE.Color();
  for (let i = 0; i < col.count; i++) { if (Math.abs(col.getX(i) - c0.r) + Math.abs(col.getY(i) - c0.g) + Math.abs(col.getZ(i) - c0.b) > 0.004) continue;
    const ny = nor.getY(i), zf = Math.min(1, Math.max(0, (-pos.getZ(i) - 0.2) / 2.2)); // 0 at the cockpit, 1 at the nose
    t.copy(c0); if (ny > 0) t.lerp(hi, ny * (0.55 - 0.25 * zf)); else t.lerp(lo, -ny * 0.6); col.setXYZ(i, t.r, t.g, t.b); }
  col.needsUpdate = true;
}
const meshes = (K, L) => [K.mesh('lambert', LIT_OPTS), L.mesh('basic')];
// a rounded knob (short cylinder + orange cap) on a panel
function knob(K, P, rot, r = 0.018) { const geo = new THREE.CylinderGeometry(r, r * 1.1, 0.02, 10); geo.rotateX(PI / 2); K.add(geo, ORANGE, along(P, rot, 0.012), rot); }

// ---------------------------------------------------------------- live gauge canvas
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath(); }
export const GAUGE_MIN_FONT = 17; // smallest text in the 256 x 128 gauge layout (layout px). Gauges are sized so 17 layout px >= 24 px at 1080p.
function fit(c, txt, x, y, maxW, px, align = 'right') { c.font = `bold ${px}px ui-monospace, Menlo, Consolas, monospace`; let w = c.measureText(txt).width; if (w > maxW) { px = Math.max(GAUGE_MIN_FONT, Math.floor(px * maxW / w)); c.font = `bold ${px}px ui-monospace, Menlo, Consolas, monospace`; } c.textAlign = align; c.fillText(txt, x, y); }
function bolt(c, x, y, s) { c.beginPath(); c.moveTo(x + 2 * s, y); c.lineTo(x - 3 * s, y + 7 * s); c.lineTo(x, y + 7 * s); c.lineTo(x - 2 * s, y + 13 * s); c.lineTo(x + 3 * s, y + 5 * s); c.lineTo(x, y + 5 * s); c.closePath(); c.fill(); }
// drawn in a 256 x 128 layout, scaled to the canvas. kind: 'wing' (plane, seaplane, blimp), 'glider' (vario instead of battery), 'hover' (battery + air jets)
function drawGauge(c, W, H, s, kind) {
  c.save(); c.setTransform(W / 256, 0, 0, H / 128, 0, 0); c.textBaseline = 'alphabetic';
  c.fillStyle = '#1a1c21'; c.fillRect(0, 0, 256, 128); rr(c, 2, 2, 252, 124, 14); c.fillStyle = '#0d1017'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(247,147,26,.75)'; c.stroke();
  // attitude disc (artificial horizon): sky / grass, rotates with roll, slides with pitch; orange "you" symbol stays fixed
  const cx = 54, cy = 64, r = 47, pitch = clamp(s.pitch || 0, -0.7, 0.7), roll = s.roll || 0, k = 80; // 80 px per radian
  c.save(); c.beginPath(); c.arc(cx, cy, r, 0, PI * 2); c.clip(); c.translate(cx, cy); c.rotate(-roll); const off = pitch * k;
  c.fillStyle = '#3d7cc9'; c.fillRect(-90, -200 + off, 180, 200); c.fillStyle = '#9fc8ec'; c.fillRect(-90, -16 + off, 180, 16);
  c.fillStyle = '#5f9a45'; c.fillRect(-90, off, 180, 200); c.fillStyle = '#447a36'; c.fillRect(-90, off + 22, 180, 200);
  c.fillStyle = '#f4f4f2'; c.fillRect(-90, off - 1.5, 180, 3);
  for (const d of [-20, -10, 10, 20]) { const y = off - d * D2R * k, w = Math.abs(d) === 10 ? 16 : 10; c.fillRect(-w, y - 1, 2 * w, 2); }
  c.restore();
  c.lineWidth = 3; c.strokeStyle = '#f4f4f2'; c.beginPath(); c.arc(cx, cy, r, 0, PI * 2); c.stroke();
  c.fillStyle = '#f4f4f2'; for (const a of [-60, -30, 0, 30, 60]) { c.save(); c.translate(cx, cy); c.rotate(a * D2R); c.fillRect(-1.5, -r, 3, a ? 6 : 9); c.restore(); } // bank scale
  c.save(); c.translate(cx, cy); c.rotate(-roll); c.fillStyle = '#ffc46b'; c.beginPath(); c.moveTo(0, -r + 10); c.lineTo(-5, -r + 18); c.lineTo(5, -r + 18); c.closePath(); c.fill(); c.restore(); // bank pointer
  c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#f7931a'; c.beginPath(); c.moveTo(cx - 30, cy); c.lineTo(cx - 11, cy); c.lineTo(cx, cy + 8); c.lineTo(cx + 11, cy); c.lineTo(cx + 30, cy); c.stroke();
  c.fillStyle = '#f7931a'; c.beginPath(); c.arc(cx, cy, 3.5, 0, PI * 2); c.fill();
  // heading tape (N / E / S / W letters), orange caret = your heading
  const tx = 108, tw = 104, tc = tx + tw / 2, hdg = (((s.heading || 0) / D2R) % 360 + 360) % 360;
  c.save(); rr(c, tx, 5, tw, 28, 6); c.fillStyle = '#23262d'; c.fill(); c.clip(); c.fillStyle = '#f4f4f2'; c.textAlign = 'center';
  for (let d = Math.floor((hdg - 60) / 15) * 15; d <= hdg + 60; d += 15) { const x = tc + (d - hdg) * 1.0, dd = ((d % 360) + 360) % 360, lab = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[dd];
    c.fillRect(x - 1, 5, 2, dd % 45 ? 5 : 8); if (lab) { c.fillStyle = lab === 'N' ? '#ffc46b' : '#f4f4f2'; c.font = 'bold 19px ui-monospace, Menlo, Consolas, monospace'; c.fillText(lab, x, 30); c.fillStyle = '#f4f4f2'; } } // (the small 30-degree numbers were dropped: too small for a TV)
  c.restore(); c.fillStyle = '#f7931a'; c.beginPath(); c.moveTo(tc - 6, 33); c.lineTo(tc + 6, 33); c.lineTo(tc, 25); c.closePath(); c.fill();
  // speed + altitude, big digits
  c.fillStyle = '#ffffff'; fit(c, String(Math.max(0, Math.round(s.speed || 0))), 157, 68, 48, 30); fit(c, String(Math.round(s.alt || 0)), 212, 68, 52, 30);
  c.fillStyle = '#bbbbbb'; c.font = `bold ${GAUGE_MIN_FONT}px system-ui, sans-serif`; c.textAlign = 'right'; c.fillText(s.unit || 'KM/H', 157, 89); c.fillText('M', 212, 89); // units only ("ALT" dropped: the M says it)
  c.fillStyle = '#f4f4f2'; c.textAlign = 'left'; c.font = `bold ${GAUGE_MIN_FONT}px ui-monospace, Menlo, Consolas, monospace`; c.fillText('HDG ' + String(Math.round(hdg) % 360).padStart(3, '0'), 108, 120);
  // right column: battery / air / vario
  const charge = clamp(s.charge == null ? 100 : s.charge, 0, 100), low = charge < 20, batCol = low ? '#ff4a3a' : '#f7931a';
  const bar = (x, w, frac, col) => { rr(c, x, 14, w, 90, 4); c.fillStyle = '#23262d'; c.fill(); const h = 86 * clamp(frac, 0, 1); c.fillStyle = col; c.fillRect(x + 2, 102 - h, w - 4, h); rr(c, x, 14, w, 90, 4); c.lineWidth = 1.5; c.strokeStyle = '#888888'; c.stroke(); c.fillStyle = '#888888'; c.fillRect(x + w / 2 - 4, 10, 8, 4); };
  if (kind === 'glider') { // vario: climb up (light orange), sink down (blue), +-3 m/s full scale
    const cl = clamp(s.climb || 0, -3, 3), h = Math.abs(cl) / 3 * 43; rr(c, 222, 14, 26, 90, 4); c.fillStyle = '#23262d'; c.fill(); c.fillStyle = cl >= 0 ? '#ffc46b' : '#6aa8ff'; c.fillRect(224, cl >= 0 ? 59 - h : 59, 22, h);
    c.fillStyle = '#f4f4f2'; c.fillRect(220, 58, 30, 2); c.fillStyle = cl >= 0 ? '#ffc46b' : '#6aa8ff'; fit(c, (cl >= 0 ? '+' : '') + cl.toFixed(1), 253, 121, 44, GAUGE_MIN_FONT);
  } else if (kind === 'hover') { // battery + air jets (unlimited air: the bar is how hard the jets are blowing)
    bar(218, 16, charge / 100, batCol); bar(237, 16, s.boost || 0, '#9fc8ec'); c.fillStyle = batCol; fit(c, String(Math.round(charge)), 236, 121, 36, GAUGE_MIN_FONT, 'center'); // battery % (the tiny infinity mark was dropped)
  } else { bar(222, 26, charge / 100, batCol); c.fillStyle = batCol; fit(c, String(Math.round(charge)), 235, 121, 36, GAUGE_MIN_FONT, 'center'); } // % sign dropped for size
  if (s.charging && kind !== 'glider') { c.fillStyle = '#0d1017'; bolt(c, kind === 'hover' ? 226 : 235, 46, 1.6); }
  c.restore();
}
const GAUGE_PX = 384; // canvas width (384 x 192 for the 2:1 screens): sharper than 256 on a TV, 295 KB per upload at <= 10 Hz
// gauge screen: w x h metres, GAUGE_PX wide canvas. Exposed as cab.gauge = { mesh, state, draw() }
function makeGauge(w, h, kind) {
  const cv = document.createElement('canvas'); cv.width = GAUGE_PX; cv.height = Math.round(GAUGE_PX * h / w); const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter; // NPOT-safe on WebGL1, no mip rebuild per redraw
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); mesh.name = 'cockpitGauge';
  const gauge = { mesh, kind, state: { pitch: 0, roll: 0, heading: 0, speed: 0, alt: 0, charge: 100, boost: 0, climb: 0, charging: false, unit: 'KM/H' }, last: -1e9, draws: 0,
    draw() { drawGauge(cv.getContext('2d'), cv.width, cv.height, gauge.state, kind); tex.needsUpdate = true; gauge.draws++; } };
  gauge.draw(); return gauge;
}
// old main.mjs API: setGauge(pct, label, info{speed, climb, alt}) every 0.5 s while in the cabin view. Folds into the same state.
const legacySetGauge = (gauge) => (pct, label, info = {}) => { const st = gauge.state; st.charge = pct; st.charging = label === 'CHARGING';
  if (info.speed != null) st.speed = info.speed; if (info.alt != null) st.alt = info.alt; if (info.climb != null) st.climb = info.climb; gauge.draw(); gauge.last = now(); };
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// PUBLIC: updateCockpit(cab, state[, force]) -> true when it redrew. Call it every frame while the cockpit is shown; it
// redraws at most every 100 ms (10 Hz) and does nothing while the cockpit group is hidden.
// state (all optional, missing keys keep their last value):
//   pitch   rad, nose up +        roll   rad, right wing down +      heading  rad, 0 = north (-Z), clockwise (headingOf())
//   speed   number in the player's units (main.mjs `spd`)           unit     'KM/H' | 'KT'
//   alt     metres (v.pos.y)       charge  battery 0..100            boost    air-jet output 0..1 (roadster / scooter)
//   climb   m/s (glider vario, main.mjs climbEMA)                    charging bool (bolt on the battery bar)
export function updateCockpit(cab, state, force = false) {
  const g = cab && cab.gauge; if (!g || (!force && !cab.group.visible)) return false;
  if (state) Object.assign(g.state, state); const t = now(); if (!force && t - g.last < 100) return false;
  g.last = t; g.draw(); return true;
}
// PUBLIC helper: the attitude main.mjs should pass for each vehicle (display only, reads the vehicle state as it is today)
const _f = new THREE.Vector3(), _r = new THREE.Vector3();
export function cockpitAttitude(kind, v) {
  if (v.quat) { _f.set(0, 0, -1).applyQuaternion(v.quat); _r.set(1, 0, 0).applyQuaternion(v.quat); return { pitch: Math.asin(clamp(_f.y, -1, 1)), roll: -Math.asin(clamp(_r.y, -1, 1)) }; } // plane, seaplane, glider
  if (kind === 'blimp') return { pitch: v.tilt || 0, roll: -(v.bank || 0) }; // blimpG.rotation.set(tilt, -yaw, bank)
  return { pitch: v.pitchVis || 0, roll: -((v.rollVis || 0) + (v.lean || 0)) }; // roadster / scooter: g.rotation.set(pitchVis, -yaw, rollVis + lean)
}

// a dash: a thin dark rounded lip `lipDeg` below the eye line (its top sits at about 25 % screen height), a glare shield that
// slopes DOWN away from the pilot (so its top never shows), and a tilted wood / cream panel under the lip that faces the
// pilot with the live gauge on it. The gauge's top is kept 1.6 deg under the lip so the lip never clips the heading tape.
function addDash(K, L, E, o) {
  const lipZ = E.z - o.lipDz, lipY = ySight(E, o.lipDz, o.lipDeg), cx = o.cx || 0, w = o.w, a = -(o.lipDeg + 14) * D2R, sd = o.shieldD || 0.3;
  K.add(new THREE.CylinderGeometry(0.006, 0.006, w, 8), DARK, [cx, lipY - 0.006, lipZ], [0, 0, PI / 2]); // rounded lip (thin, so the gauge can sit high)
  K.box(w, 0.016, sd, cx, lipY - 0.012 + Math.sin(a) * sd / 2, lipZ - Math.cos(a) * sd / 2, DARK, a); // glare shield, front edge down
  const dist = o.gDz, half = Math.atan(o.gH / 2 / (dist / Math.cos((o.lipDeg + 6) * D2R))) / D2R, gDeg = o.lipDeg + 1.6 + half;
  const gx = o.gx == null ? cx : o.gx, P = [gx, ySight(E, dist, gDeg), E.z - dist], rot = faceRot([cx, P[1], P[2]], { x: cx, y: E.y, z: E.z });
  const ph = o.panelH || 0.3, up = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(rot[0], 0, 0, 'YXZ'));
  const topT = (lipY - 0.016 - P[1]) / up.y, mid = topT - ph / 2, C = [cx, P[1] + up.y * mid, P[2] + up.z * mid];
  K.add(rrect(w - 0.02, ph, 0.05), o.face || WOOD, along(C, rot, -0.004), rot); // panel face (behind the gauge)
  K.add(rrect(o.gW + 0.026, o.gH + 0.026, 0.02), o.bezel || CREAM, along(P, rot, 0.002), [rot[0], 0, 0]); // gauge bezel
  K.box(w - 0.04, ph, 0.1, ...along(C, rot, -0.06), o.body || DARK, rot[0]); // panel body (closes the back)
  return { P: along(P, rot, 0.007), rot: [rot[0], 0, 0], C, crot: rot, gDeg };
}
function placeGauge(g, gauge, pose) { gauge.mesh.position.set(pose.P[0], pose.P[1], pose.P[2]); gauge.mesh.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2], 'YXZ'); g.add(gauge.mesh); }
function finish(g, gauge, eye, look, kind, extra = {}) { g.name = kind + 'Cockpit'; const cab = Object.assign({ group: g, eye, look, gauge, kind, setGauge: legacySetGauge(gauge) }, extra); cab.update = (st, f) => updateCockpit(cab, st, f); return cab; }

// ---------------- E-PLANE: single-seat bubble-canopy cockpit, white nose and orange spinner ahead ----------------
export function buildJetCabin() {
  const g = new THREE.Group(); g.visible = false; const K = createKit(), L = createKit();
  const E = new THREE.Vector3(0, 0.72, -1.25);
  const dash = addDash(K, L, E, { lipDz: 0.52, lipDeg: 17.8, shieldD: 0.3, w: 1.08, gDz: 0.5, gW: 0.208, gH: 0.104, panelH: 0.34, face: WOOD });
  for (const sx of [-1, 1]) knob(K, along([sx * 0.2, dash.P[1] + 0.005, dash.P[2]], dash.rot, -0.004), dash.crot, 0.016); // two orange knobs either side of the gauge
  // nose cowl ahead (top just under the glare-shield line) + orange spinner = heading cue
  K.add(new THREE.CylinderGeometry(0.22, 0.5, 3.75, 12, 1), WHITE, [0, -0.05, -3.675], [-PI / 2, 0, 0], [0.85, 1, 1]); // starts under the lip, so no gap
  K.add(new THREE.ConeGeometry(0.26, 0.6, 10), ORANGE, [0, -0.05, -5.85], [-PI / 2, 0, 0]);
  K.box(0.06, 0.012, 3.0, 0, 0.313, -3.8, ORANGE, -0.0745); // thin orange centre stripe on the cowl: lines up with the nose
  // canopy: front bow (outside the middle 60 % of the screen) + rear bow, glass-coloured sill rims, cream cockpit sills
  K.add(new THREE.TorusGeometry(0.62, 0.014, 5, 18, PI), DARK, [0, 0.48, -1.9], [0, 0, 0], [1, 0.95, 1]);
  K.add(new THREE.TorusGeometry(0.62, 0.03, 5, 18, PI), DARK, [0, 0.48, -0.55], [0, 0, 0], [1, 0.95, 1]);
  for (const sx of [-1, 1]) { K.box(0.12, 0.08, 2.1, sx * 0.62, 0.45, -1.15, CREAM); K.box(0.04, 0.02, 1.4, sx * 0.6, 0.5, -1.2, GLASS); K.box(0.02, 0.04, 1.0, sx * 0.55, 0.43, -1.05, ORANGE); // sills + glass rim + orange pinstripe
    K.box(0.06, 0.3, 2.0, sx * 0.66, 0.28, -1.1, WHITE); } // fuselage side under the sill
  knob(K, [-0.52, 0.5, -1.45], [-PI / 2, 0, 0], 0.022); // throttle knob on the left sill
  // low wing + orange tips, seen when you look out to the side; seat back behind
  for (const sx of [-1, 1]) { K.box(5.5, 0.16, 1.7, sx * 3.45, 0.05, -0.6, WHITE); K.box(0.9, 0.2, 1.72, sx * 6.2, 0.05, -0.6, ORANGE); }
  K.box(0.5, 0.7, 0.1, 0, 0.35, -0.6, FABRIC, 0.15);
  g.add(...meshes(K, L)); const gauge = makeGauge(0.208, 0.104, 'wing'); placeGauge(g, gauge, dash);
  return finish(g, gauge, E, { yaw: 0, pitch: 0.03 }, 'plane');
}

// ---------------- SEAPLANE: bush-plane cockpit, left seat, big side windows, teal trim, high wing + floats ----------------
export function buildFloatCabin() {
  const g = new THREE.Group(); g.visible = false; const K = createKit(), L = createKit();
  const E = new THREE.Vector3(-0.32, 0.66, -1.0), W = 0.86, ZF = -1.75;
  const dash = addDash(K, L, E, { cx: 0, gx: -0.32, lipDz: 0.56, lipDeg: 17.8, shieldD: 0.3, w: 1.6, gDz: 0.54, gW: 0.226, gH: 0.113, panelH: 0.34, face: CREAM, bezel: WOOD });
  knob(K, along([0.02, dash.P[1], dash.P[2]], dash.rot, -0.004), dash.crot, 0.018); knob(K, along([0.1, dash.P[1], dash.P[2]], dash.rot, -0.004), dash.crot, 0.018); // throttle + mixture knobs (centre stack)
  K.box(0.24, 0.12, 0.01, 0.38, dash.P[1], dash.P[2] + 0.004, WOOD, dash.rot[0]); for (const x of [0.32, 0.38, 0.44]) K.cyl(0.02, 0.02, 0.012, 10, x, dash.P[1], dash.P[2] + 0.012, 0x23262d, dash.rot[0] + PI / 2); // passenger-side dials (static)
  K.box(1.6, 0.02, 0.02, 0, dash.C[1] + 0.06, dash.C[2] + 0.01, TEAL, dash.rot[0]); // teal trim line across the panel
  // nose cowl + spinner ahead (centred, so it sits a little right of the left seat's view)
  K.add(new THREE.CylinderGeometry(0.24, 0.55, 3.6, 12, 1), WHITE, [0, -0.12, -3.5], [-PI / 2, 0, 0], [0.9, 1, 1]);
  K.add(new THREE.ConeGeometry(0.28, 0.6, 10), ORANGE, [0, -0.12, -5.55], [-PI / 2, 0, 0]);
  K.box(0.06, 0.01, 2.6, 0, 0.276, -3.4, TEAL, -0.086);
  // frame: A-pillars at the windscreen corners, roof header, door posts, sills; roof headliner is unlit (no green bounce)
  for (const sx of [-1, 1]) { K.rod([sx * 0.82, 0.42, -1.5], [sx * 0.78, 1.0, -1.2], 0.018, DARK); // slim A-pillars, outside the middle 60 %
    K.box(0.05, 0.05, 1.7, sx * W, 1.0, -0.35, DARK); K.box(0.07, 0.07, 2.2, sx * W, 0.42, -0.65, CREAM); K.box(0.02, 0.05, 2.2, sx * (W - 0.04), 0.4, -0.65, TEAL); // top rail, sill, teal trim
    K.rod([sx * W, 0.42, 0.1], [sx * W, 1.0, 0.1], 0.025, DARK); K.box(0.05, 0.6, 2.4, sx * (W + 0.02), 0.1, -0.6, CREAM); } // door post (behind you), lower door panel
  K.box(1.62, 0.04, 0.05, 0, 1.0, -1.2, DARK); L.box(1.72, 0.03, 1.5, 0, 1.03, -0.45, HEADLINER); L.box(0.6, 0.012, 0.6, 0, 1.015, -0.3, 0x8fc3dc); // header (above the view) + headliner + skylight
  // high wing above the roof, lift struts, twin floats below (what you see out of the side windows)
  for (const sx of [-1, 1]) { L.box(5.9, 0.18, 1.8, sx * 3.75, 1.14, -0.8, 0xdedcd6); L.box(0.9, 0.2, 1.82, sx * 6.7, 1.14, -0.8, 0x1a6d78); // wing: unlit, its underside would turn olive under the ground light
    K.rod([sx * 0.95, 0.0, -0.8], [sx * 2.9, 1.05, -0.8], 0.04, WHITE); K.rod([sx * 1.0, -0.3, -0.8], [sx * 1.5, -1.6, -0.8], 0.04, GREY);
    K.add(new THREE.CylinderGeometry(0.4, 0.4, 6.4, 8, 1), WHITE, [sx * 1.55, -1.95, -0.1], [PI / 2, 0, 0], [1, 1, 0.82]); K.add(new THREE.ConeGeometry(0.4, 1.3, 8), WHITE, [sx * 1.55, -1.9, -3.95], [-PI / 2, 0, 0], [1, 1, 0.82]);
    K.box(0.08, 0.04, 6.0, sx * 1.55, -1.62, -0.1, ORANGE); } // orange keel line on top of each float
  // yoke between the seats is out of view; a mug on the centre console for coziness
  K.cyl(0.035, 0.03, 0.08, 10, 0.05, dash.C[1] - 0.12, dash.C[2] + 0.22, ORANGE);
  g.add(...meshes(K, L)); const gauge = makeGauge(0.226, 0.113, 'wing'); placeGauge(g, gauge, dash);
  return finish(g, gauge, E, { yaw: 0, pitch: 0.03 }, 'seaplane');
}

// ---------------- BLIMP: gondola bridge, waist-high wood console, the biggest windows (NEW) ----------------
// Gondola-local coordinates (box centre). main.mjs today places the blimp interior at y = -6.9 under the envelope,
// which is exactly the gondola centre, so it can replace buildCabin() 1:1.
export function buildBlimpGondola() {
  const g = new THREE.Group(); g.visible = false; const K = createKit(), L = createKit();
  const E = new THREE.Vector3(0, 0.28, -2.45), HW = 1.38, Y0 = -1.08, Y1 = 1.08, ZF = -3.72, ZB = 3.72;
  const dash = addDash(K, L, E, { lipDz: 0.6, lipDeg: 17.8, shieldD: 0.3, w: 1.9, gDz: 0.58, gW: 0.242, gH: 0.121, panelH: 0.5, face: WOOD, body: WOOD_D });
  for (const sx of [-1, 1]) knob(K, along([sx * 0.26, dash.P[1], dash.P[2]], dash.rot, -0.004), dash.crot, 0.02);
  K.cyl(0.035, 0.03, 0.09, 10, -0.62, ySight(E, 0.6, 17.8) + 0.045, E.z - 0.62, ORANGE); K.add(new THREE.TorusGeometry(0.022, 0.007, 4, 8), ORANGE, [-0.665, ySight(E, 0.6, 17.8) + 0.05, E.z - 0.62], [0, PI / 2, 0]); // mug on the console
  K.add(new THREE.TorusGeometry(0.17, 0.018, 5, 16), WOOD, [0.62, dash.C[1] - 0.06, dash.C[2] + 0.12], dash.crot); // elevator wheel (wood), right of the console
  for (let i = 0; i < 4; i++) K.box(0.34, 0.016, 0.016, 0.62, dash.C[1] - 0.06, dash.C[2] + 0.12, WOOD_D, dash.crot[0], 0, i * PI / 4);
  K.cyl(0.03, 0.03, 0.03, 10, 0.62, dash.C[1] - 0.06, dash.C[2] + 0.14, ORANGE, dash.crot[0] + PI / 2);
  // floor, lower walls (cream), corner posts, window rails; ceiling unlit so it stays warm cream
  K.box(2 * HW, 0.05, ZB - ZF, 0, Y0, 0, 0x27303d); L.box(2 * HW, 0.04, ZB - ZF, 0, Y1, 0, HEADLINER);
  for (const sx of [-1, 1]) { K.box(0.05, 0.62, ZB - ZF, sx * HW, Y0 + 0.31, 0, CREAM); K.box(0.06, 0.05, ZB - ZF, sx * HW, -0.45, 0, WOOD); K.box(0.06, 0.08, ZB - ZF, sx * HW, 0.98, 0, DARK);
    for (const z of [-2.2, -0.6, 1.0, 2.6]) K.box(0.06, 1.45, 0.06, sx * HW, 0.27, z, DARK); // window posts down the sides
    K.rod([sx * HW, -0.45, ZF + 0.02], [sx * HW, 0.98, ZF + 0.02], 0.035, DARK); } // front corner posts (well outside the middle 60 %)
  K.box(2 * HW, 0.08, 0.06, 0, 0.98, ZF, DARK); K.box(2 * HW, 0.55, 0.05, 0, Y0 + 0.28, ZF, CREAM); K.box(2 * HW, Y1 - Y0, 0.05, 0, 0, ZB, CREAM); // front header, front lower wall, back wall
  // pilot seat behind you, orange cushion on the bench at the back, little plant: you see them when you look around
  K.box(2.2, 0.4, 0.5, 0, Y0 + 0.2, 3.3, WOOD); K.box(2.1, 0.1, 0.48, 0, Y0 + 0.45, 3.3, FABRIC); K.box(0.4, 0.3, 0.12, -0.5, Y0 + 0.65, 3.45, ORANGE, -0.2);
  K.cyl(0.12, 0.09, 0.22, 8, 1.1, Y0 + 0.11, 3.0, DARK); K.add(new THREE.IcosahedronGeometry(0.18, 0), 0x3f8a45, [1.1, Y0 + 0.36, 3.0], [0, 0, 0], [1, 1.4, 1]);
  // engine pods out the sides (orange), so the side view reads as the blimp
  for (const sx of [-1, 1]) { K.add(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 10, 1), ORANGE, [sx * 2.4, 0.5, 1.5], [PI / 2, 0, 0]); K.rod([sx * HW, 0.5, 1.5], [sx * 2.0, 0.5, 1.5], 0.06, GREY); }
  g.add(...meshes(K, L)); const gauge = makeGauge(0.242, 0.121, 'wing'); placeGauge(g, gauge, dash);
  return finish(g, gauge, E, { yaw: 0, pitch: 0.03 }, 'blimp');
}

// ---------------- HANG GLIDER: you hang prone under the wing (harness on the keel). Open and airy: the cream sail with an
// orange leading edge spans the top of the screen, the keel runs overhead, thin A-frame uprights frame the sides, the control
// bar and your two gloved hands sit in the lower ~fifth, the harness pod is just out of frame below (look down to see it), and
// a small strap-on climb meter (vario + altitude) is clamped to the right upright. No dash, no lights. 3 draw calls:
// sail + keel + leading-edge tubes (ONE unlit Basic mesh, vertex-colour "light through the fabric"), the pilot rig (ONE
// Lambert mesh: uprights, bar, wires, arms, gloves, pod, meter mount) and the climb meter canvas.
// Eye / look are the two constants below (group-local metres; the group origin is the glider's hang point area on the keel).
// Flow owns sway / FOV / pendulum: tune GLIDER_EYE and GLIDER_LOOK, or move cab.eye at runtime (the camera reads it every frame).
export const GLIDER_EYE = Object.freeze({ x: 0, y: -0.65, z: -0.2 }); // under the keel, 0.85 m below it, head just behind the A-frame apex
export const GLIDER_LOOK = Object.freeze({ yaw: 0, pitch: 0.075 }); // rad; +0.075 puts the horizon at ~47-51 % in trimmed glide (glider pitch -0.03 .. -0.08)
const SAIL = { nose: [0, 0.25, -2.3], tip: [5.0, -0.12, 0.85], root: [0, 0.18, 1.1], mid: [2.1, 0.12, 1.6], billow: 0.12 }; // full-span delta (10 m)
const BAR = { y: -1.15, z: -1.4, hx: 0.72 }, APEX = [0, 0.15, -0.5]; // control bar (group-local) and the A-frame apex on the keel
const SAIL_CREAM = 0xf3e4c6, SAIL_LIT = 0xfff3da, SAIL_POCKET = 0xd6c3a2, BATTEN = 0xc9b491, TUBE = 0xa9adb3, NAVY = 0x1d2a3a, GLOVE = 0x2b2f36;
// sail point at span u (-1 left tip .. 0 keel .. 1 right tip) and chord v (0 leading edge .. 1 trailing edge)
function sailPt(u, v, drop = 0) {
  const a = Math.abs(u), sx = Math.sign(u) || 1, N = SAIL.nose, T = SAIL.tip, R = SAIL.root, M = SAIL.mid;
  const le = [sx * T[0] * a, N[1] + (T[1] - N[1]) * a, N[2] + (T[2] - N[2]) * a];
  const k = a / (M[0] / T[0]), te = a <= M[0] / T[0] ? [sx * M[0] * k, R[1] + (M[1] - R[1]) * k, R[2] + (M[2] - R[2]) * k]
    : (() => { const j = (a - M[0] / T[0]) / (1 - M[0] / T[0]); return [sx * (M[0] + (T[0] - M[0]) * j), M[1] + (T[1] - M[1]) * j, M[2] + (T[2] - M[2]) * j]; })();
  const b = SAIL.billow * Math.sin(PI * v) * (1 - a * a); // the sail billows up between the tubes
  return [le[0] + (te[0] - le[0]) * v, le[1] + (te[1] - le[1]) * v + b - drop, le[2] + (te[2] - le[2]) * v];
}
// the sail as ONE vertex-coloured triangle soup: orange leading-edge band, a denser leading-edge pocket (double fabric, darker),
// then the single-skin body that glows warm toward the middle (sun through the cloth), with darker batten lines
function sailGeometry() {
  const pos = [], col = [], c = new THREE.Color(), cA = new THREE.Color(SAIL_CREAM), cB = new THREE.Color(SAIL_LIT);
  const quad = (p, cs) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); col.push(cs[i].r, cs[i].g, cs[i].b); } };
  const body = (u, v) => { const glow = Math.sin(PI * Math.min(1, (v - 0.1) / 0.9)) * (1 - Math.abs(u) * 0.7); return c.copy(cA).lerp(cB, clamp(glow, 0, 1)).clone(); };
  const US = [-1, -0.84, -0.68, -0.52, -0.36, -0.22, -0.1, 0, 0.1, 0.22, 0.36, 0.52, 0.68, 0.84, 1], VS = [0, 0.05, 0.13, 0.3, 0.5, 0.72, 1];
  for (let i = 0; i < US.length - 1; i++) for (let j = 0; j < VS.length - 1; j++) {
    const u0 = US[i], u1 = US[i + 1], v0 = VS[j], v1 = VS[j + 1], P = [sailPt(u0, v0), sailPt(u1, v0), sailPt(u1, v1), sailPt(u0, v1)];
    const cs = j === 0 ? Array(4).fill(new THREE.Color(ORANGE)) : j === 1 ? Array(4).fill(new THREE.Color(SAIL_POCKET)) : [body(u0, v0), body(u1, v0), body(u1, v1), body(u0, v1)];
    quad(P, cs);
  }
  const bc = Array(4).fill(new THREE.Color(BATTEN)); // battens: thin darker strips 1 cm under the cloth (read as shadows through it)
  for (const u of [-0.76, -0.6, -0.44, -0.29, -0.15, 0.15, 0.29, 0.44, 0.6, 0.76]) { const w = 0.0045; // ~2-3 cm wide strips (u is span-normalised)
    quad([sailPt(u - w, 0.13, 0.01), sailPt(u + w, 0.13, 0.01), sailPt(u + w, 0.97, 0.01), sailPt(u - w, 0.97, 0.01)], bc); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g;
}
function concatGeo(a, b) { const out = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'color']) { const A = a.getAttribute(k).array, B = b.getAttribute(k).array, C = new Float32Array(A.length + B.length); C.set(A); C.set(B, A.length); out.setAttribute(k, new THREE.BufferAttribute(C, 3)); } out.computeBoundingSphere(); return out; }
// small strap-on climb meter: big climb number + vario bar, altitude underneath. 256 x 128 canvas, all text >= 40 layout px
const VARIO_MIN_FONT = 40;
function drawVario(c, W, H, s) {
  c.save(); c.setTransform(W / 256, 0, 0, H / 128, 0, 0); c.textBaseline = 'alphabetic';
  c.fillStyle = '#1a1c21'; c.fillRect(0, 0, 256, 128); rr(c, 3, 3, 250, 122, 16); c.fillStyle = '#0d1017'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(247,147,26,.85)'; c.stroke();
  const cl = clamp(s.climb || 0, -9.9, 9.9), up = cl >= 0, colr = up ? '#ffc46b' : '#6aa8ff', h = Math.min(3, Math.abs(cl)) / 3 * 50; // bar: +-3 m/s full scale
  rr(c, 12, 12, 30, 104, 6); c.fillStyle = '#23262d'; c.fill(); c.fillStyle = colr; c.fillRect(15, up ? 64 - h : 64, 24, h); c.fillStyle = '#f4f4f2'; c.fillRect(9, 63, 36, 3);
  c.fillStyle = colr; c.font = 'bold 56px ui-monospace, Menlo, Consolas, monospace'; c.textAlign = 'right'; c.fillText((up ? '+' : '') + cl.toFixed(1), 246, 60); // climb m/s (sign = up/down)
  c.fillStyle = '#ffffff'; c.font = `bold ${VARIO_MIN_FONT}px ui-monospace, Menlo, Consolas, monospace`; c.fillText(String(Math.max(0, Math.round(s.alt || 0))), 204, 114);
  c.fillStyle = '#bbbbbb'; c.font = `bold ${VARIO_MIN_FONT}px system-ui, sans-serif`; c.fillText('M', 246, 114); c.restore();
}
function makeVario(w, h) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); mesh.name = 'cockpitGauge';
  const gauge = { mesh, kind: 'vario', minFont: VARIO_MIN_FONT, layoutH: 128, state: { pitch: 0, roll: 0, heading: 0, speed: 0, alt: 0, charge: 100, boost: 0, climb: 0, charging: false, unit: 'KM/H' }, last: -1e9, draws: 0,
    draw() { drawVario(cv.getContext('2d'), cv.width, cv.height, gauge.state); tex.needsUpdate = true; gauge.draws++; } };
  gauge.draw(); return gauge;
}
export function buildHarnessView() {
  const g = new THREE.Group(); g.visible = false; const S = createKit(), K = createKit(), rig = new THREE.Group(); rig.name = 'gliderRig'; // S: unlit sail + tubes; K: lit pilot rig (moves with cockpitBarShift)
  const E = new THREE.Vector3(GLIDER_EYE.x, GLIDER_EYE.y, GLIDER_EYE.z), N = SAIL.nose, T = SAIL.tip, R = SAIL.root;
  // keel (just under the sail's centre seam), leading-edge tubes, orange tip caps, hang loop + carabiner down to your harness
  S.rod([0, N[1] - 0.05, N[2] - 0.05], [0, R[1] - 0.05, R[2] + 0.15], 0.035, TUBE, 8);
  for (const sx of [-1, 1]) { S.rod([0, N[1] - 0.03, N[2]], [sx * T[0], T[1] - 0.03, T[2]], 0.03, TUBE, 6); S.add(new THREE.SphereGeometry(0.05, 6, 4), ORANGE, [sx * T[0], T[1] - 0.03, T[2]]);
    S.rod([sx * 0.0, 0.12, -0.05], [sx * 2.6, 0.02, 0.15], 0.028, TUBE, 5); } // cross tube (seen when you look up)
  S.rod([0, 0.14, 0.05], [0, -0.36, 0.14], 0.012, 0x23262b, 4); S.add(new THREE.TorusGeometry(0.03, 0.008, 4, 8), ORANGE, [0, -0.38, 0.15], [0, PI / 2, 0]); // hang strap + carabiner (behind your head)
  S.rod([0, -0.4, 0.16], [0, -0.78, 0.3], 0.015, 0x23262b, 4); // harness main strap to your back
  const sg = concatGeo(S.geometry(), sailGeometry()), sail = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })); sail.name = 'gliderSail';
  // A-frame: two thin uprights from the apex on the keel down to the control bar, bar with dark grips, side wires to the tips
  const B = (sx) => [sx * BAR.hx, BAR.y, BAR.z];
  for (const sx of [-1, 1]) { K.rod(APEX, B(sx), 0.022, GREY, 8); K.add(new THREE.SphereGeometry(0.03, 6, 4), DARK, B(sx));
    K.rod(B(sx), [sx * T[0] * 0.98, T[1] - 0.04, T[2] - 0.02], 0.004, 0x6b7078, 3); // side wire to the wing tip
    K.rod(B(sx), [0, N[1] - 0.06, N[2] + 0.05], 0.004, 0x6b7078, 3); K.rod(B(sx), [0, R[1] - 0.06, R[2]], 0.004, 0x6b7078, 3); } // front + rear wires
  K.rod(B(-1), B(1), 0.02, GREY, 8);
  // you: two gloved hands on the bar (orange cuffs), forearms and upper arms back to the shoulders
  const SH = (sx) => [sx * 0.22, E.y - 0.17, E.z - 0.08], EL = (sx) => [sx * 0.3, E.y - 0.33, E.z - 0.6];
  for (const sx of [-1, 1]) { const H = [sx * 0.3, BAR.y + 0.012, BAR.z + 0.012];
    K.add(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), DARK, [sx * 0.3, BAR.y, BAR.z], [0, 0, PI / 2]); // grip
    K.add(new THREE.SphereGeometry(0.052, 8, 6), GLOVE, H, [0, 0, 0], [1.25, 0.95, 1.2]); // glove
    const cuffAt = new THREE.Vector3(...H).lerp(new THREE.Vector3(...EL(sx)), 0.16); K.rod(new THREE.Vector3(...H).lerp(new THREE.Vector3(...EL(sx)), 0.11).toArray(), cuffAt.toArray(), 0.05, ORANGE, 8); // orange cuff
    K.rod(cuffAt.toArray(), EL(sx), 0.036, NAVY, 7); K.rod(EL(sx), SH(sx), 0.042, NAVY, 7); }
  // harness pod under you (just out of frame when looking level; look down to see it), chest pack, boots at the far end
  K.add(new THREE.SphereGeometry(1, 10, 8), NAVY, [0, E.y - 0.4, E.z + 0.75], [0.05, 0, 0], [0.24, 0.17, 0.9]);
  K.box(0.28, 0.09, 0.3, 0, E.y - 0.5, E.z - 0.17, 0x2b2f36, 0.1); K.box(0.29, 0.012, 0.012, 0, E.y - 0.452, E.z - 0.3, ORANGE, 0.1); // chest pack + orange zip (a hint at the bottom when you look down)
  for (const sx of [-1, 1]) { K.box(0.035, 0.012, 1.0, sx * 0.19, E.y - 0.34, E.z + 0.75, ORANGE, 0.05); K.box(0.09, 0.08, 0.16, sx * 0.08, E.y - 0.46, E.z + 1.62, 0x3a2a20, 0.1); } // pod stripes + boot heels
  // strap-on climb meter on the right upright: two strap rings, a short backing block, the screen turned toward your eye
  const meterY = -0.8, top = new THREE.Vector3(...APEX), bot = new THREE.Vector3(...B(1)), U = top.clone().lerp(bot, (top.y - meterY) / (top.y - bot.y)), d = bot.clone().sub(top).normalize();
  for (const s of [-0.055, 0.055]) K.rod(U.clone().addScaledVector(d, s - 0.012).toArray(), U.clone().addScaledVector(d, s + 0.012).toArray(), 0.03, 0x23262b, 8);
  const toEye = E.clone().sub(U).normalize(), P = U.clone().addScaledVector(toEye, 0.1), rot = faceRot(P.toArray(), E), vario = makeVario(0.17, 0.085);
  K.add(new THREE.BoxGeometry(0.19, 0.105, 0.03), 0x23262b, along(P.toArray(), rot, -0.017), rot); K.rod(U.toArray(), along(P.toArray(), rot, -0.03), 0.014, 0x23262b, 6); // backing block + short arm onto the upright K.add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8).rotateZ(PI / 2), ORANGE, U.clone().addScaledVector(d, 0.055).add(new THREE.Vector3(0.04, 0, 0)).toArray()); // orange strap buckle
  rig.add(K.mesh('lambert', LIT_OPTS)); vario.mesh.position.copy(P).addScaledVector(new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(rot[0], rot[1], 0, 'YXZ')), 0.0015); vario.mesh.rotation.set(rot[0], rot[1], 0, 'YXZ'); rig.add(vario.mesh);
  g.add(sail, rig);
  return finish(g, vario, E, { yaw: GLIDER_LOOK.yaw, pitch: GLIDER_LOOK.pitch }, 'glider', { rig, barShift: { x: 0, z: 0, r: 0 } });
}
// OPTIONAL weight-shift feel (Director wires it; costs one matrix update, no geometry): call every frame in the glider cockpit with
// the same stick input the glider gets (roll +1 = right, pitch +1 = nose up, i.e. push out). The bar, hands, wires and meter slide a
// few cm the way the bar really moves relative to you: shift right -> bar goes left; push out -> bar goes forward. dt-smoothed.
export function cockpitBarShift(cab, rollInput = 0, pitchInput = 0, dt = 1 / 20) {
  if (!cab || !cab.rig) return false; const s = cab.barShift, k = 1 - Math.exp(-dt * 8), r = clamp(rollInput, -1, 1), p = clamp(pitchInput, -1, 1);
  s.x += (-r * 0.06 - s.x) * k; s.z += (-p * 0.05 - s.z) * k; s.r += (r * 0.035 - s.r) * k;
  cab.rig.position.set(s.x, 0, s.z); cab.rig.rotation.z = s.r; return true;
}

// ---------------- ROADSTER: open-top driver's seat (geometry and the 1.0.7 dash-screen fix kept) ----------------
export function buildRoadsterCockpit() {
  const g = new THREE.Group(); g.visible = false; const K = createKit(), L = createKit();
  const paint = 0x15171c, tan = 0xc9b08a, dark = 0x101114, alu = GREY;
  K.add(new THREE.SphereGeometry(1, 16, 6, 0, PI * 2, 0, PI / 2), paint, [0, 0.0, -1.55], [0, 0, 0], [0.93, 0.27, 0.95]);
  K.box(1.86, 0.1, 1.6, 0, 0.2, -0.95, paint); for (const sx of [-1, 1]) { K.box(0.2, 0.18, 2.0, sx * 0.84, 0.3, 0.2, paint); K.box(0.04, 0.03, 2.0, sx * 0.95, 0.4, 0.2, ORANGE); K.box(0.12, 0.06, 1.0, sx * 0.72, 0.38, 0.4, tan); }
  K.box(0.05, 0.012, 1.3, 0, 0.27, -1.3, ORANGE, -0.12); // orange centre line on the hood: heading cue
  K.box(1.5, 0.05, 1.5, 0, -0.05, 0.35, dark);
  K.box(1.5, 0.18, 0.26, 0, 0.3, -0.34, dark); K.box(1.5, 0.03, 0.3, 0, 0.405, -0.37, 0x1a1b1f); K.box(1.3, 0.1, 0.012, 0, 0.33, -0.205, WOOD); // dash + wood trim strip
  const sx = -0.36; K.rod([sx, 0.26, -0.18], [sx, 0.38, -0.36], 0.025, alu);
  K.add(new THREE.TorusGeometry(0.17, 0.022, 6, 22, PI * 1.2), 0x1b1b1b, [sx, 0.32, -0.12], [-0.35, 0, PI * 0.9 + PI]); K.box(0.36, 0.04, 0.03, sx, 0.32, -0.13, 0x1b1b1b, -0.35); K.box(0.06, 0.04, 0.035, sx, 0.32, -0.125, ORANGE, -0.35);
  K.box(1.56, 0.04, 0.05, 0, 0.66, -0.3, 0x0c0d10, -0.95); for (const s of [-1, 1]) K.rod([s * 0.76, 0.42, -0.42], [s * 0.74, 0.66, -0.25], 0.02, 0x0c0d10);
  for (const s of [-1, 1]) { K.box(0.5, 0.1, 0.5, s * 0.36, 0.2, 0.62, tan); K.box(0.5, 0.55, 0.12, s * 0.36, 0.42, 0.92, tan, -0.2); }
  L.box(1.5, 0.012, 0.02, 0, 0.41, -0.22, ORANGE); // orange ambient strip along the dash edge (was #FFA531, now canonical)
  K.box(0.38, 0.2, 0.02, 0.14, 0.475, -0.214, dark, -0.3); // dark backing behind the (now taller) dash screen
  for (const s2 of [-1, 1]) K.box(0.03, 0.012, 1.95, s2 * 0.75, 0.395, 0.2, 0x3a4250); // lighter edge trim along the inner door tops
  K.box(1.7, 0.012, 0.03, 0, 0.252, -0.16, 0x3a4250); // lighter lip where the hood meets the dash
  const [lit, glow] = meshes(K, L); paintSheen(lit.geometry, paint); g.add(lit, glow);
  const gauge = makeGauge(0.36, 0.18, 'hover'); gauge.mesh.position.set(0.14, 0.475, -0.2); gauge.mesh.rotation.x = -0.3; g.add(gauge.mesh); // the 1.0.7 fix: raised onto the dash top so it stays in frame
  return finish(g, gauge, new THREE.Vector3(-0.36, 0.92, 0.6), { yaw: 0.04, pitch: -0.06 }, 'roadster');
}

// ---------------- SKY SCOOTER: over the handlebars, the most open view after the glider ----------------
export function buildScooterView() {
  const g = new THREE.Group(); g.visible = false; const K = createKit(), L = createKit();
  const paint = WHITE, dark = 0x17181c, alu = GREY;
  const bars = new THREE.Group(); bars.position.set(0, 0.9, -0.68); g.add(bars); const B = createKit();
  B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 6), alu, [0, 0, 0], [0, 0, PI / 2]);
  for (const sx of [-1, 1]) { B.add(new THREE.CylinderGeometry(0.03, 0.03, 0.13, 8), dark, [sx * 0.27, 0, 0], [0, 0, PI / 2]); B.box(0.1, 0.012, 0.03, sx * 0.24, 0.0, -0.04, 0x2a2a2a, 0.2);
    B.rod([sx * 0.2, 0, 0], [sx * 0.3, 0.2, 0.06], 0.008, 0x111111); B.box(0.1, 0.06, 0.01, sx * 0.31, 0.22, 0.06, 0x2a2e36); B.cyl(0.032, 0.032, 0.012, 8, sx * 0.335, 0, 0, ORANGE, 0, 0, PI / 2); } // orange bar-end caps
  B.box(0.1, 0.035, 0.07, 0, 0.02, -0.03, dark); B.box(0.32, 0.17, 0.025, 0, -0.068, 0.022, dark, -0.62); B.box(0.04, 0.09, 0.03, 0, -0.02, -0.03, dark); // stem block, screen housing (below the bar), bracket
  bars.add(B.mesh('lambert', LIT_OPTS));
  const gauge = makeGauge(0.3, 0.15, 'hover'); gauge.mesh.position.set(0, -0.068, 0.04); gauge.mesh.rotation.x = -0.62; bars.add(gauge.mesh); // under the bar: the middle of the screen stays clear
  K.box(0.32, 0.7, 0.14, 0, 0.22, -0.48, paint, 0.25); K.rod([0, 0.35, -0.55], [0, 0.88, -0.68], 0.03, alu); K.box(0.34, 0.08, 0.8, 0, -0.08, 0.0, dark);
  K.box(0.02, 0.05, 0.6, 0.23, 0.2, 0.5, ORANGE); K.box(0.02, 0.05, 0.6, -0.23, 0.2, 0.5, ORANGE); K.box(0.28, 0.08, 0.3, 0, 0.44, 0.35, 0x3a2a20);
  for (const sx of [-1, 1]) K.add(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 10), alu, [sx * 0.17, 0.32, 0.72], [0.35, 0, 0]);
  L.box(0.3, 0.012, 0.012, 0, 0.58, -0.56, ORANGE, 0.25);
  g.add(...meshes(K, L));
  return finish(g, gauge, new THREE.Vector3(0, 1.22, 0.02), { yaw: 0, pitch: -0.07 }, 'scooter', { bars });
}

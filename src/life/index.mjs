// SKYCHARGE world-life entry point. Same shape as every module: init(scene, terrainQuery) + update(dt, playerPos).
//   import * as life from './life/index.mjs'; import { makeTerrainQuery } from './life/terrain-query.mjs';
//   life.init(scene, makeTerrainQuery(world), { onSecret: (kind) => toast('🐄 You found a secret cow!') });
//   life.update(dt, playerPos)            // once per rendered frame, real dt in seconds, playerPos = THREE.Vector3 / {x,y,z}
//   life.setAudio(ctx[, destNode]); life.setVolume(muted ? 0 : volume)
import * as settlements from './settlements.mjs';
import * as animals from './animals.mjs';
import * as people from './people.mjs';
import * as sea from './sea.mjs';
import * as traffic from './traffic.mjs';
import { getLayout } from './layout.mjs';
export { setAudio, setVolume } from './sounds.mjs';
export { makeTerrainQuery } from './terrain-query.mjs';
export const modules = { settlements, animals, people, sea, traffic };

const S = { on: false, ms: 0, msAvg: 0, frames: 0, initMs: 0, tq: null };
export function init(scene, tq, opts = {}) {
  const t0 = performance.now(); S.tq = tq; getLayout(tq, opts.seed || 1);
  settlements.init(scene, tq); animals.init(scene, tq, opts); people.init(scene, tq); sea.init(scene, tq); traffic.init(scene, tq);
  S.initMs = performance.now() - t0; S.on = true; return S;
}
export function update(dt, p) {
  if (!S.on || !(dt > 0)) return; const t0 = performance.now(); dt = Math.min(dt, 0.1);
  settlements.update(dt, p); animals.update(dt, p); people.update(dt, p); sea.update(dt, p); traffic.update(dt, p);
  S.ms = performance.now() - t0; S.frames++; S.msAvg += (S.ms - S.msAvg) * 0.05;
}
export function stats() { return { initMs: Math.round(S.initMs), updateMs: +S.msAvg.toFixed(3), layout: summary(), settlements: settlements.stats(), animals: animals.stats(), people: people.stats(), sea: sea.stats(), traffic: traffic.stats() }; }
function summary() { const L = getLayout(S.tq); return L.pockets.map((p) => ({ type: p.type, x: Math.round(p.x), z: Math.round(p.z), r: p.r, near: p.station || '' })); }
export { getLayout };
export const triggerWhale = sea.triggerWhale, triggerDolphins = sea.triggerDolphins;

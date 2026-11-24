# src/life — world life for SKYCHARGE

Procedural, low-poly and cozy: herds, villages, farms, people, boats, whales and gentle AI traffic. It adds no assets and
uses no brand names. Nothing outside `src/life/` was changed. Only three.js APIs present in **r162** are used
(InstancedMesh, BufferGeometry, MeshLambertMaterial + onBeforeCompile, Points, LineSegments), so it runs on the Xbox
r162 / WebGL1 build. That build was tested headless with `--disable-webgl2`.

## Modules (each exports `init(scene, terrainQuery[, opts])` and `update(dt, playerPos)`)
| file | what | draw calls (max visible) |
|---|---|---|
| `index.mjs` | **entry point**: init/update all, `stats()`, `setAudio`, `setVolume`, `makeTerrainQuery`, `triggerWhale`, `triggerDolphins` | – |
| `terrain-query.mjs` | `makeTerrainQuery(world)` builds the only world interface (contract below) | – |
| `layout.mjs` | deterministic pocket placement per LIFE_DESIGN.md (village, Harbor town = the city pocket, Ridge Farms, solar field, Lagoon suburb, fishing shack), herds, flocks, walk loops, sail loops, secrets | – |
| `lifekit.mjs` | shared geometry builder, animated vertex-colour material (graze/tail/legs/wave/peck/bob via shader), instance `Pool`, `Particles` | – |
| `settlements.mjs` | all buildings in one merged mesh, with a GPU distance cull at 3.2 km. Ground decals in one mesh. Tractors, chimney smoke | 3–4 |
| `animals.mjs` | 162 cows (4 coat variants + highland, calves, waders), golden summit cow + town-rooftop secret cow, 40 sheep, 10 horses, 8 deer, ~38 ground birds. Far-LOD boxes. Moos | ≤ 6 |
| `people.mjs` | 32 people: walkers, sitters, wavers (wave when you fly low), 7 anglers with lines and bobbers | 2 |
| `sea.mjs` | 10 boats (sail / fishing / dinghy), the cow boat, a message in a bottle, whale breaches, dolphin pods, spray | ≤ 4 |
| `traffic.mjs` | 9 aircraft: 3 planes (wing-wave), blimp, 2 balloons, thermal glider, 2 hoppers that descend beside pads and the dock | 1 |
| `sounds.mjs` | WebAudio moo / baa / splash / chime. Factory nodes only, guarded StereoPanner (EdgeHTML-safe) | – |

## terrainQuery contract
`makeTerrainQuery(world)` uses `world.heightAt`, `world.stations`, `world.dock`, `world.landmarks`, `world.thermals`,
`world.launch` and `world.treeHit`. Only `heightAt` is required. A hand-rolled object works too. The full field list is
in the header of `terrain-query.mjs`. Clearances: runway/pad/dock 120 m, Summit Launch 200 m, thermal cores 150 m.

## Wiring into src/main.mjs (5 edits)
1. Imports (top of file):
   ```js
   import * as life from './life/index.mjs';
   ```
2. After `const world = createWorld(seed); scene.add(world.group);` (line ~35):
   ```js
   life.init(scene, life.makeTerrainQuery(world), { onSecret: (kind) => toast(kind === 'golden' ? 'You found the golden cow!' : 'A cow… on a roof?') });
   ```
   Put it after `toast` is defined, or wrap the callback lazily as shown (the callback only runs during play). Init takes about 150–180 ms.
3. In `frame(dt, inp)`, just before `renderer.render(scene, camera)`:
   ```js
   if (running) life.update(dt, cur().pos);
   ```
   Use the real frame dt. `life.update` caps dt at 0.1 itself. `frame()` is also what the scripted `pg.step` path calls, so
   no second hook is needed. If a path renders without calling `frame`, call `life.update` there too.
4. In `initAudio()`, right after `audio = createAudio(ctx, …)`:
   ```js
   life.setAudio(ctx);            // optional 2nd arg: a destination GainNode; defaults to ctx.destination
   ```
5. In `applyAudioSettings()`:
   ```js
   life.setVolume(P.settings.muted ? 0 : P.settings.volume);
   ```
Optional debug: `window.life = life` and then `life.stats()`, `life.triggerWhale(cur().pos)`, or `life.triggerDolphins(cur().pos)`.

## Budget (LIFE_DESIGN.md: < 25 extra draw calls, < 2 ms/frame)
Run `node qa/life/perf.mjs` (r186) or `node qa/life/perf.mjs r162` (WebGL1). The extra draw calls measured were +4 to +12
(worst: low over the Ridge herds). `life.update` cost 0.03–0.15 ms of JS per frame. There are no per-frame allocations.
Extra triangles: +50k to +108k (instanced animals are drawn at full detail up to 340 m, as boxes to 1.6 km, and hidden beyond).

## QA
`qa/life/`:
- `build-harness.mjs`: builds `harness.html` (r186) and `harness_r162.html`
- `probe.mjs [r162]`: prints stats and errors
- `shots.mjs [names]`: writes 1280×720 PNGs
- `perf.mjs [r162]`: with and without life

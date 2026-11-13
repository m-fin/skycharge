# SKYCHARGE — PERF.md (performance baseline, build 1.0.6.0)

Written by SKYCHARGE Flow, Sat Oct 17 2026 ~14:00 EDT. Read-only baseline: no game file was changed. This file is the only thing written in this folder. Full report, method and raw JSON: `/workspace/skycharge-flow/baseline.md` and `/workspace/skycharge-flow/results/`. Rerun on the next build: `cd /workspace/skycharge-flow && node bench.mjs <build index.html|dir|URL> --gl 1|2 --throttle 6 --runs 3`.

**Builds measured (copies):**
- **Backup/strict:** EdgeHTML package 1.0.6.0, three r162, WebGL1 forced. Unzipped from the signed `SKYCHARGE_Backup_EdgeHTML_x64_1.0.6.0.msix`; the sha256 matches SHA256SUMS.
- **Main:** WebView2 path, three r186, WebGL2. A scratch rebuild of the same 1.0.6 source; that source's legacy build is byte-identical to the signed 1.0.6 game.js. No 1.0.6 WebView2 msix exists; the shipped one is 1.0.0.0.

**Big caveat:** headless Chrome + SwiftShader (software GL). It is vertex-bound, and CPU throttling doesn't touch it, so no throttle rate hit the Xbox's 18–22 fps. Throttle 6x was used because its JS per frame (p50 6–8 ms, p95 13–22 ms) is the closest to the console's ~22 ms. The numbers are relative, not Xbox fps. Other agents loaded the box during the runs, so allow ±30% between runs.

## Baseline (CPU 6x, 1280x720, Xbox UA, median of 3 runs)
| scene | r162/GL1 fps | 1% low | p95 ms | >100 ms frames | draws | r186/GL2 fps | 1% low | p95 ms | >100 ms frames | draws |
|---|---|---|---|---|---|---|---|---|---|---|
| first_switch | 10.4 | 3 | 216.7 | 22 | 191.3 | 12.7 | 4.6 | 150 | 21 | 191.4 |
| chill_toggle | 10.3 | 3.3 | 233.3 | 26 | 184.1 | 10 | 3 | 199.9 | 28 | 178.6 |
| plane_cruise | 14.1 | 4.6 | 133.4 | 24 | 188.8 | 10.8 | 3.8 | 183.3 | 23 | 184.9 |
| takeoff | 13.5 | 6 | 133.3 | 13 | 262.3 | 10.4 | 3.3 | 166.6 | 25 | 261.7 |
| landing | 14.6 | 6 | 133.3 | 18 | 86 | 13.3 | 6 | 150 | 18 | 86 |
| blimp | 13.4 | 5 | 150 | 17 | 182.8 | 10.9 | 5 | 183.4 | 23 | 184.6 |
| glider | 10.4 | 4.3 | 166.7 | 26 | 147 | 9.5 | 4.3 | 216.6 | 32 | 157.9 |
| seaplane_water | 13.2 | 5.5 | 149.9 | 24 | 40.1 | 12.9 | 5.5 | 150 | 21 | 40.9 |
| seaplane_takeoff | 11.8 | 4 | 183.2 | 24 | 76.4 | 11.7 | 4.3 | 183.3 | 25 | 76.8 |
| cabin_chill | 7.4 | 3.8 | 216.7 | 39 | 169 | 6.7 | 3 | 316.6 | 37 | 169 |
| switch_cycle | 12.3 | 5.5 | 150 | 19 | 192.2 | 13.1 | 6.7 | 149.9 | 21 | 191.9 |

- Load, measured from navigation start: first rendered frame **2245 ms** (r162) / **2207 ms** (r186), and playable (10th frame) **3577 / 3463 ms**. First-frame JS is 811 / 778 ms (this includes compiling the initial shaders; that split was not profiled). The r162 vs r186 fps differences are within the box noise.
- Every scene draws about 214k–235k triangles. JS heap is 25–30 MB and allocation is 0.5–3.4 MB/s (not a problem). Shadows are off and the pixel ratio is 1.
- **Hitches:** the first switch to the hang glider costs 223–405 ms of JS (r162) and 165–235 ms (r186). The first cabin (C) toggle costs 279–453 ms (r162) and 259–350 ms (r186). Later switches and toggles take 9–34 ms.
- **Fog-colour tweak:** changing scene.fog.color at runtime gave 140 → 140 draws and 34 → 34 programs, so there is no draw-call change.
- **Tests** (run on a 13:31 copy of this folder; it covers the live out/ build, not 1.0.6): test.mjs **51/51**, test_pad.mjs **36/36**.

## Top 5 bottlenecks (ranked by likely gain on Xbox)
1. **Unmerged static station/runway meshes:** 285 meshes on 45 materials; 165 of 283 draws at Home Field and 279 of 610 at station 2. Hiding the small static meshes cut draws 141 → 68 and JS per frame by 31%.
2. **Coins not instanced:** 59 × 4 meshes = 236, giving 24–224 draws per view; each coin's matrix is updated every frame.
3. **Shader compiles on first use:** see the hitches above. The cabin point lights change the scene's light count, so all lit materials recompile (programs 19 → 34). Fix: constant light count, `renderer.compile` at load, `checkShaderErrors = false`.
4. **No LOD or culling on bulk geometry:** terrain is one 131k-triangle mesh, trees are 1600 instances (60.8k triangles) always drawn, and clouds are 28.8k transparent triangles. Removing the trees took headless fps from 11.9 to 21.5.
5. **Full-screen transparent overdraw** (60 km Phong water plane, sky dome, cloud puffs) **and the cabin view**, which is the slowest scene at 7.4 / 6.7 fps. The cabin view runs 2 per-fragment point lights and DoubleSide PBR materials; that cause is a hypothesis I didn't ablate.

## Draw-call breakdown per system (backup r162/WebGL1, build 1.0.6.0)
Counted with `calls.mjs`, which hooks `onBeforeRender` (once per draw) on every mesh, in manual mode with one render per view at 1280x720. The counts per view match `renderer.info.render.calls` to within 1–11 draws; the gap is objects drawn without a counted ancestor, such as cabin glass. Raw data: `results/calls-1.0.6-r162-gl1.json`. Per-view counts are identical on r186, and the runtime per-scene averages are in the tables above.

| system | plane_ground_home | blimp_home | plane_air_cruise | plane_air_lookback | glider_launch | seaplane_dock | cabin_chill_air | plane_ground_station2 |
|---|---|---|---|---|---|---|---|---|
| stations/runways | 165 | 167 | 59 | 59 | 73 | 1 | 58 | 279 |
| coins | 80 | 84 | 44 | 100 | 72 | 24 | 40 | 224 |
| plane mesh (+cabin) | 18 | 0 | 18 | 18 | 0 | 0 | 48 | 18 |
| dock/lagoon | 0 | 0 | 0 | 0 | 36 | 33 | 0 | 36 |
| wind turbines | 5 | 5 | 5 | 11 | 17 | 0 | 10 | 30 |
| other world groups | 6 | 6 | 6 | 2 | 0 | 6 | 0 | 8 |
| seaplane mesh | 0 | 0 | 0 | 0 | 0 | 25 | 0 | 0 |
| blimp mesh | 0 | 17 | 0 | 0 | 0 | 0 | 0 | 0 |
| trees(instanced) | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| thermals | 0 | 0 | 0 | 0 | 12 | 0 | 0 | 0 |
| glider mesh | 0 | 0 | 0 | 0 | 11 | 0 | 0 | 0 |
| sky | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| terrain | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| clouds(instanced) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| water | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| misc scene mesh | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| scene:burst(fx) | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 1 |
| **total (renderer.info calls)** | **283** | **288** | **140** | **200** | **238** | **98** | **165** | **610** |

Inventory (whole scene):
- terrain: 1 meshes, 131072 tris, 1 materials
- water: 1 meshes, 2 tris, 1 materials
- sky: 1 meshes, 960 tris, 1 materials
- clouds(instanced): 1 meshes, 28800 tris, 1 materials
- trees(instanced): 2 meshes, 60800 tris, 2 materials
- wind turbines: 35 meshes, 560 tris, 1 materials
- other world groups: 8 meshes, 298 tris, 8 materials
- stations/runways: 285 meshes, 4000 tris, 45 materials
- thermals: 18 meshes, 1152 tris, 18 materials
- misc scene mesh: 1 meshes, 20 tris, 1 materials
- dock/lagoon: 36 meshes, 776 tris, 18 materials
- plane mesh (+cabin): 74 meshes, 2500 tris, 30 materials
- blimp mesh: 73 meshes, 4262 tris, 31 materials
- glider mesh: 11 meshes, 530 tris, 5 materials
- seaplane mesh: 81 meshes, 2620 tris, 31 materials
- scene:burst(fx): 1 meshes, 180 tris, 1 materials
- coins: 236 meshes, 33512 tris, 5 materials
- vehicle/cabin groups (8 kids #4): 8 meshes, 6400 tris, 8 materials


## Plan to reach the 120 draw-call budget (ranked by draws saved)
The "after" counts are **estimates** from the inventory above. They are not measured, so re-measure with `calls.mjs` and `bench.mjs` after each step.

| # | system | now (home field / blimp home / station 2 / cabin) | change | est. after | est. saved (home / station 2) |
|---|---|---|---|---|---|
| 1 | Stations / runways (`world.mjs` charging-station loop): 285 meshes, 45 materials. Each runway dash and each edge light is its own Mesh+BoxGeometry, and every station has its own material instances. | 165 / 167 / 279 / 58 | Merge every static runway piece into one geometry per material, either per station or across all stations: `BufferGeometryUtils.mergeGeometries` on baked matrices. Share the ORANGE/dash/strip materials across stations. Keep only the animated beacon ring/beam/glow separate. | ~3–4 per station in view → ~10–16 | ~150 / ~265 |
| 2 | Coins (`coins.mjs`): 59 coins × 4 meshes (body, rim, 2 glyphs) = 236 meshes, each coin group spinning and bobbing on the CPU | 80 / 84 / 224 / 40 | One `InstancedMesh` per part per kind (coin body, rim, glyph, big body, big rim, big glyph = 6). Update instance matrices for spin/bob, and hide collected coins with a zero-scale matrix. Pre-merge the two glyph planes into one geometry. | ≤6 | ~74 / ~218 |
| 3 | Plane / seaplane / blimp / glider meshes: 11–25 draws each; plane cabin 48 | 18 / 17 / 18 / 48 | Merge the static parts of each vehicle by material (keep the prop/hub and control surfaces separate). Merge the cabin interior by material: it is 74 plane+cabin meshes on 30 materials. | ~5 chase, ~12 cabin | ~13 / ~13 (cabin −36) |
| 4 | Wind turbines: 5–30 draws | 5 / 5 / 30 / 10 | Instance the towers and nacelles (static), plus one InstancedMesh of hubs/blades updated each frame | 2–3 | ~2 / ~27 |
| 5 | Dock / lagoon: 33–36 draws on 18 materials (glider/seaplane views) | 0 / 0 / 36 / 0 | Merge the static pontoons, posts and edge lights by material, and share materials | ~5 | 0 / ~31 (seaplane −28) |
| 6 | Other small world groups (windsock, launch pole, …) + thermals (12, glider only) | 6 / 6 / 8 / 0 | Merge by material. Thermal columns: one merged mesh per opacity tier, plus one Points | 2 (+3 glider) | ~4 / ~6 |
| — | Terrain, water, sky, clouds, trees (2) | 6 | Already 1 draw each (trees and clouds are instanced) | 6 | 0 |

Estimated totals after steps 1–3: home field 283 → **~45**, blimp home 288 → **~45**, station 2 610 → **~115** (borderline; steps 4–6 bring it to **~50**), cabin 165 → **~25**, seaplane dock 98 → **~45** (step 5 → ~20). Steps 1 and 2 alone take every common view below 120 except station 2, which needs steps 1–4. Merging also removes about 520 scene-graph nodes from `projectObject`/`updateMatrixWorld` every frame, which cuts the per-frame JS that the Xbox is bound by (README: ~22 ms JS per frame on the console).

## Sky cost limits (1.0.7.1 Epic Sky)

Set by Flow on Oct 17 2026, based on the 1.0.6.0 baseline. In the slowed-down test (6x throttle, software GL), hiding the water raised fps from 11.9 to 15.8. The clouds are already 28.8k transparent triangles.

- **Target:** WebGL1 with the three.js r162 API only. Every shader must run at mediump precision in the fragment stage, because Edge 18 may not support highp there.
- **No new full-screen post passes:** no bloom, no screen-space god-rays and no extra render targets, unless they've been benchmarked on both paths and pass the gate below.
- **Sun glow, lens bloom and light shafts:** a few soft sprites or cones facing the camera, using additive blending, no depth write and no depth test against the sky.
- **Gradient and horizon haze:** these go inside the existing sky dome shader (0 extra draw calls), with the fog colour matched to the sky bottom.
- **Budget for the whole sky:** no more than 6 extra draw calls and 15k extra triangles. Cumulus and far cloud banks are instanced or merged. Cirrus is a single layer. Lit edges come from vertex colours, not lights.
- **Transparent fill:** large transparent layers may add no more than about one full screen of overdraw at the horizon.
- **Weather changes:** use uniforms and colours only, never swap materials or add lights. All sky materials are pre-compiled at load, so there's no shader stall the first time something is used.
- **Gate:** benchmark before and after with `node /workspace/skycharge-flow/bench.mjs <build> --throttle 6 --runs 3`, once with `--gl 1` and once with `--gl 2`. The median fps may drop by no more than 3%, there can be no frame over 60 ms, and the first appearance of any weather must not show a shader-compile spike.

## 1.0.8.1 perf pass (Flow, Oct 17 2026)

Changes in src: `world.mjs` merges static runway, station, turbine and prop pieces by material. `coins.mjs` draws coins as one InstancedMesh. `life/animals.mjs` sets NEAR from 340 to 220. `vehicles.mjs` gets a gentler roadster hover settle. All four files were backed up to `/workspace/skycharge-flow/backup-1.0.8.0/` first. Shader pre-compile plus a warm-up render needs `main.mjs`, so it's written up for the Director in `/workspace/skycharge-flow/precompile-patch.md` and isn't applied yet.

Draw calls on r162 / WebGL1 (counts don't depend on box load):

| view | 1.0.8.0 | 1.0.8.1 |
|---|---|---|
| spawn / Home Field | 304 | 72 |
| station 0 | 304 | 72 |
| station 2 | 639 | 103 |
| station 3 | 226 | 76 |
| glider launch | 258 | 91 |
| blimp at home | 308 | 70 |
| seaplane dock | 118 | 83 |
| plane cruise | 156 | 65 |
| cabin view | 136 | 48 |

Every measured view is now under the 120 budget. Triangles go up about 6% (from 346k to 369k at home). I haven't traced the cause yet.

FPS at 6x throttle in software GL, median of 3. The box was overloaded during these runs, so treat them as noise-level:

| view | r162 / WebGL1 | r186 / WebGL2 |
|---|---|---|
| home | 9.6 to 10.6 | 8.1 to 9.4 |
| station 2 | 9.3 to 9.5 | 7.9 to 8.5 |
| cruise | 9.9 to 8.5 | 8.5 to 6.6 |

Software GL hides most of the per-draw-call cost the Xbox pays, so the fps gain on the console isn't measured yet.

Tests on live src after these edits: test.mjs passes 75/75 on src and 66/66 on the r162 bundle. test_pad runs clean on both, with no page errors.

The Epic Sky 3% check is NOT settled. With the box overloaded, the WebGL1 runs read -3% to -13%, which is inside the noise. It needs a rerun on a quiet box before the sky ports.

# SKYCHARGE: island layout and life pockets (design doc)

Owner: SKYCHARGE World. Status: draft for Director review, Oct 17 2026. Nothing in `src/` was touched.

## 1. What the island actually is (from `src/world.mjs`)
- World is 8000 m square (`S`), terrain grid 256 cells (31 m each). Land fades out around 1500 to 3300 m from centre (slightly squashed north-south), ocean floor at -60 m.
- Heights run from beach (0 to 6 m) up to roughly 550 m summits. Trees grow only between 6 and 230 m, in fbm patches (up to 1600 instanced).
- Charging stations (approx targets, the code snaps each to flat ground): Home Field (0, 0), Ridge Skycharger (1500, -800), North Cove Solar (-1400, -900), Lagoon Pad (-700, 1500), Harbor Field (1200, 1300). Each has a ~150 m flattened apron.
- Other fixed things: wind turbines on high open ground, a coastal lighthouse, Summit Launch (glider), 6 thermals (3 near turbines, 3 over warm open fields), and Lagoon Dock on the water by Lagoon Pad.
- Fog 1600 to 9000 m, camera far 30000. The autopilot turns back past 2300 m from centre.
- Everything in the world is static (`matrixAutoUpdate` off) except turbine hubs, the dock and thermals. Life modules must respect that: only animate what's near the player.

## 2. Layout rule: little pockets, lots of nature between
Each pocket is a small, readable cluster that you spot from the air, then open green or forest until the next one. Rough targets:
- Pockets cover at most about 12% of land; at least 600 m of nature between the edges of any two built-up pockets.
- Keep 120 m clear of every runway, pad and the dock, 200 m clear of Summit Launch, and 150 m clear of thermal cores (so glider flying stays clean).
- Never place on slopes steeper than about 15 degrees (sample `terrainQuery` at 4 corners) or below 3 m (beach) except harbour and fishing spots.
- Placement is seeded from the world seed with its own RNG, so trees, turbines and coins don't move (same trick as the thermals block).

## 3. Pockets, one per station plus wild areas
| Pocket | Where | What's there | Why it fits |
|---|---|---|---|
| Home Village | 300 to 600 m off Home Field | 10 to 14 cottages, a green with a bench, a little market stall, a pond | First thing a new player sees after takeoff |
| Ridge Farms | low meadows near Ridge Skycharger | 2 farmsteads, barns, silos, fenced fields, the **main cow herds** | Open rolling ground = cow country |
| North Cove Solar | beside North Cove Solar | solar array rows (instanced panels, Bitcoin-orange trim), a small maintenance shed | Matches the station name |
| Harbor Town (the "small city") | coastal flat near Harbor Field | 4 to 6 mid-rise blocks (max 5 floors), a plaza, a pier, boats moored | The one dense spot, still small |
| Lagoon Suburb | gentle slope above Lagoon Pad | 2 short curved streets of matching houses, gardens, a playground | Cozy, near the seaplane |
| Wild East / Wild North | the empty interior and far coasts | forest, meadows, a few deer, a lone fishing shack, nothing built | The "lots of nature between" |

## 4. Life list and budgets (Xbox One, 18 to 22 fps)
Total target for all of `src/life/`: **under 25 extra draw calls and under 2 ms per frame of update** in the slow-mode harness, measured before/after.

| Life | Count | How it's built | Draws |
|---|---|---|---|
| Cows (signature) | 120 to 180 total, herds of 8 to 20, plus calves at 0.6 scale | One InstancedMesh for bodies (per-instance colour: black-and-white, brown, cream, belted), one for heads, simple low-poly box shapes | 2 to 3 |
| Secret cow | 1 | A golden cow alone on the highest summit near Summit Launch, gives a little chime and HUD note when you fly within 60 m | shares cow mesh (colour only) |
| Moos | about 1 every 8 to 20 s when within 300 m of a herd | Procedural/WAV sample, MP3/WAV only for EdgeHTML; pooled, max 2 at once | 0 |
| Sheep, horses, chickens | 40 / 10 / 30 near farms | Instanced, same idea as cows | 3 |
| Deer | 2 groups of 4 in the wild areas | Instanced | 1 |
| Houses and buildings | about 80 total | 3 to 4 merged base shapes, instanced with colour variants; roofs a second instance set | 4 to 6 |
| Solar panels | about 200 | One instanced quad mesh | 1 |
| People | 30 to 40 (walking loops, waving when the plane passes low, 6 to 8 fishing on piers and banks) | Instanced capsule bodies with a simple arm sway in the vertex shader | 1 to 2 |
| Boats | 8 to 12 (moored plus 3 drifting slowly) | Instanced hulls, bob in shader | 1 |
| Whales | 1 breach event every 2 to 4 min, offshore and only when the player is within 1500 m and above the sea | Single pooled mesh plus a splash puff | 1 when active |
| Dolphins | a pod of 3 to 5 that arcs beside a boat or the seaplane now and then | Pooled | 1 when active |
| AI air traffic | 3 to 5 small planes and 1 slow blimp on fixed gentle loops at 300 to 700 m, never crossing runway approaches below 200 m | Instanced, tiny nav lights | 2 |

## 5. Performance rules every module follows
- Instance everything; no per-object Mesh for herds, houses or people.
- Distance tiers: within 400 m animate every frame; 400 to 1500 m animate every 4th frame; beyond 1500 m frozen; beyond 3000 m hidden per pocket (`group.visible = false`).
- Animate in the vertex shader where possible (bob, sway, tail flick) so the CPU only updates a time uniform.
- No allocations inside `update()`; reuse a few Matrix4/Vector3 scratch objects.
- Pools for whales, dolphins, splashes and moo sounds; never create at runtime.
- Must run on both paths: the main WebView2 package (three.js r186, WebGL2) and the EdgeHTML backup (three.js r162, WebGL1, the strict case). Use only plain InstancedMesh, no float textures, no MRT, no WebGL2-only shader syntax.

## 6. Module shape (planned, matches the brief)
Each file in `src/life/` exports `init(scene, terrainQuery)` and `update(dt, playerPos)`. Planned files: `layout.mjs` (picks pocket sites once, shared), `cows.mjs`, `animals.mjs`, `settlements.mjs` (village, farms, suburb, town, solar), `people.mjs`, `sea.mjs` (boats, whales, dolphins), `traffic.mjs`, `index.mjs` (calls all of them), and `README.md`.

## 7. Review checklist for when `src/life/` lands
1. Nothing within 120 m of runways, pads, dock; nothing in thermal cores or blocking Summit Launch.
2. Cows really are LOTS, with calves, colour variants, the secret cow and moos.
3. Pockets feel small with clear nature between (top-down screenshot from 2500 m).
4. Draw calls and frame time before/after in the slow-mode harness, within the budget above.
5. No real brands anywhere (signs, boats, planes, shop names).
6. Headless screenshots: herd close-up, village, harbour town, whale breach, top-down island.
7. `test.mjs` and `test_pad.mjs` still pass.

## 8. 1.0.9 on-foot mode: home and hangar plot (World's part)
Measured on seed 1 from the current (still mid-edit) `world.mjs`, by loading it in node with a canvas stub. Re-run after the hand-off.
- Home Field runway centre is (600, 600), heading east, 360 m by 36 m, ground at about 115 m. The charging pad is at the west end (448, 600).
- Proposed plot: centre about (740, 510), on the north side of the runway near the east end, 90 m off the centreline. The ground varies only 2.5 m across a 60 m square, and there are no trees within 40 m.
- Layout inside the plot: the hangar (about 30 by 24 m, open side facing the runway) on the runway side, then a short gravel path to a small cottage about 25 m further north with a porch facing the sunset over the runway. Vehicles park in a row in front of the hangar, each with its own enter/exit prompt spot.
- Rules: stays outside the runway rectangle plus 25 m, away from the charging plaza and approach paths, and Home Village (section 3) moves at least 300 m away so the home feels private. Parked vehicles and the hangar door don't block taxiing.
- The search script is `/tmp/plot.mjs` (finds the flattest tree-free 60 m square 90 to 260 m beside each side of the runway). I'll move it into the project once `src/` opens.

### 8a. Window view and the cottage cow field
- From the cottage (about (740, 535), ground 115 m) the nearest sea is about 1.6 km away at bearing 130 degrees (southeast), across the runway. So "window wall faces the sea" means facing southeast over the runway.
- Cow field: centre about (940, 470), 210 m east-northeast of the cottage (bearing 72 degrees), an 80 by 50 m gently rising pasture (11 m of rise, about 8 degrees), no trees, and well north of the runway and its east approach. Because it sits about 30 m above the cottage, it reads clearly through the window.
- Recommendation for Look: make the window wall a corner window covering about 70 to 140 degrees, so one view shows the cow field on the left and the runway and sea on the right.
- The herd: 10 to 14 cows plus 3 calves with mixed coats, fenced, part of the main cow instancing (no extra draw calls). One cow always stands closest to the window.
- Script: `/tmp/cowfield2.mjs`. Re-check after the hand-off.

### 8b. First-person cockpit view (1.0.9): what it means for life
- From the roadster and scooter cockpits, at about 1 to 1.5 m eye height, life is seen up close at ground level, so the near tier (within 400 m) needs believable cow and people silhouettes from the side, not just from above.
- Ground vehicles and life must not overlap: cows, people and deer gently walk away from a ground vehicle within 25 m and never stand on runways or roads. Herds graze inside fences that leave a clear 10 m lane around them.
- Hitting an animal is never a crash or a scare. The vehicle just softly stops, and the cow moos and wanders off. That keeps it cozy, and the collision test is a cheap circle check only within 30 m.
- None of this costs draw calls. It adds a small per-frame check near the player, inside the 2 ms life budget.

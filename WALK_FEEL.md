# SKYCHARGE 1.0.9: Walk Feel, Cockpit View and Transitions (feel spec)
Owner: SKYCHARGE Flow. Future code owner file: `src/walk.mjs` (Flow, after the 1.0.7 hand-off). Design: ON_FOOT_DESIGN.md (Director). Looks: HOUSE_STYLE.md and STYLE_GUIDE.md "First-Person Cockpits & HUD" (Look). Plot, cow field, life near ground vehicles: LIFE_DESIGN.md 8, 8a, 8b (World).
Targets: Xbox One EdgeHTML, WebGL1, three.js r162 API only, no inline scripts, about 18-22 fps (so 45-55 ms frames are normal, and a hitch means a frame clearly longer than its neighbours).
Prototype that these numbers were tuned in: `/workspace/skycharge-flow/walk-proto/` (outside src/; measurements at the end).

All distances in metres, times in seconds, angles in degrees unless marked rad. Every number lives in one exported `WALK` table in src/walk.mjs so it can be tuned in one place.

## 1. Walking and running
| Item | Value | Notes |
|---|---|---|
| Eye height | 1.70 | ON_FOOT_DESIGN. Capsule: radius 0.30, height 1.80. |
| Walk speed | 2.5 m/s | Default. |
| Run speed | 5.0 m/s | LB toggles walk/run (pad). Keyboard: hold Shift (flips the toggle while held) or Caps Lock toggles. |
| Acceleration | walk 10 m/s², run 12 m/s² | 0 to walk in 0.25 s, 0 to run in about 0.42 s. Never instant (feels robotic), never longer than 0.5 s (feels icy). |
| Deceleration | 14 m/s² | Run to stop in 0.36 s (0.9 m), walk to stop in 0.18 s. |
| Air control | 30% of the ground acceleration | |
| Jump | 0.45 m (v0 2.97 m/s, gravity 9.81) | A / Space. (Get in is now hold X / F, so A is no longer contextual on foot.) |
| Turning while moving | velocity steers toward the new direction at the accel rate above | no momentum drift. |
Movement is relative to camera yaw only (looking up or down never slows you).

## 2. Camera on foot
- **No positional lag** horizontally: the camera sits exactly on the capsule (lag on foot causes nausea). Vertical only: eye height eases toward feet + 1.70 with a time constant of 0.08 s, which smooths steps and porches.
- FOV 70 (same as today's cabin view, `main.mjs` camera.fov = 70), near plane 0.10 on foot, far as today.
- Look smoothing: none on mouse. On the stick the response curve (section 3) does the smoothing; no extra filter (filters add latency).
- **Head bob: OFF by default** (Settings: "Head bob", saved). When on: vertical 0.025 (walk) / 0.035 (run), sideways 0.012, one vertical bump per step, step length 1.1 m walking (about 2.3 steps/s) and 1.6 m running (about 3.1 steps/s), fades to 0 below 0.3 m/s and in the air. No camera roll from bob, ever.
- Landing from a jump: no dip, no shake.

## 3. Controls, deadzone, curve, sensitivity
| | Gamepad (standard mapping) | Keyboard + mouse (parity) |
|---|---|---|
| Move | left stick | WASD |
| Look | right stick | mouse (pointer lock on click, PC) or arrow keys |
| Run toggle | LB | Shift (hold) or Caps Lock (toggle) |
| Jump | A | Space |
| Get in / get out | **hold X for 0.4 s** (a quick tap of X still switches vehicle, as today) | F |
| Cockpit / chase view toggle | right-stick click (R3, button 11) | B |
| Head bob | Settings menu only | Settings menu only |
- Stick deadzone: **radial 0.15**, rescaled so output starts at 0 just outside the deadzone (same constant as `input.mjs` DEADZONE = 0.15).
- Response curve: move stick linear (exponent 1.0, analogue walk speeds feel right); look stick **exponent 1.6** (fine aim near centre, full speed at the edge).
- Look speed at full stick: yaw **150°/s**, pitch **110°/s**. Mouse: 0.0022 rad per pixel (about 0.126°/px). Arrow keys = full stick.
- Pitch clamp on foot: **±80°**.
- Keyboard parity rule: every action has a key, and the prompt text follows the last device used ("A: Get in" vs "F: Get in").
- Input decisions (Director, Oct 17, ON_FOOT_DESIGN.md; `input.mjs` is the Director's file): get in and out is **hold X for 0.4 s** on gamepad, and a quick tap of X (released before 0.4 s) still switches vehicle as today. On keyboard get in/out is **F** (E stays yaw). The view toggle is **right-stick click** on gamepad and **B** on keyboard. A (respawn), gamepad B (missions), View (panel), keyboard E (yaw) and V (switch vehicle) keep their jobs. Open point for the Director: today keyboard B also starts a mission (test.mjs presses 'b' for that), so the keyboard mission key needs to move or be confirmed.

## 4. Collision (cheap, invisible shapes only)
- The player is a **circle of radius 0.30 in XZ plus a height**, resolved against **axis-aligned or yaw-rotated boxes** (furniture, walls, hangar, parked vehicles), 2 push-out iterations per frame. Never against render meshes.
- Each box has a top height. A box whose top is at most **0.30** above the feet is a step you walk onto (porch, floor slab, low rug edge); anything higher blocks. Step-down snap 0.35 (you stick to stairs going down instead of hopping).
- Terrain: existing terrain height query (World's `terrainQuery` / `world.groundAt`). **Slope limit 35°** (rise 0.70 per metre): steeper ground blocks like a wall; you slide sideways along it, never get stuck.
- Water: you can't wade deeper than 0.30; a soft spring pushes you back toward shore at up to 3 m/s (no splash, no death).
- Walkways and door gaps: **≥ 1.2 m** clear everywhere (HOUSE_STYLE.md layout). With a 0.30 radius that leaves 0.6 m of slack, so you never snag. Doors are open gaps (no door physics).
- Furniture: one box per piece (bed, armchair, counter, shelf, table). Rugs and the radio are visual only.
- Budget: at most **64 active boxes** (only the ones in your 40 m grid cell and its neighbours are tested). The prototype runs 30 boxes.
- Cows and people (LIFE_DESIGN 8b): on foot they are soft circles (cow 0.9 m, person 0.35 m) that you gently push past at 1 m/s; they then walk off. In a ground vehicle (roadster, scooter, taxiing plane), bumping an animal is **never a crash**: the vehicle eases to a stop (deceleration capped at 12 m/s², no camera shake), the cow moos and wanders off. World's cheap circle check within 30 m is the only collision test.

## 5. Getting in and out
- Each vehicle has a **door spot** (local point beside the seat). Prompt shows when you are within **3.0 m** of it, hides beyond **3.5 m** (hysteresis, no flicker). One prompt at a time: the nearest door spot wins.
- Prompt text (Look's style, bottom centre inside 5% TV-safe, ≥24 px): "Hold X: Get in" / "F: Get in" + vehicle name; inside: "Hold X: Get out" / "F: Get out".
- **Get in**: hold X for 0.4 s / press F. Releasing X before 0.4 s is a normal tap (vehicle switch in a vehicle, nothing on foot). Input is locked and the vehicle is held on its brake for the transition.
- **Get out**: hold X for 0.4 s / press F, only when **grounded and slower than 1.0 m/s**. Airborne or moving: a 1.5 s hint "Land and stop to get out" and nothing else (no falling, ever).
  - Plane, roadster, scooter: on the ground (roadster/scooter on their wheels, not hovering, not skimming water).
  - Seaplane: on water only next to the dock (within 6 m of the dock edge → you step onto the dock), otherwise **onto the float**: a walkable 0.6 x 4 m box per float with invisible walls at the edges; from the float you can only look around or get back in.
  - Blimp: only when on a pad or at the mast (pad check like today's charging check).
  - Hang glider: only landed and stopped.
- Exit spot: the door side; if it is blocked (a box overlaps the capsule) try the other side; if both are blocked, hint "No room to get out here". You face the vehicle's heading.
- Mid-transition presses: **get in / get out and vehicle-switch (X) presses are ignored** (no buffering), so they can never stack or softlock. **The view toggle is different: a toggle pressed during any camera move is queued, never dropped**: it runs as soon as the current blend ends, and several presses run one after another in order. X (vehicle cycle) is disabled on foot.

## 6. Camera blends (walk ↔ cockpit, cockpit ↔ chase)
One blend routine: position lerp + quaternion slerp + FOV lerp from the current camera pose to the live target pose (the target is re-evaluated each frame so it tracks a moving vehicle). Near plane and visibility switch once, mid-blend, never per frame.
| Blend | Time | Easing | Swap point |
|---|---|---|---|
| Walk → cockpit (plane, seaplane, blimp, roadster) | **0.60 s** | ease-in-out cubic | at 60%: hide exterior mesh, show cockpit, near 0.08 |
| Walk → glider harness | 0.50 s | ease-in-out cubic | at 60% |
| Walk → scooter | 0.45 s | ease-in-out cubic | at 60% |
| Cockpit → walk (all) | **0.50 s** (scooter 0.40) | ease-in-out cubic | at 35%: hide cockpit, show exterior, near 0.10 |
| Cockpit → chase | **0.35 s** | ease-out cubic | at 30%: hide cockpit, show exterior; near 0.50 at the end |
| Chase → cockpit | **0.35 s** | ease-out cubic | at 60% |
- HUD: walk HUD fades out over the first 0.2 s; the vehicle HUD (reduced set in first person, full set in chase, per STYLE_GUIDE) fades in over 0.25 s after the seat is reached. A small camera icon shows for 2 s after each view toggle (Look).
- Look-around offset resets to 0 on every get-in; chase cam uses today's per-vehicle distances (`main.mjs` updateCamera: plane 21/5, blimp 50/7, glider 13/4.2, seaplane 23/5.5, roadster 9.5/3, scooter 6.5/2.3) and snaps its smoothing state when you toggle to it.
- View memory: **one global setting** (saved with the progress save, `progress.mjs`, Director) that remembers the last view you used and applies to every vehicle you get into. The **very first launch starts in the cockpit**; after that you get whichever view you used last.

## 7. Flying and driving from the cockpit (first person)
### 7.1 Eye position and framing per vehicle
The eye is fixed per vehicle (vehicle-local, -Z forward) so the dash never clips the camera. Values below start from today's `interiors.mjs` / `cabin.mjs` `eye` and replace the sideways "sightseeing" yaw with a forward pilot view. Base pitch **+0.06 rad (+3.4°)** puts the horizon about 43% up the screen at level flight (STYLE_GUIDE: 40-45%, centre 50% clear, dash ≤ 25% of screen height).
| Vehicle | Eye (today's interior eye) | Pilot view change | FOV | Roll follow | Look clamp L/R, up, down |
|---|---|---|---|---|---|
| Electric plane | (-0.66, 0.24, 2.61) from buildJetCabin, yaw 0.42 (a passenger window seat) | needs a front pilot seat in Look's new cockpit; yaw 0 | 70 | 0.50 | ±100°, 45°, 30° |
| Seaplane | (-0.36, 0.26, 0.32), yaw 0.22 | yaw 0, float tips visible low at the sides | 70 | 0.50 | ±100°, 45°, 30° |
| Blimp | (0.95, 0.22, 1.0), yaw 1.0 (side window) | yaw 0 at the gondola console | 68 | 0.20 | ±100°, 45°, 35° (big windows) |
| Hang glider | (0, -1.22, -0.22) | yaw 0 (unchanged) | 74 | 0.40 | ±100°, 45°, 40° (open view) |
| Roadster | (-0.36, 0.92, 0.6) | yaw 0, hood visible; in boost tip pitch +0.03 rad more sky (STYLE_GUIDE) | 70, +4 in boost over 200 km/h, eased 0.5 s | 0.30 | ±100°, 35°, 25° |
| Scooter | (0, 1.22, 0.02) | yaw 0 (unchanged) | 74 | 0.25 | ±100°, 35°, 30° |
Clamps follow Look's ~100° each side, 45° up, 30° down, made a little tighter vertically for the ground vehicles (the roof and hood fill those angles anyway).

### 7.2 Look-around
- Right stick / mouse / arrows move a look offset on top of the pilot view, at the same speeds and curve as on foot (150°/s yaw, 110°/s pitch, exponent 1.6); mouse in the cockpit is scaled to 0.15 of a full stick per pixel per frame.
- **Auto-recenter**: after **1.5 s** with no look input the offset eases back to centre (exponential, rate 4/s, about 0.75 s to 95%). It never snaps.
- Today's `main.mjs` look (G.look smoothed at dt*6, scaled 1.3 yaw / 0.7 pitch) is replaced by these clamps in first person; chase cam keeps today's behaviour.

### 7.3 Head stabilisation (comfort)
- The camera eye rides with the vehicle's **yaw** fully and its **pitch** fully for aircraft (you must see a climb), but only a fraction of its **roll** ("roll follow" in 7.1). The horizon stays steady and the cockpit frame tilts instead. Scooter lean 0.45 rad becomes about 6° of camera roll.
- Vibration, engine buzz, hover bob and ground bumps: the camera gets **25%** of the vehicle's visual vibration, low-passed with a 0.12 s time constant, and capped at **1 cm and 0.3°**. Scooter hover bob 0.12 m → at most 0.03 m at the eye, then capped to 0.01.
- No camera shake anywhere in first person (no landing jolt, no boost shake, no crash shake). The crash respawn fades through warm #FFE2B8 (Look).
- Optional comfort setting (default off): "Level horizon" sets roll follow to 0 for all vehicles.

### 7.4 Gauges and readability
- Dash and frame **≤ 25% of screen height**, pillars ≤ 15% of width, centre 50% always clear (STYLE_GUIDE).
- Diegetic gauges (speed, altitude, battery or air) sit in the bottom 25%, each dial **≥ 6% of screen height** (about 65 px at 1080p, 43 px at the Xbox's 1280x720 render) so they read at TV distance. Big needles, no small numbers.
- Needles move smoothly but are cheap: rotate small needle meshes inside the cockpit's draw-call cap, or rewrite one merged needle mesh (≤ 48 vertices) at **10 Hz** with the needle angle eased in between. Today's canvas gauge texture (`setGauge`) updates at 2 Hz at most and stays ≤ 256x128, shared.
- First-person screen HUD is the reduced set (coins, mission ring direction, short prompts); chase view brings back the full HUD.

### 7.5 Cockpit performance rules (measured context: the cabin view is today's slowest scene, 7.4 fps headless at 6x vs about 13-14 elsewhere, and first entry stalls 280-450 ms)
- **No extra dynamic lights in cockpits.** Today the plane, seaplane and blimp cabins each add 2 PointLights (`interiors.mjs:66-67, :122-123`, `cabin.mjs:39-40`). In three r162 the number of point lights is part of every lit material's shader key (`numPointLights` in the program parameters), so showing a cabin with new lights **recompiles every lit material in the world** (the stall), and every lit pixel of the whole world then pays for those lights (the slow frame). Fix: bake the warm light into vertex colours (HOUSE_STYLE's method) or use unlit/emissive materials for cockpit parts. If a light is ever unavoidable, add it at load, keep it in the scene for good and only change its intensity (never `visible` or add/remove), so the light count never changes.
- **Pre-warm at load**: `renderer.compile(scene, camera)` with every cockpit visible, then **one warm-up render from a cockpit eye** with every cockpit visible (uploads geometry and textures and does the first draw), then hide them. In the prototype compile alone did not remove the first-entry spike; compile + warm-up render did (numbers in section 9).
- **Merged meshes**: each cockpit ≤ **6 draw calls** (STYLE_GUIDE: frame, dash, glass rim, gauges, accents, hands or bar) and ≤ **3k triangles**. Today: blimp cabin 56 meshes / 1.8k tris, plane cabin 3 meshes but 9.9k tris, seaplane 3 / 3.3k, glider 2 / 0.6k, roadster 3 / 0.8k, scooter 4 / 0.6k (counted on a copy of src/ today). The blimp needs merging and the plane needs a lighter pilot cockpit.
- The cockpit is drawn **only in first person**, and the exterior vehicle mesh is hidden while you are inside, so the cockpit mostly replaces draw calls rather than adding them.
- Cockpit near plane 0.08 (today's NEAR_CABIN), chase 0.50 (NEAR_CHASE), on foot 0.10. Change near only at the swap point (one projection update).

## 8. Budgets (Xbox One stand-in = headless Chrome, WebGL1, 6x CPU throttle)
| Budget | Limit | Source |
|---|---|---|
| Walk update (input + movement + collision + prompt + camera), per frame | **< 0.5 ms** median and mean; occasional spikes allowed but never above 10 ms | Director / ON_FOOT_DESIGN |
| Any frame during enter, exit or view toggle | **no frame over 50 ms** of our own work (update + render submit), and no frame clearly longer than its neighbours | task; ON_FOOT_DESIGN allows 60 ms, we aim for 50 |
| Outside: hangar + house exterior | **≤ 8 draw calls**, culled when far | Director |
| House interior | **≤ 12 draw calls, < 5k triangles**, drawn only when you are inside or at the door (within 3 m of the doorway; never from 40 m away) | Director / HOUSE_STYLE |
| Each cockpit | **≤ 6 draw calls, ≤ 3k triangles**, first person only, exterior hidden | STYLE_GUIDE |
| Dynamic lights | constant count from load; none added by cockpits or the house | this doc |
| Allocation | no per-frame allocations in walk.mjs (preallocated vectors) | this doc |

## 9. QA test hook (read-only)
`src/walk.mjs` publishes one frozen, read-only global so tests never rely on pixels:
```js
window.__skyWalk = {
  mode: 'walk' | 'vehicle',
  vehicle: 'plane' | 'seaplane' | 'blimp' | 'glider' | 'roadster' | 'scooter' | null,  // null on foot
  camera: 'cockpit' | 'chase' | null,   // null on foot
  pos: { x, y, z },                     // feet on foot, vehicle origin in a vehicle; a fresh frozen object per read
  prompt: string | null,                // exact on-screen text, e.g. 'Hold X: Get in', 'F: Get in', 'Hold X: Get out'
  transitioning: boolean,               // true during any blend in section 6
  viewQueued: boolean,                  // a view toggle pressed mid-blend is waiting to run
  // extras the prototype also exposes: transition ('enter'|'exit'|'toggle'|null), speed (m/s), drawCalls (last frame)
}
```
- Implemented with `Object.defineProperties` getters on a frozen object, defined with `writable: false, configurable: false`. Assigning to it does nothing. Cost: zero unless read.
- Test-only helpers (teleport etc.) live on a separate `window.__skyWalkDebug` that exists only with `?test=1`.

## 10. Measured in the prototype (Oct 17 2026, 14:05-14:40 EDT)
Note: the prototype ran before the Director's input decisions, so it used the old mapping (A/F get in, T toggle, presses ignored mid-move). The timings below don't depend on the mapping.
Prototype: `/workspace/skycharge-flow/walk-proto/` (index.html + walk.mjs, external scripts only, three r162 copy in vendor/, WebGL1 context forced, `index-legacy.html` loads an ES2017 IIFE bundle). Scene: flat ground, hangar + cottage merged into **1 draw call**, interior furniture **1 draw call** (shown only inside or at the door), one parked placeholder roadster (1 call) with a 2-call cockpit, 30 box colliders. `?filler=110` adds 110 separate tree meshes so the scene sits near the game's 120-call budget (41-49 calls).
Method: `measure.mjs`, headless Chrome + SwiftShader, `Emulation.setCPUThrottlingRate`, 1280x720, cross-origin isolated (5 µs timers). Each run: run through the cottage door and around (5 s), walk to the vehicle until the prompt shows, get in, drive 2 s, stop, cockpit→chase, chase→cockpit, get out, get in again. **Median of 3 runs.** "Work" = our update + `renderer.render` call per frame. "Frame" = rAF interval (multiples of 16.7 ms in headless). Headless SwiftShader is not the console; these are relative numbers only. Nothing was run on an Xbox.

| Run (median of 3) | Walk update mean / median / max | Worst work in any transition | Worst frame interval in a transition | Draw calls |
|---|---|---|---|---|
| 4x, plain | 0.15 / 0.04 / 6.8 ms | 17.8 ms (first entry) | 66.7 ms | 3 walk, 4 cockpit |
| 6x, plain | 0.20 / 0.04 / 12.6 ms | 17.7 ms (first entry) | 66.7 ms | 3 / 4 |
| 4x, 110 filler | 0.12 / 0.04 / 4.3 ms | 13.6 ms (exit) | 66.7 ms | 49 / 41 |
| 6x, 110 filler | 0.20 / 0.04 / 5.1 ms | 14.4 ms (first entry) | 66.7 ms | 49 / 41 |
| 6x, 110 filler, legacy ES2017 bundle | 0.15 / 0.04 / 8.3 ms | 12.2 ms | 50 ms | 49 / 41 |
| 6x, gamepad-driven (mocked pad) | 0.16 / 0.04 / 7.9 ms | 8.5 ms | 50 ms | 3 / 4 |

First-entry cost only (`enter_spike.mjs`, 6x, 110 filler, **median of 5**, worst work frame of the first get-in):
| Setup | Worst work frame |
|---|---|
| no pre-warm (compile only) | 52.3 ms |
| **compile + one warm-up render from the cockpit eye (now the default)** | **12.6 ms** |
| warm-up, but a PointLight added to the cockpit on entry (what the game does today) | 78.9 ms |
| no warm-up + PointLight on entry | 98.4 ms |

What this says:
- Walk update meets the **< 0.5 ms** budget on mean and median (0.12-0.20 ms mean at 4-6x). Single-frame spikes of 4-13 ms happened a few times per run (6-14 frames over 0.5 ms out of about 300), most likely GC or JIT under throttling. The game version must keep walk.mjs allocation-free.
- Our own work never exceeded 18 ms in any transition, far under 50 ms. **But the headless frame interval did go over 50 ms** (one 66.7 ms frame in most runs, and also at times with no transition). With our work under 18 ms, that time is the throttled browser and SwiftShader, not the transition. It needs checking on the console.
- A light added on entry costs about 65 ms more on the first entry even with pre-warm. That is the 280-450 ms stall in the real game, scaled down to this tiny scene. Hence rule 7.5: no cockpit lights, keep the light count constant.
- Compile alone is not enough: a warm-up render is what removes the first-entry spike.
- Collisions, the 1.2 m door, porch steps, the prompt, enter/exit, the view toggle and the hook were all exercised by the runs (hook values checked: prompt 'F: Get in' / 'A: Get in', camera 'cockpit' → 'chase' → 'cockpit', mode back to 'walk'). There were 0 page errors in every run.

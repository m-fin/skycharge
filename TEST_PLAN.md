# SKYCHARGE: test plan (per build)

The Xbox ships on two paths. Test both, separately, for every build:
- **Path A, main: WebView2 (Chromium) UWP host.** `game-src/` (three **r186**, WebGL2) → `dist/SKYCHARGE_WebView2_x64.msix` (`www/index.html`). The same engine family as the Chrome tests.
- **Path B, backup: EdgeHTML 18 UWP JS app.** `build-legacy.mjs` bundles `game-src/` with three aliased to **r162** and esbuild `target: es2017` → `www-legacy/` → `layout-js/` → `dist/SKYCHARGE_Backup_EdgeHTML_x64_<ver>.msix`. Strict case: WebGL1 only, no inline scripts, MP3 only, no fetch of package files, about 18–22 fps.

QA is read-only on src/, out/ and the package folder. QA never runs `pack-legacy.sh` or `sync-game-src.py`, never installs, never uploads. Helpers: `qa_edge_scan.mjs` (syntax), `qa_headless.mjs` (headless load/console/fps; `NO_FROMENTRIES=1` emulates Edge 18's missing `Object.fromEntries`).

## Every build
| # | Check | Path | How | Pass criteria |
|---|---|---|---|---|
| 1 | `node test.mjs` | single-file r186 (`out/PlaneGame_play.html`) | headless Chrome + SwiftShader, audio mock | every `pass: true`, "no page errors" |
| 2 | `node test_pad.mjs` | same | fake Xbox pad via real input path | every boolean true, "no page errors" |
| 3 | Headless console-error sweep, 20 s | A: `game-src/index.html` over http and WebView2 `www/index.html`; B: `www-legacy/index.html?diag=1` and the unzipped msix | `node qa_headless.mjs <name> <url> <webgl1> <xboxUA> 20` | 0 page errors; only expected 404s (favicon; .ogg probes on Chromium) |
| 4 | Forced WebGL1 run | B (strict) | `qa_headless.mjs … 1 1` (getContext('webgl2') → null, WebGL2RenderingContext undefined, Xbox UA) | boot diag shows `renderer ok: WebGL1`, `pg.ready`, frames advance, no errors |
| 5 | Edge 18 built-in emulation | B | `NO_FROMENTRIES=1 qa_headless.mjs …` (extend to other ES2019+ built-ins) | music `mp3`, not `error` |
| 6 | Static EdgeHTML audit | B (and src for early warning) | `node qa_edge_scan.mjs www-legacy/*.js`; rg greps per EDGEHTML_CHECKLIST.md | 0 flagged in built JS; no ES2019+ built-ins without a polyfill |
| 7 | Perf check | A and B | headless `renderer.info` calls/tris + rAF fps (trend only); **real number = on-console boot diag `fps … js …ms`** | console ≥ 18 fps at 960x540+, JS ≤ 25 ms; no new draw-call spikes vs last build |
| 8 | Package integrity | A and B | unzip -l msix; manifest Version; SHA256SUMS.txt matches | expected files only, MP3 only, version bumped |

### Baseline results, 1.0.6.0 (Oct 17 2026, 13:30–13:41 EDT). Nothing run on the console.
| Check | Director read-only baseline | QA (this pass) |
|---|---|---|
| test.mjs | 51/51 | **51/51 pass, 0 fail**, no page errors (ran 13:30:30–13:31:06, out/ built 12:45, unchanged during the run) |
| test_pad.mjs | 36/36 | **36/36 pass, 0 fail**, no page errors (13:31:06–13:32:01) |
| Path A headless (game-src http, WebGL2) | n/a | renders WebGL2, 0 page errors, 6 x 404 (music not in game-src, favicon) |
| Path A WebView2 msix www (v1.0.0.0!) | n/a | renders WebGL2, 0 page errors; the package is stale (BUG-002) |
| Path B strict WebGL1 (1.0.6.0 msix unzipped) | n/a | renders WebGL1, 0 page errors, music mp3 via XHR; auto step-down to 960x540 |
| Path B + no Object.fromEntries | n/a | **music `error`, silent** (BUG-001) |

## Planned tests (to add)
**Priority 1.0.7.0 checks:**
1. **Cows** (src/life/animals.mjs): spawn, culling, grounded on terrain, no z-fight, cost in draw calls.
2. **Weather music**: weather states switch music and the crossfades work, no stuck loops, no clicks.
3. **Coin Bitcoin look**: coin mesh/material reads as ₿ (orange #F7931A) on both paths; WebGL1 material ok; pickup still works (coins test round).
4. **Interiors** (src/interiors.mjs: jet cabin, float cabin, harness view, roadster cockpit, scooter view): each loads, the camera near plane is ok, no errors on WebGL1.
5. **Legacy r162 build uses no post-r162 three APIs**: grep the src imports from three against the r162 export list (e.g. BatchedMesh features, newer addons, `Color` management changes, TSL/WebGPU), plus a forced-WebGL1 headless run with no "is not a constructor"/undefined errors.

**Other planned:**
- Vehicles: plane/blimp/glider/seaplane cycle (covered), plus every new vehicle mesh and flight model on Path B.
- Seaplane water landing: gentle → float/bob/taxi, hard → crash (covered in test.mjs round 4); add a WebGL1 visual check of floats on the water.
- Roadster/scooter: drive on the ground, then boost/takeoff; collisions; HUD shows correct units; respawn rules.
- Charging stations: all 5 (+ Lagoon Dock) charge rates and upgrades; the renamed **Ridge Skycharger** label (BUG-005).
- Bitcoin coins: count/total (59 → new total?), saved ids, blimp-only rule.
- Weather + music crossfades: flight ↔ cabin and weather transitions; check for gapless MP3 loop clicks on EdgeHTML (on console).
- `src/life/` modules: init and update each (lifekit, terrain-query, layout, settlements, sounds, animals) with no throws, Pool culling refresh rate, per-frame cost.
- Shoreline z-fighting: stills at grazing angles; polygonOffset on water (units -2) and life materials (offset -4) on WebGL1/ANGLE D3D11.
- Audio clicks: loop points, `setSpeed` hiss fade, setOnWater transitions, mute/volume ramps.
- Visual: sky/fog horizon band (BUG-007); HUD size and TV-safe area (BUG-008).

## 1.0.9 On-foot mode (planned; owner SKYCHARGE QA, file `test_onfoot.mjs`)
Spec sources: ON_FOOT_DESIGN.md, WALK_FEEL.md, HOUSE_STYLE.md, LIFE_DESIGN.md §8/8a. Written before any code exists; nothing here has run yet.

Enter / exit
- OF-01 Enter each of the 6 vehicles (plane, seaplane, blimp, hang glider, roadster, scooter) with A on gamepad and the keyboard equivalent, from the parked spot by the hangar. Expect the cockpit/interior view and vehicle controls active.
- OF-02 Exit each vehicle with B when landed on solid ground; the player is placed on walkable ground, not inside geometry.
- OF-03 No exit while airborne (all 6), including mid-boost for the roadster/scooter and while hovering. B does nothing or shows a hint; no state change.
- OF-04 Seaplane exit on water only onto its float or a dock; never into open water.
- OF-05 Enter prompt only appears within range of a vehicle; never two prompts at once.
- OF-06 Mashing A/B and pausing during the enter/exit camera blend: no softlock, no double vehicle, controls end in exactly one mode.
- OF-07 Gamepad unplugged mid-walk / mid-transition: game pauses or falls back to keyboard, no stuck input.

Walking and collision
- OF-10 Walk speed, accel/stop and dead zone match WALK_FEEL.md values (keyboard and gamepad parity).
- OF-11 Can't walk through hangar, cottage walls, furniture or vehicles; can fit through doors and 1.2 m walkways.
- OF-12 Can't walk off world edge or into deep water; terrain following stays grounded on the 2.5 m-variation plot.
- OF-13 Head bob off by default.

Home and world
- OF-20 Cottage interior is drawn only when inside or at the door; outside hangar + exterior ≤ 8 draw calls, interior ≤ 12.
- OF-21 Window view: cow field (§8a) and runway/sea visible; no z-fighting on window, rug, or floor.
- OF-22 Radio plays current weather music and crossfades with weather; no clicks on enter/exit of the cottage.
- OF-23 Spawn: new day starts in the cottage, facing a sensible direction; no fall-through on load.

Performance and Xbox gate
- OF-30 Walk update < 0.5 ms/frame and no hitch > 1 frame in any transition, measured with Flow's slow-mode harness.
- OF-31 Full on-foot suite passes on the legacy r162 / WebGL1 / ES2017 bundle as well as src (gate rule), with 0 page errors and no Edge 18 syntax hits.
- OF-32 test.mjs and test_pad.mjs still pass with walk mode present.

### First-person vehicle control (1.0.9, added Oct 17 2026; same file `test_onfoot.mjs`)
Applies to all six vehicles: electric plane, seaplane, blimp, hang glider, roadster, scooter.
- FP-01 Boarding glides the camera into the pilot's eyes and stays there; the player has full control in first person with no extra button press.
- FP-02 Control parity: for each vehicle, the same scripted input gives the same speed, climb and heading after 5 s in first person as in chase view (within 2%), because the camera must not change the physics.
- FP-03 Toggle with View/Back on gamepad and V on keyboard, both directions, in all six. Toggling mid-flight, mid-boost and while on water causes no input drop, no hitch over 1 frame, and no change in velocity.
- FP-04 Toggle mashing (10 presses in 1 s) and toggling during the walk-to-cockpit glide never softlock the camera or leave it between the two views.
- FP-05 Climbing in always starts in the cockpit view (ON_FOOT_DESIGN.md §7).
- FP-06 Right-stick look-around is clamped (no looking through the seat or the hull), springs back to centre, and never steers the vehicle.
- FP-07 Exiting from first person still follows the OF-03 rules (no exit while airborne, mid-boost or hovering; seaplane only onto a float or dock), and the camera glides back out cleanly.
- FP-08 Roadster and scooter drive-then-boost in first person: the ground-to-air change has no camera jump, and the horizon stays level within the comfort limits in WALK_FEEL.md.
- FP-09 Seaplane water landing and takeoff in first person: the camera never clips under the water plane, and there is no z-fighting at the waterline.
- FP-10 Near-plane check: no cockpit geometry clipping, flicker or z-fighting with the near plane at 0.05–0.1 m (WebGL1 depth precision).
- FP-11 Gauges are readable: speed, altitude and charge are legible at 1080p and 720p TV-safe area, matching what the HUD shows. Look signs off on the screenshots.
- FP-12 Cockpit view adds no draw calls compared with chase view (outside model hidden, cockpit 6 calls or fewer), and the overall 120 budget holds in both views. No duplicate panels drawn.
- FP-13 Frame time in first person stays within 0.5 ms of chase view on Flow's slow-mode harness, no view switch makes a frame over 60 ms, and cockpit shaders are compiled at load (no first-entry stall).
- FP-14 The whole FP set passes on the legacy r162 / WebGL1 / ES2017 bundle as well as on src, with 0 page errors.
- FP-15 Y/C toggles autopilot in both views without changing the camera; moving a stick no longer jumps out of the cockpit. Nothing else in input.mjs reacts to the right stick.
- FP-16 Dash covers a quarter of the screen height at most, the centre of the view is clear, the runway stays visible on landing, and the HUD in cockpit view shows only coins, mission direction and prompts (STYLE_GUIDE.md).
- FP-17 Look-around is capped at about 100° each side and recentres on its own; the head is steadied against roll.
- FP-18 Drive the roadster and scooter into a herd in cockpit view: cows and people move away within 25 m, bumping a cow eases the vehicle to a stop with no crash, and the cow moos and wanders off (LIFE_DESIGN.md §8b).
- FP-19 Read state from Flow's `window.__skyWalk` hook (mode, vehicle, camera, position, prompt, transitioning).

## Epic sky (1.0.8.1, Look leads)
- SKY-01 BUG-007 closed: no pale band where sea meets sky, checked with headless screenshots at sea level, 500 m and 3 km, in each weather.
- SKY-02 Cloud, cirrus, haze and god-ray layers sort correctly: no popping, no hard edges where clouds meet terrain or water, and no flicker as the camera moves through them.
- SKY-03 The shaders compile on WebGL1/r162 at mediump precision (Edge 18 may not have highp in fragment shaders), with no banding in the gradient and 0 shader errors in the console.
- SKY-04 Draw calls and frame time measured before and after with bench.mjs (`--gl 1 --throttle 6`); any full-screen pass must be measured and approved by Flow.
- SKY-05 Weather changes blend the sky over time without a one-frame jump, and stay in step with the music crossfade.
- SKY-06 The sun glow stays readable in cockpit and chase view and never hides the HUD or gauges.

### Results, 1.0.8.0 preview package (Oct 17 2026, 14:14–14:34 EDT). Nothing run on the console.
test.mjs 75/75 on src and 66/66 on the packaged r162 bundle (run with a 240 s timeout via qa_test_slowbox.mjs because the box was overloaded); test_pad passes on both; Edge 18 scan 0 flagged; forced WebGL1 + no fromEntries: 0 page errors, 307 draw calls at spawn. Verdict: GO as a preview.

- SKY-07 (1.0.8.3): flying up through a high cloud deck. Check the frame time inside the deck, where the deck can cover the whole screen and the GPU may be drawing many overlapping cloud layers on top of each other, and confirm no frame goes over 60 ms. Also check there's no sorting flicker against the cumulus or the sun sprite on WebGL1/r162.
- SKY-08 (1.0.8.3): sun glint and corona against the HUD. The HUD and cockpit gauges must stay readable when facing the sun, in both the cockpit and chase views.

## 1.0.8.2 Cows, cockpit flying, loading screen
- COW-01: from the Home Field spawn, at takeoff and at 150 m up, at least 20 full cows are in the camera's view (BUG-024 regression; Frog saw none on the console).
- COW-02: far cows can be seen as cow shapes from 300 m up in a headless shot. Life stays at 25 draw calls or fewer and under 2 ms per frame on r162.
- COW-03: total triangles at Home Field are no more than about 6% above 1.0.8.1, which had 334,856 on WebGL1/r162. Flag anything bigger to Flow.
- CP-01: the cockpit view and autopilot are separate. In cockpit view with autopilot off, the plane answers pitch, roll and throttle input. Y/C toggles autopilot in both views.
- CP-02: the cockpit is the default view, the right-stick click or B switches to chase, and the choice is remembered and restored after a reload. This replaces the FP-05 wording.
- CP-03: each cockpit has 6 draw calls or fewer and no lights. The blimp gondola uses 3 draw calls, down from 56. The first time you enter a cockpit, no frame takes over 60 ms.
- CP-04: the dash gauges update while flying, at 10 Hz or slower, and do nothing while the dash is hidden. The screen HUD is trimmed in cockpit view.
- LD-01: play is blocked until loading finishes. During loading the progress bar always moves forward, and when it finishes it reaches 100%. No shader compile happens after the loading screen closes. On Xbox, decoded audio at start is only the current weather layer (BUG-021).
- CP-05: the look-around limits are read from `pg.lookCaps` in radians (`side`, `up`, `down`), never hard-coded. The live values are about 100° to the side, 45° up and 30° down. Holding the stick fully over stops the view at each cap, and with no input it eases back to centre.
- CP-06 (glider, Frog's priority): the glider's first-person view is flyable on a gamepad, checked with test_pad-style input. Pitch and roll respond, the launch and a turn at height work, and landing works from inside. The wing is visible overhead, and the horizon sits roughly mid-screen in level flight. The cockpit has 6 draw calls or fewer and no frame over 60 ms on entry. A shot is taken at level flight and in a 30° bank.
  - Added by the Director: with autopilot off, the glider climbs in rising air. The sky fills at least 50% (sky+sea+haze) of the frame in level flight, measured by pixel classification on a headless shot (Director set 50% on Oct 17; the old 60% and 70% targets are dropped).

## 1.0.9 On Foot (test_onfoot.mjs, QA)
- OF-01: get out and back in for all six vehicles (hold X 0.4 s / F), no stuck states, toggle queued mid-transition.
- OF-02: look-down body check. At 30° and 60° down, chest, arms and hands are in frame. Nearest body part is at least 0.10 m from the eye at 60° down (near clip 0.05 m). Pivot is 0.10 m behind and 0.12 m below the eye, and look-up is capped at +80°. Only one of the camera pivot and FP_BACK moves the eye forward, not both.
- OF-03: walk budget. On-foot update is 1 ms or less per frame. Figure is 2 draw calls or fewer, 3k triangles or fewer, and adds no lights.
- OF-04: pad flow. LB runs, A jumps, Y interacts, R3 switches view, B starts missions, keyboard B toggles the view.
- OF-05: walkable edges. You can't walk into water, cliffs or house walls, and the door's two 0.21 m steps are climbable.
- HM-01 (1.0.9.1): you can't walk through the sofa, table or kitchenette. Walk in, sit (Y), use the phone and computer, stand up (B/Y), walk out. Home is 6 draw calls or fewer and only renders when you're near. Parked vehicles charge while you're inside, and "bring it out" places the vehicle on the apron.

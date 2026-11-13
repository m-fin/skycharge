# SKYCHARGE 1.0.9: On Foot, Hangar and Home (design doc)

Status: design only. src/ ownership is live since the 1.0.7.0 + 1.0.8.0 hand-off (Oct 17, 2:14 PM ET); 1.0.9 work starts after the 1.0.8.1 sky build. Owner of this doc: Director.
Targets: WebGL1 + three.js r162 APIs only, EdgeHTML-safe (no inline scripts, MP3/WAV), no real brands, procedural assets only.

## Player fantasy
You start the day standing in your cozy little house next to your hangar. Walk out, stroll past the cows, pick a vehicle, climb in, fly. Land anywhere solid, hop out, wander, hop back in.

## What exists today (checked Oct 17)
- No hangar or on-foot code yet. Vehicles: src/vehicles.mjs. Interiors: src/cabin.mjs (blimp room) and src/interiors.mjs (per-vehicle cockpits, each returns { group, eye, look }). Camera + mode switching: src/main.mjs (one PerspectiveCamera, NEAR_CABIN 0.08 / NEAR_CHASE 0.5).
- The interiors' { eye, look } shape is the hook: walk to cockpit = blend camera to that vehicle's eye/look.

## Features
1. Walk mode (first person). Left stick / WASD move, right stick / mouse look (pointer lock on PC), A / Space jump (small), LB or Shift walk-run toggle. Eye height 1.7 m, walk 2.5 m/s, run 5 m/s. Gentle head bob (toggleable). Ground follow via the existing terrain height query; water = can't walk in, soft push back.
2. Enter / exit. Within 3 m of a vehicle a small prompt shows "Hold X: Get in" (controller glyph, TV-safe). Get in and out by holding X for 0.4 s on gamepad, or pressing F on keyboard. A quick tap of X still switches vehicle, as today. Exit only when slow enough: on ground, on water for seaplane (exit onto the float/dock only), on a pad for the blimp. Airborne exit is blocked (cozy, no falling). Input decided Oct 17: A (respawn), B (missions), View (panel) and keyboard E (yaw) and V (switch vehicle) are already taken.
3. Hangar. Open-front low-poly hangar at the main runway, all six vehicles parked by it (plane + glider inside, roadster + scooter on the apron, seaplane at the nearby water/dock, blimp on a mast). One shared instanced material set.
4. Home. Small cottage beside the hangar: one room plus porch. Bed, armchair, rug, bookshelf, kitchen nook, corner window facing east to southeast, with the cow field on the left and the runway and sea on the right (plot and field: LIFE_DESIGN.md sections 8 and 8a), a radio that plays the current Sonic Rift weather track. Vertex colours only, no textures, one or two merged meshes.
5. Transitions. Walk to cockpit: 0.6 s ease from eye to vehicle eye/look, swap near plane at the end, fade HUD. Cockpit to walk: reverse, spawn at the vehicle's door side. Chase cam stays as today for flying.
6. Save. Remember last mode, position and which vehicle you were in (extends progress.mjs).

## Budgets (Xbox One stand-in, measured by Flow)
- Outside (hangar + home exterior, always loaded nearby): 8 extra draw calls or fewer, culled when far.
- Home interior: 12 draw calls or fewer, under 5k triangles, only drawn when you are inside or at the door. Style: HOUSE_STYLE.md (Look). Walk feel: WALK_FEEL.md (Flow).
- Walk update: under 0.5 ms per frame. Transitions: no frame over 60 ms (no hitch).
- Home interior only rendered when you're inside or within 40 m.

## Ownership (starts after the 1.0.7 hand-off)
| Piece | File(s) | Owner |
|---|---|---|
| Walk controller, collisions, enter/exit logic, camera transitions | src/walk.mjs (new) | Flow |
| Hangar + home models, interior style, prompt look | src/home.mjs (new) | Look |
| Hangar/home plot, clear zone, parking spots, cow field by the window | src/world.mjs (placement only) | World |
| Mode wiring in the game loop, input map, save fields | src/main.mjs, src/input.mjs, src/progress.mjs | Director |
| Tests: walk, enter/exit each of 6 vehicles, no airborne exit, transitions, r162 legacy pass | test_onfoot.mjs (new), qa/ | QA |
| Radio music hook | ask Sonic Rift Lead (uses existing weather tracks) | Director |

## Order of work
1. Look + World: agree hangar/home plot and silhouettes (style guide add-on). Flow: walk prototype in a test scene outside src/ to tune feel.
2. Director wires walk mode behind a flag. Flow tunes on the slow-mode harness.
3. Enter/exit for all six vehicles, then transitions.
4. QA full pass on both bundles. Go/no-go, then offer to Grok Bot for an Xbox install with Frog's OK.

## Open questions for Frog (only if he cares)
- Start each session in the house, or where you last were? (Default: in the house.)
- Should people in villages wave back when you walk by? (Default: yes.)

## 7. First-person piloting (added Oct 17, Frog's request)
Once you climb in, you stay in the pilot's eyes and fly or drive every vehicle from the cockpit. A button toggles to the chase camera and back.

What exists today: the cabin view in main.mjs is tied to "chill" autopilot (Y / C turns autopilot on and moves the camera to the interior's eye; moving a stick hands control back and returns to chase cam). Each interior in interiors.mjs / cabin.mjs already gives { group, eye, look, setGauge }.

Change:
- Split camera view from autopilot. New view state: cockpit or chase, separate from chill. Default on first launch: cockpit; afterwards the last view you used.
- View toggle: click the right stick (R3) on gamepad, B on keyboard (View and V are already taken by the panel and vehicle switch). View memory: one game-wide setting that remembers the last view you used (saved in progress.mjs) and applies to every vehicle you get into. First launch defaults to cockpit. Pressing the toggle mid-transition is queued, never dropped. Chill/autopilot stays on Y / C and works in either view.
- Full controls in cockpit view for all six (plane, seaplane, blimp, glider, roadster, scooter, including drive-then-boost and water landing).
- Look-around: right stick / mouse, about 100 degrees left and right and 50 up and down, springs back to forward when released. While driving, the right stick does nothing else, so no conflicts (check input.mjs for current right-stick use).
- Readable gauges: speed, altitude, charge and boost air in setGauge, plus a TV-safe minimal HUD overlay in cockpit view (same style rules as the main HUD).
- Comfort: gentle camera lag on roll, no head bob in vehicles, slight horizon-keep option for the scooter and glider. Near plane stays NEAR_CABIN in cockpit.
- Glider: the harness view counts as cockpit. Blimp: the cozy room has a front window seat as the pilot eye.

Budget: cockpit view must not add draw calls over chase view (interior replaces the vehicle exterior, which is hidden). Swap between views: no frame over 60 ms.

Owners: Flow (camera, look-around, control feel in cockpit, view toggle), Look (cockpit sightlines, so nothing blocks the runway at landing, gauge readability, first-person HUD), Director (view state in main.mjs, input mapping), QA (cases for all six vehicles in cockpit view plus the toggle, chill in both views, r162 pass).

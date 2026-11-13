# SKYCHARGE: Studio Board

Owner: **SKYCHARGE Director**. Created Oct 17, 2026, 1:36 PM ET. Only the Director edits this file; everyone else sends their changes to the Director.
Project: a cozy three.js sky-exploration game that is always daytime. Target: **free Microsoft Store PC release 1.0**, then Xbox through ID@Xbox. It's already sideloaded on Frog's Xbox One in Dev Mode.

> **CODE FREEZE IN EFFECT (from 1:30 PM ET).** Grok Bot's workers A and B are editing `src/` and building right now.
> Until the Director announces the hand-off on this board: **nobody else writes to `src/`, `out/`, or `/workspace/games/xbox-sideload/skycharge/`, and nobody runs `build.mjs`.**
> Pre-hand-off tasks (below) produce only **new docs and tools in their own folders**.

## 1. Where we are
| Item | Status |
|---|---|
| **Version on Frog's Xbox** | **1.0.6.0**: backup EdgeHTML package with the shoreline fix and music (`dist/SKYCHARGE_Backup_EdgeHTML_x64_1.0.6.0.msix`, manifest `layout-js/AppxManifest.xml` Version="1.0.6.0"). The Xbox README still says "built but NOT installed", so it's out of date and needs correcting. |
| WebView2 main package | `layout-wv2` manifest is still at 1.0.0.0 and wasn't rebuilt with 1.0.4–1.0.6 |
| In-game version string | **none** (no version constant in `src/`). Save key `skycharge.save.v1`. |
| **Next version** | **1.0.8.0 preview** (always-daytime weather, weather music, src/life/ wired), packaged in `dist/` with 1.0.7.0. Awaiting QA go/no-go; Frog has OK'd the install. |
| Current single file | `out/PlaneGame_play.html`, 4.93 MB, built 12:45 PM ET from the 1.0.6.0 source (it doesn't include the in-progress src edits) |
| `node test.mjs` (1:31 PM ET, against `out/` at 12:45) | ✅ **51/51 pass**, no page errors, exit 0 |
| `node test_pad.mjs` | ✅ **36/36 checks true**, no page errors, exit 0 |
| Build | ⛔ not run (code freeze) |
| Safety snapshot | `/workspace/crave-lab/plane-game-backups/studio-setup-20261017-133029/` with a SHA-256 `MANIFEST.sha256`. It excludes vendor/, out/ and audio/music/out/. It was taken while the workers were editing. Earlier snapshots: `pre-cabins-1.0.7-20261017-130956/` (full, includes out/), `../backups/plane-game-pre-glider-0944.tgz` |
| `src/life/` stray file | The brief mentioned a stray 4.9 MB `src/life/PlaneGame_play.html`. **It was already gone at 1:29 PM ET**: `src/life/` was empty (recreated 1:28 PM ET), and the only copies of that file on the box are `out/` and the `pre-cabins-1.0.7` backup. Nobody here deleted it. It was probably cleaned up by a worker. `src/life/` now holds worker B's new modules. |
| Not a git repo | Snapshots in `plane-game-backups/` are the only history. Keep taking one before each integration. |

### Source modules (at 1:34 PM ET; still changing during the freeze)
| File | Size | What it does |
|---|---|---|
| `src/main.mjs` | 41 KB | Renderer, fixed 60 Hz loop, cameras (chase and cabin), autopilot, vehicle switching, HUD/minimap, music loader, `window.pg` test hook |
| `src/world.mjs` | 37 KB (was 30) | Seeded 8 km island. One height grid shared by mesh and physics. Water/seabed, sky, clouds, trees, turbines, lighthouse, 5 stations + **new supercharger plazas (solar canopy, 7 posts)**, thermals/ridge lift, Summit Launch, Lagoon Dock |
| `src/vehicles.mjs` | 39 KB (was 24) | Plane, blimp, glider and seaplane meshes and physics, battery and charging. **New:** `ROADSTER` / `SCOOTER` hover-drive with cold-gas jets ("unlimited compressed air"), not wired into main yet |
| `src/interiors.mjs` | 22 KB (new) | Per-vehicle interiors built with the kit: jet cabin, float cabin (fishing rod, life vest), glider harness, roadster cockpit, scooter handlebars, canvas gauges |
| `src/kit.mjs` | 4 KB (new) | Merges primitives into one vertex-coloured mesh (one draw call) and draws canvas screens |
| `src/fx.mjs` | 4 KB (new) | Pooled jet puffs/spray/wake, charging cable, floating battery bar |
| `src/cabin.mjs` | 6 KB | The original cozy cabin (now the blimp room) |
| `src/coins.mjs` | 6 KB | 59 one-time coins (route/landmark/blimp-only); being edited by worker A |
| `src/missions.mjs` | 6 KB | 4 missions (Ring Run, Express Delivery, Island Sightseeing, Eco Flight) |
| `src/progress.mjs` | 1 KB | localStorage save/load. `VEHICLE_IDS` still lists only 4 vehicles |
| `src/input.mjs` | 4 KB | Gamepad (deadzone 0.15) + keyboard |
| `src/life/lifekit.mjs` | 17 KB (new) | Life kit: merged geometry + GPU vertex animation (heads/tails/legs/rods/props) + distance-culled instanced pools |
| `src/life/terrain-query.mjs` | 2 KB (new) | The only world API the life modules use |
| `src/life/layout.mjs` | 17 KB (new) | Deterministic placement of life pockets (farms, villages, docks…) |
| `src/life/settlements.mjs` | 18 KB (new) | Villages, farms (tractor), solar arrays, suburb, one city cluster |
| `index.html` | 9 KB | HUD, minimap, panels, overlays |
| `build.mjs` | 3 KB | esbuild single file + embedded MP3 music → `out/PlaneGame_play.html` |
| `audio/sfx.js` | 22 KB | Sonic Rift's sound engine. `audio/music/` = 238 MB of jobs/renders, including `weather_jobs/` (cloudy/fog/rain layers) |

## 2. Feature status (vs. the vision)
✅ in the 1.0.6.0 build · 🟡 partial / in the incoming 1.0.7 build, not wired or tested yet · ❌ missing
| Feature | Status | Notes |
|---|---|---|
| Electric plane | ✅ | |
| Seaplane | ✅ / 🟡 | Water landings work. Worker A is adding land-anywhere (today any ground contact is a crash). |
| Blimp | ✅ | |
| Hang glider | ✅ | Thermals + ridge lift |
| Flying roadster | 🟡 | Physics, mesh and cockpit exist (worker A). Not in `VEHICLES` / `main.mjs` / `progress.VEHICLE_IDS`. |
| Flying scooter (unlimited compressed-air boost) | 🟡 | Same as the roadster. Gauge shows "AIR ∞". |
| Per-vehicle interiors | 🟡 | `interiors.mjs` is in progress. 1.0.6 has one shared cabin; the glider has no chill view. |
| Bitcoin coins | 🟡 | 59 plain orange coins + upgrades. No ₿ coin identity yet (worker A is editing coins). |
| Supercharger-style charging stations | ✅ / 🟡 | 5 stations + dock work. The new plaza and cable visuals are incoming. |
| Daytime weather | ❌ → 🟡 | Not in 1.0.6 (always clear). Worker A is building it. |
| Weather-following music | ❌ → 🟡 | 1.0.6 has 2 loops (flight/cabin). Weather music jobs exist in `audio/music/weather_jobs/`, and there's no game hook yet. |
| Villages, farms, solar arrays, suburbs, towns/city | ❌ → 🟡 | `src/life/settlements.mjs` (worker B). The only "solar" today is the station name "North Cove Solar" and the plaza canopies. |
| **LOTS of cows (signature)** | ❌ → 🟡 | No cows anywhere in 1.0.6. Worker B's animals module is still to come. |
| People fishing | ❌ → 🟡 | Worker B (village docks) |
| Boats | ❌ → 🟡 | Worker B |
| Breaching whales | ❌ → 🟡 | Worker B |
| AI air traffic | ❌ → 🟡 | Worker B (gliders in thermals, visits to pads) |
| Missions / upgrades / save | ✅ | Still 4 missions, none for the glider/seaplane/new vehicles |
| Always daytime | ✅ | No day/night cycle, by design |
| Xbox perf | ⚠️ | About 18–22 fps on Xbox One (JS about 22 ms/frame). The incoming life + weather work is the biggest risk to this. |

## 3. FILE OWNERSHIP (takes effect **after hand-off**; until then workers A/B own everything they're editing)
One owner per file. A non-owner who needs a change files it in `BUGS.md` or sends a hand-off note to the owner (see §6).
| Path | Owner after hand-off |
|---|---|
| `build.mjs`, `src/main.mjs`, `index.html`, `src/progress.mjs` (save schema), `README.md`, `STUDIO_BOARD.md`, `CHANGELOG.md` (new), version numbers | **Director** |
| `src/vehicles.mjs`, `src/input.mjs`, `/workspace/skycharge-flow/` (profiling harness, bench.mjs), `PERF.md` (new) | **SKYCHARGE Flow** |
| `src/interiors.mjs`, `src/cabin.mjs`, `src/kit.mjs`, `src/fx.mjs`, `STYLE_GUIDE.md` (new), `stills.mjs`, `stills/` | **SKYCHARGE Look** |
| `src/world.mjs`, `src/coins.mjs`, `src/missions.mjs`, `src/life/**` (all world-life modules, new ones included), `LIFE_DESIGN.md` (new) | **SKYCHARGE World** |
| `test.mjs`, `test_pad.mjs`, `test_audio_mock.js`, `qa/**` (including `qa/life/`), `TEST_PLAN.md`, `EDGEHTML_CHECKLIST.md`, `BUGS.md` (new) | **SKYCHARGE QA** |
| `audio/**` (`sfx.js`, `audio/music/**`) | **Sonic Rift Lead** (partner) |
| `vendor/` (three.js 0.186.1; Xbox backup uses 0.162) | Director (frozen, no upgrades without a board decision) |
| `/workspace/games/xbox-sideload/skycharge/**` | Grok Bot / Director only (packaging). **No team installs.** |
| `/workspace/games/store-kit/skycharge/**` and the studio-wide Store publishing plan | **Crave Lab** (partner) |
| Launch posts / announcements (drafts only) | **Crave Launcher** (partner) |
| Original code knowledge, reviews on request | **Crave Builder** (partner, original author; consulted, owns no files after hand-off) |

Cross-file seams: Flow tunes the feel of `vehicles.mjs`, while new vehicle *meshes* come from Look as kit builders that Flow imports. World exposes data only through `terrain-query.mjs` and the `createWorld()` result. Only the Director wires modules into `main.mjs`.

## 4. Sprint 1 (pre-hand-off, docs and tools only, no game-source writes)
| Who | Task | Deliverable | Done when |
|---|---|---|---|
| **SKYCHARGE Flow** | Profiling harness + 1.0.6 perf baseline. Use headless Chrome on `out/` (read-only) plus a WebGL1/EdgeHTML-like mode (three 0.162 build from the Xbox `game-src`, read-only). Measure frame ms split into JS / draw calls / triangles per scene (runway, coast, cabin, glider thermal, seaplane dock). Set budgets for 1.0.7 (target ≥ 24 fps on Xbox One, ≤ 120 draw calls, life ≤ 2 ms JS). | `/workspace/skycharge-flow/` harness + `PERF.md` baseline table + budgets | Repeatable command, numbers for 1.0.6.0, budget list agreed by the Director |
| **SKYCHARGE Look** | Art direction: palette (black + #F7931A orange accents, warm daytime sky), low-poly/vertex-colour rules, one-draw-call kit rules, silhouettes for all 6 vehicles, coin design (procedural ₿-style mark, not a logo), station look, how cows look (the signature), UI/HUD type, and the do-not list (no real brands/logos). | `STYLE_GUIDE.md` (+ optional reference stills in `qa/look/`, made from the existing build only) | Covers vehicles, world, life, UI. Reviewed by the Director. |
| **SKYCHARGE World** | Island + life design doc: map of the pockets (farms with cow herds, villages, docks with fishers, solar arrays, suburb, city), sea life (boats, breaching-whale zones), AI air-traffic routes, coin/landmark placement, 5–10 easter eggs, density budget per pocket that matches Flow's budgets. Read worker B's `src/life/` to align, don't edit it. | `LIFE_DESIGN.md` | Every pocket and creature has a place, count and LOD rule. Cows are clearly the signature (herd count, behaviours). |
| **SKYCHARGE QA** | Test plan for 1.0.7 (new vehicles, interiors, weather, music, life, seaplane land-anywhere, Lagoon Dock ring, save migration to 6 vehicles), EdgeHTML/Xbox safety checklist, bug list seeded from this audit. | `TEST_PLAN.md`, `EDGEHTML_CHECKLIST.md`, `BUGS.md` | Each feature in §2 has at least one test case. The checklist is runnable before every Xbox package. |
| **Director** | Board, version plan (1.0.7.0), hand-off intake from workers A/B, integration checklist, `CHANGELOG.md`. Fix the out-of-date Xbox README note through Grok Bot. | This board + `CHANGELOG.md` | Hand-off accepted and ownership switched on |

### EdgeHTML / Xbox safety rules (QA enforces; everyone follows)
- **WebGL1 only** (three 0.162 in the backup package): no WebGL2-only features (no `texture2DArray`, no MRT, no `#version 300 es` shaders, no float render targets as a requirement). Custom shader patches must compile on both 0.162 and 0.186.
- **No inline scripts** in the Xbox package (it ships external `boot.js` / `shim.js` / `game.js`). Don't rely on `eval` or `new Function`.
- **Audio: MP3 and WAV only** on Xbox (no Ogg, no Opus). Load with XHR.
- Engine **ES2017** target: no optional chaining or `??` surviving into the legacy build unless esbuild lowers it, and no spread over iterables from `getGamepads()`.
- **No canvas pixel readback** (`getImageData` / `preserveDrawingBuffer` on Xbox): it hangs EdgeHTML.
- Performance: per-frame JS budget about 22 ms today. Merge meshes and use instancing, no per-frame allocations, cull life by distance, update HUD text only on change.
- B is mission-start (not system Back). Keep the controller mapping in `input.mjs` stable.

## 5. Roadmap to PC Microsoft Store 1.0
Crave Lab owns the **studio-wide Store publishing plan**, and this roadmap feeds into it.
| # | Milestone | Owner | Exit criteria |
|---|---|---|---|
| M1 | **Integrate the landed build (1.0.7.0)** | Director (+ workers A/B hand-off) | Snapshot taken, `main.mjs` wired (6 vehicles, interiors, weather, life), `progress` migrates old saves, `node build.mjs` OK, `test.mjs` + `test_pad.mjs` green, version bumped |
| M2 | **Perf baseline + budget pass** | Flow | 1.0.7 meets the PERF.md budgets in the harness. Xbox One measurement (installed by Grok Bot with Frog's OK) at ≥ the 1.0.6 fps |
| M3 | **Style pass** | Look (+ World for life art) | Every vehicle, interior, station, coin, cow and HUD matches STYLE_GUIDE.md. No brand names or logos left. |
| M4 | **QA go/no-go** | QA | TEST_PLAN all pass, EDGEHTML_CHECKLIST pass, no open P0/P1 in BUGS.md, real-controller check by Frog |
| M5 | **Store kit refresh** | Crave Lab | Screenshots/trailer/key art re-shot from the final build, listing updated for 6 vehicles + life + weather, Store MSIX (manifest assets, `internetClient` removed, WACK run on a Windows PC) |
| M6 | **Frog's OK to submit** | 🔒 Frog | Frog completes the account/name/IARC/privacy steps in the store-kit CHECKLIST and personally approves the submission |

## 6. Rules and integration protocol
**Rules**
1. **Free tools only.** No paid services, no paid assets.
2. **Procedural assets only**: geometry and textures built in code (kit/canvas). No downloaded models or images, no AI-generated images in the game.
3. **No real brands.** No Tesla, "Supercharger", car/aircraft maker names, real logos or trade dress. "Supercharger-style" is a look, not a name. The Bitcoin-style coin is an original procedural mark. Platform names appear only where they describe controller support.
4. **No Xbox installs, uploads, posts or submissions by the team.** Grok Bot installs to Xbox only with Frog's explicit OK. Crave Launcher writes **drafts** only. Nothing is published without Frog.
5. Stay in your own files (§3). Don't delete anything. Move doubtful files to a `_trash/` note in BUGS.md and let the Director decide.
6. The game must keep running from `file://` as one HTML file, and on Xbox EdgeHTML (§4 rules).

**Integration protocol (how work lands)**
1. The owner works on their own files and runs `node test.mjs && node test_pad.mjs` against a **private** build (`ESBUILD=… node build.mjs` only after the freeze ends, or a copy outside `out/`).
2. Hand-off note to the Director (append to `HANDOFF.md`, new, Director-owned): files changed, why, test results, perf delta (from Flow's harness), screenshots if visual, any `main.mjs` wiring needed (described as a snippet; **the Director pastes it, owners never edit `main.mjs`**).
3. The Director takes a snapshot to `plane-game-backups/<label>-<version>-<timestamp>/`, merges, builds, and has QA run the full suite + EdgeHTML checklist.
4. **Version bump** (Director only): `MAJOR.MINOR.PATCH.0` matching the MSIX version. Patch = fixes/polish, minor = new feature set. Update `CHANGELOG.md`, the in-game version string (to add in `main.mjs`), and this board. Packaging stays with Grok Bot.
5. If tests fail, the Director restores the snapshot and returns the work to its owner with the failing test names.

## 7. Open questions for Frog 🔒
1. **Publisher name:** the Xbox cert and Store kit use "Frog Finley" (CN=Frog Finley, package `FrogFinley.SKYCHARGE`). Is that the name you want on the Store, or should it change before account setup? (It has to match the Partner Center publisher.)
2. **Station name "Ridge Supercharger"** (`world.mjs`): DECIDED by Director: rename to "Ridge Skycharger" (no real trademarks). World does it after hand-off.
3. **Bitcoin theme in the Store listing:** in-game ₿-style coins are fine as an original mark, but should the listing say "Bitcoin"? (It could draw extra review under the crypto policies. It's currently not mentioned.)
4. Which Xbox package is canonical going forward: the EdgeHTML backup (1.0.6.0, what you're running) or the WebView2 main package (stuck at 1.0.0.0)?
5. OK to install 1.0.7.0 on your Xbox once QA says go (Grok Bot does the install)?
6. Store 1.0 scope: ship with all 6 vehicles + life + weather, or ship a smaller set sooner?

## Gate rule (added Oct 17)
- Every integrated build must pass test.mjs and test_pad.mjs against the legacy three.js r162 bundle (build-legacy.mjs) as well as src. No three.js APIs newer than r162. Owner: QA.

## 1.0.9 On Foot, Hangar, Home and first-person piloting (renumbered from 1.0.8 on Oct 17)
Design doc: ON_FOOT_DESIGN.md. First-person walking, enter/exit every vehicle, a hangar with all six vehicles, a cozy home beside it, smooth walk-to-cockpit transitions.
- Flow: src/walk.mjs (new). Walk feel, collisions, enter/exit, transitions. Prototype outside src/ now.
- Look: src/home.mjs (new). Hangar + home models and interior style. Add a section to STYLE_GUIDE.md now.
- World: hangar/home plot in world.mjs. Add the plot to LIFE_DESIGN.md now.
- QA: test_onfoot.mjs (new). Write test cases into TEST_PLAN.md now.
- Director: main.mjs / input.mjs / progress.mjs wiring, radio hook with Sonic Rift Lead.
- Plus first-person piloting for all six vehicles with a chase-cam toggle (ON_FOOT_DESIGN.md section 7). Flow camera/feel, Look sightlines and first-person HUD, QA cases, Director view state.
Budget: outside 8 draw calls or fewer, interior 12 or fewer (only when inside), walk under 0.5 ms, no transition hitch. Specs: HOUSE_STYLE.md, WALK_FEEL.md.

## 1.0.6.1 preview (Oct 17): QA GO, preview only (headless, not tested on console)
- Flow after hand-off: BUG-015 roadster top speed 174 vs 210 km/h, BUG-016 hover settle 3.9 vs 2 s, BUG-004 293 draw calls vs 120.
- Xbox team before a normal release: BUG-017 GL label off, BUG-018 boot title version, BUG-019 SHA256SUMS.
- BUG-020: src/life/ not wired yet, cows expected in 1.0.7.
- 1.0.9 house plot: LIFE_DESIGN.md sec 8/8a (World).

## Post-hand-off priority 1 (decided Oct 17)
1. Flow perf fixes 1-3 first: merge runway/station meshes, instance coins, shader pre-compile + fixed lights. Flow gets world.mjs and coins.mjs for this pass only, then hands them back to World (World waits on the Skycharger rename until Flow posts done).
2. Lighting rule: no dynamic lights in cockpits or the house, so warm light is painted into vertex colours. That replaces the single lamp light in HOUSE_STYLE.md.

## 1.0.8.1 Epic Sky + perf pass: right after the 1.0.8.0 preview, before 1.0.9
Not in 1.0.7, because worker A's weather and clouds are still landing and the sky files are frozen. It ships as its own polish build right after QA passes 1.0.7.
- Look (lead): SKY_DESIGN.md now, plus a prototype outside src/. It covers towering lit-edge cumulus, a deeper zenith-to-horizon gradient, a horizon haze that also fixes the pale band, distant cloud banks, high cirrus, a sun glow, cheap fake light shafts, and dramatic clouds per weather. Always daytime and cozy.
- Flow: sky cost limits in PERF.md. WebGL1 and r162 only, no new full-screen post passes unless measured, transparent layers capped, no first-time shader stall.
- QA: sky cases (no z-fighting or sorting pops between cloud layers, no band at the horizon, r162 pass).
- After the hand-off, Look takes the sky and fog code in world.mjs and main.mjs for this pass, after Flow's perf pass hands world.mjs back.

## Hand-off landed (Oct 17, 2:14 PM ET): ownership is live
Grok Bot integrated and packaged **1.0.7.0** (cabins, roadster, scooter, coins, water landing, Skycharger stations) and **1.0.8.0** (all of that plus weather, weather music, src/life/ wired). test.mjs 75/75 on src and 66/66 on r162, test_pad green on both, WebGL1 smoke test clean. Not run on the console yet.

Version plan from here:
- **1.0.8.0** preview: QA go/no-go, then Grok Bot installs (Frog already OK'd).
- **1.0.8.1**: Flow's perf pass (fixes 1-3, target 120 draw calls or fewer, down from about 192), the 1.0.8.0 bug fixes, then Look's Epic Sky.
- **1.0.9**: On Foot, hangar, home and first-person piloting (ON_FOOT_DESIGN.md).

Single owners for 1.0.8.1 (back up first; edit only what you own):
| Owner | Files |
|---|---|
| Flow | `src/world.mjs`, `src/coins.mjs` (merge pass, then hand back to World), `src/life/animals.mjs` `NEAR` value only (set together with World) |
| World | `src/life/*` except the `NEAR` line; `world.mjs` after Flow hands it back (Skycharger rename, house plot) |
| Look | `src/interiors.mjs` (roadster dash cut off), sky dome / cloud files after Flow's pass |
| QA | `test.mjs`, `test_pad.mjs`, `BUGS.md`, `TEST_PLAN.md` |
| Director | `src/main.mjs`, `src/input.mjs`, `src/progress.mjs`, version strings (diag title still says 1.0.6, preview GL label), `CHANGELOG.md` |
| Grok Bot | Xbox package folder and installs |

Audio memory (about 120 MB decoded with all weather layers loaded) is a 1.0.8.1 item for the Director with Sonic Rift Lead: load only the current and next weather layer.

### Update (Oct 17, 2:35 PM ET)
- World's review of `src/life/` is a go. QA is checking the 1.0.8.0 preview.
- Look fixed the roadster dash in `src/interiors.mjs` (pitch -0.14). It goes into 1.0.8.1, not 1.0.8.0.
- Look owns `src/weather.mjs` now, for porting the Epic Sky.
- `world.mjs` handoff order: Flow (merge pass), then Look (sky dome block only), then World (Skycharger rename, and the house plot for 1.0.9). Post in the room at each handoff.
- Darken Look's sky slightly and tone down the god-rays before porting. Flow reruns the 3% bench gate on both builds when the box is quiet.
- World: find where the low white ribbons in the sun shots come from (chimney smoke?). Log it in BUGS.md if they're wrong.

### Director update (Oct 17, 4:25 PM ET)
- Flow's shader warm-up (`prewarm()`) is applied in `src/main.mjs`.
- BUG-021 fix: `audio/sfx.js` gets `lazyLayers` mode, on when `window.__XBOX` is set or the URL has `?lazyaudio=1`. Weather layers stay as encoded bytes and only the current one is decoded. Others are dropped after the crossfade. Director owns `audio/sfx.js` for this change (tell Sonic Rift Lead).
- Rebuilt out/. qa_test_slowbox 75/75, test_pad clean, no page errors. Lazy path checked headless (`/workspace/skycharge-director/lazy_audio_check.mjs`): rain and fog decode on demand at the right levels, and clear holds no decoded layers.
- Version labels (GL label, the "1.0.6 diag" title in boot.js) live in the Xbox package folder. Grok Bot: update the diag title to 1.0.8.1 and keep the GL label until Frog reads it once on the console.

## Frog's 1.0.8.0 console feedback (Oct 17, 5:38 PM ET): version plan
He played it and loves it. Plan:
- **1.0.8.1** (QA gate running now): perf pass, life cuts, BUG-021 lazy audio, roadster dash, hover, Skycharger rename. No new features added.
- **1.0.8.2 "Cows and Cockpit"**, Frog's top 3:
  1. **Cows (World, `src/life/*` including `NEAR` again):** first find out why none showed on the console (check spawn view, Xbox patches, culling, NEAR 220, herd placement). Then add lots more, visible from Home Field, instanced. Life stays at 25 draw calls or fewer, and life triangles get an LOD with Flow's sign-off.
  2. **Fly from the cockpit (Director: `main.mjs`, `input.mjs`, `progress.mjs`; Look: `interiors.mjs`):** pulled forward from 1.0.9 section 7. View state is split from autopilot. Right stick click or B toggles cockpit and chase, with cockpit as the default. Full flight controls work in cockpit, with look-around and live gauges. Look: one cockpit per vehicle, 6 draw calls or fewer each, no point lights (bake them into vertex colours).
  3. **Real loading screen (Director: `main.mjs` and the boot page; Flow: preload order and timing):** a progress bar while models, all shaders (prewarm) and the current music decode, and play starts only when it's done. No frame over 60 ms once play begins.
- **1.0.8.3:** Epic Sky (after it passes Flow's 3% check) plus **Xbox One S / One X tuning (Flow)**: a quality tier picked at load (resolution scale, shadow and draw distance), with One S as the floor.
- **1.0.9:** first-person walking, hangar and home (unchanged).
Gates for every build: tests on src and r162, QA GO, compatibility audit 0 blockers, then Grok Bot installs under Frog's standing OK.

### Oct 17, 5:40 PM ET
- **1.0.8.1: QA GO** (75/75 src, 66/66 r162, BUG-021 and BUG-022 fixed headless). Grok Bot: package and install under Frog's standing OK. QA checks the package checksums first. GL label: let the clean pack hide it (`?glver=1` still shows it).
- **1.0.8.3 headline: Epic Sky + Living Music.**
  - Sky (Look): the lite sky is the base, pushed as far as Flow's 3% check allows. The sun is the centrepiece. QA updates `weather_layers_present_and_cheap` when it ports.
  - Music: Sonic Rift Lead was asked for a stem plan. Layered stems driven by weather, altitude, speed and vehicle, plus bar-locked variation over time. MP3/WAV, lazy decode, decoded audio under 64 MB. Engine in `audio/sfx.js` (Director for now, may hand to Sonic Rift Lead).
- BUG-024 (no cows): World checks herd distance from spawn first. QA adds a "herd visible from spawn" test in 1.0.8.2.
- **Music plan accepted (5:40 PM ET):** Sonic Rift Lead is scoring about 25 stems in D at 105 BPM, bar-locked, mostly mono.
  - Seven groups: pad, altitude bass, phrases, speed rhythm, high shimmer, weather, vehicle color.
  - Peak decoded audio is about 46 MB, under the 64 MB limit.
  - Formats: WAV for the pad and bass, MP3 for the rest. The engine trims MP3 padding.
  - The 128 s loops are retired from decoding.
  - Rendered on Frog's Mac with plain ffmpeg under Frog's own rule for Sonic Rift, pending his OK (Sonic Rift Lead is asking him). Output goes to `audio/music/stems/` with stems.json.
  - Director wires the scheduler in sfx.js. QA gates on the 64 MB limit mid-crossfade, no clicks, and the mix changing with state.

### Oct 17, ~6:05 PM ET: 1.0.8.2 cockpit integration (Director)
- Landed in live src (backups in `plane-game-backups/director-1082-cockpit-*`):
  - Look's `interiors.mjs`.
  - Blimp gondola swapped in, so `cabin.mjs` is no longer imported.
  - New `G.cockpit` view switch, separate from chill, with cockpit as the default. It's saved as `settings.view`, and `?view=chase` overrides it.
  - R3 on gamepad or B on keyboard toggles the view.
  - `updateCockpit` is fed every frame in cockpit view and caps itself at 10 Hz.
  - Instrument rows and the hint are hidden in cockpit view; coins, nav, map and prompts stay.
  - Look-around caps are about 100° to the side, 45° up and 30° down.
  - Comments in the shader warm-up are updated.
  - `pg.view(mode)` and `info().view` are added for tests.
- Only syntax checks so far. The full tests run after Flow's bench, so the box stays quiet.
- File owners now: Director has `main.mjs`, `input.mjs` and `progress.mjs`. Look keeps `interiors.mjs` for the follow-ups (labels at 24 px or more, glider mount, roadster paint). World has the cow diff next, applied by Director after the tests.
- **6:10 PM ET:** applied World's cow pass (`animals.mjs`, `layout.mjs`, `lifekit.mjs`) and Look's cockpit v2 (`interiors.mjs`). Syntax is OK. The full tests on the integrated 1.0.8.2 src are waiting for Flow's sky bench (13-skyA running) to finish. Backups are in `plane-game-backups/director-1082-merge-*`.

### Oct 17, ~7:05 PM ET: version re-cut (Director)
- My tests on the combined code: slow-box test.mjs passed 75/75 and test_pad had no page errors, both run before the two fixes below.
- Added since: an XHR-first loader for the lazy weather layers in `sfx.js`, fixing Flow's Xbox fetch() find (the 1.0.8.1 console may be missing weather layers), and World's far-cow patches.
- **1.0.8.2 (gate now):** cows (BUG-024), flyable cockpits on all six vehicles with R3/B, Look's cockpit v2, the XHR fix. Ship it so Frog gets cows and first-person flying tonight.
- **1.0.8.3:** glider first-person polish (Look's view, Flow's hang and sway feel), spring look-around, the loading screen (Flow, with Look's CSS), gauge upload tuning.
- **1.0.8.4:** Epic Sky (sun-led, per Flow's coverage data) and living music (Sonic Rift Lead's stems).

### Oct 17, ~7:02 PM ET: ON FOOT update planned (Director)
Frog's design: an all-white 3D figure with a ball head and smooth, idealized proportions, like a clean mannequin ("a perfect form"). It's the start of walking around, getting in and out of the vehicles, and later the cozy house by the hangar.
- **Ships as 1.0.9 "On Foot".** Work starts tonight on brand-new files only, so 1.0.8.2 (gating now) and 1.0.8.3 (glider polish, loader) aren't touched. If on-foot passes the gate before the sky and music, it goes first.
- **Budget:** the figure gets 2 draw calls or fewer and 3k triangles or fewer, with no new lights (baked or fake shading). The full on-foot mode adds no more than 1 ms on the slow box.
- **Look owns `src/figure.mjs` (new):** the mannequin, with a full body for third person and a first-person rig (hands, arms, torso and legs visible when you look down, without clipping the camera). Simple joint poses for idle, walk and wave.
- **Flow owns `src/onfoot.mjs` (new):** controller-first walking and running, the first-person camera with a gentle step bob and the spring look-around, the step-off/step-in moment, and a button map proposal that doesn't clash with R3 for the view or B for missions.
- **World owns `src/life/walkable.mjs` (new):** where you can walk (Home Field, the hangar apron and one village to start), ground height and edges, the reserved spot for the house, and making sure cows react nicely when you walk near them.
- **QA owns `test_onfoot.mjs` (new):** tests for get-out, walk, get-in for each vehicle, the look-down body check, the budget and the pad flow.
- **Director:** wires it all into `main.mjs`, `input.mjs` and `index.html`. Nobody else edits those.

### Oct 17, ~7:06 PM ET: cozy home folded into On Foot (Director)
Frog's idea: a cozy home next to the hangar where you chill and vibe while the vehicles charge, with a computer, a phone, a chair and a desk.
- **1.0.9 On Foot:** the figure, walking, and getting in and out of the vehicles. You start at the house door, and the house outside is a closed shell.
- **1.0.9.1 Home:** the inside of the house and sitting at the desk. Both stay out of 1.0.8.2 and 1.0.8.3.
- **Look owns `src/home.mjs` (new):** the house shell and a warm interior with a desk, chair, computer, phone, a window looking at the hangar, a rug and a plant. Merged meshes, baked vertex shading, no new lights, 6 draw calls or fewer and 8k triangles or fewer. Everything only renders when you're near or inside.
- **World:** places the house at (740, 502) in `walkable.mjs` with the door, inside floor and desk spot, and makes `src/life/homecharge.mjs` (new). While you're home, vehicles in the hangar charge (a gentle speed-up) and it reports each vehicle's charge.
- **Flow owns sitting and using things, in `onfoot.mjs`:** walk up to the chair and press A to sit, the camera eases to the desk, the left stick or D-pad picks the computer or the phone, and B stands you up.
- **What they do (Director's call, so we start simple):** the computer shows a cozy island map and a radio that picks the music mood. The phone shows each vehicle's charge and a "bring it out" button that puts the vehicle on the apron ready to fly. The screens are canvas textures updated only when they change.
- **QA:** add a home section to `test_onfoot.mjs` covering enter, sit, phone, computer, stand and exit, plus the draw-call budget inside.
- **World's walkable pass is approved.** Put it into live `src/life/` after QA's 1.0.8.2 gate, and I'll wire init and update into main.mjs then.

### Oct 17, ~7:08 PM ET: seventh vehicle, the saucer (Director)
Frog wants "a really fast UFO-type vehicle that moves supersonic fast". It ships as **1.0.8.5 Saucer**, built in parallel on new files. It doesn't touch 1.0.8.2 to 1.0.8.4, and it lands whenever it passes the gate.
- **Feel (Director's call):** a calm hover with plane speed up to about 80 m/s near the ground and over herds. Above 300 m, holding boost ramps it to supersonic, about 400 m/s, with FOV stretch, speed lines and a soft whoosh, not a harsh boom. It eases back down when you let go or drop below the lane. It uses the battery and charges at stations like the rest.
- **Look owns `src/saucer.mjs` (new):** a sleek procedural saucer with a soft white and silver hull, Bitcoin-orange rim lights as emissive colour (not real lights) and a glass dome. Budget is 4 draw calls or fewer and 4k triangles or fewer. Its cockpit view sits under the dome and follows the cockpit rules: 6 draw calls or fewer, 3k triangles or fewer, no lights, and it works with `updateCockpit`.
- **Flow owns `src/saucerflight.mjs` (new):** the handling (smooth on the pad, with gentle auto-level), FOV stretch, one speed-line quad, the speed cap, and making the world stream safely at 400 m/s on the One S profile. Measure pop-in and frame time while flying at full speed. If streaming can't keep up, set the cap where it can.
- **World owns `src/life/skylanes.mjs` (new):** the high-speed lane above 300 m, open-sea runs, and no-buzz zones over herds, villages and Home Field that ease the saucer back to cozy speed. AI air traffic stays out of the lane.
- **QA owns `test_saucer.mjs` (new):** switching to and from the saucer, the cockpit view, boost to supersonic and back, the no-buzz slowdown, streaming and frame time at full speed, and the draw-call budget.
- **Director:** wires it into the vehicle list, `main.mjs`, `input.mjs`, `sfx.js` (whoosh) and the HUD.
- **Queue for each owner:** finish your 1.0.8.3 work first (Look on the glider view, Flow on the loader and camera spec), then On Foot, then the saucer.

### Oct 17, ~7:10 PM ET: 1.0.8.2 QA GO (Director)
- Results: 75/75 on src, 66/66 on r162, Edge scan 0, WebGL1 at 57-59 draw calls, BUG-026 fixed. Triangles are up 7% (accepted). Handed to Grok Bot for packaging, with the version bumped in `xbox-boot.js` and the manifest.
- Glider sky-share target: 50% or more of sky, sea and haze in level flight (final).
- Box order: World, then Flow, then Look. After that I merge the glider diff and the walk version for 1.0.8.3.

### Oct 17, ~7:26 PM ET: 1.0.8.3 merge started (Director)
- 1.0.8.2 msix built and signed by Grok Bot (sha256 0dadae94…fb91d). QA is checking it, then Grok Bot installs it.
- Merged into live: Look's glider first-person view (`interiors.mjs`, taken from Look's copy so their three later fixes are in), World's farpatch2 (`animals.mjs`), and `cockpitBarShift` wired into `main.mjs` with the pad input.
- Not tested or rebuilt yet: I'm waiting until Flow's benches finish so the box stays quiet.
- Still to come for 1.0.8.3: Flow's loader and camera spec (spring look-around, roll follow, glider hang and sway), gauge upload tuning.
- `walkable.v1.mjs` stays on World's copy until 1.0.9.

### Oct 18, ~8:20 PM ET: Frog's three new vehicles (Director)
A private jet, a rocket and a 737-style airliner, planned after On Foot and Home: 1.0.10 Lounge Jet, then 1.0.11 Sky Liner, then 1.0.12 Rocket. The draft is in `VEHICLES_ROADMAP.md` and is waiting for Frog's review. No work starts until then.

### Oct 28, ~9:35 PM ET: Flow benches + YouTube cinematic ask (Director)
- **Lite sky:** passes the 3% gate on the clean pair (station2 −2.9% at the edge). Approved as the base for 1.0.8.4 Epic Sky. Look: keep going on lite-2 (CPU colours, vertex haze, half-size cirrus, cull sun sprites).
- **Home bench (Look's copy in the 1.0.8.2 package):** outside is free; inside is about 19–24% slower. Blocker for 1.0.9.1 until Look tries one-sided materials and hiding the outer shell while inside, then Flow re-benches.
- **YouTube (DRIFTHOME lane):** Frog wants a cinematic narrated gameplay cut now. Gate HELD until Frog OKs the preview. No upload from Studio. Capture path: rebuild live src → `out/PlaneGame_play.html`, then a scripted ~5 min playthrough (Home Field cows → hang-glider first person → weather → charge pad). Story beat locked below. Grok Bot / Video Creator / YouTube Team own packaging.

### Oct 28, ~9:37 PM ET: cinematic path locked to 1.0.8.2 (Director)
Capture from the QA-GO 1.0.8.2 package only. Not live 1.0.8.3. Story: Always Daylight (Home Field → cows → weather → charge → soft land). 4–6 min. Gate HELD. Brief updated in `video/CINEMATIC_BRIEF.md`.

### Oct 28, ~9:40 PM ET: cinematic capture in progress (Director)
Video Creator Capture GO: ~5:00 final from 5:30–6:00 on 1.0.8.2 `www-legacy`. Always Daylight VO cues locked. PC capture running; path TBD when take lands. Gate HELD. No upload.

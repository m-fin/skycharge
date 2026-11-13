# SKYCHARGE: Art & Style Guide

Version 1, Oct 17, 2026. Written from the code in `src/` and `index.html`. Line numbers are as of today. Nothing in the game source was changed.
Target: Xbox One EdgeHTML (WebGL1, about 20 fps, see `src/kit.mjs:2`). Everything is built in code from three.js primitives. There are no external art assets.

## 1. Mood pillars
1. **Cozy.** Warm sun, soft rounded clouds, warm-lit interiors with wood, fabric, mugs and string lights. No grime and no danger colours unless the game needs them.
2. **Laid-back.** Calm, readable shapes and slow motion: bobbing docks, turning turbines, drifting thermal motes. Feedback is gentle, and nothing strobes.
3. **Always daytime.** It's always late morning: a high, warm sun, a blue sky gradient and a pale hazy horizon. There's no night, no storms and no dark grading.

## 2. Canonical palette
Use these hex values. Anything new should use one of them or sit next to it on purpose.

| Role | Hex | Source today |
|---|---|---|
| Sky zenith | `#3D7CC9` | `world.mjs:101` (top) |
| Sky mid | `#9FC8EC` | `world.mjs:101` (mid) |
| **Horizon = fog** (one value) | `#CFE2F2` | fog `main.mjs:21`. Sky dome bottom is `#DBE9F5` (drift) |
| Cloud body / shade | `#FFFFFF` / emissive `#C3CCD6` | `world.mjs:108` |
| Water surface | `#3A84A8` (opacity 0.88, specular `#88AACC`) | `world.mjs:95` |
| Shallow / deep seabed | `#74B8B0` / `#4287A5` | `world.mjs:61` |
| Wet sand / beach | `#B8A676` / `#D9C690` | `world.mjs:61,64-65` |
| Grass low → high | `#5F9A45` → `#4F8A3C` → `#447A36` → `#6A7350` | `world.mjs:67-68` |
| Rock / cliff, snow | `#82796A`, `#7B7466`, `#F2F4F6` | `world.mjs:66,69-70` |
| Tree crown / trunk | `#2F6B34` (HSL jitter 0.30–0.36) / `#6B4A2E` | `world.mjs:116,120` |
| Wood (dock, ramp, cabin) | `#8A5A36` (dark `#6B4A2E`) | `world.mjs:209,229`, `cabin.mjs:8` |
| Structure white (turbines, vehicles) | `#F4F4F2` | `vehicles.mjs:18,64` |
| Lighthouse red | `#C8322B` | `world.mjs:136` |
| Runway asphalt / markings | `#2B2D31` / `#E8E8E8` | `world.mjs:144-145` |
| Vehicle dark (props, wheels, pylons) | `#15171C` | `vehicles.mjs:18` |
| Canopy glass | `#1B3550` | `vehicles.mjs:22` |
| Seaplane secondary | `#1F7F8C` (teal) | `vehicles.mjs:64` |
| **Accent orange** | `#F7931A` | `world.mjs:6`, every module `ORANGE`, CSS `--o` `index.html:3` |
| Accent orange, light (highlight, rims, "done") | `#FFC46B` | `coins.mjs:25`, `index.html:30` |
| Accent orange, deep (emissive, pad base) | `#8A4300` / `#3A2405` | `coins.mjs:25`, `world.mjs:149` |
| Interior warm light | `#FFC27A` (fill `#FFE2B8`) | `cabin.mjs:39-40` |
| Interior wall / fabric | `#E9DCC6` / `#CFC2AA` | `cabin.mjs:8` |
| HUD panel | `rgba(8,8,10,.8)` + 1px border `rgba(247,147,26,.55)`, radius 10px | `index.html:3,6` |
| HUD text: primary / label / muted | `#FFFFFF` / `#BBBBBB` / `#888888` | `index.html:9-10` |
| HUD warn / sink | `#FF4A3A` / `#6AA8FF` | `index.html:12,31` |
| Brand ink (splash, store art) | `#0D1017` | store kit `tools/brand.mjs:2` |

## 3. Lighting & fog
- **Exactly one sun and one sky light.** `HemisphereLight(#D7E8FF sky, #5D6B40 ground, 1.5)` plus `DirectionalLight(#FFF0D4, 2.6)` from (0.55, 0.8, 0.25), so the sun is high and slightly south-east (`main.mjs:29-30`). Don't add more world lights. If something needs to glow, give it an unlit `MeshBasicMaterial` instead.
- **No shadows and no tone mapping.** None are used today. Keep it that way. Fake contact shading with darker vertex colours or a dark disc under the object.
- **Fog:** linear `Fog(#CFE2F2, 1600, 9000)` (`main.mjs:21`). The fog colour **must equal** the horizon colour of the sky dome, or a pale band shows where the sea meets the sky. The sky dome and the additive beacon beams opt out of fog (`fog:false`). Everything else stays fogged.
- **Interiors** get their own warm `PointLight`s (`#FFC27A` 2.2 and `#FFE2B8` 0.8, `cabin.mjs:39-40`). Use at most 2 per interior. Each one must live inside the interior group so it's culled with that group.

## 4. Clouds & water
- **Clouds** are instanced icosahedron puffs (detail 2), 6 per cloud and 60 clouds, flattened to 1.4 : 0.6 : 1, at 520–780 m (`world.mjs:107-111`). They're white with a cool `#C3CCD6` emissive at opacity 0.92, so they never turn grey. Keep them soft, flat-bottomed and fair-weather. No storm clouds, and no textures or volumetrics.
- **Water** is one big Phong plane, `#3A84A8`, shininess 80, opacity 0.88, polygonOffset −2, renderOrder 1 (`world.mjs:95-97`). The seabed blends to the water's own colour so z-fighting can't flash sand (`world.mjs:58-63`). Never put flat decals on the water at y≈0. They lose to the water's polygonOffset. This is the known faint Lagoon Dock ring (`world.mjs:235`, store-kit CHECKLIST note). Raise water decals ≥0.3 m, or give them `depthTest:false` with a higher renderOrder.

## 5. Silhouettes
- **Vehicles** are white bodies with orange accents at the extremities: spinner, wing tips, fin, belly stripe, blimp bands and fins (`vehicles.mjs:17-84`). They read from 200 m away as a white shape with an orange tail and tips. The seaplane swaps the orange stripe, tips and fin for teal `#1F7F8C` and keeps orange on the spinner and float keels. That's how it reads as a different vehicle. Any new vehicle keeps the white body and gets **one** unique secondary colour. Low poly (cylinders ≤12 segments, boxes), `flatShading` on hard-edged parts.
- **Buildings / landmarks** are tall and simple so they read against the sky: turbines (white 70 m tower + 3 blades), the red/white banded lighthouse, black charger pylons with orange glow caps and 700 m orange beam columns (`world.mjs:124-156`). New buildings: chunky box and cylinder masses, a light body (whites, sand, wood), at most 1 accent colour, a cap or roof that sets them apart. No thin detailing below ~0.5 m that will shimmer at TV distance.
- **Terrain** is vertex-coloured by height and slope only (`world.mjs:62-71`). No terrain textures.

## 6. Accent orange rules
- `#F7931A` means **"energy / interact / you"**: chargers, beacons, runway edge lights, coins, mission rings, the player's vehicle trim, HUD highlights.
- It's used as a flat colour plus a lightning-bolt shape (`world.mjs:151`, `coins.mjs:27`). There are **no real logos, currency symbols or brand marks**.
- Allowed tints: light `#FFC46B` (highlights, the active ring, completed items), deep `#8A4300` (emissive), `#3A2405` (pad base). Every other orange must be one of these.
- Keep it under ~10% of any frame. Large orange areas only for the HUD "good" status pill and the pickup flash.
- Never use orange for warnings. Warnings are red `#FF4A3A`.

## 7. Interiors
- They're cozy little rooms: warm cream walls `#E9DCC6`, wood `#8A5A36`, fabric `#CFC2AA`, a dark rug with orange stripes, an orange mug and lampshade, a plant, string lights `#FFB35C` and a battery plaque (`cabin.mjs`).
- The view always looks out a big window at the daytime world. Glass is near-invisible (`#CFE6FF`, opacity 0.06).
- Build with `kit.mjs` (merged geometry, vertex colours, one lit mesh plus one unlit "glow" mesh per interior, `kit.mjs:1-33`). Readouts are small canvas screens (`#0B0D12` background, orange border, monospace).
- `src/interiors.mjs` (jet cabin, float-plane cockpit, glider harness) follows these rules but **isn't imported yet**. All three vehicles use `buildCabin()` (`main.mjs:33`).

## 8. HUD & menu typography (10-foot)
- **Fonts:** system fonts only. Use the existing `system-ui … sans-serif` stack for text and the `ui-monospace … monospace` stack for numbers (`index.html:4,9`). Don't load webfonts in the game. The store art's rounded display face stays in store art.
- **Weights:** labels 600, values 700, titles 800 with wide tracking (`.14em`–`.3em`), all caps for titles and status.
- **Minimum sizes at a 1920×1080 reference:** body ≥ 24px, small/secondary ≥ 20px, key numbers ≥ 32px. Today the HUD is sized for a desk monitor (11–20px, `index.html:8-36`). Scale with `vh` or a root `font-size` so it reads from the couch.
- **Safe area:** keep every HUD element inside the inner 90% of the screen, a **5% margin** on each side (96px × 54px at 1080p, 48 × 27 at the 960×540 effective viewport). Today's 22–28px insets (`index.html:7,19,20,40`) are outside title-safe on a TV.
- **Panels:** dark translucent `rgba(8,8,10,.8)`, orange hairline border, radius 10px, soft shadow. Highlight text in orange, plain text in white or light grey. Keep text-on-panel contrast ≥ 4.5:1 (`#888` small text is the floor, so don't go darker).
- Status colours: good = orange pill with `#111` text, warn = red pill. Warnings should pulse softly, not flash hard.

## 9. Performance budget (Xbox One, WebGL1)
- **WebGL1 only:** no WebGL2-only features (no MRT, 3D textures, texture arrays, `#version 300 es` shaders). Note: the vendored three.js is r186 (`vendor/three.core.js:6`), and three.js dropped WebGL1 in r163 (`vendor/three.module.js:16139` throws). See Current drift.
- **No post-processing.** No composer, bloom, SSAO, DOF or tone mapping. Get glows from additive unlit geometry (beams) and HUD CSS (flash vignette).
- **Prefer** vertex colours, gradients in tiny shaders (the sky dome is about 3 lines of GLSL), fog, instancing (trees and clouds), merged static meshes (`kit.mjs`), baked matrices (`world.mjs:255-259`), and `MeshLambert`/`MeshBasic` over `MeshStandard` for anything numerous.
- **Budgets:** ≤ 2 world lights, ≤ 2 point lights per interior, ≤ 3 transparent layers stacked on screen, canvas textures ≤ 256 px, no shadow maps, no real-time reflections. Each new instanced set should be a single draw call.
- **No external assets:** no image or texture downloads, model files or webfonts. Everything is generated in code. **No AI-generated images in the game.**

## 10. Do / Don't
| Do | Don't |
|---|---|
| Pick colours from the palette table | Invent a new near-duplicate orange, white or blue |
| Keep fog colour = sky horizon colour | Fade to a different colour than the sky |
| Read white body + orange tips at 200 m | Add small detailing that shimmers at TV distance |
| Glow with unlit materials and additive beams | Add lights, bloom or shadows for glow |
| Merge static parts (`kit.mjs`), instance repeats | Ship hundreds of separate meshes |
| Keep the HUD in the 5% safe area, large type | Put text below 20px or near the screen edge |
| Use soft pulses and slow bobbing | Use hard flashing, screen shake or dark/night scenes |
| Use plain lightning-bolt and coin shapes | Use real logos, currency symbols or brand marks |

## 11. Current drift (to fix later; not changed here)
1. **Horizon ≠ fog:** sky dome bottom `#DBE9F5` (`world.mjs:101`) vs fog `#CFE2F2` (`main.mjs:21`). This makes the visible pale band at the horizon (see `stills/01_flying_hud.png`).
2. **Orange near-duplicates:** `#FFA531` dock ring (`world.mjs:235`), `#FFA733` active mission ring (`missions.mjs:33`), `#FF7A1A` life vest (`interiors.mjs:118`), `#FFB347` vario climb (`interiors.mjs:159`), `#C27012` minimap station (`main.mjs:287`), `#FFB03A` glider pilot "skin" (`vehicles.mjs:47`), HSL(0.09,1,0.45–0.6) beacon glow (`world.mjs:250-251`). Canonical: `#F7931A`, light `#FFC46B`, deep `#8A4300`.
3. **Whites:** `#F4F4F2` (`vehicles.mjs:18,64`), `#F1EFE9` blimp (`vehicles.mjs:34`), `#F4F2EC` sail (`vehicles.mjs:46`), `#F2F2F2` turbines (`world.mjs:125`), `#F5F5F5` lighthouse (`world.mjs:136`), `#E8E8E8` runway dash (`world.mjs:145`). Canonical structure white: `#F4F4F2`. Cream sail/blimp is OK as a deliberate fabric white.
4. **Darks / ink:** `#15171C` (vehicles), `#1D1F24` gondola (`vehicles.mjs:38`), `#111111` pylons (`world.mjs:153,227`), `#0B0D12` screens (`interiors.mjs:9`), `#0B0B0D` cabin plaque (`cabin.mjs:44`), HUD `rgba(8,8,10,.8)` (`index.html:3`), brand ink `#0D1017` (store kit). Canonical: `#15171C` for objects, `#0D1017` for screens and panels.
5. **Minimap ≠ world:** water `#18405C`, sand `#C4B280`, grass `#3E7036` (`world.mjs:246`) vs `#3A84A8` / `#D9C690` / `#5F9A45` in the world.
6. **Warn reds:** `#FF4A3A` (`index.html:12`, `cabin.mjs:45`), `rgba(160,20,10,.85)` status (`index.html:17`), `#FF7A66` danger menu (`index.html:30`). Canonical warn: `#FF4A3A`.
7. **Unused interiors:** `src/interiors.mjs` (with `kit.mjs`) is never imported. `main.mjs:33` uses `buildCabin()` for the plane, blimp and seaplane.
8. **Renderer vs target:** vendored three.js r186 refuses WebGL1 (`vendor/three.module.js:16139`). That conflicts with an Xbox One EdgeHTML WebGL1 target. Also `antialias:true` and pixel ratio up to 2 (`main.mjs:19-20`) are costly there.
9. **10-foot HUD:** smallest text 11–12px (`index.html:10,27,29,32`), edge insets 22–28px, and a hard 2-step flash on warnings (`index.html:17-18`).


## Hangar & Home (1.0.9)
Full spec: HOUSE_STYLE.md. Code owner: SKYCHARGE Look (`src/home.mjs`, after the 1.0.7 hand-off).
- **Cottage:** a small gabled cabin with white walls #F4F4F2, a dark slate roof near #15171C, an orange front door #F7931A, a chimney and a warm porch light #FFC27A. It should read as "home" from the air.
- **Hangar:** a wide, low barrel or gable shape in white #F4F4F2 with a dark door frame #15171C and one thin orange stripe #F7931A along the eave. Its doors face the runway, with the six vehicles parked in a row in front.
- **Interior:** walls #E9DCC6, fabric #CFC2AA, wood #8A5A36, warm lamp #FFC27A with fill #FFE2B8. Orange goes on 2-3 small things only. There's a cow-pattern rug, and the corner window faces east to southeast toward the cow field, the runway and the sea.
- **Light:** no shadows and no added lights (they force shader recompiles, see PERF.md). The lamp is an unlit emissive #FFC27A, and all warmth is baked into vertex colours. This rule applies to cockpits too.
- **Budget:** hangar plus exterior 8 draw calls or fewer; interior 12 or fewer, drawn only when inside or at the door. Everything uses only three.js r162 features that run on WebGL1, and there are no textures except one optional shared canvas texture.
- **Transitions:** fade through warm #FFE2B8, never black.

## First-Person Cockpits & HUD (1.0.9)
Applies to all six vehicles when you fly or drive from the pilot's eyes. Flow owns the camera and look-around feel; this section covers what you see.

**Sightlines (all vehicles)**
- Horizon roughly 40-45% up the screen at level flight. The dash or frame takes up **25% of screen height at most**, and the pillars and frame together take up 15% of the width at most. The view is mostly sky.
- Nothing is allowed to block the centre 50% of the screen. The forward view stays clear at all times, including during the walk-to-cockpit glide.
- Eye height and position are fixed per vehicle, so the dash never clips through the camera when you look around. Look-around caps: about 100° to each side, 45° up and 30° down.
- The frame and dash are dark #15171C with soft edges. The glass has no tint and no reflections (cheap and clear); a faint rim of canopy glass colour #1B3550 at the edges is fine.

**Per vehicle**
- **Electric plane:** a low dash and a slim canopy frame with a wide windscreen.
- **Seaplane:** the same, plus the teal #1F7F8C accent stripe, and the float tips just visible low at the sides to help with water landings.
- **Blimp:** a gondola with big side windows, a waist-high console and the most open view of any vehicle.
- **Hang glider:** no cockpit. Show only the control bar and a hint of the wing's leading edge at the top, nothing else.
- **Flying roadster:** a car dash with a short hood visible. In boost, the hood tips down slightly so more sky shows.
- **Flying scooter:** just the handlebars and a small screen. It's the most open view after the glider.

**Gauges: physical first, HUD second**
- Each vehicle gets 2-3 **diegetic gauges** (built into the cockpit itself): speed, altitude, and battery or air. Each one is a dark dial with white #F4F4F2 needles and ticks, and #F7931A only on the warning arc. Big shapes beat small numbers, and every dial must read at TV distance.
- Draw the needles as one merged mesh per cockpit with no text textures. A tiny canvas texture is allowed for the numerals only if it's shared.
- **Screen HUD in first person:** this is a reduced set. Keep the coin count, the mission ring direction and short prompts. Hide the duplicate speed and altitude panels (the dash shows them). Everything stays inside the 5% TV-safe margin, with text at least 24px at 1080p.
- The **chase/cockpit toggle** brings back the full HUD in chase view. A tiny camera icon shows for 2 s after each toggle, then fades out.

**Budget**
- Each cockpit adds **6 draw calls at most** (frame, dash, glass rim, gauges, accents, hands or bar), and it's drawn only in first person. The exterior vehicle mesh is hidden while you're inside, so in practice the cost mostly swaps rather than adds.
- No shadows, no reflections, no post-processing, and only r162 features that run on WebGL1.

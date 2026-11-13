# SKYCHARGE: Epic (but cozy) Sky Design (build 1.0.8.3)
Owner: SKYCHARGE Look. Cost limits: SKYCHARGE Flow. Follows STYLE_GUIDE.md. It's always daytime and procedural only, using WebGL1 and three.js r162. It has no full-screen post passes unless Flow measures them first.

## Goal
A big, bright storybook sky: deep blue overhead, warm haze at the horizon, towering lit clouds and soft sun shafts. It should feel epic but stay gentle and cozy, never stormy or dark.

## Layers, ranked from cheapest and biggest impact down
| # | Layer | How | Extra draw calls | Notes |
|---|---|---|---|---|
| 1 | Deeper gradient plus horizon haze | Sky-dome vertex colours: zenith #2560B8, mid #86B6E4, horizon #CFE2F2. The horizon colour equals the fog colour exactly | 0 | This also fixes the pale band where the sea meets the sky (drift #1) |
| 2 | Sun glow | A warm halo toward the sun, baked into the dome colours (#FFF4DC fading to sky), plus one soft additive sun sprite | 1 | No bloom pass. The sprite fades near the horizon |
| 3 | Towering cumulus | Instanced billboard puffs in a few tall stacks. Vertex gradient from a white #FFFFFF top to a #C3CCD6 base, with the sun-facing edge lifted toward #FFF8EC (a fake lit rim) | 1-2 | Keep about 6-10 big stacks in view and cull by distance. The tops catch the light and the bases go soft grey |
| 4 | Distant cloud banks | One low ring band at the horizon using a shared canvas-generated alpha texture, tinted to the haze colour | 1 | Makes the world feel huge at no geometry cost |
| 5 | High cirrus wisps | One very high, very faint dome patch using a canvas texture with slowly scrolling UVs | 1 | Opacity no higher than 0.35 so it reads as texture, not cover |
| 6 | Sun shafts (god-rays) | 3-5 additive, low-opacity wedge planes pointed from the sun through cloud gaps, fading by view angle and hidden when the sun is behind you | 1 | Fake but cheap, with no depth or screen tricks |

Total: about 5-6 extra draw calls and one shared canvas texture. Large transparent layers are capped at 3 to limit overdraw on the Xbox, and Flow sets the final caps.

## Weather moods (always daytime)
- **Clear:** all layers on, strongest sun shafts.
- **Cloudy:** more and bigger cumulus, cloud bases drop to #A9B4C0, sun shafts at half strength, zenith lifts to #3F74B6.
- **Rain:** zenith #6F8AA6 and horizon #C9D2DA, cloud bases #8E9AA8, no sun shafts, cirrus off. It stays soft grey-blue and never goes dark.
- **Fog:** the gradient flattens toward #D6DEE5, fog moves closer, and the cumulus fade into it. Sun glow stays as a pale disc.
- Every mood change blends over 6-10 s, so it never pops. It shares timing with the weather music crossfade.

## Rules
- Fog, the bottom of the sky and the cloud-bank tint always share one horizon colour per weather mood.
- No black, purple or sunset tones. Orange stays a UI and vehicle accent and is never used in the sky.
- No textures except one shared canvas texture generated at load. Shaders compile at load, per Flow's plan.
- The sky has to read at TV distance, so it uses big shapes and avoids fine noise.

## Steps
1. Prototype on a copy outside `src/` (at /workspace/skycharge-look/sky-proto/), with before-and-after headless screenshots for the clear, cloudy and rain moods.
2. Flow measures the prototype's cost with `bench.mjs`.
3. After the hand-off, the Director assigns the files (probably the sky part of `world.mjs` plus the weather module) and I port the changes in.

## Agreed cost limits (from Flow, PERF.md "Sky cost limits", and QA)
- At most 6 extra draw calls and 15k extra triangles for the whole sky, with no new full-screen post passes.
- The gradient and haze live inside the existing sky dome shader, and the fog colour matches them.
- Transparent layers cover about one extra screen of fill at most, near the horizon. Cut the existing cloud triangles where possible.
- Weather changes the sky through uniforms and colours only, never by swapping materials. Shaders compile at load.
- Every fragment shader runs at mediump precision.
- To pass, `bench.mjs` on both builds must show no more than a 3% fps loss and no frame over 60 ms.
- Ships as build 1.0.8.3 Epic Sky (headline feature), after the lite sky passes Flow's 3% bench and QA passes 1.0.8.2. Lite sky path: /workspace/skycharge-look/sky-lite/. Saved budget is spent back on sun corona, cloud-edge rays, warm/cool cumulus, sun-side horizon glow and high cloud decks, each benched one at a time.

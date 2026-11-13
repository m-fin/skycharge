# SKYCHARGE: new vehicles plan (draft for Frog's review)
Director, Oct 18 2026. Nothing here ships until Frog OKs the plan, and every build goes through QA before the Xbox.

## Order
1. 1.0.8.5 Saucer (already planned)
2. 1.0.9 On Foot, then 1.0.9.1 Home (current work)
3. **1.0.10 Lounge Jet**: a sleek private jet you can fly.
4. **1.0.11 Sky Liner**: a big twin-engine passenger airliner, inspired by the 737. No real maker names, logos or model numbers in the game.
5. **1.0.12 Rocket**: a rocket that takes you up above the clouds to see the sky and islands from high up, then glides home.

The jet and the airliner come after On Foot so you can get up and walk around their cabins.

## 1.0.10 Lounge Jet
- **Flying:** fast and smooth, with a cruise of about 2x the electric plane. It needs a long runway (Home Field plus World's new longer strip) and charges at stations like everything else.
- **Cozy:** you can switch the cockpit for the cabin, with leather-look seats, a window seat and a small table. The autopilot keeps flying while you sit in the cabin and watch the islands go by.
- **Look:** `src/jet.mjs` with the outside model and the cabin, 4 draw calls or fewer outside and 6 or fewer in the cabin, no lights.
- **Flow:** `src/jetflight.mjs` with the handling, takeoff and landing feel, and the cockpit and cabin cameras.
- **World:** a longer runway and a couple of island airstrips the jet can land on.
- **QA:** `test_jet.mjs`.

## 1.0.11 Sky Liner (737-style)
- **Flying:** heavy, gentle and stable, with slower turns. Takeoff and landing are the fun part, and the runway gets lights and markings.
- **Cozy:** walk the aisle with On Foot, sit in any window seat, or go up to the flight deck. There are calm cabin chimes and soft engine hum, and the cabin is empty and peaceful.
- **Look:** `src/liner.mjs` with the outside, the cabin (rows of seats, instanced) and the flight deck, 6 draw calls or fewer in the cabin.
- **Flow:** `src/linerflight.mjs`, with weighty but smooth handling, and walking inside a moving plane.
- **World:** a main airport island with a long runway, a small terminal and AI airliners on a gentle schedule.
- **QA:** `test_liner.mjs`.

## 1.0.12 Rocket
- **Flying:** it launches from a pad on a quiet island and rises straight up past the clouds with a gentle, steady climb, with nothing scary. At the top you float for a while, looking down at the islands and the curve of the sky, then it glides down under a big parachute or flies back to the pad.
- **Cozy:** the "sky from above" view is the reward: soft high-altitude blue, the sun huge and bright, and clouds like a carpet below.
- **Look:** `src/rocket.mjs` plus a high-altitude version of the Epic Sky. This depends on 1.0.8.4 Epic Sky being in.
- **Flow:** `src/rocketflight.mjs`, covering the launch, the float and the return, and keeping the world streaming and frame rate steady while you look down from very high up.
- **World:** the launch pad island and a no-fly zone around the pad.
- **QA:** `test_rocket.mjs`.

## Shared rules
Everything is procedural and free, with no real brands or logos. The Xbox One budgets stay the same: 120 draw calls total or fewer, cockpits and cabins at 6 draw calls or fewer, no lights. Each vehicle ships on its own.

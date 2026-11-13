# SKYCHARGE: Frog's House & Hangar Interior Style (for 1.0.9, design only)
Owner: SKYCHARGE Look. Follows STYLE_GUIDE.md. Walk feel, collisions and transitions: see WALK_FEEL.md (Flow). WebGL1 + three.js r162, procedural only, no real brands or logos.

## Mood
A small, warm, lived-in cabin by the hangar: afternoon sun through big windows, wood, soft fabric, a few orange touches. It should feel like "home base" you want to walk back to.

## Layout (single room + loft feel, about 8 x 6 m)
- Front door faces the hangar. Corner window facing east to southeast: cow field on the left, runway and sea on the right (see LIFE_DESIGN.md 8/8a).
- Zones: entry with coat hooks and a helmet shelf; lounge (armchair, cow-pattern rug, low table, bookshelf, a chunky radio that plays the current weather music); little kitchen (counter, kettle, two stools); desk with a world map and a small model plane; bed corner with quilt.
- One clear walking loop, at least 1.2 m wide everywhere so first-person walking never snags (Flow owns collisions; keep furniture as simple boxes for collision).

## Palette (from STYLE_GUIDE.md)
- Walls #E9DCC6, fabric / sofa #CFC2AA, wood floor and furniture #8A5A36, trim white #F4F4F2, dark details #15171C.
- Warm light #FFC27A, fill #FFE2B8. Daylight through windows uses the sky middle #9FC8EC.
- Accent orange #F7931A on only 2-3 things: a mug, a cushion, the quilt stripe. Lighter #FFC46B for a lamp shade glow.
- One cow nod: a cow-pattern rug or a cow plushie on the bed (black/white vertex colours).

## Lighting (cheap)
- No real-time shadows and NO extra lights (per PERF.md: cabin point lights force shader recompiles). Use the scene's existing lights only; the lamp glow is an unlit #FFC27A emissive shade, and warmth is baked into vertex colours.
- Bake fake light into vertex colours: lighter near windows, darker in corners and under furniture.
- Window "sunbeam": one additive, very low-opacity plane, no shader tricks.

## Geometry budget
- Interior: 12 draw calls or fewer, under 5k triangles, drawn only when inside or at the door.
- Merge all static furniture into 1-3 meshes by material (wood, fabric, misc) with vertex colours. Target split: wood, fabric, light/white, dark, glass/sunbeam, orange accents, radio dial (7, leaving headroom). No textures needed; if any, one tiny canvas-generated texture shared by all.
- Outside view through windows: reuse the world fog colour #CFE2F2 so it blends.

## Exterior (house next to hangar)
- Simple gabled cabin silhouette, white walls #F4F4F2, dark roof #15171C-ish slate, orange front door #F7931A, little porch light #FFC27A.
- Reads clearly at distance as "the cozy house": chimney plus porch plus orange door. Hangar plus house exterior together: 8 draw calls or fewer, sharing materials.

## Transitions (visual side; Flow owns timing)
- Door open: short fade through warm #FFE2B8, not black, so it stays cozy.
- Walk-to-cockpit: camera eases into each vehicle's existing interior; HUD fades in after the seat is reached.

## HUD in walk mode
- Minimal: a small "Enter [vehicle]" / "Exit" prompt, bottom centre, inside the 5% TV-safe margin, at least 24px at 1080p, white text on rgba(8,8,10,.8) with a thin orange border.

## Don'ts
- No clutter, no dark rooms, no night lighting, no real-brand products or logos on screens, posters or appliances.

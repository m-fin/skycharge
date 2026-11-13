// terrainQuery: the only thing the life modules know about the world. Build it from createWorld()'s result with
// makeTerrainQuery(world), or hand-roll one with the same fields (everything except heightAt is optional).
//
//   heightAt(x, z)  -> terrain height in metres (negative = under the sea). REQUIRED.
//   waterLevel      -> sea surface height (0 in SKYCHARGE)
//   half            -> half the world size (land and sea life stay inside +-half)
//   stations[]      -> { x, z, hd, len, wid, padX, padZ, h, name }  runways + charging pads (kept clear; AI traffic visits the pads)
//   dock            -> { x, z, hd, chargeX, chargeZ }               the seaplane dock (kept clear)
//   landmarks       -> { turbines: [{x,z,h,top}], lighthouse: {x,z,h,top} }
//   thermals[]      -> { x, z, r, base, top }                        AI hang gliders circle in these
//   launch          -> { x, z, h }                                   the glider Summit Launch (a secret cow lives up there)
//   blocked(x,z,r)  -> true if x,z is within r metres of the LIFE_DESIGN clear zones (runway/pad/dock 120 m, launch 200 m,
//                      thermal cores 150 m, turbines, lighthouse)
//   treeAt(x,z,r)   -> true if a tree trunk/crown is within r metres (houses and fields avoid trees)

export function makeTerrainQuery(world) {
  const stations = (world.stations || []).map((s) => ({ ...s }));
  const rectDist = (st, x, z) => { const dx = x - st.x, dz = z - st.z, sn = Math.sin(st.hd || 0), cs = Math.cos(st.hd || 0), l = { along: dx * sn - dz * cs, side: dx * cs + dz * sn }; return Math.hypot(Math.max(Math.abs(l.along) - st.len / 2, 0), Math.max(Math.abs(l.side) - st.wid / 2, 0)); };
  const lm = world.landmarks || { turbines: [] }, dock = world.dock || null;
  // LIFE_DESIGN.md clearances: 120 m from every runway, pad and the dock; 200 m from Summit Launch; 150 m from thermal cores.
  const CLEAR = { runway: 120, pad: 120, dock: 120, launch: 200, thermal: 150, turbine: 45, lighthouse: 40 };
  function blocked(x, z, r = 0, k = 1) {
    for (const st of stations) { if (rectDist(st, x, z) < r + CLEAR.runway * k) return true; if (st.padX != null && Math.hypot(x - st.padX, z - st.padZ) < r + CLEAR.pad * k) return true; }
    if (dock && Math.hypot(x - dock.x, z - dock.z) < r + CLEAR.dock * k) return true;
    for (const t of lm.turbines || []) if (Math.hypot(x - t.x, z - t.z) < r + CLEAR.turbine) return true;
    if (lm.lighthouse && Math.hypot(x - lm.lighthouse.x, z - lm.lighthouse.z) < r + CLEAR.lighthouse) return true;
    if (world.launch && Math.hypot(x - world.launch.x, z - world.launch.z) < r + CLEAR.launch * k) return true;
    for (const t of world.thermals || []) if (Math.hypot(x - t.x, z - t.z) < r + CLEAR.thermal * k) return true;
    return false;
  }
  const treeAt = (x, z, r = 4) => (world.treeHit ? !!world.treeHit(x, world.heightAt(x, z) + 3, z, r) : false);
  return { heightAt: world.heightAt, waterLevel: 0, half: 3900, stations, dock, landmarks: lm, thermals: world.thermals || [], launch: world.launch || null, blocked, treeAt, CLEAR };
}

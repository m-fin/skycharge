// Save data in localStorage (works from file:// in Chrome/Edge). Fails soft if storage is blocked.
export const SAVE_KEY = 'skycharge.save.v1';
export const VEHICLE_IDS = ['plane', 'blimp', 'glider', 'seaplane', 'roadster', 'scooter']; // saved lastVehicle must be one of these
export function defaults() {
  return { v: 1, coins: 0, collected: [], completed: {}, best: {}, runs: {}, lastVehicle: 'plane',
    settings: { invertPitch: false, units: 'kmh', muted: false, volume: 0.8, vario: true, view: 'cockpit' }, upgrades: { battery: false, charger: false } };
}
export function load() {
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return defaults(); const s = JSON.parse(raw); if (!s || s.v !== 1) return defaults(); const d = defaults();
    return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, upgrades: { ...d.upgrades, ...(s.upgrades || {}) }, completed: { ...(s.completed || {}) }, best: { ...(s.best || {}) }, runs: { ...(s.runs || {}) }, collected: Array.isArray(s.collected) ? s.collected : [], lastVehicle: VEHICLE_IDS.includes(s.lastVehicle) ? s.lastVehicle : 'plane' };
  } catch { return defaults(); }
}
export function save(s) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; } }
export function clear() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

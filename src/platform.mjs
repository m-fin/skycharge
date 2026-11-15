// src/platform.mjs (Director, Xbox Store polish pass). Platform hooks, all no-ops for now.
// Nothing here talks to a network or an Xbox service. Fill these in later under GDK / ID@Xbox only if Frog decides to add
// Xbox network features. Every call is wrapped so a hook can never throw into the game loop.
// Plain ES2017 on purpose (no ?. or ??) so old EdgeHTML on Xbox One parses it.
export const platformHooks = {
  signIn() {},
  unlockAchievement(id) {},
  setPresence(str) {},
  event(name, data) {},
};

const safe = function (name, a, b) {
  try { const f = platformHooks[name]; if (typeof f === 'function') return f.call(platformHooks, a, b); } catch (e) { /* hooks must never break the game */ }
  return undefined;
};
const unlocked = {};
// Each achievement id is sent at most once per session; the platform itself would dedupe across sessions.
export function achieve(id) { if (unlocked[id]) return false; unlocked[id] = true; safe('unlockAchievement', id); safe('event', 'achievement', { id: id }); return true; }
export function signIn() { return safe('signIn'); }
export function setPresence(str) { return safe('setPresence', str); }
export function platformEvent(name, data) { return safe('event', name, data); }
export function achieved() { return Object.keys(unlocked); }

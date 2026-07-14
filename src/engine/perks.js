// PERKS ENGINE — WS-E (Sprint 2). Applies the gameplay effects of owned perks
// (state.perks, set by the PURCHASE_PERK reducer; costs come from data/perks.json).
// Runs in the tick order right AFTER risk.step, so auto-pull sees freshly-accrued
// risk but still acts before a TOS break.
//
// Perks handled here (fully self-contained — no cross-file imports):
//   extra_slot     → +1 front-page slot (reconciles state.slots + frontPage length)
//   auto_pull      → pull any featured stream that crosses AUTO_PULL_AT of threshold
//   heat_scrubber  → passive extra heat cooldown each tick
//   risk_xray      → read by ui/frontpage.js (reveal), not applied here
// Contract: export step(state). Never call Math.random() — use state.rng.

import { store } from '../state/store.js';

const AUTO_PULL_AT = 0.90;        // pull at 90% of tosThreshold
const HEAT_SCRUB_PER_TICK = 0.6;  // extra heat cooldown on top of audit.js's cooldown

export function step(state) {
  const perks = state.perks || {};

  reconcileSlots(state, perks);

  if (perks.auto_pull) autoPull(state);

  if (perks.heat_scrubber && state.heat > 0) {
    state.heat = Math.max(0, state.heat - HEAT_SCRUB_PER_TICK);
  }
}

/** Keep state.slots = baseSlots + perk bonuses, and grow frontPage to match.
 * Only ever grows here (never truncates a featured slot). */
function reconcileSlots(state, perks) {
  const base = typeof state.baseSlots === 'number' ? state.baseSlots : 5;
  const target = base + (perks.extra_slot ? 1 : 0);
  if (state.slots !== target) state.slots = target;
  while (state.frontPage.length < state.slots) state.frontPage.push(null);
}

function autoPull(state) {
  for (const s of state.streams) {
    if (s.state !== 'featured') continue;
    const line = s.tosThreshold * AUTO_PULL_AT;
    if (s.risk >= line && s.risk < s.tosThreshold) {
      const idx = state.frontPage.indexOf(s.id);
      if (idx !== -1) state.frontPage[idx] = null;
      s.state = 'pulled';
      s.cooldown = 3;
      store.pushEvent({
        type: 'info', tone: 'good', streamId: s.id,
        message: `🤖 Auto-Pull yanked "${s.title}" at ${Math.round((s.risk / s.tosThreshold) * 100)}% risk.`,
      });
    }
  }
}

// RISK ENGINE (Phase 0 reference implementation of the step() pattern).
// Featured streams accrue risk each tick; controversial ones faster. When risk
// crosses tosThreshold the stream breaks TOS: penalty, ban, heat, scandal.
// Contract: export step(state). See CONTRACTS.md §2, §6.

import { store } from '../state/store.js';

export function step(state) {
  for (const s of featured(state)) {
    // canonical risk formula (CONTRACTS.md §2)
    s.risk += s.riskRate * (1 + s.controversy / 120);

    if (s.risk >= s.tosThreshold) {
      breakTos(state, s);
    }
  }
}

function breakTos(state, s) {
  s.state = 'banned';
  const idx = state.frontPage.indexOf(s.id);
  if (idx !== -1) state.frontPage[idx] = null;

  state.tosBreaksThisShift += 1;
  state.reputation = clamp(state.reputation - 15, 0, 100);
  state.heat = clamp(state.heat + 20, 0, 100);
  state.engagement = Math.max(0, state.engagement - 50); // clawback + optics

  store.pushEvent({
    type: 'tos_break', tone: 'bad', streamId: s.id,
    message: `🚨 "${s.title}" shit the TOS bed live on the front page. Reputation −15, Heat +20.`,
  });
}

function featured(state) {
  return state.streams.filter((s) => s.state === 'featured');
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

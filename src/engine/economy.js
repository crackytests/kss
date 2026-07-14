// ECONOMY ENGINE — WS-C.
// Runs last in the tick order (risk → jackpot → economy). Two jobs:
//   1. Accrue per-tick engagement from every featured stream, using the canonical
//      formula tuned by engagementScale (see CONTRACTS.md §2 + its contract-change
//      log — the scale keeps the numbers in range of the 2500 starting quota).
//   2. Resolve the end-of-shift MONEY payout. We do NOT edit clock.js (owned by
//      lead); instead we fold the payout into the final tick. clock.tick()
//      increments state.tick, then calls the steppers, then calls endShift() when
//      state.tick >= state.ticksPerShift — so on the last tick economy runs with
//      state.tick === state.ticksPerShift while phase is still 'playing', right
//      before clock.endShift() does the engagement/quota pass-fail check. That is
//      the moment we pay salary + bonuses − penalties (reputation-weighted).
//
// Jackpot money is added in engine/jackpot.js during the shift; this payout adds
// salary/bonus/penalties on top. Contract: export step(state). CONTRACTS §2/§6.

import { store } from '../state/store.js';

// Tuning defaults mirror src/data/tos-rules.json; hydrated at load (same pattern
// as engine/audit.js). Falls back to defaults when fetch is unavailable.
const rules = {
  engagementScale: 0.4,
  salaryBase: 400,
  salaryReputationBonusMax: 400,
  quotaClearBonus: 300,
  penaltyPerTosBreak: 120,
  cleanShiftReputationBonus: 3,
};

if (typeof fetch === 'function') {
  fetch('src/data/tos-rules.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (!json) return;
      for (const k of Object.keys(rules)) {
        if (typeof json[k] === 'number') rules[k] = json[k];
      }
    })
    .catch(() => { /* keep defaults — engagement + payout still work */ });
}

export function step(state) {
  // Stop accruing / paying once the run has ended (e.g. sponsor pulled out this
  // same tick in jackpot.step). endShift hasn't fired yet on the final tick, so
  // a normal shift still has phase === 'playing' here.
  if (state.phase !== 'playing') return;

  // ---- per-tick engagement ----
  for (const s of state.streams) {
    if (s.state !== 'featured') continue;
    // Canonical formula (CONTRACTS.md §2) scaled by engagementScale.
    const base = (s.viewers / 1000) * (1 + s.controversy / 100);
    state.engagement += Math.floor(base * rules.engagementScale);
  }

  // ---- end-of-shift payout (final tick, before clock.endShift()) ----
  if (state.tick >= state.ticksPerShift) {
    payout(state);
  }
}

/** Salary + quota bonus − TOS penalties, reputation-weighted, into state.money. */
export function payout(state) {
  const passed = state.engagement >= state.quota
    && state.reputation > 0
    && state.tosBreaksThisShift < state.maxTosBreaksPerShift;

  // Reputation-weighted salary: full base + up to salaryReputationBonusMax at rep 100.
  const salary = rules.salaryBase + rules.salaryReputationBonusMax * (state.reputation / 100);
  const bonus = passed ? rules.quotaClearBonus : 0;
  const sponsorCash = settleSponsorPayouts(state);
  const penalties = state.tosBreaksThisShift * rules.penaltyPerTosBreak;
  const net = Math.round(salary + bonus + sponsorCash - penalties);

  state.money += net;

  // A clean, passing shift nudges reputation back up.
  if (passed && state.tosBreaksThisShift === 0) {
    state.reputation = Math.min(100, state.reputation + rules.cleanShiftReputationBonus);
  }

  const breakNote = state.tosBreaksThisShift > 0
    ? ` (−$${penalties} for ${state.tosBreaksThisShift} TOS break${state.tosBreaksThisShift > 1 ? 's' : ''})`
    : '';
  const sponsorNote = sponsorCash > 0 ? ` · sponsors +$${sponsorCash}` : '';
  store.pushEvent({
    type: 'info', tone: net >= 0 ? 'good' : 'bad',
    message: `💵 Payday: ${net >= 0 ? '+' : '−'}$${Math.abs(net)}${sponsorNote}${breakNote}. Wallet: $${state.money}.`,
  });
}

/** Prorate each surviving contract by the share of evaluated ticks satisfied. */
function settleSponsorPayouts(state) {
  let total = 0;
  for (const sponsor of state.sponsors || []) {
    const runtime = sponsor.runtime;
    if (!runtime || runtime.dropped || !sponsor.payoutPerShift) continue;
    const ratio = runtime.evaluatedTicks > 0
      ? runtime.satisfiedTicks / runtime.evaluatedTicks
      : 0;
    const payout = Math.round(sponsor.payoutPerShift * ratio);
    runtime.satisfactionPct = Math.round(ratio * 100);
    runtime.payoutEarned = payout;
    total += payout;
  }
  return total;
}

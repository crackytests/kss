// PR CRISIS ENGINE — WS-P (Sprint 6). A TOS break is no longer just a fine —
// it's a decision. When a featured stream breaks TOS, ONE crisis spawns (if
// none is active) with a ~8-tick countdown. The player picks a play in
// ui/crisis.js (dispatching CRISIS_CHOOSE); if the countdown expires, the
// engine resolves the worst case ("say nothing") through the same reducer so
// there is exactly one effect-application path.
//
// Crisis effects stack ON TOP of the break's baseline penalties (risk.js) and
// investigation bump (story.js) — this system is about damage CONTROL.
//
// Contract: export step(state). Options/copy in data/crisis.json. Spin's money
// cost scales with shift and is baked into the option at spawn (the store
// reducer stays generic). CONTRACTS v14.

import { store } from '../state/store.js';

const FALLBACK = {
  countdownTicks: 8,
  spinCostBase: 200,
  spinCostPerShift: 100,
  options: [
    { id: 'spin', label: 'Spin it', desc: 'Pay ${cost} to reframe it.', tone: 'neutral', effects: { reputation: 8, heat: -5 }, resolveMessage: 'Spun.' },
    { id: 'bury', label: 'Bury it', desc: 'Scrub the clips.', tone: 'bad', effects: { engagement: 40, heat: 10, investigation: 10 }, resolveMessage: 'Buried.' },
    { id: 'sacrifice', label: 'Sacrifice the streamer', desc: 'Throw them under the bus.', tone: 'bad', effects: { reputation: 10, heat: -10, investigation: -5, relationship: -40 }, resolveMessage: 'Sacrificed.' },
  ],
  ignore: { id: 'ignore', label: '(say nothing)', effects: { reputation: -5, heat: 5, investigation: 5 }, resolveMessage: 'Ignored.' },
};
let rules = FALLBACK;

if (typeof fetch === 'function') {
  fetch('src/data/crisis.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => { if (json && Array.isArray(json.options)) rules = { ...FALLBACK, ...json }; })
    .catch(() => { /* keep defaults */ });
}

/** Test/sim hook (same pattern as events/story). */
export function _setRules(next) {
  rules = { ...FALLBACK, ...next };
}

const seen = new Set();
let seq = 0;

export function step(state) {
  // expire: countdown ran out → worst case, through the one true reducer path
  if (state.crisis && state.tick >= state.crisis.endsAt) {
    store.dispatch({ type: 'CRISIS_CHOOSE', payload: { optionId: 'ignore' } });
  }

  // spawn: first un-handled tos_break this tick, if no crisis is active
  for (const evt of state.eventQueue) {
    if (seen.has(evt.id)) continue;
    seen.add(evt.id);
    if (evt.type !== 'tos_break' || state.crisis || !evt.streamId) continue;
    spawn(state, evt.streamId);
  }
}

function spawn(state, streamId) {
  const s = state.streams.find((x) => x.id === streamId);
  if (!s) return;

  const cost = rules.spinCostBase + rules.spinCostPerShift * state.shift;
  const bake = (opt) => {
    const effects = { ...(opt.effects || {}) };
    if (opt.id === 'spin') effects.money = -cost;
    return {
      ...opt,
      effects,
      desc: (opt.desc || '').replaceAll('${cost}', `$${cost.toLocaleString()}`),
      resolveMessage: (opt.resolveMessage || '').replaceAll('${cost}', `$${cost.toLocaleString()}`),
      cost: opt.id === 'spin' ? cost : 0,
    };
  };

  state.crisis = {
    id: `crisis${++seq}`,
    streamId: s.id,
    streamerId: s.streamerId,
    streamerName: s.streamerName,
    streamTitle: s.title,
    startedAt: state.tick,
    endsAt: state.tick + (rules.countdownTicks || 8),
    // ignore is a real option in the array so CRISIS_CHOOSE handles expiry too;
    // the UI renders it as the "do nothing" footer, not a button.
    options: [...rules.options.map(bake), bake(rules.ignore)],
  };

  store.pushEvent({
    type: 'info', tone: 'bad', streamId: s.id,
    message: `☎️ PR CRISIS — "${s.streamerName}" just detonated on your front page. You have ${rules.countdownTicks} ticks before silence becomes the statement.`,
  });
}

// STORY ENGINE — WS-N (Sprint 5). The narrative spine of a run.
//
// Three jobs, every tick (runs after dm.step so the plot reacts to DM outcomes):
//   1. INVESTIGATION — a 0..100 run-scoped pressure meter (survives shifts).
//      Rises on TOS breaks, audit fines, and sustained high heat; DM choices move
//      it via DMEffect.investigation (store applies those). Cools slightly on a
//      clean shift. Threshold beats at 25/50/75 fire ONCE per run (storyFlags)
//      and reveal journalist/legal DM threads.
//   2. NEWS TICKER — pushes satirical headlines into state.ticker (capped):
//      reactions to eventQueue items (seen-id set, same pattern as audio/toast)
//      plus ambient headlines on a slow cadence.
//   3. THREAD REVEALS — story-revealed DM threads are re-asserted every tick
//      (storyFlags.revealed_<id>) so engine/dm.js's per-shift thread rebuilds
//      can't swallow them.
//
// Contract: export step(state). Uses state.rng only. No DOM. Copy/tuning in
// data/story.json (defaults below mirror it for Node/file://). CONTRACTS v12.

import { store, clamp } from '../state/store.js';

const FALLBACK = {
  investigation: { tosBreak: 8, auditFine: 5, hotTickThreshold: 70, hotTickGain: 0.15, cleanShiftCooling: 4 },
  tickerCap: 8,
  ambientEveryTicks: 9,
  ambientHeadlines: ['PLATFORM DENIES EVERYTHING, ANNOUNCES NOTHING, PROFITS ANYWAY'],
  eventHeadlines: {},
  beats: [],
  endings: [],
};
let rules = FALLBACK;

if (typeof fetch === 'function') {
  fetch('src/data/story.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => { if (json && json.investigation) rules = { ...FALLBACK, ...json }; })
    .catch(() => { /* keep defaults */ });
}

/** Test/sim hook (mirrors events.js): override tuning + copy. */
export function _setRules(next) {
  rules = { ...FALLBACK, ...next };
}

/** Endings table for ui/ending.js + scripts/story-check.mjs. */
export function getEndings() {
  return rules.endings.map((e) => ({ ...e }));
}

/** Pick the ending for a terminal state. Exported so UI + checks share ONE rule. */
export function pickEnding(state) {
  const phase = state.phase === 'won' ? 'won' : 'fired';
  const candidates = rules.endings
    .filter((e) => e.phase === 'any' || e.phase === phase)
    .filter((e) => (e.requiresFlags || []).every((f) => !!state.storyFlags[f]))
    .filter((e) => (typeof e.minInvestigation !== 'number' || state.investigation >= e.minInvestigation))
    .filter((e) => (typeof e.maxInvestigation !== 'number' || state.investigation < e.maxInvestigation))
    .sort((a, b) => (a.priority || 99) - (b.priority || 99));
  return candidates[0] || rules.endings[rules.endings.length - 1] || null;
}

const seen = new Set();
let lastAmbient = -Infinity;

export function step(state) {
  const inv = rules.investigation;

  // 1) react to this tick's fresh events: pressure + headlines
  for (const evt of state.eventQueue) {
    if (seen.has(evt.id)) continue;
    seen.add(evt.id);
    if (evt.type === 'tos_break') bumpInvestigation(state, inv.tosBreak);
    if (evt.type === 'audit' && evt.tone === 'bad') bumpInvestigation(state, inv.auditFine);
    maybeHeadlineForEvent(state, evt);
  }

  // sustained high heat keeps the story hot
  if (state.heat >= inv.hotTickThreshold) bumpInvestigation(state, inv.hotTickGain);

  // clean-shift cooling: last tick of the shift, before clock.endShift runs
  if (state.tick >= state.ticksPerShift && state.tosBreaksThisShift === 0) {
    state.investigation = clamp(state.investigation - inv.cleanShiftCooling, 0, 100);
  }

  // 2) threshold beats — once per run
  for (const beat of rules.beats) {
    if (state.storyFlags[beat.flag]) continue;
    if (state.investigation < beat.at) continue;
    state.storyFlags[beat.flag] = true;
    if (typeof beat.heat === 'number') state.heat = clamp(state.heat + beat.heat, 0, 100);
    if (typeof beat.reputation === 'number') state.reputation = clamp(state.reputation + beat.reputation, 0, 100);
    pushHeadline(state, beat.headline);
    store.pushEvent({ type: 'info', tone: beat.tone || 'neutral', message: beat.message });
    for (const threadId of beat.revealThreads || []) {
      state.storyFlags[`revealed_${threadId}`] = true;
    }
  }

  // 3) re-assert story reveals every tick (dm.js rebuilds threads per shift)
  for (const key of Object.keys(state.storyFlags)) {
    if (!key.startsWith('revealed_')) continue;
    const t = state.threads.find((x) => x.id === key.slice('revealed_'.length));
    if (t && !t._arrived) { t._arrived = true; t.unread = true; }
  }

  // ambient headline cadence (skip if something just happened)
  if (state.tick - lastAmbient >= rules.ambientEveryTicks && state.rng.chance(0.5)) {
    lastAmbient = state.tick;
    pushHeadline(state, state.rng.pick(rules.ambientHeadlines));
  }
}

function bumpInvestigation(state, delta) {
  state.investigation = clamp(state.investigation + delta, 0, 100);
}

function maybeHeadlineForEvent(state, evt) {
  const pool = rules.eventHeadlines[evt.type];
  if (!pool || !pool.length) return;
  // jackpots are frequent — only sometimes newsworthy
  if (evt.type === 'jackpot' && !state.rng.chance(0.35)) return;
  const stream = evt.streamId ? state.streams.find((s) => s.id === evt.streamId) : null;
  const line = state.rng.pick(pool)
    .replaceAll('{streamer}', stream ? stream.streamerName : 'A STREAMER')
    .replaceAll('{title}', stream ? stream.title : 'a stream');
  pushHeadline(state, line);
}

function pushHeadline(state, text) {
  if (!text) return;
  if (!Array.isArray(state.ticker)) state.ticker = [];
  state.ticker.push(text);
  const cap = rules.tickerCap || 8;
  if (state.ticker.length > cap) state.ticker.splice(0, state.ticker.length - cap);
}

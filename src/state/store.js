// Single source of truth. State shape + reducers + pub/sub.
// CONTRACT-LOCKED: see docs/CONTRACTS.md. Do not change action names or state
// field names without updating that file + BUILD_PLAN.md.

import { makeRng } from '../engine/rng.js';

let _eventSeq = 0;
export function nextEventId() {
  return `e${++_eventSeq}`;
}

/** @returns {import('../../docs/CONTRACTS.md').GameState} */
function initialState(seed) {
  return {
    shift: 1,
    tick: 0,
    ticksPerShift: 60,
    running: false,
    phase: 'playing',

    engagement: 0,
    quota: 2500, // WS-C: balance target. ~1 good featured stream/tick over a shift.
    quotaGrowthPerShift: 1.25,
    riskRateGrowthPerShift: 1.06,
    maxTosBreaksPerShift: 3,
    money: 0,
    reputation: 60,
    heat: 0,
    tosBreaksThisShift: 0,
    failureReason: null,

    streams: [],
    frontPage: [null, null, null, null, null],
    slots: 5,
    baseSlots: 5,       // slots before perk bonuses; engine/perks.js reconciles `slots`
    ticksNoStake: 0,

    threads: [],

    // ---- Sprint 2 (S2.0) additive state ----
    perks: {},          // { [perkId]: true } owned perks. Persisted. WS-E reads/applies.
    relationships: {},  // { [streamerId]: -100..100 } standing. WS-F drives.
    sponsors: [],        // seeded from data/sponsors.json. WS-G migrates jackpot.js to this.
    muted: false,        // audio mute. WS-H reads. Persisted.

    // ---- Sprint 3 (S3.0) additive state ----
    liveEvents: [],      // active world events. engine/events.js (WS-J) owns lifecycle.
    mutator: null,       // this run's modifier (from data/mutators.json). WS-K draws/applies.
    wonAtShift: 10,      // clearing this shift sets phase 'won' (endless continues after)
    viewerGrowthPerShift: 1.10, // audience inflation applied in ADVANCE_SHIFT (WS-J tunes)

    // ---- Sprint 5 (S5.0) additive state — the story layer ----
    investigation: 0,    // 0..100 run-scoped pressure meter. Survives ADVANCE_SHIFT.
    storyFlags: {},      // plot memory: bribesTaken, whistleblower, _ending… WS-N/O read.
    ticker: [],          // recent news headlines (strings, newest last). story.js pushes,
                         // ui/news-ticker.js renders. Capped by story.js.

    // ---- Sprint 6 (S6.0) additive state — new toys ----
    crisis: null,        // active PR crisis (one at a time) or null. engine/crisis.js
                         // spawns/expires; CRISIS_CHOOSE resolves. See CONTRACTS v14.

    eventQueue: [],
    rng: makeRng(seed),
    seed,
  };
}

// ---- Sprint 2 persistence seam (localStorage). Guarded so the game still runs
// under file://, private mode, or Node. WS-I builds daily-seed/leaderboard on top.
const CAREER_KEY = 'kickstaff.career.v1';

function readCareer() {
  try {
    if (typeof localStorage === 'undefined') return {};
    return JSON.parse(localStorage.getItem(CAREER_KEY) || '{}') || {};
  } catch { return {}; }
}

function writeCareer(career) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(CAREER_KEY, JSON.stringify(career));
  } catch { /* ignore quota/availability errors */ }
}

// ---- Run-resume seam (v15). The live run autosaves to localStorage once per
// tick; the title screen's ">>" button restores it. Career persists separately.
const RUN_KEY = 'kickstaff.run.v1';

function readRunSnapshot() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const snap = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (!snap || snap.v !== 1 || !snap.state) return null;
    if (!['playing', 'shift_end', 'won'].includes(snap.state.phase)) return null;
    return snap;
  } catch { return null; }
}

function clearRunSnapshot() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(RUN_KEY);
  } catch { /* unavailable storage */ }
}

function runMode() {
  try {
    if (typeof location === 'undefined') return 'standard';
    return new URLSearchParams(location.search).get('mode') === 'daily' ? 'daily' : 'standard';
  } catch { return 'standard'; }
}

function createStore() {
  let state = initialState(1);
  const subscribers = new Set();

  const store = {
    getState: () => state,

    /**
     * Subscribe to commits.
     *   subscribe(fn)             -> fn(state) on EVERY commit (legacy behaviour).
     *   subscribe(fn, selector)   -> fn(state) only when selector(state) changes
     *                                vs. the previous commit (shallow compare).
     * Use the selector form for panes that rebuild innerHTML wholesale (browse,
     * discord) so they don't re-render — and lose scroll/focus — every tick.
     * Return a cheap signature (string/number, or a flat array/object) from the
     * selector describing just that pane's slice of state.
     */
    subscribe(fn, selector = null) {
      const entry = { fn, selector, last: selector ? selector(state) : undefined };
      subscribers.add(entry);
      return () => subscribers.delete(entry);
    },

    commit() {
      for (const entry of subscribers) {
        if (!entry.selector) { entry.fn(state); continue; }
        const next = entry.selector(state);
        if (!shallowEqual(next, entry.last)) {
          entry.last = next;
          entry.fn(state);
        }
      }
    },

    /** Hydrate from data bundle: { streams, streamers, threads, sponsors, rules, seed } */
    load({ streams = [], streamers = [], threads = [], sponsors = [], rules = {}, seed = 1 } = {}) {
      state = initialState(seed);
      for (const key of ['quotaGrowthPerShift', 'riskRateGrowthPerShift', 'maxTosBreaksPerShift', 'wonAtShift', 'viewerGrowthPerShift']) {
        if (typeof rules[key] === 'number') state[key] = rules[key];
      }
      const nameById = new Map(streamers.map((p) => [p.id, p.name]));
      state.streamers = streamers;
      state.streams = streams.map((s) => hydrateStream(s, nameById.get(s.streamerId)));
      state.threads = threads.map(hydrateThread);
      state.sponsors = sponsors.map((s) => ({ ...s }));

      // Carry money + perks + mute across runs (roguelite meta-progression).
      const career = readCareer();
      state.career = career;
      if (typeof career.bank === 'number') state.money = career.bank;
      if (career.perks && typeof career.perks === 'object') state.perks = { ...career.perks };
      state.muted = !!career.muted;

      this.commit();
    },

    dispatch(action) {
      reduce(state, action);
      this.commit();
    },

    /** Snapshot persistent bits to localStorage. Call after money/perk/mute
     * changes and at shift boundaries. WS-I extends the career blob (leaderboard,
     * seenArcs, bestEngagement, runs) — merge, don't overwrite unknown keys. */
    persist() {
      const career = { ...readCareer(), ...(state.career || {}) };
      career.bank = state.money;
      career.perks = { ...state.perks };
      career.muted = state.muted;
      career.bestEngagement = Math.max(career.bestEngagement || 0, state.engagement || 0);
      state.career = career;
      writeCareer(career);
    },

    /** The saved run snapshot, or null if none is resumable (v15). */
    hasSavedRun() {
      return readRunSnapshot();
    },

    /** Restore the saved run wholesale (v15): full state including the exact
     * RNG stream position. Keeps the freshly-loaded career; drops any stale
     * event queue; always lands paused so the player resumes deliberately. */
    resumeRun() {
      const snap = readRunSnapshot();
      if (!snap) return false;
      state = {
        ...snap.state,
        rng: makeRng(snap.seed, snap.rngInternal),
        career: state.career,
        eventQueue: [],
        running: false,
      };
      this.commit();
      return true;
    },

    /** Permanently clear all browser-local meta progression and reset its
     * in-memory mirrors. The career UI reloads immediately after this call. */
    resetCareer() {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem(CAREER_KEY);
      } catch { /* private mode / unavailable storage */ }
      clearRunSnapshot();
      state.career = {};
      state.money = 0;
      state.perks = {};
      state.relationships = {};
      state.muted = false;
      this.commit();
    },

    pushEvent(evt) {
      state.eventQueue.push({ id: nextEventId(), tone: 'neutral', ...evt });
    },
  };
  return store;
}

function hydrateStream(s, streamerName) {
  return {
    viewers: 0,
    color: '#53fc18',
    tags: [],
    controversy: 0,
    isGambling: false,
    isStake: false,
    risk: 0,
    riskRate: 1,
    tosThreshold: 100,
    jackpotChance: 0,
    jackpotPayout: 0,
    cooldown: 0,
    ...s,
    // Resolved from streamers.json (falls back to the id if unmatched) so views
    // can show the streamer's handle without a lookup.
    streamerName: streamerName || s.streamerName || s.streamerId,
    tags: Array.isArray(s.tags) ? [...s.tags] : [],
    state: 'live',
  };
}

function hydrateThread(t) {
  return {
    unread: false,
    ...t,
    // The Discord view treats delivery as the source of visibility. Immediate
    // top-level threads are present during the day-one briefing; scheduled and
    // continuation threads stay archived until their engine delivery.
    _arrived: !t.hidden && (typeof t.arrivesAt !== 'number' || t.arrivesAt === 0),
    messages: Array.isArray(t.messages) ? t.messages.map((message) => ({ ...message })) : [],
    choices: cloneChoices(t.choices),
    followUp: t.followUp
      ? { ...t.followUp, choices: cloneChoices(t.followUp.choices) }
      : undefined,
  };
}

function cloneChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map((choice) => ({
    ...choice,
    effect: choice.effect
      ? {
        ...choice.effect,
        unlockThreadIds: Array.isArray(choice.effect.unlockThreadIds)
          ? [...choice.effect.unlockThreadIds]
          : choice.effect.unlockThreadIds,
      }
      : {},
  }));
}

// ---- reducers (pure state transforms; may push events; NO engine steps) ----

function reduce(state, action) {
  const { type, payload = {} } = action;
  switch (type) {
    case 'PROMOTE_STREAM': return promote(state, payload);
    case 'PULL_STREAM': return pull(state, payload);
    case 'DM_OPEN': return dmOpen(state, payload);
    case 'DM_CHOOSE': return dmChoose(state, payload);
    case 'START_SHIFT': return startShift(state);
    case 'ADVANCE_SHIFT': return advanceShift(state);
    case 'PURCHASE_PERK': return purchasePerk(state, payload);
    case 'TOGGLE_MUTE': return toggleMute(state);
    case 'SET_STORY_FLAG':
      if (payload.key) state.storyFlags[payload.key] = payload.value ?? true;
      return;
    case 'CRISIS_CHOOSE': return crisisChoose(state, payload);
    case 'CLIP_ATTEMPT': return clipAttempt(state, payload);
    case 'ADJUST_RELATIONSHIP': return adjustRelationship(state, payload.streamerId, payload.delta);
    case 'SET_RUNNING': state.running = !!payload.running; return;
    case 'DISMISS_EVENT':
      state.eventQueue = state.eventQueue.filter((e) => e.id !== payload.eventId);
      return;
    default:
      console.warn('Unknown action', type);
  }
}

function promote(state, { streamId, slot }) {
  const s = state.streams.find((x) => x.id === streamId);
  if (!s || s.state === 'banned' || s.cooldown > 0) return;
  if (slot == null || slot < 0 || slot >= state.slots) return;
  // clear whoever was in the slot back to live
  const prevId = state.frontPage[slot];
  if (prevId) {
    const prev = state.streams.find((x) => x.id === prevId);
    if (prev && prev.state === 'featured') prev.state = 'live';
  }
  // if this stream is already featured elsewhere, vacate that slot
  const existing = state.frontPage.indexOf(streamId);
  if (existing !== -1) state.frontPage[existing] = null;
  state.frontPage[slot] = streamId;
  s.state = 'featured';
}

function pull(state, { streamId }) {
  const s = state.streams.find((x) => x.id === streamId);
  if (!s) return;
  const idx = state.frontPage.indexOf(streamId);
  if (idx !== -1) state.frontPage[idx] = null;
  if (s.state === 'featured') {
    s.state = 'pulled';
    s.cooldown = 3;
  }
}

function dmOpen(state, { threadId }) {
  const t = state.threads.find((x) => x.id === threadId);
  if (t) t.unread = false;
}

function dmChoose(state, { threadId, choiceIndex }) {
  const t = state.threads.find((x) => x.id === threadId);
  if (!t || !t.choices[choiceIndex]) return;
  const choice = t.choices[choiceIndex];
  const eff = choice.effect || {};
  t.messages.push({ from: 'me', text: choice.label });
  if (typeof eff.money === 'number') state.money += eff.money;
  if (typeof eff.reputation === 'number')
    state.reputation = clamp(state.reputation + eff.reputation, 0, 100);
  if (typeof eff.heat === 'number') state.heat = clamp(state.heat + eff.heat, 0, 100);
  if (eff.reply) t.messages.push({ from: 'them', text: eff.reply });
  if (Array.isArray(eff.unlockThreadIds)) {
    for (const id of eff.unlockThreadIds) {
      const th = state.threads.find((x) => x.id === id);
      if (th) th.unread = true;
    }
  }
  // Sprint 2 (WS-F): a DM choice can move standing with a streamer. Defaults to
  // this thread's own streamer; override with eff.relationshipStreamerId.
  if (typeof eff.relationship === 'number') {
    adjustRelationship(state, eff.relationshipStreamerId || t.streamerId, eff.relationship);
  }
  // Sprint 5 (S5.0): DM choices move the plot — investigation pressure delta and
  // arbitrary story-flag merges (e.g. {"whistleblower": true, "bribesTaken": 2}).
  if (typeof eff.investigation === 'number') {
    state.investigation = clamp(state.investigation + eff.investigation, 0, 100);
  }
  if (eff.storyFlags && typeof eff.storyFlags === 'object') {
    Object.assign(state.storyFlags, eff.storyFlags);
  }
  // forceFeatureStreamId enforcement is handled by engine/dm.js (WS-B) on tick.
  if (eff.forceFeatureStreamId) t._pendingForce = eff.forceFeatureStreamId;
  t.choices = [];
}

// ---- Sprint 2 (S2.0) reducers ----

/** Buy a perk. Cost comes from the UI (perks.json, owned by WS-E) — the store
 * stays generic and never hard-codes perk semantics; engine/perks.js applies the
 * gameplay effect by reading state.perks. */
function purchasePerk(state, { perkId, cost = 0 }) {
  if (!perkId || state.perks[perkId]) return;
  if (state.money < cost) return;
  state.money -= cost;
  state.perks[perkId] = true;
  store.persist();
}

function toggleMute(state) {
  state.muted = !state.muted;
  store.persist();
}

function adjustRelationship(state, streamerId, delta) {
  if (!streamerId || typeof delta !== 'number') return;
  const cur = state.relationships[streamerId] || 0;
  state.relationships[streamerId] = clamp(cur + delta, -100, 100);
}

// ---- Sprint 6 (S6.0) reducers ----

/** Resolve the active PR crisis with one of its options. The store stays
 * generic: it applies the option's declared effects (same key language as
 * DMEffect + relationship delta against the crisis streamer) and clears the
 * crisis. Option semantics/copy live in data/crisis.json (WS-P). */
function crisisChoose(state, { optionId }) {
  const crisis = state.crisis;
  if (!crisis) return;
  const opt = (crisis.options || []).find((o) => o.id === optionId);
  if (!opt) return;
  const eff = opt.effects || {};
  if (typeof eff.money === 'number') state.money += eff.money;
  if (typeof eff.engagement === 'number') state.engagement = Math.max(0, state.engagement + eff.engagement);
  if (typeof eff.reputation === 'number') state.reputation = clamp(state.reputation + eff.reputation, 0, 100);
  if (typeof eff.heat === 'number') state.heat = clamp(state.heat + eff.heat, 0, 100);
  if (typeof eff.investigation === 'number') state.investigation = clamp(state.investigation + eff.investigation, 0, 100);
  if (typeof eff.relationship === 'number') adjustRelationship(state, crisis.streamerId, eff.relationship);
  if (eff.storyFlags && typeof eff.storyFlags === 'object') Object.assign(state.storyFlags, eff.storyFlags);
  if (eff.storyFlagsAdd && typeof eff.storyFlagsAdd === 'object') {
    for (const [k, n] of Object.entries(eff.storyFlagsAdd)) {
      state.storyFlags[k] = (state.storyFlags[k] || 0) + n;
    }
  }
  if (opt.resolveMessage) {
    store.pushEvent({ type: 'info', tone: opt.tone || 'neutral', message: opt.resolveMessage });
  }
  state.crisis = null;
}

/** Clip Desk (WS-P): convert timing accuracy (0..1) on a viral featured stream
 * into an engagement bonus. Canonical formula (CONTRACTS v14):
 *   hit  (accuracy >= 0.3): + round(viewers/1000 × (0.5 + accuracy) × 2)
 *   miss (accuracy <  0.3): − 25 engagement (the clip is embarrassing)
 * One attempt per viral event: marks the live event _clipped. */
function clipAttempt(state, { streamId, accuracy = 0 }) {
  const s = state.streams.find((x) => x.id === streamId);
  if (!s) return;
  const ev = (state.liveEvents || []).find(
    (e) => e.defId === 'viral' && !e._clipped && (e.streamIds || []).includes(streamId),
  );
  if (!ev) return; // no un-clipped viral moment for this stream
  ev._clipped = true;
  const acc = clamp(accuracy, 0, 1);
  if (acc >= 0.3) {
    const bonus = Math.round((s.viewers / 1000) * (0.5 + acc) * 2);
    state.engagement += bonus;
    store.pushEvent({
      type: 'jackpot', tone: 'good', streamId,
      message: `🎬 CLIPPED IT — ${Math.round(acc * 100)}% frame-perfect. +${bonus} engagement.`,
    });
  } else {
    state.engagement = Math.max(0, state.engagement - 25);
    store.pushEvent({
      type: 'info', tone: 'bad', streamId,
      message: `🎬 You clipped the wrong ten seconds. −25 engagement and everyone saw.`,
    });
  }
}

function startShift(state) {
  state.tick = 0;
  state.engagement = 0;
  state.tosBreaksThisShift = 0;
  state.ticksNoStake = 0;
  state.failureReason = null;
  state.phase = 'playing';
  state.running = true;
  for (const s of state.streams) {
    s.risk = 0;
    s.cooldown = 0;
    if (s.state !== 'banned') s.state = 'live';
  }
  state.frontPage = new Array(state.slots).fill(null);
}

function advanceShift(state) {
  // 'won' also advances: victory at wonAtShift, then endless scaling continues.
  if (state.phase !== 'shift_end' && state.phase !== 'won') return;
  state.shift += 1;
  state.quota = Math.round(state.quota * state.quotaGrowthPerShift);
  for (const stream of state.streams) {
    stream.riskRate = Number((stream.riskRate * state.riskRateGrowthPerShift).toFixed(4));
    // S3.0: audience inflation — supply grows with demand so the curve is a
    // gradient, not a wall (see BUILD_PLAN Sprint 3 / WS-J).
    stream.viewers = Math.round(stream.viewers * state.viewerGrowthPerShift);
  }
  // Close yesterday's inbox immediately while the next briefing is paused.
  // dm.step rebuilds and redelivers today's conversations on the first tick.
  for (const thread of state.threads) {
    thread._arrived = false;
    thread.unread = false;
  }
  startShift(state);
  // The briefing owns the transition from prepared to actively ticking.
  state.running = false;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Shallow equality for selector signatures: primitives, or flat arrays/objects. */
function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is(a[k], b[k])) return false;
  return true;
}

export const store = createStore();
export { clamp };

// ---- run autosave (v15). Registered before any UI subscriber. Saves at most
// once per tick/phase change; never before the run's first real tick, so a
// fresh boot can't clobber the previous run's snapshot before the player picks
// ">>" on the title screen. A fired run clears its snapshot — no resurrecting.
let _lastRunSave = null;
store.subscribe((state) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (state.phase === 'fired') { clearRunSnapshot(); _lastRunSave = null; return; }
    if (state.tick < 1) return;
    const mark = `${state.shift}|${state.tick}|${state.phase}`;
    if (mark === _lastRunSave) return;
    _lastRunSave = mark;
    const { rng, career, eventQueue, ...rest } = state;
    localStorage.setItem(RUN_KEY, JSON.stringify({
      v: 1,
      savedAt: Date.now(),
      mode: runMode(),
      seed: state.seed,
      rngInternal: rng && rng.getInternal ? rng.getInternal() : undefined,
      state: { ...rest, eventQueue: [], running: false },
    }));
  } catch { /* quota/unavailable — resume simply won't be offered */ }
});

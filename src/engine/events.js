// LIVE EVENTS ENGINE — WS-J (Sprint 3). The world moves without you.
//
// Seeded, durational world events that temporarily mutate stream stats and then
// revert: Viral Moment, Raid, Drama Wave, Dead Hours, Category Boom. Runs FIRST
// in the tick order so every downstream engine (risk/jackpot/economy) sees the
// modified stats the same tick. Active events live in state.liveEvents; each
// stores the exact original values it touched (ev.saved) and restores them on
// expiry or at shift end (clock calls clearAll before payout/inflation).
//
// Featuring a viral stream is the sprint's core new decision: huge viewers =
// huge engagement, but controversy+riskRate spike too — ride it or dodge it.
//
// Contract: export step(state), clearAll(state). Uses state.rng exclusively.
// Tuning lives in data/events.json (defaults below mirror it for Node/file://).

import { store } from '../state/store.js';

const FALLBACK_RULES = {
  baseChancePerTick: 0.055,
  maxConcurrent: 2,
  minGapTicks: 6,
  earliestTick: 5,
  defs: [
    { id: 'viral', weight: 30, minDur: 8, maxDur: 12, viewersMultMin: 2, viewersMultMax: 4, controversyAdd: 15, riskRateMult: 1.5 },
    { id: 'raid', weight: 20, minDur: 8, maxDur: 12, movedShare: 0.6 },
    { id: 'drama_wave', weight: 15, minDur: 8, maxDur: 12, minControversy: 40, controversyAdd: 20, riskRateMult: 1.3, viewersMult: 1.4 },
    { id: 'dead_hours', weight: 15, minDur: 6, maxDur: 10, viewersMult: 0.6 },
    { id: 'category_boom', weight: 20, minDur: 8, maxDur: 12, viewersMult: 1.8 },
  ],
};
let rules = FALLBACK_RULES;

if (typeof fetch === 'function') {
  fetch('src/data/events.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => { if (json && Array.isArray(json.defs)) rules = { ...FALLBACK_RULES, ...json }; })
    .catch(() => { /* keep defaults */ });
}

/** Test/sim hook: override tuning (used by scripts/simulate-balance.mjs). */
export function _setRules(next) {
  rules = { ...FALLBACK_RULES, ...next };
}

let seq = 0;
let lastSpawnTick = -Infinity;

export function step(state) {
  if (!Array.isArray(state.liveEvents)) state.liveEvents = [];

  // 1) expire + revert
  for (const ev of [...state.liveEvents]) {
    if (state.tick < ev.endsAt) continue;
    revert(state, ev);
    state.liveEvents = state.liveEvents.filter((x) => x !== ev);
    store.pushEvent({ type: 'info', tone: 'neutral', message: `${ev.label} is over.` });
  }

  // 2) maybe spawn
  if (state.tick < (rules.earliestTick ?? 5)) return;
  if (state.liveEvents.length >= (rules.maxConcurrent ?? 2)) return;
  if (state.tick - lastSpawnTick < (rules.minGapTicks ?? 6)) return;
  if (!state.rng.chance(rules.baseChancePerTick ?? 0.055)) return;

  const def = pickWeighted(state.rng, rules.defs);
  const ev = BUILDERS[def.id] ? BUILDERS[def.id](state, def) : null;
  if (!ev) return; // no valid target this tick — try again later

  ev.id = `lev${++seq}`;
  ev.defId = def.id;
  ev.endsAt = state.tick + def.minDur + state.rng.int(def.maxDur - def.minDur + 1);
  state.liveEvents.push(ev);
  lastSpawnTick = state.tick;
  store.pushEvent({ type: ev.toastType, tone: ev.tone, streamId: ev.streamIds[0], message: ev.message });
}

/** Revert every active event (clock calls this at shift end, before payout). */
export function clearAll(state) {
  if (!Array.isArray(state.liveEvents)) { state.liveEvents = []; return; }
  for (const ev of state.liveEvents) revert(state, ev);
  state.liveEvents = [];
  lastSpawnTick = -Infinity;
}

function revert(state, ev) {
  for (const [streamId, fields] of Object.entries(ev.saved)) {
    const s = state.streams.find((x) => x.id === streamId);
    if (!s) continue;
    Object.assign(s, fields);
  }
}

// ---- event builders. Each returns {label, message, toastType, tone, streamIds, saved} or null. ----

const BUILDERS = {
  viral(state, def) {
    const s = pickStream(state, (x) => !busy(state, x.id));
    if (!s) return null;
    const saved = { [s.id]: { viewers: s.viewers, controversy: s.controversy, riskRate: s.riskRate } };
    const mult = def.viewersMultMin + state.rng.next() * (def.viewersMultMax - def.viewersMultMin);
    s.viewers = Math.round(s.viewers * mult);
    s.controversy = clamp(s.controversy + def.controversyAdd, 0, 100);
    s.riskRate = round4(s.riskRate * def.riskRateMult);
    return {
      label: `${s.streamerName}'s viral moment`,
      message: `🔥 "${s.title}" is going VIRAL — ${s.viewers.toLocaleString()} viewers and climbing. Clip it or kill it.`,
      toastType: 'viral', tone: 'good', streamIds: [s.id], saved,
    };
  },

  raid(state, def) {
    const from = pickStream(state, (x) => x.viewers >= 5000 && !busy(state, x.id));
    const to = pickStream(state, (x) => x.id !== (from && from.id) && !busy(state, x.id));
    if (!from || !to) return null;
    const saved = {
      [from.id]: { viewers: from.viewers },
      [to.id]: { viewers: to.viewers },
    };
    const moved = Math.round(from.viewers * def.movedShare);
    from.viewers -= moved;
    to.viewers += moved;
    return {
      label: `${from.streamerName} → ${to.streamerName} raid`,
      message: `⚡ ${from.streamerName} just raided ${to.streamerName} — ${moved.toLocaleString()} viewers moved.`,
      toastType: 'info', tone: 'neutral', streamIds: [to.id, from.id], saved,
    };
  },

  drama_wave(state, def) {
    const targets = state.streams.filter((x) => x.state !== 'banned' && x.controversy >= def.minControversy && !busy(state, x.id));
    if (!targets.length) return null;
    const saved = {};
    for (const s of targets) {
      saved[s.id] = { viewers: s.viewers, controversy: s.controversy, riskRate: s.riskRate };
      s.viewers = Math.round(s.viewers * def.viewersMult);
      s.controversy = clamp(s.controversy + def.controversyAdd, 0, 100);
      s.riskRate = round4(s.riskRate * def.riskRateMult);
    }
    return {
      label: 'a sitewide drama wave',
      message: `🍿 DRAMA WAVE — ${targets.length} messy streams just got messier (and bigger). Engagement gold, TOS minefield.`,
      toastType: 'info', tone: 'neutral', streamIds: targets.map((s) => s.id), saved,
    };
  },

  dead_hours(state, def) {
    const targets = state.streams.filter((x) => x.state !== 'banned' && !busy(state, x.id));
    if (!targets.length) return null;
    const saved = {};
    for (const s of targets) {
      saved[s.id] = { viewers: s.viewers };
      s.viewers = Math.round(s.viewers * def.viewersMult);
    }
    return {
      label: 'the dead hours',
      message: `😴 Dead hours — the whole directory's numbers just sagged. Good luck hitting quota with this.`,
      toastType: 'info', tone: 'bad', streamIds: [], saved,
    };
  },

  category_boom(state, def) {
    const cats = [...new Set(state.streams.filter((x) => x.state !== 'banned').map((x) => x.category))];
    const withTwo = cats.filter((c) => state.streams.filter((x) => x.category === c && x.state !== 'banned').length >= 2);
    if (!withTwo.length) return null;
    const cat = state.rng.pick(withTwo);
    const targets = state.streams.filter((x) => x.category === cat && x.state !== 'banned' && !busy(state, x.id));
    if (!targets.length) return null;
    const saved = {};
    for (const s of targets) {
      saved[s.id] = { viewers: s.viewers };
      s.viewers = Math.round(s.viewers * def.viewersMult);
    }
    return {
      label: `the ${cat} boom`,
      message: `📈 ${cat} is BOOMING — every ${cat} stream just inflated. Front-page material.`,
      toastType: 'info', tone: 'good', streamIds: targets.map((s) => s.id), saved,
    };
  },
};

// ---- helpers ----

/** A stream already touched by an active event is off-limits to new ones. */
function busy(state, streamId) {
  return state.liveEvents.some((ev) => ev.saved && ev.saved[streamId]);
}

function pickStream(state, filter) {
  const pool = state.streams.filter((x) => x.state !== 'banned' && filter(x));
  return pool.length ? state.rng.pick(pool) : null;
}

function pickWeighted(rng, defs) {
  const total = defs.reduce((n, d) => n + d.weight, 0);
  let roll = rng.next() * total;
  for (const d of defs) {
    roll -= d.weight;
    if (roll <= 0) return d;
  }
  return defs[defs.length - 1];
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round4(v) { return Number(v.toFixed(4)); }

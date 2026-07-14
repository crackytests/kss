// DM ENGINE — WS-F (see docs/BUILD_PLAN.md). Extends WS-B.
// Per-tick direct-message simulation. Runs every tick after economy.step and
// before audit.step (fixed order in clock.js). Jobs:
//   1. REBUILD per shift: at each shift boundary (and on a fresh load),
//      reconstruct every thread's messages/choices from its authored template,
//      picking a relationship band (loyal / default / hostile) from
//      state.relationships. Resets delivery + enforcement flags so arcs recur
//      every shift AND the content reflects how you treated the streamer last
//      shift (a burned streamer returns hostile; a loyal one offers kickbacks).
//   2. Reveal "hidden" continuation threads once a parent choice unlocks them
//      (the store's DM_CHOOSE reducer flips unread=true on unlockThreadIds).
//   3. Deliver time-scheduled arrivals (arrivesAt) + one optional followUp beat.
//   4. Enforce forceFeatureStreamId — and now move standing: honour → up,
//      renege → down (hard). Unresolved deals are settled at shift end so a
//      bribe can't be dodged by running out the clock.
// Cross-run memory: state.relationships is mirrored into the localStorage career
// blob (career.relationships) and restored at the start of each run, so the world
// remembers you across restarts. store.persist() preserves unknown career keys.
//
// Template source: bands are read from the IMMUTABLE authored data imported below
// (a module singleton), NOT from live thread state. This matters because a
// DM_CHOOSE can land before the first clock tick (the shift-1 briefing window);
// snapshotting from live state then would freeze a mutated, choice-cleared
// thread into the template. Cloning into the live thread keeps the template safe.
//
// Authoring fields on a DMThread (optional — CONTRACTS §3, v4 + v8):
//   arrivesAt, hidden, followUp                              (v4)
//   loyal, hostile : { messages, choices, followUp? }        (v8) — band variants
// Engine bookkeeping (never authored; mutated by engine/dm.js): _arrived,
//   _revealed, _fuDelivered, _pendingForce (set by the DM_CHOOSE reducer),
//   _forceGrace.
//
// Contract: export step(state). Uses state.rng where randomness is needed —
// NEVER Math.random(). No DOM. CONTRACTS §3/§5/§6.

import { store, clamp } from '../state/store.js';
// Immutable authored templates. Imported (not fetch'd) so they're available
// before the first tick and can't be corrupted by an early DM_CHOOSE.
import dmsAuthored from '../data/dms.json' with { type: 'json' };

const TEMPLATES = new Map(dmsAuthored.map((t) => [t.id, t]));

// --- tuning (hardcoded like engine/audit.js; tos-rules.json is WS-C-owned) ---
const FORCE_GRACE_TICKS = 8;       // ticks to actually feature the promised stream
const FORCE_KEEP_WORD_REP = 2;     // small reputation nod for honouring a deal
const FORCE_HONOR_REL = 25;        // standing gained when you honour a deal → loyal band fast
const FORCE_RENEGE_MONEY = 1500;   // fine + clawback when you renege
const FORCE_RENEGE_REP = 10;
const FORCE_RENEGE_HEAT = 8;
const FORCE_RENEGE_REL = -35;      // standing lost when you renege → hostile band next shift

// Relationship bands select a thread's variant content each shift.
const LOYAL_ABOVE = 25;            // standing >= → loyal variant
const HOSTILE_BELOW = -25;         // standing <= → hostile variant

let lastShift = -1;
let lastThreadsRef = null;         // detects a fresh store.load() (new threads array)
let restored = false;

export function step(state) {
  if (state.phase !== 'playing') return;

  // A new store.load() builds a fresh threads array + resets shift/tick — reset
  // our per-run bookkeeping so the new run rebuilds + restores cleanly.
  if (state.threads !== lastThreadsRef) {
    lastThreadsRef = state.threads;
    lastShift = -1;
    restored = false;
  }
  if (!restored) { restored = true; restoreRelationships(state); }

  if (state.shift !== lastShift) {
    lastShift = state.shift;
    rebuildForShift(state);
  }

  revealUnlocks(state);
  deliverArrivals(state);
  deliverFollowUps(state);
  enforceForcedFeatures(state);
  if (state.tick >= state.ticksPerShift) settleForces(state); // no dodging bribes
  syncCareer(state);
}

// ---- cross-run relationship memory (career blob) ----

function restoreRelationships(state) {
  const saved = state.career && state.career.relationships;
  if (saved && typeof saved === 'object') state.relationships = { ...saved };
}

/** Mirror standing into the career blob so store.persist() flushes it to
 *  localStorage. Writes only when a value actually changed (no per-tick churn). */
function syncCareer(state) {
  if (!state.career) state.career = {};
  const cur = state.career.relationships || {};
  const live = state.relationships || {};
  const keys = new Set([...Object.keys(cur), ...Object.keys(live)]);
  let changed = false;
  for (const k of keys) {
    if ((cur[k] || 0) !== (live[k] || 0)) { changed = true; break; }
  }
  if (changed) state.career.relationships = { ...live };
}

// ---- per-shift arc rebuild ----

/** Rebuild every thread for the new shift from the relationship-appropriate
 *  variant of its IMMUTABLE authored template. Resets delivery flags so arcs
 *  recur; re-locks continuation threads so chains replay. */
function rebuildForShift(state) {
  for (const t of state.threads) {
    const tpl = TEMPLATES.get(t.id);
    if (!tpl) continue;                          // no authored template → leave as-is
    const src = tpl[bandFor(state, t)] || tpl;   // loyal/hostile band, else top-level (default)
    t.messages = cloneMsgs(src.messages);
    t.choices = cloneChoices(src.choices);
    t.followUp = src.followUp ? { ...src.followUp, choices: cloneChoices(src.followUp.choices) } : null;
    // reset per-shift delivery + force-feature enforcement
    t._arrived = false;
    t._fuDelivered = false;
    t._pendingForce = null;
    t._forceGrace = 0;
    if (tpl.hidden) {
      // continuation thread: re-lock until a parent choice unlocks it again
      t.hidden = true;
      t._revealed = false;
      t.unread = false;
    } else {
      // top-level thread: fresh opening message this shift → unread
      t.hidden = false;
      t.unread = true;
    }
  }
}

function bandFor(state, t) {
  const rel = (state.relationships || {})[t.streamerId] || 0;
  if (rel >= LOYAL_ABOVE) return 'loyal';
  if (rel <= HOSTILE_BELOW) return 'hostile';
  return 'default';
}

// ---- deliveries (flags reset per shift by rebuildForShift) ----

/** Hidden continuation threads appear once unlocked (reducer set unread=true). */
function revealUnlocks(state) {
  for (const t of state.threads) {
    if (!t.hidden || t._revealed) continue;
    if (!t.unread) continue;            // reducer flips unread on unlockThreadIds
    t.hidden = false;
    t._revealed = true;
    store.pushEvent({
      type: 'dm_incoming', tone: 'neutral', threadId: t.id,
      message: `💬 ${t.name} slid into your corporate nightmare.`,
    });
  }
}

/** Top-level threads with a scheduled arrival open and ping you, once per shift. */
function deliverArrivals(state) {
  for (const t of state.threads) {
    if (t.hidden || t._arrived) continue;
    const when = typeof t.arrivesAt === 'number' ? t.arrivesAt : 0;
    if (when === 0) { t._arrived = true; continue; }   // present from shift start, no ping
    if (state.tick < when) continue;
    t._arrived = true;
    t.unread = true;
    store.pushEvent({
      type: 'dm_incoming', tone: 'neutral', threadId: t.id,
      message: `💬 ${t.name} wants something. Of fucking course.`,
    });
  }
}

/** One optional scheduled follow-up beat per thread, delivered once per shift. */
function deliverFollowUps(state) {
  for (const t of state.threads) {
    if (t.hidden || t._fuDelivered) continue;
    const fu = t.followUp;
    if (!fu) continue;
    if (state.tick < fu.at) continue;
    if (t.choices && t.choices.length) continue;        // don't interrupt a pending choice
    t._fuDelivered = true;
    t.messages.push({ from: fu.from || 'them', text: fu.text });
    if (Array.isArray(fu.choices) && fu.choices.length) t.choices = cloneChoices(fu.choices);
    t.unread = true;
    store.pushEvent({
      type: 'dm_incoming', tone: 'neutral', threadId: t.id,
      message: `💬 ${t.name} followed up because boundaries are dead.`,
    });
  }
}

// ---- force-feature enforcement + standing ----

/** Honour-or-penalize a promised feature from a bribe/threat choice. */
function enforceForcedFeatures(state) {
  for (const t of state.threads) {
    const promised = t._pendingForce;
    if (!promised) continue;
    if (state.frontPage.includes(promised)) { honor(state, t); continue; }
    t._forceGrace = (t._forceGrace || 0) + 1;
    if (t._forceGrace >= FORCE_GRACE_TICKS) renege(state, t);
  }
}

/** Anything still unresolved when the clock runs out is a renege. */
function settleForces(state) {
  for (const t of state.threads) {
    if (t._pendingForce) renege(state, t);
  }
}

function honor(state, t) {
  t._pendingForce = null;
  t._forceGrace = 0;
  state.reputation = clamp(state.reputation + FORCE_KEEP_WORD_REP, 0, 100);
  adjust(state, t.streamerId, FORCE_HONOR_REL);
  store.pushEvent({
    type: 'info', tone: 'good', threadId: t.id,
    message: `🤝 You honoured the filthy deal with ${t.name}. Reputation +${FORCE_KEEP_WORD_REP}; somehow loyalty exists here.`,
  });
}

function renege(state, t) {
  const promised = t._pendingForce;
  t._pendingForce = null;
  t._forceGrace = 0;
  state.money -= FORCE_RENEGE_MONEY;
  state.reputation = clamp(state.reputation - FORCE_RENEGE_REP, 0, 100);
  state.heat = clamp(state.heat + FORCE_RENEGE_HEAT, 0, 100);
  adjust(state, t.streamerId, FORCE_RENEGE_REL);
  const stream = state.streams.find((s) => s.id === promised);
  const what = stream ? `"${stream.title}"` : 'the stream';
  store.pushEvent({
    type: 'info', tone: 'bad', threadId: t.id,
    message: `📣 ${t.name} blew the whistle — you took the dirty deal then stiffed them on ${what}. −$${FORCE_RENEGE_MONEY}, reputation −${FORCE_RENEGE_REP}, heat +${FORCE_RENEGE_HEAT}. Petty bastards remember everything.`,
  });
}

function adjust(state, streamerId, delta) {
  if (!streamerId || typeof delta !== 'number') return;
  const cur = state.relationships[streamerId] || 0;
  state.relationships[streamerId] = clamp(cur + delta, -100, 100);
}

// ---- clone helpers ----

function cloneMsgs(msgs) {
  return Array.isArray(msgs) ? msgs.map((m) => ({ ...m })) : [];
}

function cloneChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map((c) => ({
    ...c,
    effect: c.effect
      ? {
        ...c.effect,
        unlockThreadIds: Array.isArray(c.effect.unlockThreadIds)
          ? [...c.effect.unlockThreadIds]
          : c.effect.unlockThreadIds,
      }
      : {},
  }));
}

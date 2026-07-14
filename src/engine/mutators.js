// RUN MUTATORS — WS-K (BUILD_PLAN → Sprint 3).
// Draws one modifier from a RNG stream separate from gameplay RNG, applies its
// one-time run setup, then handles Crackdown's per-tick audit/cooling behavior.
// No DOM and never Math.random().

import mutatorsAuthored from '../data/mutators.json' with { type: 'json' };
import { makeRng } from './rng.js';
import { store, clamp } from '../state/store.js';

const MUTATOR_SEED_SALT = 0x4d555441; // "MUTA"
const AUDIT_BASE_CHANCE_PER_10_HEAT = 0.02;
const MAX_AUDIT_CHANCE = 0.25;
const AUDIT_RISK_LINE = 70;
const CLEAN_AUDIT_COOL = 5;
const FINE_HEAT_PER_STREAM = 8;
const FINE_REP_PER_STREAM = 3;
const FINE_BASE = 50;

/** Deterministically choose a mutator without advancing state.rng. */
export function selectMutator(seed, definitions = mutatorsAuthored) {
  if (!Array.isArray(definitions) || definitions.length === 0) return null;
  const rng = makeRng(((Number(seed) || 0) ^ MUTATOR_SEED_SALT) >>> 0);
  return definitions[rng.int(definitions.length)] || definitions[0];
}

/**
 * Install this run's mutator exactly once. Called by persistence immediately
 * after store.load(), before the briefing UI mounts.
 */
export function initializeRun(state, config = {}, forcedId = null) {
  if (!state || state.mutator) return state?.mutator || null;
  const definition = forcedId
    ? mutatorsAuthored.find((candidate) => candidate.id === forcedId)
    : selectMutator(config.seed ?? state.seed);
  if (!definition) return null;

  state.mutator = {
    ...definition,
    effects: { ...(definition.effects || {}) },
    rosterSize: state.streams?.length || 0,
    runtime: {
      initialized: true,
      lastHeat: state.heat || 0,
      extraAudits: 0,
    },
  };

  applyOneTimeEffects(state, state.mutator);
  keepRosterThreadsOnly(state);
  return state.mutator;
}

/** Per-tick hook. One-time mutators need no ongoing work. */
export function step(state) {
  if (state.phase !== 'playing' || state.mutator?.id !== 'crackdown') return;
  stepCrackdown(state, state.mutator);
}

function applyOneTimeEffects(state, mutator) {
  const effects = mutator.effects || {};

  if (typeof effects.jackpotChanceMultiplier === 'number') {
    for (const stream of state.streams || []) {
      stream.jackpotChance = Number(clamp(
        stream.jackpotChance * effects.jackpotChanceMultiplier,
        0,
        1,
      ).toFixed(6));
    }
  }
  if (typeof effects.jackpotPayoutMultiplier === 'number') {
    for (const stream of state.streams || []) {
      stream.jackpotPayout = Math.round(stream.jackpotPayout * effects.jackpotPayoutMultiplier);
    }
  }
  if (typeof effects.controversyAdd === 'number') {
    for (const stream of state.streams || []) {
      stream.controversy = clamp(stream.controversy + effects.controversyAdd, 0, 100);
    }
  }
  if (typeof effects.viewerMultiplier === 'number') {
    for (const stream of state.streams || []) {
      stream.viewers = Math.max(1, Math.round(stream.viewers * effects.viewerMultiplier));
    }
  }
  if (typeof effects.quotaMultiplier === 'number') {
    state.quota = Math.max(1, Math.round(state.quota * effects.quotaMultiplier));
  }

  for (const sponsor of state.sponsors || []) {
    if (typeof effects.sponsorPayoutMultiplier === 'number') {
      sponsor.payoutPerShift = Math.round(
        sponsor.payoutPerShift * effects.sponsorPayoutMultiplier,
      );
    }
    if (typeof effects.sponsorPatienceMultiplier === 'number') {
      for (const key of ['graceTicks', 'failTicks', 'warningEveryTicks']) {
        if (typeof sponsor[key] === 'number') {
          sponsor[key] = Math.max(1, Math.round(sponsor[key] * effects.sponsorPatienceMultiplier));
        }
      }
    }
  }
}

function keepRosterThreadsOnly(state) {
  if (!Array.isArray(state.threads)) return;
  const roster = new Set((state.streams || []).map((stream) => stream.streamerId));
  state.threads = state.threads.filter((thread) => roster.has(thread.streamerId));
}

function stepCrackdown(state, mutator) {
  const effects = mutator.effects || {};
  const runtime = mutator.runtime || (mutator.runtime = {
    initialized: true,
    lastHeat: state.heat || 0,
    extraAudits: 0,
  });

  // audit.step runs immediately before this module. Put back the portion of any
  // heat reduction that Crackdown suppresses (including a clean base audit).
  const coolingMultiplier = clamp(effects.heatCoolingMultiplier ?? 1, 0, 1);
  if (state.heat < runtime.lastHeat) {
    const cooled = runtime.lastHeat - state.heat;
    state.heat = clamp(state.heat + cooled * (1 - coolingMultiplier), 0, 100);
  }

  // The normal audit engine already rolled once. Rolling the additional
  // (multiplier − 1) share here makes the total frequency approximately ×2.
  const extraMultiplier = Math.max(0, (effects.auditChanceMultiplier ?? 1) - 1);
  const extraChance = clamp(
    (state.heat / 10) * AUDIT_BASE_CHANCE_PER_10_HEAT * extraMultiplier,
    0,
    MAX_AUDIT_CHANCE,
  );
  if (state.heat > 0 && state.rng.chance(extraChance)) {
    runExtraAudit(state, coolingMultiplier);
    runtime.extraAudits += 1;
  }

  runtime.lastHeat = state.heat;
}

function runExtraAudit(state, coolingMultiplier) {
  const featured = state.frontPage
    .map((id) => state.streams.find((stream) => stream.id === id))
    .filter(Boolean);
  const offenders = featured.filter((stream) => stream.risk > AUDIT_RISK_LINE);

  if (offenders.length === 0) {
    const cooling = Number((CLEAN_AUDIT_COOL * coolingMultiplier).toFixed(2));
    state.heat = clamp(state.heat - cooling, 0, 100);
    store.pushEvent({
      type: 'audit',
      tone: 'neutral',
      message: `🔎 Crackdown re-audit — somehow clean. The regulator leaves disappointed. Heat −${cooling}.`,
    });
    return;
  }

  let totalFine = 0;
  for (const stream of offenders) {
    totalFine += FINE_BASE + Math.round((stream.risk - AUDIT_RISK_LINE) * 2);
    const slot = state.frontPage.indexOf(stream.id);
    if (slot !== -1) state.frontPage[slot] = null;
    stream.state = 'pulled';
    stream.cooldown = 3;
  }
  const repHit = offenders.length * FINE_REP_PER_STREAM;
  const heatGain = offenders.length * FINE_HEAT_PER_STREAM;
  state.engagement = Math.max(0, state.engagement - totalFine);
  state.reputation = clamp(state.reputation - repHit, 0, 100);
  state.heat = clamp(state.heat + heatGain, 0, 100);
  store.pushEvent({
    type: 'audit',
    tone: 'bad',
    streamId: offenders[0].id,
    message: `🚨 CRACKDOWN! Second audit catches ${offenders.length} reckless bastard${offenders.length === 1 ? '' : 's'} — engagement −${totalFine}, reputation −${repHit}, heat +${heatGain}.`,
  });
}

/** Read-only clone for checks/tools without exposing the imported singleton. */
export function getMutatorDefinitions() {
  return mutatorsAuthored.map((definition) => ({
    ...definition,
    effects: { ...(definition.effects || {}) },
  }));
}

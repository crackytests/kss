// PERSISTENCE / DAILY RUNS — WS-I.
// Extends S2.0's existing state.career + store.persist() seam. This module owns
// daily seed derivation, deterministic per-run roster variance, and terminal
// run archival. It does not add store actions or touch the DOM.

import { makeRng } from './rng.js';
import { initializeRun } from './mutators.js';
import { store } from '../state/store.js';

export const RUN_HISTORY_LIMIT = 20;
export const LEADERBOARD_LIMIT = 10;

/** UTC date key shared by every player, independent of local timezone. */
export function dailyKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Stable unsigned FNV-1a seed for a UTC date. */
export function dailySeed(date = new Date()) {
  const input = `kickstaff-daily-v1:${dailyKey(date)}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Resolve standard/daily mode once at boot. */
export function getRunConfig(
  search = typeof location === 'undefined' ? '' : location.search,
  now = new Date(),
) {
  const params = new URLSearchParams(search);
  const mode = params.get('mode') === 'daily' ? 'daily' : 'standard';
  const key = mode === 'daily' ? dailyKey(now) : null;
  const challengeSeed = parseChallengeSeed(params.get('seed'));
  return {
    mode,
    dailyKey: key,
    seed: challengeSeed ?? (mode === 'daily' ? dailySeed(now) : now.getTime() >>> 0),
  };
}

/** Decimal-only URL seed parser. Invalid/overflowing values fall back normally. */
function parseChallengeSeed(raw) {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= 0xffffffff ? value >>> 0 : null;
}

/**
 * Build the seeded run directory without consuming state.rng: shuffle, select
 * 16–18 streams, guarantee both sponsor-critical tags, then independently
 * jitter viewers/risk/jackpot odds by ±15%.
 */
export function orderStreamsForRun(streams, config) {
  const ordered = streams.map((stream) => ({
    ...stream,
    tags: Array.isArray(stream.tags) ? [...stream.tags] : [],
  }));
  const rng = makeRng((((config?.seed ?? 1) >>> 0) ^ 0x9e3779b9) >>> 0);
  for (let i = ordered.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  }
  const rosterSize = Math.min(ordered.length, 16 + rng.int(3));
  const selected = ordered.slice(0, rosterSize);
  guaranteeTag(selected, ordered, 'stake');
  guaranteeTag(selected, ordered, 'wholesome');
  return selected.map((stream) => jitterStream(stream, rng));
}

/** Observe a run and emit exactly one RunEntry when it reaches fired/won. */
export function createRunTracker({
  config,
  startedAt = new Date().toISOString(),
  startingMoney = 0,
  now = () => new Date(),
} = {}) {
  const runConfig = config || getRunConfig();
  const countedShifts = new Set();
  let totalEngagement = 0;
  let peakEngagement = 0;
  let tosBreaks = 0;
  let recorded = false;

  function countShift(state) {
    if (countedShifts.has(state.shift)) return;
    countedShifts.add(state.shift);
    totalEngagement += Math.max(0, state.engagement || 0);
    tosBreaks += Math.max(0, state.tosBreaksThisShift || 0);
  }

  return {
    observe(state) {
      peakEngagement = Math.max(peakEngagement, state.engagement || 0);
      if (state.phase === 'shift_end') countShift(state);
      if (recorded || (state.phase !== 'fired' && state.phase !== 'won')) return null;

      countShift(state);
      recorded = true;
      const shiftsSurvived = state.phase === 'won'
        ? Math.max(countedShifts.size, state.shift)
        : Math.max(0, countedShifts.size - 1);
      const finishedAt = now().toISOString();
      const base = {
        id: `${runConfig.mode}:${runConfig.seed}:${startedAt}`,
        mode: runConfig.mode,
        dailyKey: runConfig.dailyKey,
        seed: runConfig.seed >>> 0,
        startedAt,
        finishedAt,
        result: state.phase,
        failureReason: state.failureReason || null,
        shiftsSurvived,
        totalEngagement,
        peakEngagement,
        money: state.money || 0,
        moneyEarned: (state.money || 0) - startingMoney,
        reputation: state.reputation || 0,
        heat: state.heat || 0,
        tosBreaks,
        mutatorId: state.mutator?.id || null,
        mutatorName: state.mutator?.name || 'Unknown mutator',
        rosterSize: state.mutator?.rosterSize || state.streams?.length || 0,
      };
      return { ...base, score: scoreRun(base) };
    },
    get recorded() { return recorded; },
  };
}

/** Score favors sustained survival and engagement, with risk/cash as modifiers. */
export function scoreRun(entry) {
  return Math.max(0, Math.round(
    entry.totalEngagement
    + entry.shiftsSurvived * 5000
    + entry.moneyEarned * 2
    + entry.reputation * 25
    - entry.tosBreaks * 500
    - entry.heat * 10,
  ));
}

/** Pure career-blob update, exported for the deterministic acceptance harness. */
export function updateCareer(career = {}, entry) {
  const history = [entry, ...validEntries(career.runHistory)]
    .filter((candidate, index, rows) => rows.findIndex((row) => row.id === candidate.id) === index)
    .slice(0, RUN_HISTORY_LIMIT);
  const leaderboard = [entry, ...validEntries(career.leaderboard)]
    .filter((candidate, index, rows) => rows.findIndex((row) => row.id === candidate.id) === index)
    .sort(compareRuns)
    .slice(0, LEADERBOARD_LIMIT);
  const dailyBest = { ...(career.dailyBest || {}) };
  if (entry.mode === 'daily' && entry.dailyKey) {
    const previous = dailyBest[entry.dailyKey];
    if (!previous || compareRuns(entry, previous) < 0) dailyBest[entry.dailyKey] = entry;
  }

  return {
    ...career,
    runs: Math.max(0, Number(career.runs) || 0) + 1,
    bestRunScore: Math.max(Number(career.bestRunScore) || 0, entry.score),
    bestEngagement: Math.max(Number(career.bestEngagement) || 0, entry.peakEngagement),
    lifetimeEngagement: Math.max(0, Number(career.lifetimeEngagement) || 0) + entry.totalEngagement,
    lifetimeShifts: Math.max(0, Number(career.lifetimeShifts) || 0) + entry.shiftsSurvived,
    runHistory: history,
    leaderboard,
    dailyBest,
  };
}

/** Mount once, immediately after store.load() and before leaderboard UI. */
export function mountPersistence(config = getRunConfig()) {
  const initial = store.getState();
  initializeRun(initial, config);
  const tracker = createRunTracker({ config, startingMoney: initial.money || 0 });
  const observe = (state) => {
    const entry = tracker.observe(state);
    if (!entry) return;
    state.career = updateCareer(state.career, entry);
    store.persist();
  };
  observe(initial);
  store.subscribe(observe, (state) => [
    state.shift,
    state.phase,
    state.engagement,
    state.money,
    state.reputation,
    state.heat,
    state.tosBreaksThisShift,
  ]);
  return tracker;
}

function guaranteeTag(selected, directory, tag) {
  if (selected.some((stream) => stream.tags.includes(tag))) return;
  const replacement = directory.find((stream) => (
    !selected.some((candidate) => candidate.id === stream.id)
    && stream.tags.includes(tag)
  ));
  if (!replacement || selected.length === 0) return;
  const replaceAt = selected.findLastIndex((stream) => (
    !stream.tags.includes('stake') && !stream.tags.includes('wholesome')
  ));
  selected[replaceAt >= 0 ? replaceAt : selected.length - 1] = replacement;
}

function jitterStream(stream, rng) {
  const jitter = () => 0.85 + rng.next() * 0.3;
  return {
    ...stream,
    tags: [...stream.tags],
    viewers: Math.max(1, Math.round(stream.viewers * jitter())),
    riskRate: Number((stream.riskRate * jitter()).toFixed(4)),
    jackpotChance: Number(Math.min(1, stream.jackpotChance * jitter()).toFixed(6)),
  };
}

function validEntries(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string') : [];
}

function compareRuns(a, b) {
  return (b.score || 0) - (a.score || 0)
    || (b.shiftsSurvived || 0) - (a.shiftsSurvived || 0)
    || (b.totalEngagement || 0) - (a.totalEngagement || 0)
    || String(a.finishedAt).localeCompare(String(b.finishedAt));
}

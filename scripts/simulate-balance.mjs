// Deterministic Phase 2 balance smoke test.
// Drives the real store + engine tick loop with a competent curator heuristic:
// keep sponsor coverage, fill the strongest available streams, and pull near
// the top of the safe window. No DOM or wall-clock timer is involved.
import { readFile } from 'node:fs/promises';
import { store } from '../src/state/store.js';
import { tick } from '../src/engine/clock.js';

const RUNS = 24;
const SHIFTS = 10;
const PULL_AT = 0.82;

const [streams, threads, rules, sponsors] = await Promise.all([
  readJson(new URL('../src/data/streams.json', import.meta.url)),
  readJson(new URL('../src/data/dms.json', import.meta.url)),
  readJson(new URL('../src/data/tos-rules.json', import.meta.url)),
  readJson(new URL('../src/data/sponsors.json', import.meta.url)),
]);

// Sprint 3: two passes — a no-perk baseline and an all-perks endgame check.
// 'won' counts as a clear (victory at rules.wonAtShift, endless after).
const ALL_PERKS = { risk_xray: true, auto_pull: true, heat_scrubber: true, extra_slot: true };

const baseline = simulate({ perks: null, label: 'no perks (baseline skill)' });
const perked = simulate({ perks: ALL_PERKS, label: 'all perks (meta endgame)' });
let wins = 0;

function simulate({ perks, label }) {
  const rows = Array.from({ length: SHIFTS }, (_, i) => ({
    shift: i + 1, attempts: 0, clears: 0, engagement: 0, quota: 0, breaks: 0,
  }));
  let winCount = 0;

  for (let seed = 1; seed <= RUNS; seed += 1) {
    store.load({ streams, threads, rules, sponsors, seed });
    if (perks) store.getState().perks = { ...perks };
    store.dispatch({ type: 'START_SHIFT' });

    for (let day = 0; day < SHIFTS; day += 1) {
      const row = rows[day];
      row.attempts += 1;

      while (store.getState().phase === 'playing') {
        curate();
        tick();
      }

      const state = store.getState();
      row.engagement += state.engagement;
      row.quota = state.quota;
      row.breaks += state.tosBreaksThisShift;

      const cleared = state.phase === 'shift_end' || state.phase === 'won';
      if (state.phase === 'won') winCount += 1;
      if (!cleared) break;
      row.clears += 1;
      if (state.phase === 'won') break; // victory — stop this run's tally at the win
      store.dispatch({ type: 'ADVANCE_SHIFT' });
      store.dispatch({ type: 'SET_RUNNING', payload: { running: true } });
    }
  }

  console.log(`\n=== ${label} — ${RUNS} runs, win at shift ${rules.wonAtShift ?? 10} ===`);
  console.table(rows.map((row) => ({
    shift: row.shift,
    attempts: row.attempts,
    clearRate: row.attempts ? `${Math.round((row.clears / row.attempts) * 100)}%` : '—',
    avgEngagement: row.attempts ? Math.round(row.engagement / row.attempts) : 0,
    quota: row.quota,
    avgTosBreaks: row.attempts ? (row.breaks / row.attempts).toFixed(2) : '0.00',
  })));
  console.log(`wins (reached shift ${rules.wonAtShift ?? 10}): ${winCount}/${RUNS}`);
  return { rows, winCount };
}

wins = perked.winCount;

// Health gates for the Sprint 3 gradient:
// 1) baseline skill still clears the first five shifts reliably;
// 2) baseline does NOT trivially win (skill ceiling stays meaningful);
// 3) the win is actually reachable with full perks.
const firstFiveHealthy = baseline.rows.slice(0, 5).every((row) => row.clears / row.attempts >= 0.8);
if (!firstFiveHealthy) {
  console.error('Balance check failed: baseline should clear each of the first five shifts >=80%.');
  process.exitCode = 1;
}
if (baseline.winCount > RUNS * 0.5) {
  console.error('Balance check failed: no-perk baseline wins too easily — tighten the curve.');
  process.exitCode = 1;
}
if (wins === 0) {
  console.error('Balance check failed: the shift-10 win must be reachable with all perks.');
  process.exitCode = 1;
}

function curate() {
  let state = store.getState();

  for (const stream of featured(state)) {
    if (stream.risk / stream.tosThreshold >= PULL_AT) {
      store.dispatch({ type: 'PULL_STREAM', payload: { streamId: stream.id } });
    }
  }

  state = store.getState();
  if (!featured(state).some((stream) => stream.isStake)) {
    const sponsor = available(state)
      .filter((stream) => stream.isStake)
      .sort((a, b) => score(b) - score(a))[0];
    if (sponsor) promoteCompatibly(sponsor);
  }

  state = store.getState();
  if (!featured(state).some(isWholesome)) {
    const wholesome = available(state)
      .filter(isWholesome)
      .sort((a, b) => score(b) - score(a))[0];
    if (wholesome) promoteCompatibly(wholesome);
  }

  while (store.getState().frontPage.includes(null)) {
    state = store.getState();
    const candidates = available(state).sort((a, b) => score(b) - score(a));
    let placed = false;
    for (const candidate of candidates) {
      if (promoteCompatibly(candidate, false)) {
        placed = true;
        break;
      }
    }
    if (!placed && candidates[0]) promoteCompatibly(candidates[0], true);
    if (!placed && !candidates[0]) break;
  }
}

function featured(state) {
  return state.streams.filter((stream) => stream.state === 'featured');
}

function available(state) {
  return state.streams.filter((stream) => (
    stream.state !== 'featured'
    && stream.state !== 'banned'
    && stream.cooldown === 0
    && stream.risk / stream.tosThreshold < PULL_AT
  ));
}

function score(stream) {
  const engagement = (stream.viewers / 1000) * (1 + stream.controversy / 100);
  const jackpot = stream.jackpotChance * stream.jackpotPayout * 0.5;
  return engagement + jackpot;
}

function promoteCompatibly(stream, allowConflict = true) {
  const state = store.getState();
  const emptySlots = state.frontPage
    .map((id, slot) => (id == null ? slot : -1))
    .filter((slot) => slot !== -1);
  const slot = emptySlots.find((candidate) => !createsSponsorConflict(state, stream, candidate))
    ?? (allowConflict ? emptySlots[0] : undefined);
  if (slot == null) return false;
  store.dispatch({ type: 'PROMOTE_STREAM', payload: { streamId: stream.id, slot } });
  return true;
}

function createsSponsorConflict(state, stream, slot) {
  if (!stream.isGambling && !isWholesome(stream)) return false;
  return [slot - 1, slot + 1].some((neighbor) => {
    const neighborId = state.frontPage[neighbor];
    const other = neighborId && state.streams.find((item) => item.id === neighborId);
    if (!other) return false;
    return (stream.isGambling && isWholesome(other))
      || (isWholesome(stream) && other.isGambling);
  });
}

function isWholesome(stream) {
  return stream.tags.includes('wholesome');
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

// WS-K deterministic roster + mutator acceptance checks.
import { readFile } from 'node:fs/promises';
import { makeRng } from '../src/engine/rng.js';
import {
  createRunTracker,
  mountPersistence,
  orderStreamsForRun,
} from '../src/engine/persistence.js';
import {
  getMutatorDefinitions,
  initializeRun,
  selectMutator,
  step as stepMutator,
} from '../src/engine/mutators.js';
import { store } from '../src/state/store.js';
import { mountShiftOverlay } from '../src/ui/shift-overlay.js';
import { mountLeaderboard } from '../src/ui/leaderboard.js';

const [streams, threads, sponsors] = await Promise.all([
  readJson('../src/data/streams.json'),
  readJson('../src/data/dms.json'),
  readJson('../src/data/sponsors.json'),
]);

checkRosterDeterminism();
checkDifferentSeeds();
checkOneTimeEffects();
checkCrackdownTickEffects();
checkRunArchiveMetadata();
checkRenderedSurfaces();

console.log('WS-K mutator checks: OK');

function checkRosterDeterminism() {
  const config = { mode: 'daily', dailyKey: '2030-01-02', seed: 0xc0ffee };
  const first = orderStreamsForRun(streams, config);
  const second = orderStreamsForRun(streams, config);
  assert(JSON.stringify(first) === JSON.stringify(second), 'daily roster/jitter did not reproduce');
  assert(first.length >= 16 && first.length <= 18, `roster size ${first.length} outside 16–18`);
  assert(first.some((stream) => stream.tags.includes('stake')), 'roster lacks Stake inventory');
  assert(first.some((stream) => stream.tags.includes('wholesome')), 'roster lacks wholesome inventory');
  assert(selectMutator(config.seed).id === selectMutator(config.seed).id, 'daily mutator did not reproduce');

  const authored = new Map(streams.map((stream) => [stream.id, stream]));
  for (const stream of first) {
    const original = authored.get(stream.id);
    assert(withinJitter(stream.viewers, original.viewers, 1), `${stream.id} viewer jitter out of range`);
    assert(withinJitter(stream.riskRate, original.riskRate, 0.0001), `${stream.id} risk jitter out of range`);
    if (original.jackpotChance > 0) {
      assert(withinJitter(stream.jackpotChance, original.jackpotChance, 0.000001), `${stream.id} jackpot jitter out of range`);
    }
  }
}

function checkDifferentSeeds() {
  const firstSeed = 11;
  const firstRoster = orderStreamsForRun(streams, { mode: 'standard', seed: firstSeed });
  const firstMutator = selectMutator(firstSeed);
  let comparison = null;
  for (let seed = firstSeed + 1; seed < 1000; seed += 1) {
    const roster = orderStreamsForRun(streams, { mode: 'standard', seed });
    const mutator = selectMutator(seed);
    if (mutator.id !== firstMutator.id && roster.map((stream) => stream.id).join() !== firstRoster.map((stream) => stream.id).join()) {
      comparison = { seed, roster, mutator };
      break;
    }
  }
  assert(comparison, 'could not find distinct seeded roster + mutator');
}

function checkOneTimeEffects() {
  for (const definition of getMutatorDefinitions()) {
    const state = baseState(700 + definition.id.length);
    const before = snapshot(state);
    initializeRun(state, { seed: state.seed }, definition.id);
    assert(state.mutator.id === definition.id, `${definition.id} was not installed`);
    // storyThread contacts (WS-N, CONTRACTS v13) have no stream and are exempt
    // from roster filtering by design.
    assert(state.threads.every((thread) => thread.storyThread || state.streams.some((stream) => stream.streamerId === thread.streamerId)), `${definition.id} left an off-roster DM`);

    if (definition.id === 'gold_rush') {
      assert(state.streams.every((stream, index) => stream.jackpotChance === Number(Math.min(1, before.streams[index].jackpotChance * 2).toFixed(6))), 'Gold Rush jackpot odds');
      assert(state.streams.every((stream, index) => stream.jackpotPayout === Math.round(before.streams[index].jackpotPayout * 1.5)), 'Gold Rush payout');
    }
    if (definition.id === 'drama_week') {
      assert(state.streams.every((stream, index) => stream.controversy === Math.min(100, before.streams[index].controversy + 20)), 'Drama Week controversy');
    }
    if (definition.id === 'sponsor_war') {
      assert(state.sponsors.every((sponsor, index) => sponsor.payoutPerShift === before.sponsors[index].payoutPerShift * 2), 'Sponsor War payout');
      assert(state.sponsors.every((sponsor, index) => sponsor.failTicks === Math.max(1, Math.round(before.sponsors[index].failTicks * 0.5))), 'Sponsor War patience');
    }
    if (definition.id === 'slow_news_day') {
      assert(state.quota === Math.round(before.quota * 0.8), 'Slow News Day quota');
      assert(state.streams.every((stream, index) => stream.viewers === Math.round(before.streams[index].viewers * 0.75)), 'Slow News Day viewers');
    }
  }
}

function checkCrackdownTickEffects() {
  const cooling = baseState(909);
  initializeRun(cooling, { seed: cooling.seed }, 'crackdown');
  cooling.heat = 49.6; // audit.js normally cooled 0.4 from last tick's 50
  cooling.mutator.runtime.lastHeat = 50;
  cooling.rng = { chance: () => false };
  stepMutator(cooling);
  assert(Math.abs(cooling.heat - 49.86) < 0.000001, `Crackdown cooling expected 49.86, got ${cooling.heat}`);

  const audit = baseState(910);
  initializeRun(audit, { seed: audit.seed }, 'crackdown');
  const offender = audit.streams[0];
  offender.risk = 80;
  offender.state = 'featured';
  audit.frontPage[0] = offender.id;
  audit.heat = 50;
  audit.mutator.runtime.lastHeat = 50;
  audit.engagement = 1000;
  audit.rng = { chance: () => true };
  stepMutator(audit);
  assert(offender.state === 'pulled' && audit.frontPage[0] === null, 'Crackdown extra audit did not pull offender');
  assert(audit.mutator.runtime.extraAudits === 1, 'Crackdown extra audit was not counted');
}

function checkRunArchiveMetadata() {
  const state = baseState(1111);
  initializeRun(state, { seed: state.seed }, 'gold_rush');
  const tracker = createRunTracker({
    config: { mode: 'standard', dailyKey: null, seed: state.seed },
    startedAt: '2030-01-01T00:00:00.000Z',
    now: () => new Date('2030-01-01T00:01:00.000Z'),
  });
  state.phase = 'fired';
  state.failureReason = 'quota';
  state.engagement = 1234;
  const entry = tracker.observe(state);
  assert(entry.mutatorId === 'gold_rush' && entry.mutatorName === 'Gold Rush', 'run entry lacks mutator identity');
  assert(entry.rosterSize >= 16 && entry.rosterSize <= 18, 'run entry lacks roster size');
}

function checkRenderedSurfaces() {
  const overlayRoot = fakeRoot();
  const leaderboardRoot = fakeRoot();
  const listeners = {};
  globalThis.document = {
    getElementById(id) {
      if (id === 'shiftOverlay') return overlayRoot;
      if (id === 'leaderboardSlot') return leaderboardRoot;
      return null;
    },
  };
  globalThis.window = {
    addEventListener(name, listener) { listeners[name] = listener; },
  };

  const config = { mode: 'daily', dailyKey: '2030-01-02', seed: 2222 };
  store.load({
    streams: orderStreamsForRun(streams, config),
    threads,
    sponsors,
    seed: config.seed,
  });
  mountPersistence(config);
  const state = store.getState();
  store.dispatch({ type: 'START_SHIFT' });
  store.dispatch({ type: 'SET_RUNNING', payload: { running: false } });
  mountShiftOverlay();
  assert(overlayRoot.innerHTML.includes("THIS RUN'S RULE"), 'briefing lacks mutator label');
  assert(overlayRoot.innerHTML.toLowerCase().includes(state.mutator.name.toLowerCase()), 'briefing lacks mutator name');
  assert(overlayRoot.innerHTML.includes(`${state.streams.length} seeded live channels`), 'briefing lacks roster size');

  const entry = {
    id: 'daily:2222:test', mode: 'daily', dailyKey: config.dailyKey, seed: config.seed,
    startedAt: '2030-01-02T00:00:00.000Z', finishedAt: '2030-01-02T00:01:00.000Z',
    result: 'fired', failureReason: 'quota', score: 12345, shiftsSurvived: 2,
    totalEngagement: 9000, peakEngagement: 5000, money: 100, moneyEarned: 100,
    reputation: 55, heat: 20, tosBreaks: 1, rosterSize: state.streams.length,
    mutatorId: state.mutator.id, mutatorName: state.mutator.name,
  };
  state.career = { leaderboard: [entry], runHistory: [entry], dailyBest: { [config.dailyKey]: entry } };
  mountLeaderboard(config);
  listeners['kickstaff:career-open']();
  assert(leaderboardRoot.innerHTML.includes(state.mutator.name), 'career ledger lacks mutator name');
  assert(leaderboardRoot.innerHTML.includes('seed 0001PQ'), 'career history lacks reproducible seed label');
  assert(leaderboardRoot.innerHTML.includes('data-career-reset'), 'career ledger lacks reset control');
}

function baseState(seed) {
  return {
    seed,
    phase: 'playing',
    shift: 1,
    streams: orderStreamsForRun(streams, { mode: 'standard', seed }),
    threads: structuredClone(threads),
    sponsors: structuredClone(sponsors),
    frontPage: new Array(5).fill(null),
    quota: 2500,
    engagement: 0,
    reputation: 60,
    heat: 0,
    tosBreaksThisShift: 0,
    mutator: null,
    rng: makeRng(seed),
  };
}

function snapshot(state) {
  return structuredClone({ streams: state.streams, sponsors: state.sponsors, quota: state.quota });
}

function withinJitter(actual, original, epsilon) {
  return actual >= original * 0.85 - epsilon && actual <= original * 1.15 + epsilon;
}

function fakeRoot() {
  return {
    hidden: true,
    dataset: {},
    innerHTML: '',
    querySelector: () => null,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  return JSON.parse(await readFile(url, 'utf8'));
}

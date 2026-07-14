import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear(),
};

const {
  dailyKey,
  dailySeed,
  getRunConfig,
  mountPersistence,
  orderStreamsForRun,
  updateCareer,
} = await import('../src/engine/persistence.js');
const { selectMutator } = await import('../src/engine/mutators.js');
const { buildChallengeUrl, copyText, makeShareText } = await import('../src/ui/share.js');
const { store } = await import('../src/state/store.js');

const day = new Date('2026-07-14T18:30:00.000Z');
const sameDay = new Date('2026-07-14T23:59:59.000Z');
const nextDay = new Date('2026-07-15T00:00:00.000Z');
assert.equal(dailyKey(day), '2026-07-14');
assert.equal(dailySeed(day), dailySeed(sameDay), 'same UTC day must share a seed');
assert.notEqual(dailySeed(day), dailySeed(nextDay), 'next UTC day must change the seed');

// WS-O challenge URLs override the clock/date without changing the selected mode.
const challengeA = getRunConfig('?seed=123456789', day);
const challengeB = getRunConfig('?seed=123456789', nextDay);
assert.deepEqual(challengeA, challengeB, 'explicit standard challenge seed must ignore launch time');
assert.equal(challengeA.seed, 123456789);
const dailyChallenge = getRunConfig('?mode=daily&seed=123456789', nextDay);
assert.equal(dailyChallenge.mode, 'daily');
assert.equal(dailyChallenge.seed, challengeA.seed, 'explicit seed must override the daily seed');
assert.equal(getRunConfig('?seed=4294967295', day).seed, 0xffffffff, 'maximum uint32 seed must work');
assert.equal(getRunConfig('?seed=-1', day).seed, day.getTime() >>> 0, 'signed seeds must fall back');
assert.equal(getRunConfig('?seed=4294967296', day).seed, day.getTime() >>> 0, 'overflow seeds must fall back');

const dailyA = getRunConfig('?mode=daily', day);
const dailyB = getRunConfig('?mode=daily', sameDay);
assert.deepEqual(dailyA, dailyB, 'same-day daily configs must be identical');
const sampleStreams = Array.from({ length: 12 }, (_, index) => ({ id: `s${index}` }));
const orderA = orderStreamsForRun(sampleStreams, dailyA).map((stream) => stream.id);
const orderB = orderStreamsForRun(sampleStreams, dailyB).map((stream) => stream.id);
assert.deepEqual(orderA, orderB, 'same-day daily directory must be identical');
// WS-K (Sprint 3) made EVERY run a seeded roster: 16–18 stream subset (capped
// by the authored pool) with ±15% jitter. The old "standard runs keep authored
// order" contract is gone; what must hold now is determinism + subset validity.
const stdConfig = getRunConfig('', day); // standard seeds are time-derived — reuse ONE config
const stdA = orderStreamsForRun(sampleStreams, stdConfig).map((stream) => stream.id);
const stdB = orderStreamsForRun(sampleStreams, stdConfig).map((stream) => stream.id);
assert.deepEqual(stdA, stdB, 'same-seed standard runs must produce the same roster');
const authoredIds = new Set(sampleStreams.map((stream) => stream.id));
assert.ok(stdA.every((id) => authoredIds.has(id)), 'roster must be drawn from authored streams');
assert.ok(new Set(stdA).size === stdA.length, 'roster must not repeat streams');
assert.ok(stdA.length <= Math.min(sampleStreams.length, 18), 'roster must respect the size cap');
const challengeRosterA = orderStreamsForRun(sampleStreams, challengeA);
const challengeRosterB = orderStreamsForRun(sampleStreams, challengeB);
assert.deepEqual(challengeRosterA, challengeRosterB, 'challenge URL must reproduce roster order and jitter');
assert.equal(
  selectMutator(challengeA.seed)?.id,
  selectMutator(challengeB.seed)?.id,
  'challenge URL must reproduce the mutator',
);

const pagesUrl = buildChallengeUrl(challengeA.seed, 'standard', 'https://crackytests.github.io/kss/?mode=daily#old');
assert.equal(pagesUrl, 'https://crackytests.github.io/kss/?seed=123456789', 'challenge URL must retain the Pages subpath');
const dailyPagesUrl = buildChallengeUrl(challengeA.seed, 'daily', 'https://crackytests.github.io/kss/');
assert.equal(dailyPagesUrl, 'https://crackytests.github.io/kss/?mode=daily&seed=123456789');
const shareText = makeShareText({
  mode: 'standard', seed: challengeA.seed, result: 'won', shiftsSurvived: 3,
  shiftReached: 3, endingTitle: 'Made CEO', money: 325, score: 9876,
  shiftMarks: ['✅', '💥', '🏆'],
}, { challengeUrl: pagesUrl });
assert.ok(shareText.includes('Made CEO'), 'share card must include the story ending');
assert.ok(shareText.includes('01 ✅\n02 💥\n03 🏆'), 'share card must include one emoji row per shift');
assert.ok(shareText.includes(pagesUrl), 'share card must include the challenge URL');

let clipboardValue = '';
assert.equal(await copyText('clipboard path', {
  navigatorRef: { clipboard: { writeText: async (value) => { clipboardValue = value; } } },
}), 'clipboard');
assert.equal(clipboardValue, 'clipboard path', 'Clipboard API must receive the complete text');
let selectedFallback = false;
const fallbackTextarea = {
  value: '',
  focus() {},
  select() { selectedFallback = true; },
  setSelectionRange() {},
};
assert.equal(await copyText('fallback path', {
  navigatorRef: {},
  documentRef: { execCommand: (command) => command === 'copy' },
  fallbackTextarea,
}), 'fallback');
assert.equal(fallbackTextarea.value, 'fallback path');
assert.equal(selectedFallback, true, 'textarea fallback must select the complete text');

// Full store/localStorage round-trip: terminal commit -> career blob -> reload.
store.load({ streams: sampleStreams, seed: dailyA.seed });
mountPersistence(dailyA);
store.dispatch({ type: 'START_SHIFT' });
const state = store.getState();
state.tick = 41;
state.phase = 'fired';
state.running = false;
state.failureReason = 'sponsor';
state.engagement = 1875;
state.money = 325;
state.reputation = 22;
state.heat = 67;
state.tosBreaksThisShift = 2;
store.commit();

const saved = JSON.parse(memory.get('kickstaff.career.v1'));
assert.equal(saved.runs, 1);
assert.equal(saved.runHistory.length, 1);
assert.equal(saved.leaderboard.length, 1);
assert.equal(saved.runHistory[0].mode, 'daily');
assert.equal(saved.runHistory[0].dailyKey, '2026-07-14');
assert.equal(saved.runHistory[0].failureReason, 'sponsor');
assert.equal(saved.runHistory[0].totalEngagement, 1875);
assert.equal(saved.runHistory[0].moneyEarned, 325);
assert.equal(saved.dailyBest['2026-07-14'].id, saved.runHistory[0].id);

store.load({ streams: sampleStreams, seed: 99 });
assert.equal(store.getState().career.runHistory[0].id, saved.runHistory[0].id, 'entry must survive reload');
assert.equal(store.getState().money, 325, 'career bank must survive reload');

// Ranking/retention stay bounded and deterministic.
let career = {};
for (let index = 0; index < 25; index += 1) {
  const entry = {
    ...saved.runHistory[0],
    id: `run-${index}`,
    mode: 'standard',
    dailyKey: null,
    finishedAt: new Date(day.getTime() + index * 1000).toISOString(),
    score: index * 100,
    shiftsSurvived: index % 6,
  };
  career = updateCareer(career, entry);
}
assert.equal(career.runs, 25);
assert.equal(career.runHistory.length, 20);
assert.equal(career.leaderboard.length, 10);
assert.equal(career.leaderboard[0].score, 2400);
assert.equal(career.runHistory[0].id, 'run-24');

console.log('Persistence checks: OK');

// Fast engine/store invariants for terminal states and cross-shift progression.
import { readFile } from 'node:fs/promises';
import { store } from '../src/state/store.js';
import { tick } from '../src/engine/clock.js';
import { groupConversations } from '../src/ui/discord.js';

const [streams, threads, rules] = await Promise.all([
  readJson(new URL('../src/data/streams.json', import.meta.url)),
  readJson(new URL('../src/data/dms.json', import.meta.url)),
  readJson(new URL('../src/data/tos-rules.json', import.meta.url)),
]);
const authoredThreadsSnapshot = JSON.stringify(threads);

checkSponsorFailure();
checkReputationFailure();
checkTosLimitFailure();
checkFinalTickPrecedence();
checkDifficultyAdvance();
checkDmConversations();
checkCareerReset();
assert(JSON.stringify(threads) === authoredThreadsSnapshot, 'store hydration mutated authored DM data');

console.log('Integration checks: OK');

function checkSponsorFailure() {
  reset(101);
  for (let i = 0; i < rules.sponsorFailTicks; i += 1) tick();
  assertState('sponsor failure', { phase: 'fired', failureReason: 'sponsor', tick: 20 });
}

function checkReputationFailure() {
  reset(102);
  store.getState().reputation = 0;
  tick();
  assertState('reputation failure', { phase: 'fired', failureReason: 'reputation' });
}

function checkTosLimitFailure() {
  reset(103);
  const state = store.getState();
  state.tosBreaksThisShift = state.maxTosBreaksPerShift - 1;
  const stream = state.streams.find((item) => !item.isStake);
  stream.risk = stream.tosThreshold - 0.01;
  store.dispatch({ type: 'PROMOTE_STREAM', payload: { streamId: stream.id, slot: 0 } });
  tick();
  assertState('TOS-limit failure', {
    phase: 'fired',
    failureReason: 'tos_limit',
    tosBreaksThisShift: rules.maxTosBreaksPerShift,
  });
}

function checkFinalTickPrecedence() {
  reset(104);
  const state = store.getState();
  state.tick = state.ticksPerShift - 1;
  state.ticksNoStake = rules.sponsorFailTicks - 1;
  state.engagement = state.quota * 2;
  tick();
  assertState('final-tick sponsor precedence', {
    phase: 'fired',
    failureReason: 'sponsor',
    tick: state.ticksPerShift,
  });
}

function checkDifficultyAdvance() {
  reset(105);
  const state = store.getState();
  const startingRiskRate = state.streams[0].riskRate;
  const startingViewers = state.streams[0].viewers;
  const startingQuota = state.quota;
  state.phase = 'shift_end';
  state.running = false;
  store.dispatch({ type: 'ADVANCE_SHIFT' });
  const next = store.getState();
  assert(next.shift === 2, 'difficulty advance: shift');
  // Derive from rules — quota/viewer growth are tunable knobs (S3.0).
  assert(next.quota === Math.round(startingQuota * rules.quotaGrowthPerShift), 'difficulty advance: quota');
  assert(next.running === false && next.tick === 0, 'difficulty advance: paused briefing');
  assert(
    next.streams[0].riskRate === Number((startingRiskRate * rules.riskRateGrowthPerShift).toFixed(4)),
    'difficulty advance: risk rate',
  );
  assert(
    next.streams[0].viewers === Math.round(startingViewers * (rules.viewerGrowthPerShift ?? 1)),
    'difficulty advance: audience inflation (S3.0)',
  );
  assert(next.threads.every((thread) => !thread._arrived), 'difficulty advance: prior-shift DMs must archive immediately');
  store.dispatch({ type: 'SET_RUNNING', payload: { running: true } });
  tick();
  const immediate = next.threads.find((thread) => !thread.hidden && (thread.arrivesAt ?? 0) === 0);
  assert(immediate?._arrived, 'difficulty advance: current-shift DMs must redeliver on the first tick');
}

function checkDmConversations() {
  const state = { shift: 1 };
  const grouped = groupConversations([
    {
      id: 'dm_parent', streamerId: 'same-person', name: 'Same Person',
      _arrived: true, hidden: false, unread: false,
      messages: [{ from: 'them', text: 'opening' }], choices: [],
    },
    {
      id: 'dm_continuation', streamerId: 'same-person', name: 'Same Person',
      _arrived: true, hidden: false, unread: true,
      messages: [{ from: 'them', text: 'continuation' }], choices: [{ label: 'reply' }],
    },
    {
      id: 'dm_other', streamerId: 'someone-else', name: 'Someone Else',
      _arrived: true, hidden: false, unread: false,
      messages: [{ from: 'them', text: 'separate' }], choices: [],
    },
  ], state);
  assert(grouped.length === 2, 'DM grouping: one person should produce one tab');
  const samePerson = grouped.find((conversation) => conversation.streamerId === 'same-person');
  assert(samePerson?.threads.length === 2, 'DM grouping: continuation must stay in its sender tab');
  assert(samePerson?.messages.map((message) => message.text).join('|') === 'opening|continuation', 'DM grouping: combined history order');
  assert(samePerson?.unread, 'DM grouping: grouped tab must inherit unread state');
}

function checkCareerReset() {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: (key) => saved.delete(key),
  };
  localStorage.setItem('kickstaff.career.v1', JSON.stringify({
    bank: 4200,
    muted: true,
    perks: { legal_shield: true },
    relationships: { slotking: 50 },
    runHistory: [{ id: 'old-run' }],
  }));
  store.load({ streams, threads, rules, seed: 106 });
  const loaded = store.getState();
  assert(loaded.money === 4200 && loaded.muted, 'career reset setup did not hydrate save');
  store.resetCareer();
  const reset = store.getState();
  assert(localStorage.getItem('kickstaff.career.v1') === null, 'career save key was not removed');
  assert(reset.money === 0 && !reset.muted, 'career money/settings were not reset');
  assert(Object.keys(reset.perks).length === 0, 'career perks were not reset');
  assert(Object.keys(reset.relationships).length === 0, 'career relationships were not reset');
  assert(Object.keys(reset.career).length === 0, 'career history was not reset');
  delete globalThis.localStorage;
}

function reset(seed) {
  store.load({ streams, threads, rules, seed });
  store.dispatch({ type: 'START_SHIFT' });
}

function assertState(label, expected) {
  const state = store.getState();
  for (const [key, value] of Object.entries(expected)) {
    assert(state[key] === value, `${label}: expected ${key}=${value}, got ${state[key]}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

// WS-N (Sprint 5) story-layer checks: ending selection rules, investigation
// beat mechanics, and ticker/reveal plumbing — against the real store + engine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { store } from '../src/state/store.js';
import * as story from '../src/engine/story.js';

const storyRules = JSON.parse(await readFile(new URL('../src/data/story.json', import.meta.url), 'utf8'));
story._setRules(storyRules);

// ---- ending selection: all five reachable, correct precedence ----
const cases = [
  [{ phase: 'won', investigation: 20, storyFlags: {} }, 'ceo'],
  [{ phase: 'won', investigation: 80, storyFlags: {} }, 'indicted'],
  [{ phase: 'won', investigation: 80, storyFlags: { whistleblower: true } }, 'whistleblower'],
  [{ phase: 'fired', investigation: 70, storyFlags: {} }, 'scapegoat'],
  [{ phase: 'fired', investigation: 10, storyFlags: {} }, 'replaced'],
  [{ phase: 'fired', investigation: 10, storyFlags: { whistleblower: true } }, 'whistleblower'],
];
for (const [shape, expected] of cases) {
  const got = story.pickEnding(shape)?.id;
  assert.equal(got, expected, `ending for ${JSON.stringify(shape)} should be ${expected}, got ${got}`);
}

// ---- live mechanics: breaks raise investigation; beats fire once + reveal ----
store.load({ streams: [{ id: 's1', streamerId: 'a', title: 'x', viewers: 1000 }], threads: [
  { id: 'dm_journalist_1', streamerId: 'journalist', storyThread: true, name: 'petra', arrivesAt: 9999, messages: [], choices: [] },
], seed: 7 });
store.dispatch({ type: 'START_SHIFT' });
const state = store.getState();

store.pushEvent({ type: 'tos_break', tone: 'bad', message: 'test break', streamId: 's1' });
story.step(state);
assert.equal(state.investigation, storyRules.investigation.tosBreak, 'tos_break must raise investigation');
assert.ok(state.ticker.length >= 1, 'break should produce a headline');

state.investigation = 30; // past beat 25
story.step(state);
assert.ok(state.storyFlags._beat25, 'beat 25 must fire');
assert.ok(state.storyFlags.revealed_dm_journalist_1, 'beat 25 must reveal the journalist');
const thread = state.threads.find((t) => t.id === 'dm_journalist_1');
assert.ok(thread._arrived && thread.unread, 'revealed thread must be arrived + unread');

const flagsBefore = JSON.stringify(state.storyFlags);
story.step(state);
assert.equal(JSON.stringify(state.storyFlags), flagsBefore, 'beats must fire only once');

// clean-shift cooling on the final tick
state.tick = state.ticksPerShift;
state.tosBreaksThisShift = 0;
const invBefore = state.investigation;
story.step(state);
assert.ok(state.investigation < invBefore, 'clean shift must cool investigation');

// ticker stays capped
for (let i = 0; i < 30; i += 1) {
  state.tick = i; // dodge the cooling branch
  store.pushEvent({ type: 'tos_break', tone: 'bad', message: `b${i}`, streamId: 's1' });
  story.step(state);
}
assert.ok(state.ticker.length <= storyRules.tickerCap, 'ticker must stay capped');

console.log('Story checks: OK');

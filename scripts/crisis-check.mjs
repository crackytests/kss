// WS-P (Sprint 6) checks: PR crisis lifecycle + Clip Desk payout, against the
// real store + crisis engine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { store } from '../src/state/store.js';
import * as crisis from '../src/engine/crisis.js';

const rules = JSON.parse(await readFile(new URL('../src/data/crisis.json', import.meta.url), 'utf8'));
crisis._setRules(rules);

function freshState() {
  store.load({
    streams: [
      { id: 's1', streamerId: 'a', title: 'stream one', viewers: 40000 },
      { id: 's2', streamerId: 'b', title: 'stream two', viewers: 9000 },
    ],
    seed: 11,
  });
  store.dispatch({ type: 'START_SHIFT' });
  return store.getState();
}

// ---- spawn: one crisis per break, options baked with shift-scaled spin cost ----
let state = freshState();
state.money = 5000;
store.pushEvent({ type: 'tos_break', tone: 'bad', message: 'b1', streamId: 's1' });
store.pushEvent({ type: 'tos_break', tone: 'bad', message: 'b2', streamId: 's2' });
crisis.step(state);
assert.ok(state.crisis, 'a break must spawn a crisis');
assert.equal(state.crisis.streamId, 's1', 'first break wins');
assert.equal(state.crisis.options.length, rules.options.length + 1, 'options + ignore');
const spin = state.crisis.options.find((o) => o.id === 'spin');
const expectedCost = rules.spinCostBase + rules.spinCostPerShift * state.shift;
assert.equal(spin.effects.money, -expectedCost, 'spin cost must be baked at spawn');
assert.ok(spin.desc.includes(`$${expectedCost.toLocaleString()}`), 'spin desc must show the cost');

// ---- resolve: spin applies effects and clears ----
const moneyBefore = state.money;
const repBefore = state.reputation;
store.dispatch({ type: 'CRISIS_CHOOSE', payload: { optionId: 'spin' } });
assert.equal(state.money, moneyBefore - expectedCost, 'spin must charge');
assert.equal(state.reputation, Math.min(100, repBefore + 8), 'spin must recover reputation');
assert.equal(state.crisis, null, 'crisis must clear after a choice');
assert.equal(state.storyFlags.spinsUsed, 1, 'spinsUsed must increment');

// ---- expire: countdown runs out → ignore path through the same reducer ----
state = freshState();
store.pushEvent({ type: 'tos_break', tone: 'bad', message: 'b3', streamId: 's1' });
crisis.step(state);
assert.ok(state.crisis, 'crisis re-spawned');
const repBeforeIgnore = state.reputation;
state.tick = state.crisis.endsAt;
crisis.step(state);
assert.equal(state.crisis, null, 'expiry must clear the crisis');
assert.equal(state.reputation, Math.max(0, repBeforeIgnore - 5), 'ignore must cost reputation');
assert.equal(state.storyFlags.crisesIgnored, 1, 'crisesIgnored must increment');

// ---- sacrifice: relationship nuke against the crisis streamer ----
state = freshState();
store.pushEvent({ type: 'tos_break', tone: 'bad', message: 'b4', streamId: 's2' });
crisis.step(state);
store.dispatch({ type: 'CRISIS_CHOOSE', payload: { optionId: 'sacrifice' } });
assert.equal(state.relationships.b, -40, 'sacrifice must nuke the relationship');
assert.equal(state.storyFlags.sacrifices, 1);

// ---- clip desk: accuracy-scaled bonus, once per viral event, miss penalty ----
state = freshState();
state.frontPage[0] = 's1';
state.liveEvents.push({ id: 'lev1', defId: 'viral', streamIds: ['s1'], endsAt: 999, saved: {} });
const engBefore = state.engagement;
store.dispatch({ type: 'CLIP_ATTEMPT', payload: { streamId: 's1', accuracy: 1 } });
const expectedBonus = Math.round((40000 / 1000) * (0.5 + 1) * 2);
assert.equal(state.engagement, engBefore + expectedBonus, 'perfect clip must pay the canonical bonus');
assert.ok(state.liveEvents[0]._clipped, 'event must be marked clipped');
store.dispatch({ type: 'CLIP_ATTEMPT', payload: { streamId: 's1', accuracy: 1 } });
assert.equal(state.engagement, engBefore + expectedBonus, 'second attempt must be a no-op');

state.engagement = 100;
state.liveEvents.push({ id: 'lev2', defId: 'viral', streamIds: ['s1'], endsAt: 999, saved: {} });
store.dispatch({ type: 'CLIP_ATTEMPT', payload: { streamId: 's1', accuracy: 0.1 } });
assert.equal(state.engagement, 75, 'a botched clip must cost 25 engagement');

console.log('Crisis checks: OK');

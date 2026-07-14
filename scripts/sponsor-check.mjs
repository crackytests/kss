// WS-G acceptance harness: real store + tick loop, no DOM or wall clock.
import { readFile } from 'node:fs/promises';
import { store } from '../src/state/store.js';
import { tick } from '../src/engine/clock.js';

const [streams, streamers, threads, rules, sponsors] = await Promise.all([
  readJson(new URL('../src/data/streams.json', import.meta.url)),
  readJson(new URL('../src/data/streamers.json', import.meta.url)),
  readJson(new URL('../src/data/dms.json', import.meta.url)),
  readJson(new URL('../src/data/tos-rules.json', import.meta.url)),
  readJson(new URL('../src/data/sponsors.json', import.meta.url)),
]);

checkSpatialConflict();
checkNonTerminalDrop();
checkTerminalDrop();
checkProratedPayout();

console.log('Sponsor checks: OK');

function checkSpatialConflict() {
  reset(201);
  feature('st_slotking', 0);
  feature('st_cozycook', 1);
  tick();
  assert(runtime('stake').satisfied, 'Stake should be satisfied by its tagged stream');
  assert(!runtime('brightfizz').satisfied, 'BrightFizz should reject adjacent gambling');

  feature('st_cozycook', 4);
  tick();
  assert(runtime('stake').satisfied, 'Stake should remain satisfied after slot move');
  assert(runtime('brightfizz').satisfied, 'BrightFizz should recover when inventory is separated');
  assert(runtime('brightfizz').ticksUnsatisfied === 0, 'compliance should reset patience clock');
}

function checkNonTerminalDrop() {
  reset(202);
  disableJackpots();
  feature('st_slotking', 0);
  const contract = sponsor('brightfizz');
  for (let i = 0; i < contract.failTicks; i += 1) tick();
  assert(runtime('brightfizz').dropped, 'BrightFizz should drop after its patience expires');
  assert(store.getState().phase === 'playing', 'BrightFizz drop must not end the run');
  assert(store.getState().money === -contract.dropMoneyPenalty, 'BrightFizz drop should charge its authored penalty');
  assert(store.getState().reputation < 60, 'BrightFizz warnings/drop should cost reputation');
}

function checkTerminalDrop() {
  reset(203);
  const contract = sponsor('stake');
  for (let i = 0; i < contract.failTicks; i += 1) tick();
  assert(runtime('stake').dropped, 'Stake should drop after its patience expires');
  assert(store.getState().phase === 'fired', 'terminal Stake drop should fire the player');
  assert(store.getState().failureReason === 'sponsor', 'Stake drop should use sponsor failure reason');
}

function checkProratedPayout() {
  reset(204);
  disableJackpots();
  feature('st_slotking', 0);
  feature('st_cozycook', 4);
  const state = store.getState();
  state.engagement = state.quota * 2;
  state.tick = state.ticksPerShift - 1;
  tick();
  assert(runtime('stake').payoutEarned === 300, 'Stake should pay its full compliant contract');
  assert(runtime('brightfizz').payoutEarned === 500, 'BrightFizz should pay its full compliant contract');
  assert(store.getState().money === 1740, `expected $1740 total payout, got $${store.getState().money}`);
}

function reset(seed) {
  store.load({ streams, streamers, threads, rules, sponsors, seed });
  store.dispatch({ type: 'START_SHIFT' });
}

function disableJackpots() {
  for (const stream of store.getState().streams) stream.jackpotChance = 0;
}

function feature(streamId, slot) {
  store.dispatch({ type: 'PROMOTE_STREAM', payload: { streamId, slot } });
}

function sponsor(id) {
  return store.getState().sponsors.find((item) => item.id === id);
}

function runtime(id) {
  return sponsor(id).runtime;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

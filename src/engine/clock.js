// Tick scheduler + shift progression. Calls engine steppers in the fixed order
// events -> risk -> perks -> jackpot -> economy -> dm -> audit -> mutators,
// then commits. Events run FIRST so viewer/controversy changes are visible to
// every downstream engine this same tick; mutators run last as a catch-all hook.
// See docs/ARCHITECTURE.md. This file is the ONE integration point that knows
// the step order; WS agents implement the steppers behind the `step(state)`
// contract and never touch this order.

import { store } from '../state/store.js';
import * as events from './events.js';
import * as risk from './risk.js';
import * as perks from './perks.js';
import * as jackpot from './jackpot.js';
import * as economy from './economy.js';
import * as dm from './dm.js';
import * as story from './story.js';
import * as audit from './audit.js';
import * as mutators from './mutators.js';

const TICK_MS = 1000;
let timer = null;

export function tick() {
  const state = store.getState();
  if (state.phase !== 'playing' || !state.running) return;

  state.tick += 1;

  // Fixed engine order. Each step mutates state + pushes events.
  events.step(state);  // first: world moves before anything reads viewers/controversy
  risk.step(state);
  perks.step(state);   // after risk so auto-pull sees fresh risk, before a break
  jackpot.step(state);
  economy.step(state);
  dm.step(state);
  story.step(state);   // after dm: the plot reacts to DM outcomes this same tick (S5.0)
  audit.step(state);
  mutators.step(state); // last: run-modifier catch-all (WS-K)

  if (state.phase === 'playing' && state.reputation <= 0) {
    fire(state, 'reputation', 'Your reputation hit zero. HR killed your access and called it culture work.');
  } else if (
    state.phase === 'playing'
    && state.tosBreaksThisShift >= state.maxTosBreaksPerShift
  ) {
    fire(
      state,
      'tos_limit',
      `${state.tosBreaksThisShift} public TOS breaks in one shift. Management needs a poor bastard to sacrifice.`,
    );
  }

  // decay cooldowns for pulled streams
  for (const s of state.streams) if (s.cooldown > 0) s.cooldown -= 1;

  if (state.phase === 'playing' && state.tick >= state.ticksPerShift) endShift(state);

  store.commit();
}

function endShift(state) {
  state.running = false;
  events.clearAll(state); // revert live-event stat changes BEFORE payout/inflation (S3.0)
  store.persist(); // bank money + best-engagement at every shift boundary (S2.0)
  const passed = state.engagement >= state.quota
    && state.reputation > 0
    && state.tosBreaksThisShift < state.maxTosBreaksPerShift;
  if (!passed) {
    state.phase = 'fired';
    state.failureReason = 'quota';
    store.pushEvent({
      type: 'shift_end', tone: 'bad',
      message: `Shift ${state.shift} failed — ${state.engagement}/${state.quota} engagement. Pack your shit; you're fired.`,
    });
  } else if (state.shift >= state.wonAtShift && state.phase !== 'won') {
    // Victory: survive wonAtShift shifts. Endless scaling continues via ADVANCE_SHIFT.
    state.phase = 'won';
    store.pushEvent({
      type: 'shift_end', tone: 'good',
      message: `🏆 Shift ${state.shift} cleared — you survived the bloody quarter. Management is horrified, impressed, and taking credit. (Endless mode unlocked.)`,
    });
  } else {
    state.phase = 'shift_end';
    store.pushEvent({
      type: 'shift_end', tone: 'good',
      message: `Shift ${state.shift} cleared! ${state.engagement}/${state.quota} engagement. Somehow this shit worked.`,
    });
  }
}

function fire(state, reason, message) {
  state.phase = 'fired';
  state.running = false;
  state.failureReason = reason;
  store.persist(); // bank progress before the run ends (S2.0)
  store.pushEvent({ type: 'shift_end', tone: 'bad', message });
}

export function start() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
}

export function stop() {
  clearInterval(timer);
  timer = null;
}

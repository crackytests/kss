// FIRST-RUN TUTORIAL — WS-L (Sprint 4 Release Cut). Owned by lead.
// Six skippable steps that fire when the first briefing opens onto the board.
// shift (career.tutorialDone gates it forever after, via store.persist()).
// The clock stays paused throughout onboarding and remains paused afterward;
// the player deliberately presses Resume once their front page is ready.
// Pure chrome: highlights existing panes and never touches the simulation.
import { store } from '../state/store.js';

const STEPS = [
  {
    target: 'browse',
    title: 'The directory',
    text: 'The clock is paused, so set up without burning a second. Every stream here is a liability with a webcam. Hit **Feature** to put one on the front page.',
  },
  {
    target: 'frontpage',
    title: 'The front page',
    text: 'Fill your available slots before you start the clock. Featured streams print engagement — the number that keeps you employed. Watch the TOS risk meter. It only goes up.',
  },
  {
    target: 'frontpage',
    title: 'The pull',
    text: 'Pull a stream BEFORE the meter maxes or it breaks TOS live on your homepage: fines, heat, and your name on the incident report. The pros pull at the last safe tick.',
  },
  {
    target: 'frontpage',
    title: 'The sponsor',
    text: 'Stake requires a gambling stream featured AT ALL TIMES. When the degenerates hit a jackpot on your front page, you get a cut. Yes, that is the business model.',
  },
  {
    target: 'discord',
    title: 'The DMs',
    text: 'Streamers will slide in — begging, bribing, threatening. Choices move money, reputation, and heat… and they remember how you treated them. Good luck.',
  },
  {
    target: 'hud',
    title: 'Start when you’re ready',
    text: 'Finish setting up the front page, then press **▶ Resume** in the top bar. The timer, risk, and sponsor patience stay frozen until you do.',
  },
];

let stepIndex = -1; // -1 = not running
let armed = true;   // only attempt once per page load

export function mountTutorial() {
  store.subscribe(check);
}

function check(state) {
  if (stepIndex !== -1) {
    if (state.running) store.dispatch({ type: 'SET_RUNNING', payload: { running: false } });
    return;
  }
  if (!armed) return;
  if ((state.career || {}).tutorialDone) { armed = false; return; }
  // Fire only after the day-one briefing has dismissed into its paused setup
  // state. Boot also sits at tick 0, but the visible briefing guards that case.
  const overlay = document.getElementById('shiftOverlay');
  if (state.phase !== 'playing' || state.running || state.shift !== 1 || state.tick !== 0 || !overlay?.hidden) return;
  armed = false;
  stepIndex = 0;
  render();
}

function render() {
  const root = document.getElementById('tutorial');
  if (!root) return;
  clearHighlight();
  if (stepIndex < 0 || stepIndex >= STEPS.length) { root.hidden = true; return; }

  const step = STEPS[stepIndex];
  const target = document.getElementById(step.target);
  if (target) target.classList.add('tut-highlight');

  root.hidden = false;
  root.innerHTML = `
    <div class="tut-card" role="dialog" aria-label="Tutorial step ${stepIndex + 1} of ${STEPS.length}">
      <div class="tut-eyebrow">ONBOARDING ${stepIndex + 1}/${STEPS.length}</div>
      <h3>${step.title}</h3>
      <p>${step.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>
      <div class="tut-actions">
        <button data-tut-skip>Skip tutorial</button>
        <button class="primary" data-tut-next>${stepIndex === STEPS.length - 1 ? 'Got it — stay paused' : 'Next →'}</button>
      </div>
    </div>`;

  root.querySelector('[data-tut-next]').onclick = () => {
    stepIndex += 1;
    if (stepIndex >= STEPS.length) finish();
    else render();
  };
  root.querySelector('[data-tut-skip]').onclick = finish;
}

function finish() {
  stepIndex = -1;
  render();
  const state = store.getState();
  state.career = { ...(state.career || {}), tutorialDone: true };
  store.persist();
}

function clearHighlight() {
  for (const el of document.querySelectorAll('.tut-highlight')) el.classList.remove('tut-highlight');
}

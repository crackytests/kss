// FIRST-RUN TUTORIAL — WS-L (Sprint 4 Release Cut). Owned by lead.
// Five skippable steps that fire the first time a player actually starts a
// shift (career.tutorialDone gates it forever after, via store.persist()).
// The clock pauses while a step is up and resumes when the player finishes
// or skips. Pure chrome: highlights existing panes, dispatches only
// SET_RUNNING, never touches the sim.
import { store } from '../state/store.js';

const STEPS = [
  {
    target: 'browse',
    title: 'The directory',
    text: 'Every stream here is a liability with a webcam. Hit **Feature** to put one on the front page. Big viewers × big controversy = big engagement.',
  },
  {
    target: 'frontpage',
    title: 'The front page',
    text: 'Featured streams print engagement — the number that keeps you employed. Watch the TOS risk meter. It only goes up.',
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
];

let stepIndex = -1; // -1 = not running
let armed = true;   // only attempt once per page load

export function mountTutorial() {
  store.subscribe(check);
}

function check(state) {
  if (!armed || stepIndex !== -1) return;
  if ((state.career || {}).tutorialDone) { armed = false; return; }
  // Fire on the first REAL tick of shift 1 — not at boot, where START_SHIFT
  // briefly sets running=true before main.js pauses for the briefing.
  if (state.phase !== 'playing' || !state.running || state.shift !== 1 || state.tick < 1) return;
  armed = false;
  stepIndex = 0;
  store.dispatch({ type: 'SET_RUNNING', payload: { running: false } });
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
        <button class="primary" data-tut-next>${stepIndex === STEPS.length - 1 ? "Let's work →" : 'Next →'}</button>
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
  store.dispatch({ type: 'SET_RUNNING', payload: { running: true } });
}

function clearHighlight() {
  for (const el of document.querySelectorAll('.tut-highlight')) el.classList.remove('tut-highlight');
}

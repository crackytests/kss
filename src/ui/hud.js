// HUD — top bar meters + clock + controls. Renders from state, dispatches actions.
import { store } from '../state/store.js';

const el = () => document.getElementById('hud');

export function mountHud() {
  render(store.getState());
  store.subscribe(render);
}

function render(state) {
  const root = el();
  const pct = Math.min(100, Math.round((state.engagement / state.quota) * 100));
  root.innerHTML = `
    <div class="brand">KICK STAFF SIM<small>FEATURED PAGE // CURATOR TERMINAL</small></div>
    <div class="stat"><span class="lbl">Shift</span><b>${state.shift}</b></div>
    <div class="stat"><span class="lbl">Time</span><b>${state.tick}/${state.ticksPerShift}</b></div>
    <div class="stat"><span class="lbl">Engagement</span><b>${state.engagement} / ${state.quota} (${pct}%)</b></div>
    <div class="stat"><span class="lbl">Money</span><b>$${state.money.toLocaleString()}</b></div>
    <div class="stat"><span class="lbl">Reputation</span><b>${formatNumber(state.reputation)}</b></div>
    <div class="stat"><span class="lbl">Heat</span><b>${formatNumber(state.heat)}</b></div>
    <div class="hud-spacer"></div>
    <button id="muteBtn" title="Toggle sound" aria-pressed="${state.muted ? 'true' : 'false'}">${state.muted ? '🔇' : '🔊'}</button>
    <button id="careerBtn" title="Open career ledger">${state.phase === 'fired' || state.phase === 'won' ? '📊 Run saved' : '📊 Career'}</button>
    ${controls(state)}
  `;
  wire(state);
}

function controls(state) {
  if (state.phase === 'playing') {
    return `<button id="pauseBtn">${state.running ? '⏸ Pause' : '▶ Resume'}</button>`;
  }
  if (state.phase === 'shift_end') {
    return `<button id="nextBtn" class="primary">Next shift →</button>`;
  }
  if (state.phase === 'fired') {
    return `<span class="stat" style="color:var(--bad)"><b>FIRED</b></span>
            <button id="restartBtn" class="primary">Restart</button>`;
  }
  return '';
}

function wire(state) {
  const mute = document.getElementById('muteBtn');
  if (mute) mute.onclick = () => store.dispatch({ type: 'TOGGLE_MUTE' });
  const career = document.getElementById('careerBtn');
  if (career) career.onclick = () => window.dispatchEvent(new CustomEvent('kickstaff:career-open'));
  const pause = document.getElementById('pauseBtn');
  if (pause) pause.onclick = () => store.dispatch({ type: 'SET_RUNNING', payload: { running: !state.running } });
  const next = document.getElementById('nextBtn');
  if (next) next.onclick = () => store.dispatch({ type: 'ADVANCE_SHIFT' });
  const restart = document.getElementById('restartBtn');
  if (restart) restart.onclick = () => location.reload();
}

function formatNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

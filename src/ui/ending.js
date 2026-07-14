// RUN ENDINGS — WS-N (Sprint 5). When a run ends (phase 'won' or 'fired'), pick
// the story ending from investigation + storyFlags (engine/story.js owns the
// rule via pickEnding) and show a full-screen card ABOVE the performance
// review. Sets storyFlags._ending / _endingTitle so WS-O's share card can brag
// with it (optional read — WS-O degrades gracefully without it).
import { store } from '../state/store.js';
import { pickEnding } from '../engine/story.js';

let shownForPhase = null; // guard: render once per terminal state

export function mountEnding() {
  store.subscribe(render, (s) => [s.phase, s.shift]);
}

function render(state) {
  const root = document.getElementById('endingSlot');
  if (!root) return;

  const terminal = state.phase === 'won' || state.phase === 'fired';
  if (!terminal) { root.innerHTML = ''; shownForPhase = null; return; }
  if (shownForPhase === state.phase) return; // already up (or dismissed) for this state
  shownForPhase = state.phase;

  const ending = pickEnding(state);
  if (!ending) return;
  if (state.storyFlags._ending !== ending.id) {
    store.dispatch({ type: 'SET_STORY_FLAG', payload: { key: '_ending', value: ending.id } });
    store.dispatch({ type: 'SET_STORY_FLAG', payload: { key: '_endingTitle', value: ending.title } });
  }

  const won = state.phase === 'won';
  root.innerHTML = `
    <div class="ending-backdrop">
      <section class="ending-card ${won ? 'is-won' : 'is-fired'}" role="dialog" aria-modal="true" aria-labelledby="endingTitle">
        <div class="ending-stamp">${escape(ending.stamp || (won ? 'RUN COMPLETE' : 'RUN OVER'))}</div>
        <div class="ending-eyebrow">SEASON FINALE // SHIFT ${state.shift}</div>
        <h1 id="endingTitle">${escape(ending.title)}</h1>
        <p class="ending-body">${escape(ending.body)}</p>
        <div class="ending-stats">
          <div><span>INVESTIGATION</span><b>${Math.round(state.investigation)}</b></div>
          <div><span>WALLET</span><b>${state.money < 0 ? '−' : ''}$${Math.abs(state.money).toLocaleString()}</b></div>
          <div><span>SHIFTS</span><b>${state.shift}</b></div>
          <div><span>REPUTATION</span><b>${Math.round(state.reputation)}</b></div>
        </div>
        <div class="ending-actions">
          <button data-ending-report>View performance report</button>
          ${won
            ? '<button class="primary" data-ending-continue>Continue — endless →</button>'
            : '<button class="primary" data-ending-restart>Run it back</button>'}
        </div>
      </section>
    </div>`;

  root.querySelector('[data-ending-report]').onclick = () => { root.innerHTML = ''; };
  const cont = root.querySelector('[data-ending-continue]');
  if (cont) cont.onclick = () => { root.innerHTML = ''; store.dispatch({ type: 'ADVANCE_SHIFT' }); };
  const restart = root.querySelector('[data-ending-restart]');
  if (restart) restart.onclick = () => location.reload();
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

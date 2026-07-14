// PR CRISIS PANEL — WS-P (Sprint 6). Renders state.crisis into #crisisSlot:
// who detonated, a draining countdown, and the three plays (+ the implicit
// "say nothing" worst case). Dispatch-only; engine/crisis.js owns lifecycle.
import { store } from '../state/store.js';

export function mountCrisis() {
  render(store.getState());
  // Re-render when the crisis appears/disappears or the countdown moves.
  store.subscribe(render, (s) => [s.crisis ? s.crisis.id : null, s.crisis ? s.tick : 0, s.money]);
}

function render(state) {
  const root = document.getElementById('crisisSlot');
  if (!root) return;
  const c = state.crisis;
  if (!c) { root.innerHTML = ''; return; }

  const total = Math.max(1, c.endsAt - c.startedAt);
  const left = Math.max(0, c.endsAt - state.tick);
  const pct = Math.round((left / total) * 100);
  const buttons = c.options.filter((o) => o.id !== 'ignore').map((o) => {
    const broke = o.id === 'spin' && state.money < (o.cost || 0);
    return `
      <button class="crisis-opt ${o.tone === 'bad' ? 'is-dark' : ''}" data-crisis-opt="${o.id}" ${broke ? 'disabled' : ''}>
        <b>${escape(o.label)}${o.cost ? ` — $${o.cost.toLocaleString()}` : ''}</b>
        <small>${escape(o.desc)}</small>
      </button>`;
  }).join('');

  root.innerHTML = `
    <aside class="crisis" role="alertdialog" aria-label="PR crisis">
      <div class="crisis__head">
        <span class="crisis__badge">☎️ PR CRISIS</span>
        <span class="crisis__timer">${left} tick${left === 1 ? '' : 's'}</span>
      </div>
      <div class="crisis__who"><b>${escape(c.streamerName)}</b> broke TOS live on your front page.</div>
      <div class="crisis__countdown"><i style="width:${pct}%"></i></div>
      <div class="crisis__opts">${buttons}</div>
      <div class="crisis__foot">Do nothing and the silence becomes the statement.</div>
    </aside>`;

  root.querySelectorAll('[data-crisis-opt]').forEach((el) => {
    el.onclick = () => store.dispatch({ type: 'CRISIS_CHOOSE', payload: { optionId: el.dataset.crisisOpt } });
  });
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

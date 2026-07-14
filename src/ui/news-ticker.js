// NEWS TICKER — WS-N (Sprint 5). A one-line satirical chyron under the HUD.
// Renders state.ticker (pushed by engine/story.js); selector-gated so it only
// re-renders when a new headline lands. Reduced-motion gets a static line.
import { store } from '../state/store.js';

export function mountTicker() {
  const root = document.getElementById('tickerSlot');
  if (!root) return;
  root.innerHTML = `
    <div class="ticker" hidden>
      <span class="ticker__badge">KICK NEWS</span>
      <div class="ticker__viewport"><div class="ticker__reel" id="tickerReel"></div></div>
    </div>`;
  render(store.getState());
  store.subscribe(render, (s) => [s.ticker.length, s.ticker[s.ticker.length - 1] || '']);
}

function render(state) {
  const wrap = document.querySelector('#tickerSlot .ticker');
  const reel = document.getElementById('tickerReel');
  if (!wrap || !reel) return;
  if (!state.ticker.length) { wrap.hidden = true; return; }
  wrap.hidden = false;
  // Newest first; duplicate the row so the CSS loop scrolls seamlessly.
  const items = [...state.ticker].reverse()
    .map((t) => `<span class="ticker__item">${escape(t)}</span>`).join('<span class="ticker__sep">•</span>');
  reel.innerHTML = `${items}<span class="ticker__sep">•</span>${items}<span class="ticker__sep">•</span>`;
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

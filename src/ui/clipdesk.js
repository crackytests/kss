// CLIP DESK — WS-P (Sprint 6). While a FEATURED stream is having a viral
// moment (Sprint-3 live event) and hasn't been clipped yet, a "CLIP IT" pill
// appears. Clicking opens a timing bar: a marker sweeps back and forth; hit
// the hot zone for an accuracy-scaled engagement bonus (CLIP_ATTEMPT — the
// store owns the payout formula, CONTRACTS v14). One attempt per viral event.
import { store } from '../state/store.js';

const PERIOD_MS = 1200; // one full left→right→left sweep

let activeGame = null;  // {streamId, startedAt, raf} while the timing bar is open

export function mountClipDesk() {
  render(store.getState());
  store.subscribe(render, signature);
}

/** A clip opportunity exists when a viral live event's stream is featured and
 * not yet clipped. Signature changes when the opportunity set changes. */
function opportunities(state) {
  return (state.liveEvents || [])
    .filter((ev) => ev.defId === 'viral' && !ev._clipped)
    .map((ev) => (ev.streamIds || [])[0])
    .filter((id) => id && state.frontPage.includes(id));
}

function signature(state) {
  return [opportunities(state).join(','), state.phase];
}

function render(state) {
  const root = document.getElementById('clipSlot');
  if (!root) return;
  const ids = state.phase === 'playing' ? opportunities(state) : [];

  if (!ids.length) {
    if (!activeGame) root.innerHTML = '';
    return;
  }
  if (activeGame) return; // timing bar already open — leave it alone

  const s = state.streams.find((x) => x.id === ids[0]);
  if (!s) return;
  root.innerHTML = `
    <button class="clip-pill" data-clip-open="${s.id}">
      🎬 CLIP IT — <b>${escape(s.streamerName)}</b> is going viral
    </button>`;
  root.querySelector('[data-clip-open]').onclick = () => openGame(root, s);
}

function openGame(root, s) {
  activeGame = { streamId: s.id, startedAt: performance.now(), raf: 0 };
  root.innerHTML = `
    <div class="clip-game" role="dialog" aria-label="Clip timing">
      <div class="clip-game__title">🎬 Clip "${escape(s.title)}"</div>
      <div class="clip-bar">
        <div class="clip-bar__hot"></div>
        <div class="clip-bar__marker" id="clipMarker"></div>
      </div>
      <div class="clip-game__actions">
        <button class="primary" data-clip-now>CLIP!</button>
        <button data-clip-cancel>Never mind</button>
      </div>
      <div class="clip-game__hint">Nail the center. Miss badly and the internet remembers.</div>
    </div>`;

  const marker = root.querySelector('#clipMarker');
  const animate = () => {
    if (!activeGame) return;
    marker.style.left = `${phaseNow() * 100}%`;
    activeGame.raf = requestAnimationFrame(animate);
  };
  animate();

  root.querySelector('[data-clip-now]').onclick = () => {
    const phase = phaseNow();                 // 0..1 position along the bar
    const accuracy = 1 - Math.abs(phase - 0.5) * 2; // 1 at center, 0 at edges
    closeGame(root);
    store.dispatch({ type: 'CLIP_ATTEMPT', payload: { streamId: s.id, accuracy } });
  };
  root.querySelector('[data-clip-cancel]').onclick = () => {
    closeGame(root);
    render(store.getState());
  };
}

/** Triangle-wave sweep position derived from wall time — no DOM reads. */
function phaseNow() {
  const t = ((performance.now() - activeGame.startedAt) % PERIOD_MS) / PERIOD_MS;
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

function closeGame(root) {
  if (activeGame) cancelAnimationFrame(activeGame.raf);
  activeGame = null;
  root.innerHTML = '';
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

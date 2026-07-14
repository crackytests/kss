// BROWSE — live directory list + promote controls. Owned by WS-A.
// Renders from state, dispatches PROMOTE_STREAM. No engine imports.
import { store } from '../state/store.js';
import { streamThumbnail } from './stream-thumbnails.js?v=4';

let filter = 'all';

export function mountBrowse() {
  render(store.getState());
  // Only re-render when the directory slice actually changes (a stream's
  // state/cooldown flips, or front-page slot availability flips) — NOT every
  // tick. This keeps hover/focus alive while meters climb elsewhere.
  // See CONTRACTS.md §7 (selector-aware subscribe) + HANDOFF render-opt task.
  store.subscribe(render, browseSignature);
}

/** Cheap signature describing exactly what the directory pane renders. */
function browseSignature(s) {
  const sig = [s.frontPage.indexOf(null)];
  for (const st of s.streams) sig.push(st.state + '|' + st.cooldown);
  return sig;
}

function render(state) {
  const root = document.getElementById('browse');
  const firstEmpty = state.frontPage.indexOf(null);
  const list = state.streams
    .filter((s) => s.state !== 'banned')
    .filter((s) => matches(s, filter))
    .map((s) => card(s, firstEmpty, state.streams.indexOf(s)))
    .join('');

  root.innerHTML = `
    <h2>Live Directory</h2>
    <div class="filters">
      ${filterBtn('all', 'All')}
      ${filterBtn('category:Just Chatting', 'Chat')}
      ${filterBtn('category:IRL', 'IRL')}
      ${filterBtn('category:Sports', 'Sports')}
      ${filterBtn('gambling', 'Gambling')}
      ${filterBtn('controversial', 'Controversial')}
      ${filterBtn('safe', 'Safe')}
    </div>
    <div class="pane-body">${list || '<p class="dm-empty">No streams match.</p>'}</div>
  `;
  wire(state, firstEmpty);
}

function matches(s, f) {
  if (f === 'all') return true;
  if (f.startsWith('category:')) return s.category === f.slice('category:'.length);
  if (f === 'gambling') return s.isGambling;
  if (f === 'controversial') return s.tags.includes('controversial') || s.controversy >= 50;
  if (f === 'safe') return s.controversy < 30 && !s.isGambling;
  return true;
}

function filterBtn(id, label) {
  return `<button data-filter="${id}" class="${filter === id ? 'active' : ''}">${label}</button>`;
}

function card(s, firstEmpty, streamIndex) {
  const featured = s.state === 'featured';
  const canFeature = !featured && s.cooldown === 0 && firstEmpty !== -1;
  const cd = s.cooldown > 0 ? `<div class="stream-sub">cooling down (${s.cooldown})</div>` : '';
  const carriedRisk = !featured && s.risk > 0
    ? `<div class="stream-risk ${s.risk / s.tosThreshold >= 0.8 ? 'danger' : ''}">carried TOS risk · ${Math.round((s.risk / s.tosThreshold) * 100)}%</div>`
    : '';
  return `
    <div class="stream-card">
      ${streamThumbnail(s, streamIndex)}
      <div class="stream-meta">
        <div class="stream-title">${escape(s.title)}</div>
        <div class="stream-streamer">${escape(s.streamerName)}</div>
        <div class="stream-sub">${escape(s.category)} · ${s.viewers.toLocaleString()} viewers · 🌶️ ${s.controversy}</div>
        <div class="tags">${s.tags.map((t) => `<span class="tag ${escape(t)}">${escape(t)}</span>`).join('')}</div>
        ${cd}
        ${carriedRisk}
      </div>
      <div class="stream-actions">
        ${featured
          ? '<button disabled>Featured</button>'
          : `<button data-feature="${s.id}" class="primary" ${canFeature ? '' : 'disabled'}>Feature</button>`}
      </div>
    </div>`;
}

function wire(state, firstEmpty) {
  const root = document.getElementById('browse');
  root.querySelectorAll('[data-filter]').forEach((b) => {
    b.onclick = () => { filter = b.dataset.filter; render(store.getState()); };
  });
  root.querySelectorAll('[data-feature]').forEach((b) => {
    b.onclick = () => {
      const slot = store.getState().frontPage.indexOf(null);
      if (slot === -1) return;
      store.dispatch({ type: 'PROMOTE_STREAM', payload: { streamId: b.dataset.feature, slot } });
    };
  });
  void firstEmpty;
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

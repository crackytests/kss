// BROWSE — searchable/sortable live directory + promote controls. WS-Q.
// The control shell stays mounted; selector-gated commits only rebuild the list.
// This preserves search focus, scroll, and hover state through ordinary ticks.
import { store } from '../state/store.js';
import { streamThumbnail } from './stream-thumbnails.js?v=4';

let filter = 'all';
let searchQuery = '';
let sortMode = 'viewers';
let hoverCapable = false;

export function mountBrowse() {
  hoverCapable = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  renderShell();
  renderDirectory(store.getState());
  store.subscribe(renderDirectory, browseSignature);
}

/** Cheap signature for data visible in directory cards; risk ticks stay gated. */
function browseSignature(state) {
  const sig = [state.frontPage.indexOf(null), state.slots];
  for (const stream of state.streams) {
    sig.push(`${stream.state}|${stream.cooldown}|${stream.viewers}|${stream.controversy}`);
  }
  return sig;
}

function renderShell() {
  const root = document.getElementById('browse');
  root.innerHTML = `
    <h2>Live Directory</h2>
    <div class="directory-toolbar">
      <label class="directory-search" for="directorySearch">
        <span>Search</span>
        <input id="directorySearch" type="search" autocomplete="off" spellcheck="false"
          placeholder="Host, title, category, tag…" aria-controls="directoryList">
      </label>
      <label class="directory-sort" for="directorySort">
        <span>Sort</span>
        <select id="directorySort" aria-controls="directoryList">
          <option value="viewers">Viewers</option>
          <option value="controversy">Controversy</option>
          <option value="risk">TOS risk</option>
          <option value="category">Category</option>
        </select>
      </label>
      <output id="directoryCount" class="directory-count" aria-live="polite"></output>
    </div>
    <div class="filters" role="group" aria-label="Filter live directory">
      ${filterBtn('all', 'All')}
      ${filterBtn('category:Just Chatting', 'Chat')}
      ${filterBtn('category:IRL', 'IRL')}
      ${filterBtn('category:Sports', 'Sports')}
      ${filterBtn('gambling', 'Gambling')}
      ${filterBtn('controversial', 'Controversial')}
      ${filterBtn('safe', 'Safe')}
    </div>
    <div id="directoryList" class="pane-body" aria-label="Stream results"></div>
    <aside id="directoryPreview" class="directory-preview" aria-hidden="true" hidden></aside>
  `;

  const search = root.querySelector('#directorySearch');
  const sort = root.querySelector('#directorySort');
  search.value = searchQuery;
  sort.value = sortMode;

  search.addEventListener('input', () => {
    searchQuery = search.value;
    renderDirectory(store.getState());
  });
  sort.addEventListener('change', () => {
    sortMode = sort.value;
    renderDirectory(store.getState());
  });
  root.querySelectorAll('[data-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.filter;
      updateFilterButtons(root);
      renderDirectory(store.getState());
    });
  });
}

function renderDirectory(state) {
  const root = document.getElementById('browse');
  const listRoot = root?.querySelector('#directoryList');
  if (!listRoot) return;
  hidePreview();

  const firstEmpty = state.frontPage.indexOf(null);
  const available = state.streams.filter((stream) => stream.state !== 'banned');
  const visible = sortStreams(available
    .filter((stream) => matchesFilter(stream, filter))
    .filter(matchesSearch));

  listRoot.innerHTML = visible.length
    ? visible.map((stream) => card(stream, firstEmpty, state.streams.indexOf(stream))).join('')
    : '<p class="directory-empty" role="status">No live streams match that search.</p>';

  const count = root.querySelector('#directoryCount');
  if (count) count.textContent = `${visible.length} of ${available.length}`;
  wireCards();
}

function matchesFilter(stream, selected) {
  if (selected === 'all') return true;
  if (selected.startsWith('category:')) return stream.category === selected.slice('category:'.length);
  if (selected === 'gambling') return stream.isGambling;
  if (selected === 'controversial') return stream.tags.includes('controversial') || stream.controversy >= 50;
  if (selected === 'safe') return stream.controversy < 30 && !stream.isGambling;
  return true;
}

function matchesSearch(stream) {
  const needle = searchQuery.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [stream.title, stream.streamerName, stream.category, ...stream.tags]
    .some((value) => String(value).toLocaleLowerCase().includes(needle));
}

function sortStreams(streams) {
  return [...streams].sort((a, b) => {
    if (sortMode === 'controversy') return b.controversy - a.controversy || b.viewers - a.viewers;
    if (sortMode === 'risk') return riskPercent(b) - riskPercent(a) || b.viewers - a.viewers;
    if (sortMode === 'category') return a.category.localeCompare(b.category) || b.viewers - a.viewers;
    return b.viewers - a.viewers;
  });
}

function filterBtn(id, label) {
  const active = filter === id;
  return `<button type="button" data-filter="${id}" class="${active ? 'active' : ''}"
    aria-pressed="${active}">${label}</button>`;
}

function updateFilterButtons(root) {
  root.querySelectorAll('[data-filter]').forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function card(stream, firstEmpty, streamIndex) {
  const featured = stream.state === 'featured';
  const canFeature = !featured && stream.cooldown === 0 && firstEmpty !== -1;
  const cooldown = stream.cooldown > 0
    ? `<div class="stream-sub">cooling down (${stream.cooldown})</div>`
    : '';
  const risk = riskPercent(stream);
  const carriedRisk = !featured && stream.risk > 0
    ? `<div class="stream-risk ${risk >= 80 ? 'danger' : ''}" role="progressbar"
        aria-label="Carried TOS risk for ${escape(stream.streamerName)}"
        aria-valuemin="0" aria-valuemax="100" aria-valuenow="${risk}">
        carried TOS risk · ${risk}%</div>`
    : '';
  const titleId = `stream-title-${escape(stream.id)}`;
  return `
    <article class="stream-card" data-stream-card="${escape(stream.id)}" aria-labelledby="${titleId}">
      ${streamThumbnail(stream, streamIndex)}
      <div class="stream-meta">
        <div class="stream-title" id="${titleId}">${escape(stream.title)}</div>
        <div class="stream-streamer">${escape(stream.streamerName)}</div>
        <div class="stream-sub">${escape(stream.category)} · ${stream.viewers.toLocaleString()} viewers · 🌶️ ${stream.controversy}</div>
        <div class="tags" aria-label="Stream tags">${stream.tags.map((tag) => `<span class="tag ${tagClass(tag)}">${escape(tag)}</span>`).join('')}</div>
        ${cooldown}
        ${carriedRisk}
      </div>
      <div class="stream-actions">
        ${featured
          ? `<button type="button" disabled aria-label="${escape(stream.streamerName)} is featured">Featured</button>`
          : `<button type="button" data-feature="${escape(stream.id)}" class="primary"
              aria-label="Feature ${escape(stream.streamerName)}" ${canFeature ? '' : 'disabled'}>Feature</button>`}
      </div>
    </article>`;
}

function wireCards() {
  const root = document.getElementById('browse');
  root.querySelectorAll('[data-feature]').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = store.getState().frontPage.indexOf(null);
      if (slot === -1) return;
      store.dispatch({ type: 'PROMOTE_STREAM', payload: { streamId: button.dataset.feature, slot } });
    });
  });

  if (!hoverCapable) return;
  root.querySelectorAll('[data-stream-card]').forEach((streamCard) => {
    streamCard.addEventListener('pointerenter', () => showPreview(streamCard.dataset.streamCard, streamCard));
    streamCard.addEventListener('pointerleave', hidePreview);
    streamCard.addEventListener('focusin', () => showPreview(streamCard.dataset.streamCard, streamCard));
    streamCard.addEventListener('focusout', (event) => {
      if (!streamCard.contains(event.relatedTarget)) hidePreview();
    });
  });
}

function showPreview(streamId, anchor) {
  if (!hoverCapable) return;
  const root = document.getElementById('browse');
  const preview = root?.querySelector('#directoryPreview');
  const stream = store.getState().streams.find((candidate) => candidate.id === streamId);
  if (!root || !preview || !stream) return;

  const risk = riskPercent(stream);
  const rate = stream.riskRate * (1 + stream.controversy / 120);
  const ticksLeft = rate > 0 ? Math.max(0, Math.ceil((stream.tosThreshold - stream.risk) / rate)) : Infinity;
  preview.innerHTML = `
    <div class="preview-eyebrow">Quick read</div>
    <strong>${escape(stream.streamerName)}</strong>
    <span>${escape(stream.category)} · ${stream.viewers.toLocaleString()} viewers</span>
    <div class="preview-stats">
      <span><b>${stream.controversy}</b> controversy</span>
      <span><b>${Number.isFinite(ticksLeft) ? `~${ticksLeft}` : '∞'}</b> featured ticks left</span>
    </div>
    <div class="preview-risk-row"><span>TOS risk</span><b>${risk}%</b></div>
    <div class="preview-risk" role="progressbar" aria-label="Current TOS risk for ${escape(stream.streamerName)}"
      aria-valuemin="0" aria-valuemax="100" aria-valuenow="${risk}">
      <span style="width:${risk}%;background:${riskColor(risk)}"></span>
    </div>`;
  preview.hidden = false;
  preview.setAttribute('aria-hidden', 'false');

  const rootRect = root.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const maxLeft = window.innerWidth - preview.offsetWidth - 12;
  const maxTop = window.innerHeight - preview.offsetHeight - 12;
  preview.style.left = `${Math.max(12, Math.min(rootRect.right + 8, maxLeft))}px`;
  preview.style.top = `${Math.max(12, Math.min(anchorRect.top, maxTop))}px`;
}

function hidePreview() {
  const preview = document.getElementById('directoryPreview');
  if (!preview) return;
  preview.hidden = true;
  preview.setAttribute('aria-hidden', 'true');
}

function riskPercent(stream) {
  return Math.min(100, Math.max(0, Math.round((stream.risk / stream.tosThreshold) * 100)));
}

function riskColor(percent) {
  if (percent >= 80) return 'var(--bad)';
  if (percent >= 55) return 'var(--warn)';
  return 'var(--good)';
}

function tagClass(tag) {
  return String(tag).replace(/[^a-z0-9_-]/gi, '');
}

function escape(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[char]));
}

// DISCORD DM PANE — WS-B (see docs/BUILD_PLAN.md).
// Persistent chrome (header + server/channel rail) built once at mount; the
// thread list + active conversation re-render only when the DM slice actually
// changes (selector-aware subscribe, CONTRACTS §7) — NOT every tick. This keeps
// scroll position and hover/focus intact while meters climb elsewhere.
//
// Reacts to dm_incoming indirectly: the engine marks threads unread on arrival,
// which changes the signature and re-renders the unread/typing badges.
import { store } from '../state/store.js';

let activeThreadId = null;
let stickToBottom = true;   // autoscroll the active thread unless the user scrolled up

export function mountDiscord() {
  const root = document.getElementById('discord');
  root.innerHTML = `
    <h2>Direct Messages <span class="dm-unread-total" data-unread="0"></span></h2>
    <div class="dm-wrap">
      <div class="dm-rail" aria-hidden="true">
        <div class="dm-server" title="Kick Staff">K</div>
        <div class="dm-rail-sep"></div>
        <div class="dm-rail-ch on" title="#featured-page">⭐</div>
        <div class="dm-rail-ch" title="#staff-lounge">🛠️</div>
        <div class="dm-rail-ch" title="#memes">😂</div>
        <div class="dm-rail-ch" title="#tips">💜</div>
      </div>
      <div class="dm-threads" id="dmThreads"></div>
      <div class="dm-view" id="dmView"></div>
    </div>`;
  render(store.getState());
  store.subscribe(render, dmSignature);
}

/** Cheap signature: only the DM-relevant bits + the active thread + standing. */
function dmSignature(s) {
  const rels = s.relationships || {};
  const parts = [activeThreadId || '-'];
  for (const t of s.threads) {
    if (!isVisible(t, s)) continue;
    const last = t.messages.at(-1);
    parts.push(`${t.id}|${t.unread ? 1 : 0}|${t.messages.length}|${t.choices ? t.choices.length : 0}|${last ? last.text : ''}|${rels[t.streamerId] || 0}`);
  }
  return parts.join('~');
}

function isVisible(t, s) {
  if (t.hidden) return false;
  return !!t._arrived || (typeof t.arrivesAt === 'number' ? t.arrivesAt : 0) <= s.tick;
}

function render(state) {
  const visibleThreads = state.threads.filter((t) => isVisible(t, state));
  if ((!activeThreadId || !visibleThreads.some((t) => t.id === activeThreadId)) && visibleThreads[0]) {
    activeThreadId = visibleThreads[0].id;
  }
  const active = state.threads.find((t) => t.id === activeThreadId) || null;

  // Capture scroll intent before we touch the messages DOM.
  const old = document.getElementById('dmMessages');
  if (old) stickToBottom = old.scrollHeight - old.scrollTop - old.clientHeight < 60;

  renderThreadList(visibleThreads);
  renderView(active, state);
  wire();
  if (stickToBottom) {
    const box = document.getElementById('dmMessages');
    if (box) box.scrollTop = box.scrollHeight;
  }
  updateUnreadTotal(state);
}

function renderThreadList(threads) {
  const root = document.getElementById('dmThreads');
  root.innerHTML = threads.length
    ? threads.map((t) => threadItem(t, t.id === activeThreadId)).join('')
    : '<div class="dm-empty">No messages yet.<br><span class="dm-muted">Streamers will slide in as the shift goes on…</span></div>';
}

function renderView(active, state) {
  const root = document.getElementById('dmView');
  if (!active) {
    root.innerHTML = '<div class="dm-empty">Select a conversation.</div>';
    return;
  }
  const standing = standingChip((state.relationships || {})[active.streamerId]);
  root.innerHTML = `
    <div class="dm-view-head">
      <span class="dm-avatar" style="--c:${active.avatarColor}">${initial(active.name)}</span>
      <div class="dm-view-name">
        <b>${escape(active.name)}</b>
        <small class="dm-muted">${active.messages.length} message${active.messages.length === 1 ? '' : 's'}</small>
      </div>
      ${standing}
    </div>
    <div class="dm-messages" id="dmMessages">${messages(active)}</div>
    <div class="dm-choices">${choices(active)}</div>`;
}

/** Standing chip for the thread header: ALLY / COOL / HOSTILE + numeric value. */
function standingChip(rel) {
  const r = typeof rel === 'number' ? rel : 0;
  let cls, label;
  if (r >= 25) { cls = 'ally'; label = 'ALLY'; }
  else if (r <= -25) { cls = 'hostile'; label = 'HOSTILE'; }
  else { cls = 'cool'; label = 'COOL'; }
  return `<span class="dm-standing ${cls}" title="relationship standing">${label} ${r > 0 ? '+' : ''}${r}</span>`;
}

function threadItem(t, isActive) {
  const last = t.messages.at(-1);
  const who = last ? (last.from === 'me' ? 'You: ' : '') : '';
  return `<div class="dm-thread-item ${isActive ? 'active' : ''} ${t.unread ? 'unread' : ''}" data-thread="${t.id}">
    <span class="dm-avatar sm" style="--c:${t.avatarColor}">${initial(t.name)}</span>
    <div class="dm-thread-meta">
      <div class="dm-thread-name"><b>${escape(t.name)}</b>${t.unread ? '<span class="dm-typing" title="new message"><i></i><i></i><i></i></span>' : ''}</div>
      <div class="dm-thread-preview">${escape((who + (last ? last.text : '')).slice(0, 42))}</div>
    </div>
  </div>`;
}

function messages(t) {
  return t.messages.map((m) => {
    if (m.from === 'system') return `<div class="dm-msg system">${escape(m.text)}</div>`;
    return `<div class="dm-msg ${m.from}">${escape(m.text)}</div>`;
  }).join('') || '<div class="dm-muted" style="padding:8px">(no messages)</div>';
}

function choices(t) {
  if (!t.choices || !t.choices.length) return '<div class="dm-empty">— end of conversation —</div>';
  return t.choices.map((c, i) =>
    `<button data-choice="${i}" class="dm-choice">${escape(c.label)}</button>`).join('');
}

function wire() {
  const root = document.getElementById('discord');
  root.querySelectorAll('[data-thread]').forEach((el) => {
    el.onclick = () => {
      activeThreadId = el.dataset.thread;
      stickToBottom = true;
      store.dispatch({ type: 'DM_OPEN', payload: { threadId: activeThreadId } });
    };
  });
  root.querySelectorAll('[data-choice]').forEach((el) => {
    el.onclick = () => store.dispatch({
      type: 'DM_CHOOSE',
      payload: { threadId: activeThreadId, choiceIndex: Number(el.dataset.choice) },
    });
  });
}

function updateUnreadTotal(state) {
  const el = document.querySelector('.dm-unread-total');
  if (!el) return;
  const n = state.threads.filter((t) => isVisible(t, state) && t.unread).length;
  el.textContent = n ? String(n) : '';
  el.dataset.unread = String(n);
}

function initial(name) {
  return String(name).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

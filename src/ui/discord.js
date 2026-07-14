// DISCORD DM PANE — WS-B (see docs/BUILD_PLAN.md).
// Persistent chrome (header + server/channel rail) built once at mount; the
// thread list + active conversation re-render only when the DM slice actually
// changes (selector-aware subscribe, CONTRACTS §7) — NOT every tick. This keeps
// scroll position and hover/focus intact while meters climb elsewhere.
//
// Reacts to dm_incoming indirectly: the engine marks threads unread on arrival,
// which changes the signature and re-renders the unread/typing badges.
import { store } from '../state/store.js';

let activeConversationKey = null;
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
  const parts = [`shift:${s.shift}`, activeConversationKey || '-'];
  for (const t of s.threads) {
    if (!isVisible(t, s)) continue;
    const last = t.messages.at(-1);
    parts.push(`${conversationKey(t)}|${t.id}|${t.unread ? 1 : 0}|${t.messages.length}|${t.choices ? t.choices.length : 0}|${last ? last.text : ''}|${rels[t.streamerId] || 0}`);
  }
  return parts.join('~');
}

export function isVisible(t) {
  return !t.hidden && !!t._arrived;
}

export function conversationKey(thread) {
  return thread.streamerId ? `streamer:${thread.streamerId}` : `thread:${thread.id}`;
}

/** Collapse authored continuations/story beats into one visible tab per person. */
export function groupConversations(threads, state) {
  const grouped = new Map();
  for (const thread of threads || []) {
    if (!isVisible(thread, state)) continue;
    const key = conversationKey(thread);
    let conversation = grouped.get(key);
    if (!conversation) {
      conversation = {
        key,
        streamerId: thread.streamerId,
        name: thread.name,
        avatarColor: thread.avatarColor,
        threads: [],
        messages: [],
        unread: false,
      };
      grouped.set(key, conversation);
    }
    conversation.threads.push(thread);
    conversation.messages.push(...(thread.messages || []));
    conversation.unread ||= !!thread.unread;
  }
  return [...grouped.values()];
}

function render(state) {
  const conversations = groupConversations(state.threads, state);
  if ((!activeConversationKey || !conversations.some((item) => item.key === activeConversationKey)) && conversations[0]) {
    activeConversationKey = conversations[0].key;
  }
  if (!conversations.length) activeConversationKey = null;
  const active = conversations.find((item) => item.key === activeConversationKey) || null;

  // Capture scroll intent before we touch the messages DOM.
  const old = document.getElementById('dmMessages');
  if (old) stickToBottom = old.scrollHeight - old.scrollTop - old.clientHeight < 60;

  renderThreadList(conversations, state);
  renderView(active, state);
  wire(state);
  if (stickToBottom) {
    const box = document.getElementById('dmMessages');
    if (box) box.scrollTop = box.scrollHeight;
  }
  updateUnreadTotal(state);
}

function renderThreadList(conversations, state) {
  const root = document.getElementById('dmThreads');
  root.innerHTML = conversations.length
    ? conversations.map((item) => threadItem(item, item.key === activeConversationKey)).join('')
    : `<div class="dm-empty">${state.shift > 1 ? 'Yesterday’s DMs archived.' : 'No messages yet.'}<br><span class="dm-muted">${state.shift > 1 ? 'Today’s inbox opens when the shift starts…' : 'Streamers will slide in as the shift goes on…'}</span></div>`;
}

function renderView(active, state) {
  const root = document.getElementById('dmView');
  if (!active) {
    root.innerHTML = `<div class="dm-empty">${state.shift > 1 ? 'No stale corporate baggage here.<br><span class="dm-muted">Start the shift for today’s fresh demands.</span>' : 'Select a conversation.'}</div>`;
    return;
  }
  const standing = standingChip((state.relationships || {})[active.streamerId]);
  root.innerHTML = `
    <div class="dm-view-head">
      <span class="dm-avatar" style="--c:${active.avatarColor}">${initial(active.name)}</span>
      <div class="dm-view-name">
        <b>${escape(active.name)}</b>
        <small class="dm-muted">${active.messages.length} message${active.messages.length === 1 ? '' : 's'} · one continuous thread</small>
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

function threadItem(conversation, isActive) {
  const last = conversation.messages.at(-1);
  const who = last ? (last.from === 'me' ? 'You: ' : '') : '';
  return `<div class="dm-thread-item ${isActive ? 'active' : ''} ${conversation.unread ? 'unread' : ''}" data-conversation="${escape(conversation.key)}">
    <span class="dm-avatar sm" style="--c:${conversation.avatarColor}">${initial(conversation.name)}</span>
    <div class="dm-thread-meta">
      <div class="dm-thread-name"><b>${escape(conversation.name)}</b>${conversation.unread ? '<span class="dm-typing" title="new message"><i></i><i></i><i></i></span>' : ''}</div>
      <div class="dm-thread-preview">${escape((who + (last ? last.text : '')).slice(0, 42))}</div>
    </div>
  </div>`;
}

function messages(conversation) {
  return conversation.messages.map((m) => {
    if (m.from === 'system') return `<div class="dm-msg system">${escape(m.text)}</div>`;
    return `<div class="dm-msg ${m.from}">${escape(m.text)}</div>`;
  }).join('') || '<div class="dm-muted" style="padding:8px">(no messages)</div>';
}

function choices(conversation) {
  const buttons = conversation.threads.flatMap((thread) => (
    (thread.choices || []).map((choice, index) => (
      `<button data-choice="${index}" data-choice-thread="${escape(thread.id)}" class="dm-choice">${escape(choice.label)}</button>`
    ))
  ));
  return buttons.length ? buttons.join('') : '<div class="dm-empty">— end of conversation —</div>';
}

function wire(state) {
  const root = document.getElementById('discord');
  root.querySelectorAll('[data-conversation]').forEach((el) => {
    el.onclick = () => {
      activeConversationKey = el.dataset.conversation;
      stickToBottom = true;
      const conversation = groupConversations(state.threads, state)
        .find((item) => item.key === activeConversationKey);
      const unread = conversation?.threads.filter((thread) => thread.unread) || [];
      if (!unread.length) render(store.getState());
      for (const thread of unread) {
        store.dispatch({ type: 'DM_OPEN', payload: { threadId: thread.id } });
      }
    };
  });
  root.querySelectorAll('[data-choice]').forEach((el) => {
    el.onclick = () => store.dispatch({
      type: 'DM_CHOOSE',
      payload: { threadId: el.dataset.choiceThread, choiceIndex: Number(el.dataset.choice) },
    });
  });
}

function updateUnreadTotal(state) {
  const el = document.querySelector('.dm-unread-total');
  if (!el) return;
  const n = groupConversations(state.threads, state).filter((item) => item.unread).length;
  el.textContent = n ? String(n) : '';
  el.dataset.unread = String(n);
}

function initial(name) {
  return String(name).replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '?';
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

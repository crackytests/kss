// Toast / event feed. Drains state.eventQueue, renders notifications, then
// acknowledges each via DISMISS_EVENT. Owned by WS-D.
//
// Styling is driven by two axes (see CONTRACTS.md §5):
//   - evt.tone  ('good' | 'bad' | 'neutral')  → base color band
//   - evt.type  ('jackpot' | 'tos_break' | 'audit' | ...) → special treatments:
//       jackpot            → celebratory shimmer
//       tos_break / audit  → alarm (pulsing red + shake)
// The drain loop + DISMISS_EVENT dispatch below is the integration contract and
// must stay intact.
import { store } from '../state/store.js';
import { incidentReplay } from './stream-thumbnails.js?v=5';

const shown = new Set();

const ALARM_TYPES = new Set(['tos_break', 'audit', 'sponsor_warning']);
const CELEBRATE_TYPES = new Set(['jackpot', 'viral']);

export function mountToasts() {
  store.subscribe(render);
}

function render(state) {
  const root = document.getElementById('toasts');
  if (!root) return;
  for (const evt of state.eventQueue) {
    if (shown.has(evt.id)) continue;
    shown.add(evt.id);
    const stream = evt.streamId
      ? state.streams.find((candidate) => candidate.id === evt.streamId)
      : null;
    root.appendChild(buildToast(evt, stream));
  }
}

function buildToast(evt, stream) {
  const tone = evt.tone || 'neutral';
  const isAlarm = ALARM_TYPES.has(evt.type);
  const isCelebrate = CELEBRATE_TYPES.has(evt.type);

  const div = document.createElement('div');
  const classes = ['toast', tone];
  if (evt.type) classes.push(`toast--${evt.type}`);
  if (isAlarm) classes.push('toast--alarm');
  if (isCelebrate) classes.push('toast--celebrate');
  div.className = classes.join(' ');
  // Alarms are assertive; everything else is polite.
  div.setAttribute('role', isAlarm ? 'alert' : 'status');

  const accent = document.createElement('span');
  accent.className = 'toast__accent';
  accent.setAttribute('aria-hidden', 'true');
  div.appendChild(accent);

  const content = document.createElement('div');
  content.className = 'toast__content';

  const msg = document.createElement('div');
  msg.className = 'toast__msg';
  msg.textContent = evt.message;
  content.appendChild(msg);

  if (evt.type === 'tos_break' && stream) {
    content.insertAdjacentHTML('beforeend', incidentReplay(stream));
  }
  div.appendChild(content);

  // Alarms linger so they can't be missed; celebrations get a beat; the rest
  // clear quickly to keep the feed moving.
  const ttl = isAlarm ? 6200 : isCelebrate ? 5200 : 4200;

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    div.classList.add('toast--out');
    setTimeout(() => div.remove(), 200);
    // Acknowledge back to the store so the event drains out of the queue.
    store.dispatch({ type: 'DISMISS_EVENT', payload: { eventId: evt.id } });
  };

  // Click to dismiss early; otherwise auto-dismiss after its lifetime.
  div.addEventListener('click', dismiss);
  setTimeout(dismiss, ttl);

  return div;
}

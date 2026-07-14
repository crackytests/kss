// SHARE LOOP — WS-O (Sprint 5).
// Adds deterministic challenge links, text share cards, and post-victory depth
// summaries through the existing DOM/store seams. No backend or new actions.

import { store } from '../state/store.js';
import { getRunConfig } from '../engine/persistence.js';

const JACKPOT_LIKE_JUMP = 125;
const JACKPOT_HEAVY_TOTAL = 400;

let runConfig = getRunConfig();
let mounted = false;
let observer = null;
let activeShift = 1;
let lastMoney = 0;
let lastPhase = 'playing';
let jackpotLikeGain = 0;
let runStartingMoney = 0;
const shiftDetails = new Map();

/** Build a Pages-safe replay URL while discarding unrelated query/hash state. */
export function buildChallengeUrl(
  seed,
  mode = 'standard',
  baseHref = typeof location === 'undefined' ? 'http://localhost/' : location.href,
) {
  const url = new URL(baseHref, 'http://localhost/');
  url.search = '';
  url.hash = '';
  if (mode === 'daily') url.searchParams.set('mode', 'daily');
  url.searchParams.set('seed', String((Number(seed) || 0) >>> 0));
  return url.href;
}

/** Create the copyable Wordle-style text block. Pure for the acceptance check. */
export function makeShareText(record, options = {}) {
  const normalized = normalizeRecord(record);
  const challengeUrl = options.challengeUrl
    || buildChallengeUrl(normalized.seed, normalized.mode, options.baseHref);
  const rows = normalized.shiftMarks
    .map((mark, index) => `${String(index + 1).padStart(2, '0')} ${mark}`)
    .join('\n');
  const outcome = normalized.endingTitle || `Shift ${normalized.shiftReached} reached`;
  const depth = normalized.endlessDepth > 0
    ? `\nEndless depth +${normalized.endlessDepth}`
    : '';

  return [
    'KICK STAFF SIMULATOR',
    outcome,
    `Score ${formatNumber(normalized.score)} · Wallet ${formatMoney(normalized.money)}`,
    `Seed ${normalized.seed}${depth}`,
    '',
    rows,
    '',
    `Challenge ${challengeUrl}`,
  ].filter((line, index, lines) => line !== '' || (lines[index - 1] !== '' && lines[index + 1] !== '')).join('\n');
}

/** Clipboard API first; selected textarea + execCommand fallback for older webviews. */
export async function copyText(text, options = {}) {
  const navigatorRef = options.navigatorRef
    || (typeof navigator === 'undefined' ? null : navigator);
  const documentRef = options.documentRef
    || (typeof document === 'undefined' ? null : document);

  try {
    if (navigatorRef?.clipboard?.writeText) {
      await navigatorRef.clipboard.writeText(String(text));
      return 'clipboard';
    }
  } catch { /* fall through to the visible/manual-safe textarea path */ }

  if (!documentRef) return 'unavailable';
  let textarea = options.fallbackTextarea || null;
  const ownsTextarea = !textarea;
  if (!textarea && typeof documentRef.createElement === 'function') {
    textarea = documentRef.createElement('textarea');
    textarea.setAttribute('readonly', '');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    documentRef.body?.appendChild(textarea);
  }
  if (!textarea) return 'unavailable';

  textarea.value = String(text);
  textarea.focus?.();
  textarea.select?.();
  textarea.setSelectionRange?.(0, textarea.value.length);
  let copied = false;
  try { copied = documentRef.execCommand?.('copy') === true; } catch { copied = false; }
  if (ownsTextarea && copied) textarea.remove?.();
  return copied ? 'fallback' : 'manual';
}

/** Mount once from leaderboard.js, the WS-O-owned integration seam. */
export function mountShare(config = getRunConfig()) {
  runConfig = config;
  if (mounted || typeof document === 'undefined') return;
  mounted = true;
  ensureStyles();

  const state = store.getState();
  activeShift = state.shift || 1;
  lastMoney = state.money || 0;
  lastPhase = state.phase || 'playing';
  runStartingMoney = state.money || 0;
  observeState(state);
  store.subscribe(observeState, (next) => [
    next.shift,
    next.phase,
    next.money,
    next.engagement,
    next.tosBreaksThisShift,
    next.investigation,
    next.storyFlags?._endingTitle || '',
  ]);

  if (typeof MutationObserver !== 'undefined' && document.body) {
    observer = new MutationObserver(() => refreshShareSurfaces());
    observer.observe(document.body, { childList: true, subtree: true });
  }
  refreshShareSurfaces();
}

/** Re-run after another UI owner replaces overlay markup wholesale. */
export function refreshShareSurfaces() {
  if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return;
  const state = store.getState();
  document.querySelectorAll('.shift-card__actions').forEach((actions) => {
    addChallengeButton(actions);
    const card = actions.closest?.('.shift-card');
    if (card?.classList?.contains('shift-card--results')) addShareButton(actions);
  });
  document.querySelectorAll('.ending-actions').forEach((actions) => {
    addChallengeButton(actions);
    addShareButton(actions);
  });
  renderEndlessSummary(state);
}

/** Open a share card for either a live state-derived record or a career entry. */
export function openShareCard(record, options = {}) {
  if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') return null;
  ensureStyles();
  document.getElementById?.('shareCard')?.remove?.();

  const normalized = normalizeRecord(record);
  const challengeUrl = options.challengeUrl
    || buildChallengeUrl(normalized.seed, normalized.mode, options.baseHref);
  const text = makeShareText(normalized, { challengeUrl });
  const modal = document.createElement('div');
  modal.id = 'shareCard';
  modal.className = 'share-backdrop';
  modal.innerHTML = `
    <section class="share-card" role="dialog" aria-modal="true" aria-labelledby="shareTitle">
      <button class="share-close" type="button" data-share-close aria-label="Close share card">×</button>
      <div class="share-eyebrow">LOCAL BRAGGING RIGHTS // NO BACKEND REQUIRED</div>
      <h2 id="shareTitle">Send the same nightmare to a mate.</h2>
      <p>Every number in this link rebuilds the same roster, stat jitter, and run mutator.</p>
      <textarea class="share-copy" data-share-text readonly spellcheck="false">${escapeHtml(text)}</textarea>
      <div class="share-legend" aria-label="Shift result legend">
        <span>✅ clear</span><span>💥 break</span><span>💰 jackpot-heavy</span><span>🏆 win</span>
      </div>
      <div class="share-actions">
        <a href="${escapeHtml(challengeUrl)}">Replay seed ${normalized.seed}</a>
        <button type="button" class="primary" data-share-copy>Copy run card</button>
      </div>
      <div class="share-status" data-share-status aria-live="polite">Clipboard ready. No account, tracking pixel, or tasteful restraint.</div>
    </section>`;
  document.body.appendChild(modal);

  const close = () => {
    modal.remove();
    document.removeEventListener?.('keydown', onKeydown);
  };
  const onKeydown = (event) => { if (event.key === 'Escape') close(); };
  modal.querySelector('[data-share-close]').onclick = close;
  modal.onclick = (event) => { if (event.target === modal) close(); };
  document.addEventListener?.('keydown', onKeydown);
  modal.querySelector('[data-share-copy]').onclick = async () => {
    const textarea = modal.querySelector('[data-share-text]');
    const result = await copyText(text, { fallbackTextarea: textarea });
    const status = modal.querySelector('[data-share-status]');
    const button = modal.querySelector('[data-share-copy]');
    if (result === 'manual') {
      status.textContent = 'Clipboard blocked — the full card is selected. Press Ctrl/Cmd+C, mate.';
      button.textContent = 'Card selected';
    } else if (result === 'unavailable') {
      status.textContent = 'Clipboard unavailable — select the card above and copy it manually.';
    } else {
      status.textContent = result === 'fallback' ? 'Copied through the compatibility fallback.' : 'Run card copied.';
      button.textContent = 'Copied ✓';
    }
  };
  modal.querySelector('[data-share-text]').focus?.();
  return modal;
}

/** Current run snapshot used by results/ending/endless controls. */
export function liveShareRecord(state = store.getState()) {
  const details = [...shiftDetails.entries()].sort((a, b) => a[0] - b[0]);
  const latest = validEntries(state.career?.runHistory)
    .find((entry) => (entry.seed >>> 0) === (runConfig.seed >>> 0));
  const totalEngagement = details.reduce((sum, [, detail]) => sum + detail.engagement, 0);
  const tosBreaks = details.reduce((sum, [, detail]) => sum + detail.tosBreaks, 0);
  const completedShifts = state.phase === 'fired'
    ? Math.max(0, details.length - 1)
    : details.length;
  const calculatedScore = Math.max(0, Math.round(
    totalEngagement
    + completedShifts * 5000
    + ((state.money || 0) - runStartingMoney) * 2
    + (state.reputation || 0) * 25
    - tosBreaks * 500
    - (state.heat || 0) * 10,
  ));
  const endlessDepth = Math.max(0, (state.shift || 1) - (state.wonAtShift || 10));

  return {
    ...(latest || {}),
    mode: runConfig.mode,
    seed: runConfig.seed >>> 0,
    result: state.phase,
    shiftReached: state.shift || 1,
    shiftsSurvived: state.phase === 'fired' ? Math.max(0, (state.shift || 1) - 1) : state.shift || 1,
    money: state.money || 0,
    score: endlessDepth > 0 || !latest ? calculatedScore : latest.score,
    mutatorName: state.mutator?.name || latest?.mutatorName,
    endingTitle: state.storyFlags?._endingTitle || null,
    investigation: state.investigation || 0,
    endlessDepth,
    shiftMarks: marksThrough(state.shift || 1),
  };
}

function observeState(state) {
  if ((state.shift || 1) !== activeShift) {
    activeShift = state.shift || 1;
    jackpotLikeGain = 0;
    lastMoney = state.money || 0;
    lastPhase = state.phase || 'playing';
  } else {
    const gain = (state.money || 0) - lastMoney;
    if (state.phase === 'playing' && lastPhase === 'playing' && gain >= JACKPOT_LIKE_JUMP) {
      jackpotLikeGain += gain;
    }
    lastMoney = state.money || 0;
    lastPhase = state.phase || 'playing';
  }

  if (!shiftDetails.has(activeShift) && ['shift_end', 'fired', 'won'].includes(state.phase)) {
    const mark = state.phase === 'won'
      ? '🏆'
      : state.phase === 'fired' || state.tosBreaksThisShift > 0
        ? '💥'
        : jackpotLikeGain >= JACKPOT_HEAVY_TOTAL ? '💰' : '✅';
    shiftDetails.set(activeShift, {
      mark,
      engagement: Math.max(0, state.engagement || 0),
      tosBreaks: Math.max(0, state.tosBreaksThisShift || 0),
    });
  }
  refreshShareSurfaces();
}

function addChallengeButton(actions) {
  if (actions.querySelector?.('[data-share-challenge]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shift-action share-inline-action';
  button.dataset.shareChallenge = '';
  button.textContent = '🔗 Copy challenge';
  button.onclick = async () => {
    const url = buildChallengeUrl(runConfig.seed, runConfig.mode);
    const result = await copyText(url);
    button.textContent = result === 'manual' ? 'Link selected — Ctrl/Cmd+C' : 'Challenge copied ✓';
    window.setTimeout?.(() => { button.textContent = '🔗 Copy challenge'; }, 2200);
  };
  actions.insertBefore(button, actions.querySelector?.('.primary') || null);
}

function addShareButton(actions) {
  if (actions.querySelector?.('[data-share-run]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'shift-action share-inline-action';
  button.dataset.shareRun = '';
  button.textContent = '▦ Share run';
  button.onclick = () => openShareCard(liveShareRecord());
  actions.insertBefore(button, actions.querySelector?.('.primary') || null);
}

function renderEndlessSummary(state) {
  const card = document.querySelector?.('.shift-card--results');
  if (!card || (state.shift || 0) <= (state.wonAtShift || 10)) return;
  let summary = card.querySelector?.('[data-endless-summary]');
  if (!summary) {
    summary = document.createElement('section');
    summary.dataset.endlessSummary = '';
    summary.className = 'endless-summary';
    card.querySelector('.shift-card__actions')?.before(summary);
  }
  const record = liveShareRecord(state);
  summary.innerHTML = `
    <div><span>ENDLESS SCORECARD</span><strong>Depth +${record.endlessDepth}</strong><small>Campaign cleared at shift ${state.wonAtShift}; every extra day is pure corporate hubris.</small></div>
    <div><span>SCORE</span><strong>${formatNumber(record.score)}</strong></div>
    <div><span>ENGAGEMENT</span><strong>${formatNumber(state.engagement)}</strong></div>
    <div><span>INVESTIGATION</span><strong>${formatNumber(state.investigation)}</strong></div>
    <button type="button" data-endless-share>Share depth +${record.endlessDepth}</button>`;
  summary.querySelector('[data-endless-share]').onclick = () => openShareCard(record);
}

function marksThrough(count) {
  const fallback = '✅';
  return Array.from({ length: Math.max(1, Number(count) || 1) }, (_, index) => (
    shiftDetails.get(index + 1)?.mark || fallback
  ));
}

function normalizeRecord(record = {}) {
  const result = record.result || 'shift_end';
  const survived = Math.max(0, Number(record.shiftsSurvived) || 0);
  const shiftReached = Math.max(1, Number(record.shiftReached)
    || (result === 'fired' ? survived + 1 : survived)
    || 1);
  const marks = Array.isArray(record.shiftMarks) && record.shiftMarks.length
    ? record.shiftMarks.slice(0, shiftReached)
    : syntheticMarks(record, shiftReached);
  return {
    ...record,
    mode: record.mode === 'daily' ? 'daily' : 'standard',
    seed: (Number(record.seed) || 0) >>> 0,
    shiftReached,
    shiftMarks: marks,
    money: Number(record.money) || 0,
    score: Number(record.score) || 0,
    endlessDepth: Math.max(0, Number(record.endlessDepth) || 0),
    endingTitle: record.endingTitle
      || (result === 'won' ? 'Campaign cleared' : null),
  };
}

function syntheticMarks(record, count) {
  const marks = new Array(count).fill('✅');
  const breaks = Math.min(count, Math.max(0, Number(record.tosBreaks) || 0));
  for (let index = 0; index < breaks; index += 1) marks[index] = '💥';
  if (record.result === 'won') marks[count - 1] = '🏆';
  else if (record.result === 'fired') marks[count - 1] = '💥';
  else if ((Number(record.moneyEarned) || 0) >= JACKPOT_HEAVY_TOTAL) marks[count - 1] = '💰';
  return marks;
}

function ensureStyles() {
  if (typeof document === 'undefined'
    || typeof document.createElement !== 'function'
    || typeof document.querySelector !== 'function'
    || !document.head) return;
  if (document.querySelector('link[data-share-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../styles/share.css', import.meta.url).href;
  link.dataset.shareStyles = '';
  document.head.appendChild(link);
}

function validEntries(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string') : [];
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return `${amount < 0 ? '−' : ''}$${Math.abs(amount).toLocaleString('en-US')}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

void observer;

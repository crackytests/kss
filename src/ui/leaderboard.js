// LOCAL CAREER / LEADERBOARD — WS-I, extended by WS-K with mutator run tags.
// Reads the additive career blob and renders into #leaderboardSlot. The only
// navigation it performs is switching between standard and ?mode=daily runs.

import { store } from '../state/store.js';
import { dailyKey, getRunConfig } from '../engine/persistence.js';

let open = false;
let runConfig = getRunConfig();
let eventBound = false;

export function mountLeaderboard(config = getRunConfig()) {
  runConfig = config;
  if (!eventBound && typeof window !== 'undefined') {
    window.addEventListener('kickstaff:career-open', () => {
      open = true;
      render(store.getState());
    });
    eventBound = true;
  }
  render(store.getState());
  store.subscribe(render, (state) => [
    state.phase,
    state.shift,
    state.money,
    Object.keys(state.perks || {}).length,
    state.career?.runs || 0,
    state.career?.bestRunScore || 0,
    state.career?.runHistory?.[0]?.id || '',
    state.career?.leaderboard?.[0]?.id || '',
  ]);
}

function render(state) {
  const root = document.getElementById('leaderboardSlot');
  if (!root) return;
  const career = state.career || {};
  root.innerHTML = open ? careerPanel(state, career) : '';
  wire(root, state);
}

function careerPanel(state, career) {
  const leaders = validRows(career.leaderboard);
  const history = validRows(career.runHistory).slice(0, 8);
  const todayConfig = getRunConfig('?mode=daily');
  const today = todayConfig.dailyKey || dailyKey();
  const todayBest = career.dailyBest?.[today];
  const perksOwned = Object.keys(state.perks || {}).length;
  const switchHref = runConfig.mode === 'daily' ? './' : '?mode=daily';
  const switchLabel = runConfig.mode === 'daily' ? 'Return to regular bullshit' : 'Play today’s shared nightmare';

  return `
    <div class="career-backdrop" data-career-backdrop>
      <section class="career-panel" role="dialog" aria-modal="true" aria-labelledby="careerTitle">
        <header class="career-head">
          <div>
            <div class="career-eyebrow">LOCAL EMPLOYEE RECORD // HR’S LITTLE BOOK OF FUCK-UPS</div>
            <h2 id="careerTitle">Career damage ledger</h2>
            <p>Your best grifts, worst disasters, and every ugly number finance kept for leverage.</p>
          </div>
          <button class="career-close" data-career-close aria-label="Close career ledger">×</button>
        </header>

        <div class="career-lifetime" aria-label="Lifetime career metrics">
          ${lifetimeMetric('RUNS', career.runs || 0, 'completed corporate ordeals')}
          ${lifetimeMetric('BEST SCORE', formatNumber(career.bestRunScore || 0), 'local arse-kicking table')}
          ${lifetimeMetric('BEST ENGAGEMENT', formatNumber(career.bestEngagement || 0), 'one glorious shitshow')}
          ${lifetimeMetric('SHIFTS SURVIVED', career.lifetimeShifts || 0, 'before somebody cracked')}
          ${lifetimeMetric('CAREER BANK', formatMoney(state.money || 0), `${perksOwned} expensive coping mechanisms`)}
        </div>

        <section class="daily-card ${runConfig.mode === 'daily' ? 'is-active' : ''}">
          <div class="daily-card__date"><span>TODAY’S BOARD</span><strong>${today}</strong><small>UTC · shared seed ${seedLabel(runConfig.mode === 'daily' ? runConfig.seed : todayConfig.seed)}</small></div>
          <div class="daily-card__copy">
            <strong>${runConfig.mode === 'daily' ? 'You’re in today’s shared meat grinder.' : 'Same roster. Same RNG. No fucking excuses.'}</strong>
            <small>${dailySummary(state, todayBest)}</small>
          </div>
          <a class="daily-card__action" href="${switchHref}">${switchLabel} →</a>
        </section>

        <div class="career-columns">
          <section class="career-section">
            <div class="career-section__head"><div><span>TOP 10</span><h3>Local bastard leaderboard</h3></div><small>Survival, engagement, ethical flexibility</small></div>
            <div class="leader-table">
              ${leaders.length ? leaders.map(leaderRow).join('') : emptyState('No completed runs yet. Go get fired with some fucking ambition.')}
            </div>
          </section>
          <section class="career-section">
            <div class="career-section__head"><div><span>LAST 8</span><h3>Incident history</h3></div><small>Freshest humiliation first</small></div>
            <div class="history-list">
              ${history.length ? history.map(historyRow).join('') : emptyState('Your permanent record is somehow clean. Suspicious as hell.')}
            </div>
          </section>
        </div>

        <footer class="career-foot">
          <div class="career-foot__save">
            <span>Your sins are saved in this browser only.</span>
            <button type="button" class="career-reset" data-career-reset>Burn the whole record</button>
          </div>
          <strong>${runConfig.mode === 'daily' ? 'DAILY MODE ACTIVE' : 'STANDARD MODE'}</strong>
        </footer>
      </section>
    </div>`;
}

function lifetimeMetric(label, value, note) {
  return `<div class="career-stat"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function leaderRow(entry, index) {
  const mutator = entry.mutatorName || 'Legacy run';
  return `
    <div class="leader-row ${index === 0 ? 'is-best' : ''}">
      <b class="leader-rank">${String(index + 1).padStart(2, '0')}</b>
      <div class="leader-run"><strong>${entry.mode === 'daily' ? 'DAILY' : 'STANDARD'}</strong><small>${escapeHtml(mutator)} · ${formatDate(entry.finishedAt)}</small></div>
      <div><span>SCORE</span><strong>${formatNumber(entry.score)}</strong></div>
      <div><span>SHIFTS</span><strong>${entry.shiftsSurvived}</strong></div>
      <div><span>ENGAGEMENT</span><strong>${formatCompact(entry.totalEngagement)}</strong></div>
      <div><span>CASH</span><strong>${formatDeltaMoney(entry.moneyEarned)}</strong></div>
    </div>`;
}

function historyRow(entry) {
  const reason = entry.result === 'won'
    ? 'CAMPAIGN CLEARED'
    : `FIRED · ${(entry.failureReason || 'quota').replaceAll('_', ' ').toUpperCase()}`;
  return `
    <article class="history-row">
      <div class="history-row__badge ${entry.mode === 'daily' ? 'daily' : ''}">${entry.mode === 'daily' ? 'D' : 'S'}</div>
      <div class="history-row__main"><strong>${reason}</strong><small>${escapeHtml(entry.mutatorName || 'Legacy run')} · ${formatDateTime(entry.finishedAt)} · seed ${seedLabel(entry.seed)}</small></div>
      <div class="history-row__score"><strong>${formatNumber(entry.score)}</strong><small>${entry.shiftsSurvived} shifts</small></div>
    </article>`;
}

function dailySummary(state, todayBest) {
  const current = state.mutator
    ? `Today’s rule: ${state.mutator.icon} ${escapeHtml(state.mutator.name)}. `
    : '';
  const best = todayBest
    ? `Local best: ${todayBest.score.toLocaleString()} points over ${todayBest.shiftsSurvived} shifts (${escapeHtml(todayBest.mutatorName || 'legacy rules')}).`
    : 'No local daily result yet. Be the first bastard to leave a stain.';
  return `${runConfig.mode === 'daily' ? current : ''}${best}`;
}

function emptyState(copy) {
  return `<div class="career-empty">${copy}</div>`;
}

function wire(root, state) {
  const close = root.querySelector('[data-career-close]');
  if (close) close.onclick = () => { open = false; render(state); };
  const backdrop = root.querySelector('[data-career-backdrop]');
  if (backdrop) backdrop.onclick = (event) => {
    if (event.target === backdrop) { open = false; render(state); }
  };
  const reset = root.querySelector('[data-career-reset]');
  if (reset) reset.onclick = () => {
    const confirmed = window.confirm(
      'Burn your entire career record? This permanently deletes every dollar, perk, relationship, setting, run, score, and daily result saved in this browser. There is no clever undo button, mate.',
    );
    if (!confirmed) return;
    store.resetCareer();
    window.location.reload();
  };
}

function validRows(value) {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry.id === 'string') : [];
}

function seedLabel(seed) {
  return ((Number(seed) || 0) >>> 0).toString(36).toUpperCase().padStart(6, '0');
}

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString();
}

function formatCompact(value) {
  return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return `${amount < 0 ? '−' : ''}$${Math.abs(amount).toLocaleString()}`;
}

function formatDeltaMoney(value) {
  const amount = Number(value) || 0;
  return `${amount > 0 ? '+' : amount < 0 ? '−' : '±'}$${Math.abs(amount).toLocaleString()}`;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'unknown date' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'unknown time'
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

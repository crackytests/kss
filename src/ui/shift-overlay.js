// SHIFT OVERLAY — Phase 2 briefing + results flow.
// Reads the store, dispatches existing actions, and delegates shift progression
// through the store. No simulation happens here.
import { store } from '../state/store.js';

const startedShifts = new Set();
const snapshots = new Map();

export function mountShiftOverlay() {
  render(store.getState());
  store.subscribe(render, overlaySignature);
}

function overlaySignature(state) {
  return [
    state.shift,
    state.tick,
    state.phase,
    state.running,
    state.engagement,
    state.quota,
    state.money,
    state.reputation,
    state.heat,
    state.tosBreaksThisShift,
    state.mutator?.id || '',
  ];
}

function render(state) {
  const root = document.getElementById('shiftOverlay');
  if (!root) return;

  const needsBriefing = state.phase === 'playing'
    && state.tick === 0
    && !startedShifts.has(state.shift);

  if (needsBriefing) {
    rememberStart(state);
    root.innerHTML = briefing(state);
    show(root, 'briefing');
    wireBriefing(root, state);
    return;
  }

  if (state.phase === 'shift_end' || state.phase === 'fired' || state.phase === 'won') {
    root.innerHTML = results(state);
    show(root, state.phase === 'shift_end' || state.phase === 'won' ? 'cleared' : 'fired');
    wireResults(root, state);
    return;
  }

  hide(root);
}

function rememberStart(state) {
  if (snapshots.has(state.shift)) return;
  snapshots.set(state.shift, {
    money: state.money,
    reputation: state.reputation,
    heat: state.heat,
  });
}

function briefing(state) {
  const pressure = state.shift === 1 ? 'BASELINE' : state.shift < 4 ? 'ELEVATED' : 'SEVERE';
  const stake = state.sponsors?.find((sponsor) => sponsor.id === 'stake');
  const stakePayout = stake?.payoutPerShift || 0;
  return `
    <section class="shift-card shift-card--briefing" role="dialog" aria-modal="true" aria-labelledby="shiftTitle">
      ${memoHeader('OPERATIONS BRIEF', state.shift)}
      <div class="eddie-message">
        <div class="eddie-avatar" aria-hidden="true">E</div>
        <div>
          <div class="shift-card__eyebrow">VOICE NOTE TRANSCRIBED // EDDIE, CEO</div>
          <h1 id="shiftTitle">Make the shitshow look organic, mate.</h1>
          <p class="shift-card__lede">${briefingLede(state)}</p>
        </div>
      </div>
      ${mutatorBrief(state)}
      <div class="brief-grid">
        ${briefMetric('TARGET', state.quota.toLocaleString(), 'engagement')}
        ${briefMetric('WINDOW', `${state.ticksPerShift}s`, 'one tick per second')}
        ${briefMetric('SLOTS', state.slots, `${state.streams.length} seeded live channels`)}
        ${briefMetric('PRESSURE', pressure, pressureNote(state))}
        ${briefMetric('STAKE UPSIDE', stakePayout ? `$${stakePayout}` : 'VIBES', 'maximum ethically flexible fee')}
      </div>
      <div class="brief-priorities">
        <div class="brief-directive brief-directive--stake">
          <span>EDDIE'S TOTALLY INDEPENDENT EDITORIAL PRIORITY</span>
          <strong>Keep a Stake-tagged casino circus visible. Tastefully. Constantly. No bloody gaps.</strong>
          <small>We don't play favourites. Some partners simply pay enough to make that sentence complete bullshit.</small>
        </div>
        <div class="brief-directive">
          <span>PUBLIC TALKING POINT</span>
          <strong>“Kick backs creators, choice, and a fair go.”</strong>
          <small>If anybody asks about the casino next to the puppies, say “brand safety” slowly and look professionally constipated.</small>
        </div>
      </div>
      <div class="eddie-checklist" aria-label="Eddie's shift checklist">
        ${checklistItem('01', 'Feed the bastard number', `Clear ${state.quota.toLocaleString()} engagement before the clock runs out and finance starts sniffing around.`)}
        ${checklistItem('02', 'Herd the feral talent', 'Pull risky streams one second before they shit the bed, not one second after. Easy as, mate.')}
        ${checklistItem('03', 'Protect the corporate fairy tale', 'A clean shift is excellent. A filthy profitable shift is, for legal reasons, also excellent.')}
      </div>
      ${eddieSignoff('Righto — go make me proud, or at least difficult to subpoena. Give the green-logo streams a very, very fair go.')}
      <div class="shift-card__actions">
        <button class="shift-action" data-career-overlay>📊 Career ledger</button>
        <button class="primary shift-action" data-start-shift>Righto, start day ${state.shift} →</button>
      </div>
    </section>`;
}

function mutatorBrief(state) {
  const mutator = state.mutator;
  if (!mutator) return '';
  return `
    <div class="brief-directive" style="margin-top:18px" aria-label="This run's mutator">
      <span>THIS RUN'S RULE // ${escapeHtml(mutator.name).toUpperCase()}</span>
      <strong>${escapeHtml(mutator.icon)} ${escapeHtml(mutator.summary)}</strong>
      <small>${escapeHtml(mutator.blurb)} Eddie says this fresh bullshit is “market texture,” mate.</small>
    </div>`;
}

function memoHeader(label, shift) {
  return `
    <header class="memo-masthead">
      <div class="memo-brand"><span>KICK</span><small>EXECUTIVE OPERATIONS</small></div>
      <div class="memo-meta"><strong>${label} // DAY ${shift}</strong><small>FICTIONAL PARODY · NOT AN ACTUAL EXECUTIVE MESSAGE</small></div>
    </header>`;
}

function briefingLede(state) {
  if (state.shift === 1) {
    return 'G’day. Nice easy one: make the homepage enormous, keep it technically legal, and remember Stake visibility is a totally fascinating coincidence. Don’t fuck it up.';
  }
  if (state.shift < 4) {
    return `Righto, mate, day ${state.shift}. Target’s up, patience is rooted, and “authentic discovery” had better keep discovering the casino with the green logo.`;
  }
  return `Listen, mate, day ${state.shift} is panic wearing a strategy lanyard. Keep the chaos monetisable, the policy breaches deniable, and Stake where every bloody camera can see it.`;
}

function briefMetric(label, value, note) {
  return `<div class="brief-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function checklistItem(index, title, copy) {
  return `<div class="eddie-checklist__item"><b>${index}</b><span><strong>${title}</strong><small>${copy}</small></span></div>`;
}

function eddieSignoff(copy) {
  return `<div class="eddie-signoff"><span>${copy}</span><strong>— Eddie</strong><small>Sent from a phone whose responsible-gambling controls are somebody else’s fucking problem</small></div>`;
}

function pressureNote(state) {
  const riskLift = Math.round((Math.pow(state.riskRateGrowthPerShift, state.shift - 1) - 1) * 100);
  return riskLift ? `risk speed +${riskLift}%` : 'baseline risk speed';
}

function results(state) {
  const start = snapshots.get(state.shift) || { money: 0, reputation: 60, heat: 0 };
  const passed = state.phase === 'shift_end' || state.phase === 'won';
  const scorePct = Math.round((state.engagement / Math.max(1, state.quota)) * 100);
  const moneyDelta = state.money - start.money;
  const repDelta = state.reputation - start.reputation;
  const heatDelta = state.heat - start.heat;
  const reason = resultReason(state, passed);
  const sponsor = sponsorSummary(state);
  const risk = riskSummary(state);
  const talent = talentSummary(state);
  const margin = state.engagement - state.quota;
  const pace = state.tick ? state.engagement / state.tick : 0;

  return `
    <section class="shift-card shift-card--results ${passed ? 'is-cleared' : 'is-fired'}" role="dialog" aria-modal="true" aria-labelledby="resultTitle">
      ${memoHeader('PERFORMANCE REVIEW', state.shift)}
      <div class="result-stamp">${passed ? 'BONUS-ADJACENT' : 'MATE, WHAT THE FUCK'}</div>
      <div class="eddie-message eddie-message--review">
        <div class="eddie-avatar" aria-hidden="true">E</div>
        <div>
          <div class="shift-card__eyebrow">PRIVATE FEEDBACK // EDDIE, CEO</div>
          <h1 id="resultTitle">${passed ? 'Bloody hell. I’ll call this leadership.' : 'You’ve absolutely cooked this, mate.'}</h1>
          <p class="shift-card__lede">${reason}</p>
        </div>
      </div>
      <div class="eddie-verdict"><span>EDDIE'S READ</span><p>${eddieVerdict(state, passed, scorePct, sponsor)}</p></div>
      <div class="result-score">
        <div class="result-score__number">${scorePct}%</div>
        <div class="result-score__copy">
          <span>THE NUMBER THAT DECIDES WHETHER THIS SHITSHOW WAS “STRATEGY”</span>
          <strong>${state.engagement.toLocaleString()} / ${state.quota.toLocaleString()}</strong>
          <div class="result-progress"><i style="width:${Math.min(100, Math.max(0, scorePct))}%"></i></div>
        </div>
      </div>
      <div class="result-grid">
        ${resultMetric('QUOTA MARGIN', formatDelta(margin), margin >= 0 ? 'above target' : 'engagement short', margin)}
        ${resultMetric('PACE', pace.toFixed(1), 'engagement per tick', pace)}
        ${resultMetric('WALLET MOVE', formatDelta(moneyDelta, '$'), `${formatMoney(state.money)} total`, moneyDelta)}
        ${resultMetric('SPONSOR CASH', `$${sponsor.payout.toLocaleString()}`, `${(state.sponsors || []).length} contracts reported`, sponsor.payout)}
        ${resultMetric('REPUTATION', formatDelta(repDelta), `${formatNumber(state.reputation)} current`, repDelta)}
        ${resultMetric('HEAT MOVE', formatDelta(heatDelta), `${formatNumber(state.heat)} final`, -heatDelta)}
        ${resultMetric('TOS BREAKS', state.tosBreaksThisShift, state.tosBreaksThisShift ? 'public incidents' : 'clean shift', -state.tosBreaksThisShift)}
        ${resultMetric('BANNED TALENT', risk.banned, risk.banned ? 'removed from inventory' : 'nobody sacrificed', -risk.banned)}
      </div>
      <div class="review-sections">
        <section class="review-panel review-panel--sponsors">
          <div class="review-panel__heading"><span>01</span><div><strong>PARTNER ALIGNMENT</strong><small>The paid-for bit Eddie actually gives a shit about</small></div></div>
          <div class="sponsor-review-list">${sponsor.rows}</div>
        </section>
        <section class="review-panel">
          <div class="review-panel__heading"><span>02</span><div><strong>FRONT-PAGE AUTOPSY</strong><small>What the “algorithm” did after you held it at gunpoint</small></div></div>
          ${reviewLine('Slots occupied at close', `${risk.occupied} / ${state.slots}`)}
          ${reviewLine('Stake-tagged positions', risk.stakeSlots)}
          ${reviewLine('Gambling positions', risk.gamblingSlots)}
          ${reviewLine('Wholesome positions', risk.wholesomeSlots)}
          ${reviewLine('Average stream risk', `${risk.averageRisk}%`)}
          ${reviewLine('Highest-risk talent', `${escapeHtml(risk.hottestName)} · ${risk.hottestRisk}%`)}
        </section>
        <section class="review-panel">
          <div class="review-panel__heading"><span>03</span><div><strong>TALENT TEMPERATURE</strong><small>Parasocial friendship, brutally operationalised</small></div></div>
          ${reviewLine('Average relationship', formatSigned(talent.average))}
          ${reviewLine('Strongest ally', `${escapeHtml(talent.bestName)} · ${formatSigned(talent.bestScore)}`)}
          ${reviewLine('Most likely to subtweet', `${escapeHtml(talent.worstName)} · ${formatSigned(talent.worstScore)}`)}
          ${reviewLine('Tracked relationships', talent.count)}
        </section>
        <section class="review-panel">
          <div class="review-panel__heading"><span>04</span><div><strong>RISK & OPTICS</strong><small>For the expensive bastards who say “governance”</small></div></div>
          ${reviewLine('Final regulatory heat', formatNumber(state.heat))}
          ${reviewLine('Heat added this shift', formatDelta(heatDelta))}
          ${reviewLine('Policy incident budget', `${state.tosBreaksThisShift} / ${state.maxTosBreaksPerShift}`)}
          ${reviewLine('Run mutator', `${escapeHtml(state.mutator?.icon || '•')} ${escapeHtml(state.mutator?.name || 'None')}`)}
          ${reviewLine('Starting roster', `${state.mutator?.rosterSize || state.streams.length} streams`)}
          ${reviewLine('Streams still available', state.streams.length - risk.banned)}
          ${reviewLine('Overall verdict', passed ? 'SCALE THIS BEAUTIFUL MESS' : 'REBRAND THE FUCK-UP')}
        </section>
      </div>
      ${eddieSignoff(passed
        ? 'Good on ya, mate. Take five, then ask whether Stake needs anything. Casually, desperately, profitably.'
        : 'No hard feelings, mate. Pack your shit before security develops initiative.')}
      <div class="shift-card__actions">
        <button class="shift-action" data-career-overlay>📊 Career ledger</button>
        ${passed
          ? `<button class="primary shift-action" data-next-shift>Have a squiz at day ${state.shift + 1} →</button>`
          : '<button class="primary shift-action" data-restart>Give it another crack</button>'}
      </div>
    </section>`;
}

function resultReason(state, passed) {
  if (passed) {
    return state.tosBreaksThisShift === 0
      ? 'You hit quota with a clean policy record. Bloody beautiful, mate. Legal is bored and finance is claiming the whole fucking idea.'
      : `You hit quota despite ${state.tosBreaksThisShift} public policy shitstorm${state.tosBreaksThisShift === 1 ? '' : 's'}. Finance deducted the fines; comms renamed the wreckage “creator-led spontaneity.”`;
  }
  if (state.failureReason === 'sponsor') return 'The sponsor walked mid-shift, mate. Management discovered its fucking principles at the exact same second.';
  if (state.failureReason === 'reputation') return 'Your reputation hit zero. Impressive. HR moved your messages into a folder called “culture” and your badge into the bin.';
  if (state.failureReason === 'tos_limit') return `You detonated ${state.tosBreaksThisShift} public TOS breaches. Management needed accountability, which is executive for “sacrifice this poor bastard.”`;
  return `You finished ${Math.max(0, state.quota - state.engagement).toLocaleString()} engagement short. Close only counts in horseshoes, hand grenades, and bullshit quarterly decks, mate.`;
}

function eddieVerdict(state, passed, scorePct, sponsor) {
  const stake = state.sponsors?.find((item) => item.id === 'stake');
  const uptime = sponsorUptime(stake);
  if (!passed && state.failureReason === 'sponsor') {
    return 'Mate, I asked for growth, safety, freedom, and one tiny non-negotiable casino logo. Somehow you lost the only bit that fucking pays us.';
  }
  if (!passed) {
    return 'The dashboard is red, the group chat is silent, and some coward said “learning opportunity.” That phrase means you’re fucked, mate.';
  }
  if (uptime >= 95 && state.tosBreaksThisShift === 0) {
    return `Clean record, ${scorePct}% of quota, and Stake enjoyed ${uptime}% uptime. Independent editorial excellence, bought and paid for.`;
  }
  if (uptime < 70) {
    return `The number cleared. Good. Stake visibility landed at ${uptime}%. Bad. Make that second number boring as batshit tomorrow, mate.`;
  }
  return `You got the result: chaos, paperwork, ${uptime}% Stake uptime, and nobody important in handcuffs. Classic high-growth governance, mate.`;
}

function sponsorSummary(state) {
  let payout = 0;
  const sponsors = state.sponsors || [];
  const rows = sponsors.map((sponsor) => {
    const runtime = sponsor.runtime || {};
    const uptime = sponsorUptime(sponsor);
    const earned = runtime.payoutEarned || 0;
    payout += earned;
    const status = runtime.dropped ? 'DROPPED' : uptime >= 95 ? 'ALIGNED' : uptime >= 70 ? 'WOBBLY' : 'PLEASE EXPLAIN';
    const tone = runtime.dropped || uptime < 70 ? 'bad' : uptime < 95 ? 'warn' : 'good';
    return `<div class="sponsor-review ${tone}"><div><strong>${escapeHtml(sponsor.name)}</strong><small>${escapeHtml(sponsor.blurb || 'Contract active')}</small></div><span>${status}</span><b>${uptime}%</b><em>+$${earned.toLocaleString()}</em></div>`;
  }).join('');
  return {
    payout,
    rows: rows || '<div class="review-empty">No sponsor telemetry. Eddie has fucked off to a safer group chat.</div>',
  };
}

function sponsorUptime(sponsor) {
  const runtime = sponsor?.runtime;
  if (!runtime) return 0;
  if (typeof runtime.satisfactionPct === 'number') return runtime.satisfactionPct;
  return runtime.evaluatedTicks > 0
    ? Math.round((runtime.satisfiedTicks / runtime.evaluatedTicks) * 100)
    : 0;
}

function riskSummary(state) {
  const featured = state.frontPage
    .map((id) => state.streams.find((stream) => stream.id === id))
    .filter(Boolean);
  const hottest = state.streams.reduce((best, stream) => stream.risk > best.risk ? stream : best, state.streams[0] || { risk: 0, streamerName: 'Nobody' });
  const averageRisk = state.streams.length
    ? Math.round(state.streams.reduce((sum, stream) => sum + stream.risk, 0) / state.streams.length)
    : 0;
  return {
    occupied: featured.length,
    banned: state.streams.filter((stream) => stream.state === 'banned').length,
    stakeSlots: featured.filter((stream) => stream.tags.includes('stake')).length,
    gamblingSlots: featured.filter((stream) => stream.tags.includes('gambling')).length,
    wholesomeSlots: featured.filter((stream) => stream.tags.includes('wholesome')).length,
    averageRisk,
    hottestName: hottest.streamerName || hottest.title || 'Nobody',
    hottestRisk: Math.round(hottest.risk || 0),
  };
}

function talentSummary(state) {
  const entries = Object.entries(state.relationships || {});
  if (!entries.length) return { average: 0, bestName: 'Nobody yet', bestScore: 0, worstName: 'Nobody yet', worstScore: 0, count: 0 };
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const average = Math.round(entries.reduce((sum, [, score]) => sum + score, 0) / entries.length);
  return {
    average,
    bestName: streamerName(state, sorted[0][0]),
    bestScore: sorted[0][1],
    worstName: streamerName(state, sorted[sorted.length - 1][0]),
    worstScore: sorted[sorted.length - 1][1],
    count: entries.length,
  };
}

function streamerName(state, streamerId) {
  return state.streamers?.find((streamer) => streamer.id === streamerId)?.name
    || state.streams.find((stream) => stream.streamerId === streamerId)?.streamerName
    || streamerId;
}

function reviewLine(label, value) {
  return `<div class="review-line"><span>${label}</span><strong>${value}</strong></div>`;
}

function resultMetric(label, value, note, sentiment) {
  const tone = sentiment > 0 ? 'good' : sentiment < 0 ? 'bad' : 'neutral';
  return `<div class="result-metric ${tone}"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
}

function formatDelta(value, prefix = '') {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '±';
  return `${sign}${prefix}${Math.abs(value).toLocaleString()}`;
}

function formatMoney(value) {
  return `${value < 0 ? '−' : ''}$${Math.abs(value).toLocaleString()}`;
}

function formatNumber(value) {
  return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
}

function formatSigned(value) {
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function wireBriefing(root, state) {
  wireCareer(root);
  const start = root.querySelector('[data-start-shift]');
  if (!start) return;
  start.onclick = () => {
    startedShifts.add(state.shift);
    store.dispatch({ type: 'SET_RUNNING', payload: { running: true } });
  };
}

function wireResults(root, state) {
  wireCareer(root);
  const next = root.querySelector('[data-next-shift]');
  if (next) next.onclick = () => store.dispatch({ type: 'ADVANCE_SHIFT' });
  const restart = root.querySelector('[data-restart]');
  if (restart) restart.onclick = () => location.reload();
  void state;
}

function wireCareer(root) {
  const career = root.querySelector('[data-career-overlay]');
  if (career) career.onclick = () => window.dispatchEvent(new CustomEvent('kickstaff:career-open'));
}

function show(root, mode) {
  root.hidden = false;
  root.dataset.mode = mode;
  setBoardInert(true);
}

function hide(root) {
  root.hidden = true;
  delete root.dataset.mode;
  setBoardInert(false);
}

function setBoardInert(value) {
  for (const id of ['hud', 'app']) {
    const node = document.getElementById(id);
    if (node) node.inert = value;
  }
}

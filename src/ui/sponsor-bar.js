// WS-G standalone sponsor strip. Reads runtime contract status from state and
// renders into the S2.0 #sponsorSlot mount point; no engine imports or actions.
import { store } from '../state/store.js';

export function mountSponsorBar() {
  render(store.getState());
  store.subscribe(render, sponsorSignature);
}

function sponsorSignature(state) {
  const signature = [state.shift, state.phase];
  for (const sponsor of state.sponsors || []) {
    const runtime = sponsor.runtime || {};
    signature.push([
      sponsor.id,
      runtime.shift,
      runtime.satisfied,
      runtime.ticksUnsatisfied,
      runtime.satisfiedTicks,
      runtime.evaluatedTicks,
      runtime.dropped,
      runtime.payoutEarned,
      runtime.detail,
    ].join('|'));
  }
  return signature;
}

function render(state) {
  const root = document.getElementById('sponsorSlot');
  if (!root) return;
  const sponsors = state.sponsors || [];
  if (sponsors.length === 0) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <section class="sponsor-strip" aria-label="Sponsor contracts">
      <div class="sponsor-strip__label"><span>CONTRACT PRESSURE</span><small>every needy logo wants a different fucking homepage</small></div>
      <div class="sponsor-strip__contracts">${sponsors.map(sponsorCard).join('')}</div>
    </section>`;
}

function sponsorCard(sponsor) {
  const runtime = sponsor.runtime || {};
  const failTicks = Math.max(1, sponsor.failTicks || 1);
  const missed = runtime.ticksUnsatisfied || 0;
  const patience = runtime.dropped ? 0 : Math.max(0, 100 - (missed / failTicks) * 100);
  const uptime = runtime.evaluatedTicks
    ? Math.round((runtime.satisfiedTicks / runtime.evaluatedTicks) * 100)
    : 0;
  const status = runtime.dropped
    ? 'dropped'
    : !runtime.evaluatedTicks
      ? 'pending'
      : runtime.satisfied ? 'satisfied' : 'breach';
  const badge = status === 'dropped'
    ? 'TOLD US TO FUCK OFF'
    : status === 'satisfied'
      ? 'LOGO HAPPY'
      : status === 'breach' ? `PISSED ${missed}/${failTicks}` : 'WAITING TO COMPLAIN';
  const payout = runtime.payoutEarned > 0
    ? `coughed up $${runtime.payoutEarned}`
    : `dangling up to $${sponsor.payoutPerShift || 0}`;

  return `
    <article class="sponsor-contract is-${status}" style="--sponsor-color:${safeColor(sponsor.color)}">
      <div class="sponsor-contract__head">
        <strong>${escape(sponsor.name)}</strong>
        <span>${badge}</span>
      </div>
      <p>${escape(runtime.detail || sponsor.blurb)}</p>
      <div class="sponsor-contract__meter" aria-label="${Math.round(patience)} percent patience remaining">
        <i style="width:${patience}%"></i>
      </div>
      <div class="sponsor-contract__foot"><span>${payout}</span><span>${uptime}% uptime</span></div>
    </article>`;
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#53fc18';
}

function escape(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[character]));
}

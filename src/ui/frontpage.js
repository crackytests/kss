// FRONT PAGE — slot management + live risk meters + pull controls. Owned by WS-A.
// Renders from state, dispatches PULL_STREAM. No engine imports.
//
// Render-optimization (HANDOFF): risk meters DO change every tick, so the whole
// pane is NOT gated. Instead we split the work:
//   - render() rebuilds the slot LIST only when the structure changes (which
//     stream occupies each slot, or the Stake-slot presence). Gated by
//     structureSignature via store.subscribe(render, selector) — see §7.
//   - updateMeters() runs every commit but only mutates the existing meter
//     widths / labels in place, so pull buttons (and any hover/focus) survive.
import { store } from '../state/store.js';
import { streamThumbnail } from './stream-thumbnails.js?v=4';

export function mountFrontPage() {
  render(store.getState());
  store.subscribe(updateMeters);                 // every commit: in-place meter tweak
  store.subscribe(render, structureSignature);   // structural change only
}

/** Signature of the slot layout — changes only when occupancy flips. */
function structureSignature(s) {
  return [s.frontPage.join(','), s.frontPage.some(Boolean) ? 1 : 0];
}

function render(state) {
  const root = document.getElementById('frontpage');
  const hasStake = state.frontPage.some((id) => {
    const s = state.streams.find((x) => x.id === id);
    return s && s.isStake;
  });

  const slots = state.frontPage.map((id, i) => slot(state, id, i)).join('');
  root.innerHTML = `
    <h2>Front Page — ${state.frontPage.filter(Boolean).length}/${state.slots} slots</h2>
    ${hasStake ? '' : `<div class="sponsor-warning">⚠️ No Stake stream featured — sponsor requires one. (<span data-noticks>${state.ticksNoStake}</span> ticks)</div>`}
    <div class="pane-body">${slots}</div>
  `;
  wire();
  // Fresh structure → seed meters from current risk so the first paint is right.
  updateMeters(state);
}

function slot(state, id, i) {
  if (!id) {
    return `<div class="slot" data-slot="${i}"><div class="slot-empty">Slot ${i + 1} — empty · promote a stream</div></div>`;
  }
  const s = state.streams.find((x) => x.id === id);
  if (!s) return `<div class="slot" data-slot="${i}"><div class="slot-empty">Slot ${i + 1}</div></div>`;

  const riskPct = Math.min(100, Math.round((s.risk / s.tosThreshold) * 100));
  const color = riskColor(riskPct);
  const streamIndex = state.streams.indexOf(s);
  return `
    <div class="slot filled ${s.isStake ? 'stake-req' : ''}" data-slot="${i}" data-stream="${s.id}">
      <div class="slot-body">
        <div class="slot-thumb">${streamThumbnail(s, streamIndex)}</div>
        <div class="slot-details">
          <div class="slot-head">
            <span class="slot-title">${escape(s.title)}</span>
            <button data-pull="${s.id}">Pull</button>
          </div>
          <div class="stream-sub"><b class="slot-streamer">${escape(s.streamerName)}</b> · ${escape(s.category)} · ${s.viewers.toLocaleString()} viewers ${s.isStake ? '· 🎰 STAKE' : ''}</div>
          <div class="risk-meter"><div class="risk-fill" style="width:${riskPct}%;background:${color}"></div></div>
          <div class="risk-label"><span>TOS risk</span><span>${riskLabel(riskPct)}</span></div>
          ${state.perks && state.perks.risk_xray ? `<div class="risk-xray" data-xray>${xrayText(s)}</div>` : ''}
        </div>
      </div>
    </div>`;
}

// Risk X-Ray perk (WS-E): effective per-tick risk + live ticks-to-break estimate.
function effectiveRate(s) { return s.riskRate * (1 + s.controversy / 120); }
function xrayText(s) {
  const rate = effectiveRate(s);
  const remaining = Math.max(0, s.tosThreshold - s.risk);
  const tleft = rate > 0 ? Math.ceil(remaining / rate) : Infinity;
  return `⚡ ${rate.toFixed(2)}/tick · ~${Number.isFinite(tleft) ? tleft + 't' : '∞'} to break`;
}

/** Mutate meter widths / labels in place. Never rebuild — keeps buttons alive. */
function updateMeters(state) {
  const root = document.getElementById('frontpage');
  if (!root) return;
  state.frontPage.forEach((id, i) => {
    if (!id) return;
    const slotEl = root.querySelector(`.slot[data-slot="${i}"]`);
    if (!slotEl) return;
    const s = state.streams.find((x) => x.id === id);
    if (!s) return;
    const riskPct = Math.min(100, Math.round((s.risk / s.tosThreshold) * 100));
    const fill = slotEl.querySelector('.risk-fill');
    if (fill) {
      fill.style.width = riskPct + '%';
      fill.style.background = riskColor(riskPct);
    }
    const label = slotEl.querySelector('.risk-label span:last-child');
    if (label) label.textContent = riskLabel(riskPct);
    const xray = slotEl.querySelector('[data-xray]');
    if (xray) xray.textContent = xrayText(s);
  });
  const ticks = root.querySelector('[data-noticks]');
  if (ticks) ticks.textContent = String(state.ticksNoStake);
}

function riskLabel(pct) {
  const danger = pct >= 80 ? ' 🔥' : pct >= 60 ? ' ⚠️' : '';
  return pct + '%' + danger;
}

function riskColor(pct) {
  if (pct >= 80) return 'var(--bad)';
  if (pct >= 55) return 'var(--warn)';
  return 'var(--good)';
}

function wire() {
  const root = document.getElementById('frontpage');
  root.querySelectorAll('[data-pull]').forEach((b) => {
    b.onclick = () => store.dispatch({ type: 'PULL_STREAM', payload: { streamId: b.dataset.pull } });
  });
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// PERKS SHOP — WS-E (Sprint 2). Between-shift store. Renders into #shopSlot (a
// mount slot lead exposes in index.html) and is shown only during phase
// 'shift_end' — i.e. after you clear a shift, before you advance. Dispatches
// PURCHASE_PERK; the reducer + engine/perks.js do the rest. No engine imports.
import { store } from '../state/store.js';

let PERKS = [];

export function mountShop() {
  fetch('src/data/perks.json')
    .then((r) => r.json())
    .then((defs) => { PERKS = defs; render(store.getState()); })
    .catch(() => { PERKS = []; });
  // Re-render when the shop's slice changes: which phase, money, or owned perks.
  store.subscribe(render, (s) => [s.phase, s.money, Object.keys(s.perks || {}).sort().join(',')]);
}

function render(state) {
  const root = document.getElementById('shopSlot');
  if (!root) return;

  // Only offered between shifts (after a clear). Hidden while playing / fired.
  if (state.phase !== 'shift_end') { root.innerHTML = ''; return; }

  const rows = PERKS.map((p) => perkRow(p, state)).join('');
  root.innerHTML = `
    <aside class="shop" aria-label="Perk shop">
      <div class="shop__head">
        <div>
          <div class="shop__eyebrow">STAFF PERKS</div>
          <h3 class="shop__title">Spend before you clock back in</h3>
        </div>
        <div class="shop__wallet">$${state.money.toLocaleString()}</div>
      </div>
      <div class="shop__list">${rows || '<div class="shop__empty">No perks available.</div>'}</div>
      <p class="shop__foot">Perks are permanent — they carry across runs.</p>
    </aside>`;
  wire(state);
}

function perkRow(perk, state) {
  const owned = !!(state.perks && state.perks[perk.id]);
  const afford = state.money >= perk.cost;
  const btn = owned
    ? '<span class="shop-owned">OWNED</span>'
    : `<button class="shop-buy ${afford ? 'primary' : ''}" data-perk="${perk.id}" data-cost="${perk.cost}" ${afford ? '' : 'disabled'}>$${perk.cost.toLocaleString()}</button>`;
  return `
    <div class="shop-perk ${owned ? 'is-owned' : ''}">
      <div class="shop-perk__icon" aria-hidden="true">${perk.icon || '⭐'}</div>
      <div class="shop-perk__body">
        <div class="shop-perk__name">${escape(perk.name)}</div>
        <div class="shop-perk__blurb">${escape(perk.blurb)}</div>
      </div>
      <div class="shop-perk__buy">${btn}</div>
    </div>`;
}

function wire(state) {
  const root = document.getElementById('shopSlot');
  root.querySelectorAll('[data-perk]').forEach((el) => {
    el.onclick = () => store.dispatch({
      type: 'PURCHASE_PERK',
      payload: { perkId: el.dataset.perk, cost: Number(el.dataset.cost) },
    });
  });
  void state;
}

function escape(str) {
  return String(str).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

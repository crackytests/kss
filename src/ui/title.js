// TITLE SCREEN + SETTINGS — WS-L (Sprint 4 Release Cut). Owned by lead.
// A full-screen shell over the game: brand, content notice, mode select
// (Career / Daily Run), career ledger, and a settings panel (volume / mute /
// reset career). The game itself boots underneath, paused on its briefing —
// the title is pure chrome and dismisses into it.
//
// Mode switching navigates (mode lives in the URL per engine/persistence.js);
// a one-shot sessionStorage flag skips the title on that reload so the player
// lands straight on the briefing.
import { store } from '../state/store.js';
import { setVolume } from '../engine/audio.js';

const SKIP_KEY = 'kickstaff.titleSkip';
const RESUME_KEY = 'kickstaff.resumeAfterNav';

/** Mounts the title shell. Returns true if it RESUMED a saved run (second leg
 * of a ">>" navigation) — main.js must then skip its fresh START_SHIFT. */
export function mountTitle() {
  const root = document.getElementById('titleScreen');
  if (!root) return false;

  // One-shot flags set before an in-title navigation reload.
  let skip = false;
  let resumeNow = false;
  try {
    skip = sessionStorage.getItem(SKIP_KEY) === '1';
    if (skip) sessionStorage.removeItem(SKIP_KEY);
    resumeNow = sessionStorage.getItem(RESUME_KEY) === '1';
    if (resumeNow) sessionStorage.removeItem(RESUME_KEY);
  } catch { /* storage unavailable — always show title */ }

  render(root);
  wire(root);
  initVolume();

  // Second leg of a ">>" resume that had to change the URL first (v15).
  if (resumeNow && store.resumeRun()) { hide(root); return true; }

  if (skip) hide(root);
  else show(root);
  return false;
}

function isDaily() {
  return new URLSearchParams(location.search).get('mode') === 'daily';
}

function render(root) {
  const daily = isDaily();
  const today = new Date().toISOString().slice(0, 10);
  const snap = store.hasSavedRun();
  const resumeLabel = snap
    ? `Resume last game — shift ${snap.state.shift}${snap.mode === 'daily' ? ' (daily)' : ''}`
    : '';
  root.innerHTML = `
    <div class="title-card" role="dialog" aria-modal="true" aria-labelledby="titleBrand">
      <div class="title-eyebrow">A PLATFORM CURATION SATIRE</div>
      <h1 id="titleBrand" class="title-brand">KICK STAFF<br>SIMULATOR</h1>
      <p class="title-tag">Feature the chaos. Keep the slots spinning. Pull it one tick before it becomes your problem.</p>

      <div class="title-notice">
        <b>18+ · R-rated satire &amp; parody.</b> Strong language, gambling
        degeneracy, crude adult humor. Characters are fictional creations;
        some parody the public conduct of public figures. Nothing depicted is
        a statement of fact about any real person.
      </div>

      <div class="title-actions">
        ${snap ? `<button class="primary title-btn title-resume" data-resume aria-label="${resumeLabel}" title="${resumeLabel}">&gt;&gt;</button>` : ''}
        <button class="${snap ? '' : 'primary '}title-btn" data-mode="career">▶ ${daily ? 'Switch to Career' : 'Start Career'}</button>
        <button class="title-btn ${daily ? 'primary' : ''}" data-mode="daily">📅 ${daily ? `Play Daily — ${today}` : 'Daily Run'}</button>
      </div>
      <div class="title-actions title-actions--minor">
        <button data-title-ledger>📊 Career Ledger</button>
        <button data-title-settings>⚙️ Settings</button>
        <a class="title-menu-link" href="https://crackyreads.com/our-games" target="_blank" rel="noopener noreferrer">🎮 More games ↗</a>
      </div>

      <div class="title-foot">Best on desktop · progress saves in this browser</div>
    </div>`;

  // Settings lives in its OWN top-level host — NOT inside #titleScreen — so the
  // HUD gear can open it mid-game while the title is display:none.
  const host = document.getElementById('settingsHost');
  if (host) {
    host.innerHTML = `
    <div class="settings-panel" id="settingsPanel" hidden>
      <div class="settings-card" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Settings</h2>
        <label class="settings-row">
          <span>Volume</span>
          <input type="range" id="volSlider" min="0" max="100" step="5" />
        </label>
        <label class="settings-row">
          <span>Mute</span>
          <input type="checkbox" id="muteCheck" />
        </label>
        <div class="settings-row settings-row--danger">
          <span>Wipe saved career<br><small>money, perks, history — gone</small></span>
          <button id="resetCareerBtn">Reset career</button>
        </div>
        <div class="settings-actions"><button class="primary" data-settings-close>Done</button></div>
      </div>
    </div>`;
  }
}

function wire(root) {
  // ">>" — resume the saved run (v15). If the saved run's mode/seed don't match
  // the current URL, navigate to the canonical run URL first (so persistence's
  // run config aligns) and finish the resume after the reload via RESUME_KEY.
  const resumeBtn = root.querySelector('[data-resume]');
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      const snap = store.hasSavedRun();
      if (!snap) { render(root); wire(root); return; }
      const params = new URLSearchParams(location.search);
      const urlMatches = (params.get('mode') === 'daily') === (snap.mode === 'daily')
        && params.get('seed') === String(snap.seed);
      if (!urlMatches) {
        try { sessionStorage.setItem(RESUME_KEY, '1'); } catch { /* resume inline instead */ }
        location.href = `${location.pathname}?seed=${snap.seed}${snap.mode === 'daily' ? '&mode=daily' : ''}`;
        return;
      }
      if (store.resumeRun()) hide(root);
    };
  }

  for (const btn of root.querySelectorAll('[data-mode]')) {
    btn.onclick = () => {
      const wantDaily = btn.dataset.mode === 'daily';
      if (wantDaily === isDaily()) { hide(root); return; }
      try { sessionStorage.setItem(SKIP_KEY, '1'); } catch { /* fall through to title re-show */ }
      const base = location.pathname;
      location.href = wantDaily ? `${base}?mode=daily` : base;
    };
  }

  root.querySelector('[data-title-ledger]').onclick = () =>
    window.dispatchEvent(new CustomEvent('kickstaff:career-open'));

  root.querySelector('[data-title-settings]').onclick = () => openSettings();
  window.addEventListener('kickstaff:settings-open', openSettings);

  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  panel.querySelector('[data-settings-close]').onclick = () => { panel.hidden = true; };
  panel.onclick = (e) => { if (e.target === panel) panel.hidden = true; };

  panel.querySelector('#volSlider').oninput = (e) => {
    const v = Number(e.target.value) / 100;
    setVolume(v);
    const state = store.getState();
    state.career = { ...(state.career || {}), volume: v };
    store.persist();
  };

  panel.querySelector('#muteCheck').onchange = () => store.dispatch({ type: 'TOGGLE_MUTE' });

  panel.querySelector('#resetCareerBtn').onclick = () => {
    if (!confirm('Wipe your saved career? Money, perks, leaderboard, relationships — all gone.')) return;
    store.resetCareer();
    location.reload();
  };
}

function openSettings() {
  const panel = document.getElementById('settingsPanel');
  if (!panel) return;
  const state = store.getState();
  const vol = typeof (state.career || {}).volume === 'number' ? state.career.volume : 1;
  panel.querySelector('#volSlider').value = String(Math.round(vol * 100));
  panel.querySelector('#muteCheck').checked = !!state.muted;
  panel.hidden = false;
}

/** Apply persisted volume once at mount (audio.js default is full). */
function initVolume() {
  const vol = (store.getState().career || {}).volume;
  if (typeof vol === 'number') setVolume(vol);
}

function show(root) {
  root.hidden = false;
  for (const id of ['hud', 'app']) {
    const el = document.getElementById(id);
    if (el) el.inert = true;
  }
}

function hide(root) {
  root.hidden = true;
  // Only un-inert if the shift overlay isn't also holding the board.
  const overlay = document.getElementById('shiftOverlay');
  if (overlay && !overlay.hidden) return;
  for (const id of ['hud', 'app']) {
    const el = document.getElementById(id);
    if (el) el.inert = false;
  }
}

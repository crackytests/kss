// WS-Q — keyboard shortcuts + discoverable help + additive accessibility sync.
// Every gameplay shortcut dispatches an EXISTING store action. No engine imports.
import { store } from '../state/store.js';

let helpDialog = null;
let restoreFocus = null;

export function mountHotkeys() {
  if (document.getElementById('hotkeyHelp')) return;

  helpDialog = document.createElement('dialog');
  helpDialog.id = 'hotkeyHelp';
  helpDialog.className = 'hotkey-dialog';
  helpDialog.setAttribute('aria-labelledby', 'hotkeyHelpTitle');
  helpDialog.innerHTML = `
    <div class="hotkey-dialog__head">
      <div>
        <span>Curator controls</span>
        <h2 id="hotkeyHelpTitle">Keyboard shortcuts</h2>
      </div>
      <button type="button" data-hotkey-close aria-label="Close keyboard shortcuts">×</button>
    </div>
    <p>Run the whole shitshow without taking your hands off the keyboard.</p>
    <dl class="hotkey-list">
      <div><dt><kbd>1</kbd>–<kbd>6</kbd></dt><dd>Pull that front-page slot</dd></div>
      <div><dt><kbd>Space</kbd></dt><dd>Pause or resume the shift</dd></div>
      <div><dt><kbd>M</kbd></dt><dd>Mute or unmute audio</dd></div>
      <div><dt><kbd>?</kbd></dt><dd>Open or close this overlay</dd></div>
      <div><dt><kbd>Esc</kbd></dt><dd>Close this overlay</dd></div>
    </dl>
    <small>Shortcuts stand down while you are typing in search or another form field.</small>`;
  document.body.appendChild(helpDialog);

  helpDialog.querySelector('[data-hotkey-close]').addEventListener('click', closeHelp);
  helpDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeHelp();
  });
  helpDialog.addEventListener('click', (event) => {
    if (event.target === helpDialog) closeHelp();
  });
  document.addEventListener('keydown', handleKeydown);

  // HUD/front-page views rebuild on commits. Run after their subscribers and
  // add semantics in-place without taking ownership of their render logic.
  store.subscribe(syncAccessibility);
  syncAccessibility(store.getState());
}

function handleKeydown(event) {
  if (isTypingTarget(event.target) || event.ctrlKey || event.altKey || event.metaKey) return;

  if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
    event.preventDefault();
    if (helpDialog.open) closeHelp();
    else openHelp();
    return;
  }

  if (helpDialog.open) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeHelp();
    }
    return;
  }
  if (visibleDialogExists()) return;

  const state = store.getState();
  if (/^[1-6]$/.test(event.key)) {
    const streamId = state.frontPage[Number(event.key) - 1];
    if (!streamId) return;
    event.preventDefault();
    store.dispatch({ type: 'PULL_STREAM', payload: { streamId } });
    return;
  }

  if (event.code === 'Space' || event.key === ' ') {
    if (state.phase !== 'playing') return;
    event.preventDefault();
    store.dispatch({ type: 'SET_RUNNING', payload: { running: !state.running } });
    return;
  }

  if (event.key.toLocaleLowerCase() === 'm') {
    event.preventDefault();
    store.dispatch({ type: 'TOGGLE_MUTE' });
  }
}

function openHelp() {
  if (!helpDialog || helpDialog.open) return;
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (typeof helpDialog.showModal === 'function') helpDialog.showModal();
  else helpDialog.setAttribute('open', '');
  helpDialog.querySelector('[data-hotkey-close]').focus();
}

function closeHelp() {
  if (!helpDialog?.open) return;
  if (typeof helpDialog.close === 'function') helpDialog.close();
  else helpDialog.removeAttribute('open');
  if (restoreFocus?.isConnected) restoreFocus.focus();
  restoreFocus = null;
}

function isTypingTarget(target) {
  return target instanceof Element
    && !!target.closest('input, textarea, select, [contenteditable="true"]');
}

function visibleDialogExists() {
  return [...document.querySelectorAll('dialog[open], [role="dialog"], [aria-modal="true"]')]
    .some((dialog) => dialog !== helpDialog
      && !dialog.closest('[hidden]')
      && dialog.getClientRects().length > 0);
}

function syncAccessibility(state) {
  const hud = document.getElementById('hud');
  if (hud && !document.getElementById('hotkeyHelpBtn')) {
    const helpButton = document.createElement('button');
    helpButton.id = 'hotkeyHelpBtn';
    helpButton.className = 'hotkey-help-trigger';
    helpButton.type = 'button';
    helpButton.textContent = '?';
    helpButton.title = 'Keyboard shortcuts';
    helpButton.setAttribute('aria-label', 'Show keyboard shortcuts');
    helpButton.setAttribute('aria-keyshortcuts', 'Shift+/');
    helpButton.addEventListener('click', openHelp);
    hud.insertBefore(helpButton, document.getElementById('muteBtn'));
  }

  setButtonLabel('muteBtn', state.muted ? 'Unmute audio' : 'Mute audio', 'M');
  setButtonLabel('settingsBtn', 'Open settings');
  setButtonLabel('careerBtn', 'Open career ledger');
  setButtonLabel('pauseBtn', state.running ? 'Pause shift' : 'Resume shift', 'Space');

  state.frontPage.slice(0, 6).forEach((streamId, index) => {
    if (!streamId) return;
    const stream = state.streams.find((candidate) => candidate.id === streamId);
    const slot = document.querySelector(`#frontpage .slot[data-slot="${index}"]`);
    if (!stream || !slot) return;

    slot.setAttribute('aria-label', `Front-page slot ${index + 1}: ${stream.streamerName}`);
    const pull = slot.querySelector('[data-pull]');
    if (pull) {
      pull.setAttribute('aria-label', `Pull ${stream.streamerName} from slot ${index + 1}`);
      pull.setAttribute('aria-keyshortcuts', String(index + 1));
    }

    const percent = Math.min(100, Math.max(0, Math.round((stream.risk / stream.tosThreshold) * 100)));
    const meter = slot.querySelector('.risk-meter');
    if (meter) {
      meter.setAttribute('role', 'progressbar');
      meter.setAttribute('aria-label', `${stream.streamerName} TOS risk`);
      meter.setAttribute('aria-valuemin', '0');
      meter.setAttribute('aria-valuemax', '100');
      meter.setAttribute('aria-valuenow', String(percent));
      meter.setAttribute('aria-valuetext', `${percent} percent TOS risk`);
    }
  });

  const investigation = document.querySelector('#hud .investigation');
  if (investigation) {
    investigation.setAttribute('role', 'progressbar');
    investigation.setAttribute('aria-label', 'Regulatory investigation');
    investigation.setAttribute('aria-valuemin', '0');
    investigation.setAttribute('aria-valuemax', '100');
    investigation.setAttribute('aria-valuenow', String(Math.round(state.investigation || 0)));
  }

  document.querySelectorAll('button[title]:not([aria-label])').forEach((button) => {
    button.setAttribute('aria-label', button.title);
  });
}

function setButtonLabel(id, label, shortcut = null) {
  const button = document.getElementById(id);
  if (!button) return;
  button.setAttribute('aria-label', label);
  if (shortcut) button.setAttribute('aria-keyshortcuts', shortcut);
}

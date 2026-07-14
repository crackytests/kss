// AUDIO ENGINE + JUICE HOOKS — owned by WS-H (see docs/BUILD_PLAN.md → Sprint 2).
//
// mountAudio() does two jobs, both driven from a single store subscription:
//   1. AUDIO — scans NEW eventQueue items each commit (seen-id Set, exactly like
//      ui/toast.js) and plays a synthesized Web Audio cue per event type. No asset
//      files. The AudioContext is created lazily on the first user gesture to
//      satisfy browser autoplay policy; state.muted silences everything.
//   2. JUICE HOOKS — because this file cannot edit the other workstreams' UI JS,
//      it drives CSS juice by toggling additive classes on DOM those files already
//      render: a `.juice-pop` on a HUD stat's <b> when its value changes, a
//      `.juice-danger` on a front-page `.risk-fill` when that meter nears its TOS
//      threshold, and a body-level `.juice-shake` on tos_break / audit. All the
//      motion lives in styles/juice.css and is disabled under prefers-reduced-motion.
//
// Contract: export mountAudio(). Never call Math.random() (uses state.rng).
// Class toggles on existing nodes only — never builds/writes UI content.

import { store } from '../state/store.js';

// ---- audio state (lazily initialised on first user gesture) ----
let ctx = null;         // AudioContext | null — null until first gesture
let master = null;      // GainNode master bus
const played = new Set(); // event ids already handled (mirrors toast.js `shown`)

// User volume 0..1, scaling the fixed bus level. Set by the settings panel
// (WS-L, Sprint 4) via setVolume; applied on the live bus and remembered for
// the lazily-created context.
const BASE_GAIN = 0.28;
let volume = 1;

/** Additive Sprint-4 export: user volume control (0..1). */
export function setVolume(v) {
  volume = Math.max(0, Math.min(1, Number(v) || 0));
  if (master) master.gain.value = BASE_GAIN * volume;
}

// Note frequencies (Hz) used by the cues.
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;

export function mountAudio() {
  // Autoplay policy: no AudioContext until the user interacts. We attach the
  // unlock once and remove it after firing. Events that arrive before the unlock
  // are still marked "seen" (see onCommit) so unlocking never dumps a backlog.
  const unlock = () => {
    ensureContext();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Single subscription: audio cues + juice class toggles. mountAudio() is called
  // last in main.js, so by the time this runs every UI pane has already rendered
  // the current commit — the DOM we read/annotate below is up to date.
  store.subscribe(onCommit);
}

function ensureContext() {
  if (ctx) {
    // A tab-backgrounded context can go suspended; nudge it back on gesture.
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // no Web Audio support → stay silent, game still works
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = BASE_GAIN * volume; // civilised bus level × user volume
    master.connect(ctx.destination);
  } catch {
    ctx = null;
    master = null;
  }
}

function onCommit(state) {
  // 1) AUDIO + shake — drain new events. Always mark seen (even when muted or
  //    before unlock) so we never replay a backlog once sound becomes available.
  for (const evt of state.eventQueue) {
    if (played.has(evt.id)) continue;
    played.add(evt.id);
    handleEvent(evt, state);
  }

  // 2) JUICE — number-pop on changed HUD stats + meter-danger pulse.
  applyNumberPops(state);
  applyMeterDanger(state);
}

function handleEvent(evt, state) {
  // Visual shake is independent of audio: it should still fire when muted, but is
  // neutralised by prefers-reduced-motion in juice.css.
  if (evt.type === 'tos_break' || evt.type === 'audit') triggerShake();

  if (state.muted) return;      // muted → no sound at all
  ensureContext();              // no-op if already built; null if pre-gesture
  if (!ctx || !master) return;  // not unlocked yet → silent

  switch (evt.type) {
    case 'jackpot': return cueJackpot(state);
    case 'viral': return cueJackpot(state);      // toast treats viral as celebratory too
    case 'tos_break': return cueAlarm();
    case 'audit': return cueSiren();
    case 'dm_incoming': return cuePing();
    case 'sponsor_warning': return cueBuzzer();
    case 'info': return cueClick();
    // Unlisted types (e.g. shift_end) stay silent by design — no noise floor.
    default: return;
  }
}

// ---------------------------------------------------------------------------
// Web Audio synthesis helpers. Everything is oscillator + gain-envelope; no
// samples. `t` is an offset in seconds from "now".
// ---------------------------------------------------------------------------

/** One enveloped oscillator note. */
function note({ type = 'sine', freq, to, t = 0, dur = 0.15, gain = 0.2, attack = 0.004 }) {
  const t0 = ctx.currentTime + t;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (typeof to === 'number' && to !== freq) osc.frequency.linearRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// Bright ascending "cha-ching": a quick arpeggio with a sparkle on top. rng adds
// a touch of detune so repeats don't sound mechanical (never Math.random).
function cueJackpot(state) {
  const steps = [C5, E5, G5, C6];
  steps.forEach((f, i) => note({ type: 'triangle', freq: f, t: i * 0.075, dur: 0.16, gain: 0.24 }));
  const detune = 1 + (state.rng.next() - 0.5) * 0.02; // ±1% sparkle wobble
  note({ type: 'sine', freq: C6 * 2 * detune, t: 0.3, dur: 0.35, gain: 0.16 });
  note({ type: 'triangle', freq: G5 * 2, t: 0.3, dur: 0.28, gain: 0.12 });
}

// Harsh two-tone klaxon alarm.
function cueAlarm() {
  const a = 466.16, b = 349.23; // dissonant-ish alternation
  for (let i = 0; i < 3; i++) {
    note({ type: 'square', freq: a, t: i * 0.28, dur: 0.13, gain: 0.2 });
    note({ type: 'square', freq: b, t: i * 0.28 + 0.14, dur: 0.13, gain: 0.2 });
  }
}

// Rising/falling police siren via a frequency sweep repeated twice.
function cueSiren() {
  note({ type: 'sawtooth', freq: 620, to: 1040, t: 0, dur: 0.42, gain: 0.16 });
  note({ type: 'sawtooth', freq: 1040, to: 620, t: 0.42, dur: 0.42, gain: 0.16 });
  note({ type: 'sawtooth', freq: 620, to: 1040, t: 0.84, dur: 0.42, gain: 0.16 });
}

// Soft, friendly two-note ping.
function cuePing() {
  note({ type: 'sine', freq: 880, t: 0, dur: 0.12, gain: 0.16 });
  note({ type: 'sine', freq: 1174.66, t: 0.09, dur: 0.16, gain: 0.14 });
}

// Low, rude buzzer — two clipped sawtooth pulses.
function cueBuzzer() {
  note({ type: 'sawtooth', freq: 150, t: 0, dur: 0.16, gain: 0.22 });
  note({ type: 'sawtooth', freq: 132, t: 0.2, dur: 0.2, gain: 0.22 });
}

// Subtle UI click / blip.
function cueClick() {
  note({ type: 'triangle', freq: 1200, t: 0, dur: 0.045, gain: 0.12 });
}

// ---------------------------------------------------------------------------
// JUICE class toggles (additive; the animations themselves live in juice.css).
// ---------------------------------------------------------------------------

let shakeTimer = null;
function triggerShake() {
  const b = document.body;
  if (!b) return;
  b.classList.remove('juice-shake');
  // Force reflow so re-adding the class restarts the keyframe even on back-to-back events.
  void b.offsetWidth;
  b.classList.add('juice-shake');
  clearTimeout(shakeTimer);
  shakeTimer = setTimeout(() => b.classList.remove('juice-shake'), 520);
}

// HUD stats are rebuilt wholesale each commit, so we can't diff DOM nodes; we
// track the previous numeric values ourselves and pop the matching stat's <b>.
const POP_STATS = [
  ['Engagement', (s) => s.engagement],
  ['Money', (s) => s.money],
  ['Reputation', (s) => s.reputation],
  ['Heat', (s) => s.heat],
];
let prevStatValues = null;

function applyNumberPops(state) {
  const values = POP_STATS.map(([, get]) => get(state));
  if (prevStatValues) {
    const hud = document.getElementById('hud');
    if (hud) {
      POP_STATS.forEach(([label], i) => {
        if (values[i] === prevStatValues[i]) return;
        const b = findStatValue(hud, label);
        if (b) {
          b.classList.remove('juice-pop');
          void b.offsetWidth; // restart animation
          b.classList.add('juice-pop');
        }
      });
    }
  }
  prevStatValues = values;
}

// Find the <b> value node for a stat by matching its .lbl text (robust to the
// HUD reordering its stats). hud.js renders: <div class="stat"><span class="lbl">
function findStatValue(hud, label) {
  const stats = hud.querySelectorAll('.stat');
  for (const stat of stats) {
    const lbl = stat.querySelector('.lbl');
    if (lbl && lbl.textContent.trim() === label) return stat.querySelector('b');
  }
  return null;
}

// Pulse a front-page risk meter when its stream is near the TOS threshold.
const METER_DANGER_PCT = 75;
function applyMeterDanger(state) {
  const fp = document.getElementById('frontpage');
  if (!fp) return;
  for (const id of state.frontPage) {
    if (!id) continue;
    const s = state.streams.find((x) => x.id === id);
    if (!s) continue;
    const fill = fp.querySelector(`.slot[data-stream="${cssEscape(id)}"] .risk-fill`);
    if (!fill) continue;
    const pct = (s.risk / s.tosThreshold) * 100;
    fill.classList.toggle('juice-danger', pct >= METER_DANGER_PCT);
  }
}

// Minimal attribute-selector escaping (stream ids are simple, but be safe).
function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/["\\\]]/g, '\\$&');
}

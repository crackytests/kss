// AUDIT ENGINE — owned by WS-D (see docs/BUILD_PLAN.md).
// Heat-driven random regulatory audits. The higher state.heat, the higher the
// per-tick chance a regulator drops by. When an audit fires it scans the
// featured front page and FINES any stream whose risk exceeds the audit line
// (from data/tos-rules.json): engagement + reputation drop, heat rises, and the
// offending stream is forced off the page. A 'bad'-tone 'audit' event hits the
// feed. A clean sweep instead reassures the regulator and cools heat a little.
// When no breach or fine happens, heat slowly cools over ticks.
//
// Contract: export step(state). Uses state.rng — NEVER Math.random(). Does not
// touch the DOM. See CONTRACTS.md §5 (events), §6 (step + rng).

import { store, clamp } from '../state/store.js';

// Tuning defaults mirror src/data/tos-rules.json (owned by WS-C — read-only for
// WS-D). We additionally hydrate the live file at load so WS-C tuning changes
// take effect without editing this module. Falls back to defaults if unavailable
// (e.g. under `node --check`, where fetch never runs).
const rules = {
  auditRiskLine: 70,
  auditBaseChancePer10Heat: 0.02,
};

if (typeof fetch === 'function') {
  fetch('src/data/tos-rules.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((json) => {
      if (json && typeof json.auditRiskLine === 'number') {
        rules.auditRiskLine = json.auditRiskLine;
      }
      if (json && typeof json.auditBaseChancePer10Heat === 'number') {
        rules.auditBaseChancePer10Heat = json.auditBaseChancePer10Heat;
      }
    })
    .catch(() => { /* keep defaults — audits still function */ });
}

const MAX_AUDIT_CHANCE = 0.25;   // sanity cap so max heat isn't a coin flip/tick
const HEAT_COOL_PER_TICK = 0.4;  // slow regulatory cool-down on quiet ticks
const CLEAN_AUDIT_COOL = 5;      // passing an audit reassures the regulator
const FINE_HEAT_PER_STREAM = 8;  // getting caught draws even more attention
const FINE_REP_PER_STREAM = 3;
const FINE_BASE = 50;            // flat engagement fine per over-risk stream

// Tracks cumulative TOS breaks so we can tell if one just happened this tick.
let lastBreaks = 0;
let lastShift = -1;

export function step(state) {
  if (state.shift !== lastShift) {
    lastShift = state.shift;
    lastBreaks = 0;
  }
  if (state.phase !== 'playing') return;

  // Did risk.js flag a fresh TOS break earlier in this same tick?
  const breachedThisTick = state.tosBreaksThisShift > lastBreaks;
  lastBreaks = state.tosBreaksThisShift;

  // Per-tick audit chance scales linearly with heat: auditBaseChancePer10Heat
  // per 10 points of heat, capped. At heat 0 no audit is possible.
  const auditChance = clamp(
    (state.heat / 10) * rules.auditBaseChancePer10Heat,
    0,
    MAX_AUDIT_CHANCE,
  );
  const audited = state.heat > 0 && state.rng.chance(auditChance);

  let finedThisTick = false;
  if (audited) finedThisTick = runAudit(state);

  // Heat cools slowly on quiet ticks (no fresh TOS break, no audit fine).
  if (!breachedThisTick && !finedThisTick) {
    state.heat = clamp(state.heat - HEAT_COOL_PER_TICK, 0, 100);
  }
}

function runAudit(state) {
  const offenders = featured(state).filter((s) => s.risk > rules.auditRiskLine);

  if (offenders.length === 0) {
    // Clean sweep — regulator backs off a little.
    state.heat = clamp(state.heat - CLEAN_AUDIT_COOL, 0, 100);
    store.pushEvent({
      type: 'audit', tone: 'neutral',
      message: `🔎 Snap audit — front page clean. Regulator stands down. Heat −${CLEAN_AUDIT_COOL}.`,
    });
    return false;
  }

  let totalFine = 0;
  let repHit = 0;
  let heatGain = 0;
  for (const s of offenders) {
    const overBy = s.risk - rules.auditRiskLine;
    totalFine += FINE_BASE + Math.round(overBy * 2);
    repHit += FINE_REP_PER_STREAM;
    heatGain += FINE_HEAT_PER_STREAM;
    // Regulator forces the offending stream off the front page (takedown).
    const idx = state.frontPage.indexOf(s.id);
    if (idx !== -1) state.frontPage[idx] = null;
    if (s.state === 'featured') {
      s.state = 'pulled';
      s.cooldown = 3;
    }
  }

  state.engagement = Math.max(0, state.engagement - totalFine);
  state.reputation = clamp(state.reputation - repHit, 0, 100);
  state.heat = clamp(state.heat + heatGain, 0, 100);

  const noun = offenders.length === 1 ? 'stream' : 'streams';
  store.pushEvent({
    type: 'audit', tone: 'bad',
    streamId: offenders[0].id,
    message: `🚔 AUDIT! ${offenders.length} over-risk ${noun} fined & taken down — engagement −${totalFine}, reputation −${repHit}, heat +${heatGain}.`,
  });
  return true;
}

function featured(state) {
  return state.streams.filter((s) => s.state === 'featured');
}

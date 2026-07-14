// JACKPOT / MULTI-SPONSOR ENGINE — WS-G.
// Featured gambling streams roll for jackpots, while every authored sponsor in
// state.sponsors evaluates its own demand, patience, warnings, and drop cost.
// Runtime sponsor status stays on the sponsor object so the standalone UI strip
// can render it without importing this engine.

import { store } from '../state/store.js';

const rules = {
  sponsorGraceTicks: 5,
  sponsorFailTicks: 20,
  sponsorWarnReputationPenalty: 4,
  sponsorFailMoneyPenalty: 1500,
  sponsorFailReputationPenalty: 40,
  engagementScale: 0.4,
  jackpotEngagementFactor: 0.5,
  jackpotMoneyFactor: 1.0,
};

if (typeof fetch === 'function') {
  fetch('src/data/tos-rules.json')
    .then((response) => (response.ok ? response.json() : null))
    .then((json) => {
      if (!json) return;
      for (const key of Object.keys(rules)) {
        if (typeof json[key] === 'number') rules[key] = json[key];
      }
    })
    .catch(() => { /* keep deterministic defaults */ });
}

export function step(state) {
  if (state.phase !== 'playing') return;

  rollJackpots(state);

  for (const sponsor of sponsorList(state)) {
    if (state.phase !== 'playing') break;
    stepSponsor(state, sponsor);
  }
}

function rollJackpots(state) {
  for (const stream of state.streams) {
    if (stream.state !== 'featured' || !stream.isGambling) continue;
    if (!state.rng.chance(stream.jackpotChance)) continue;

    const cash = Math.round(stream.jackpotPayout * rules.jackpotMoneyFactor);
    const engagement = Math.round(
      stream.jackpotPayout * rules.jackpotEngagementFactor * rules.engagementScale,
    );
    state.money += cash;
    state.engagement += engagement;
    store.pushEvent({
      type: 'jackpot',
      tone: 'good',
      streamId: stream.id,
      message: `💰 JACKPOT on "${stream.title}"! The house farted money: +$${cash} to you, +${engagement} engagement.`,
    });
  }
}

function stepSponsor(state, sponsor) {
  const runtime = ensureRuntime(state, sponsor);
  if (runtime.dropped) return;

  const result = evaluateDemand(state, sponsor);
  const previousMisses = runtime.ticksUnsatisfied;
  runtime.satisfied = result.satisfied;
  runtime.detail = result.detail;
  runtime.evaluatedTicks += 1;

  if (result.satisfied) {
    runtime.satisfiedTicks += 1;
    runtime.ticksUnsatisfied = 0;
    if (previousMisses >= graceTicks(sponsor)) {
      store.pushEvent({
        type: 'info',
        tone: 'good',
        message: `✅ ${sponsor.name} stopped throwing a corporate tantrum. Contract clock reset.`,
      });
    }
  } else {
    runtime.ticksUnsatisfied += 1;
  }

  if (sponsor.id === 'stake') state.ticksNoStake = runtime.ticksUnsatisfied;
  if (result.satisfied) return;

  const missed = runtime.ticksUnsatisfied;
  if (missed >= failTicks(sponsor)) {
    dropSponsor(state, sponsor, runtime);
    return;
  }

  const grace = graceTicks(sponsor);
  const warningEvery = Math.max(1, sponsor.warningEveryTicks || 5);
  if (missed === grace || (missed > grace && missed % warningEvery === 0)) {
    const repPenalty = sponsor.warningReputationPenalty
      ?? rules.sponsorWarnReputationPenalty;
    state.reputation = Math.max(0, state.reputation - repPenalty);
    runtime.lastWarningTick = state.tick;
    store.pushEvent({
      type: 'sponsor_warning',
      tone: 'bad',
      message: `⚠️ ${sponsor.name} is pissed: ${runtime.detail} ${failTicks(sponsor) - missed} ticks before the money fucks off. Reputation −${repPenalty}.`,
    });
  }
}

function dropSponsor(state, sponsor, runtime) {
  const moneyPenalty = sponsor.dropMoneyPenalty ?? rules.sponsorFailMoneyPenalty;
  const reputationPenalty = sponsor.dropReputationPenalty
    ?? rules.sponsorFailReputationPenalty;

  runtime.dropped = true;
  runtime.satisfied = false;
  runtime.dropTick = state.tick;
  runtime.detail = `Dropped: ${runtime.detail}`;
  state.money -= moneyPenalty;
  state.reputation = Math.max(0, state.reputation - reputationPenalty);

  store.pushEvent({
    type: 'sponsor_warning',
    tone: 'bad',
    message: `❌ ${sponsor.name} killed the bloody contract after ${runtime.ticksUnsatisfied} misses. −$${moneyPenalty}, Reputation −${reputationPenalty}.`,
  });

  if (sponsor.terminal) {
    state.phase = 'fired';
    state.running = false;
    state.failureReason = 'sponsor';
  }
}

function evaluateDemand(state, sponsor) {
  const featured = state.frontPage.map((id, slot) => ({
    slot,
    stream: id ? state.streams.find((item) => item.id === id) : null,
  }));

  if (sponsor.demand === 'featureTag') {
    const match = featured.some(({ stream }) => (
      stream && stream.tags.includes(sponsor.tag)
    ));
    return {
      satisfied: match,
      detail: match
        ? `A ${sponsor.tag}-tagged money furnace is live.`
        : `No ${sponsor.tag}-tagged money furnace is featured.`,
    };
  }

  if (sponsor.demand === 'featureCategoryAvoidGambling') {
    const wanted = featured.filter(({ stream }) => (
      stream && stream.tags.includes(sponsor.wantsTag)
    ));
    if (wanted.length === 0) {
      return {
        satisfied: false,
        detail: `No ${sponsor.wantsTag} stream is featured. The brand is having a shit-fit.`,
      };
    }

    const conflict = wanted.some(({ slot }) => (
      [slot - 1, slot + 1].some((neighbor) => {
        const stream = featured.find((item) => item.slot === neighbor)?.stream;
        return stream && (
          stream.isGambling
          || stream.tags.includes(sponsor.avoidAdjacentTag)
        );
      })
    ));
    return {
      satisfied: !conflict,
      detail: conflict
        ? `A casino stream is dry-humping the wholesome inventory next door.`
        : `Wholesome inventory is live with suspiciously clean neighbours.`,
    };
  }

  return { satisfied: false, detail: `Unknown contract demand: ${sponsor.demand}.` };
}

function ensureRuntime(state, sponsor) {
  if (!sponsor.runtime) {
    sponsor.runtime = freshRuntime(
      state.shift,
      sponsor.id === 'stake' ? state.ticksNoStake : 0,
    );
    return sponsor.runtime;
  }
  if (sponsor.runtime.shift !== state.shift) {
    const dropped = !!sponsor.runtime.dropped;
    const dropTick = sponsor.runtime.dropTick ?? null;
    sponsor.runtime = {
      ...freshRuntime(state.shift, 0),
      dropped,
      dropTick,
      detail: dropped ? 'Contract already told us to get fucked.' : 'Waiting for the logo to judge us.',
    };
  }
  return sponsor.runtime;
}

function freshRuntime(shift, ticksUnsatisfied) {
  return {
    shift,
    satisfied: false,
    detail: 'Waiting for the logo to judge us.',
    ticksUnsatisfied,
    satisfiedTicks: 0,
    evaluatedTicks: 0,
    lastWarningTick: null,
    dropped: false,
    dropTick: null,
    payoutEarned: 0,
  };
}

function sponsorList(state) {
  if (!Array.isArray(state.sponsors) || state.sponsors.length === 0) {
    // Backward-compatible contract for Node harnesses that predate S2.0.
    state.sponsors = [{
      id: 'stake',
      name: 'Stake',
      demand: 'featureTag',
      tag: 'stake',
      graceTicks: rules.sponsorGraceTicks,
      failTicks: rules.sponsorFailTicks,
      payoutPerShift: 0,
      warningReputationPenalty: rules.sponsorWarnReputationPenalty,
      dropMoneyPenalty: rules.sponsorFailMoneyPenalty,
      dropReputationPenalty: rules.sponsorFailReputationPenalty,
      terminal: true,
      color: '#f5a623',
    }];
  }
  return state.sponsors;
}

function graceTicks(sponsor) {
  return sponsor.graceTicks ?? rules.sponsorGraceTicks;
}

function failTicks(sponsor) {
  return sponsor.failTicks ?? rules.sponsorFailTicks;
}

# Contracts — READ BEFORE WRITING CODE

This file is the law. Every module depends on these shapes and names. **Do not
change anything here without updating this file in the same commit and noting it
in `BUILD_PLAN.md` under "Contract changes".** If you need a field that doesn't
exist, add it here first, then implement.

All shapes documented as JSDoc-style typedefs. The project is plain JS; these are
the source of truth for structure.

---

## 1. Game State (`store.getState()`)

```js
/**
 * @typedef {Object} GameState
 * @property {number}   shift            // 1-based day counter
 * @property {number}   tick             // ticks elapsed this shift
 * @property {number}   ticksPerShift    // shift length (default 60)
 * @property {boolean}  running          // clock active
 * @property {'playing'|'shift_end'|'fired'|'won'} phase
 *
 * @property {number}   engagement       // score this shift
 * @property {number}   quota            // engagement needed to pass shift
 * @property {number}   quotaGrowthPerShift    // quota multiplier on ADVANCE_SHIFT
 * @property {number}   riskRateGrowthPerShift // stream riskRate multiplier on ADVANCE_SHIFT
 * @property {number}   maxTosBreaksPerShift   // immediate-firing threshold
 * @property {number}   money            // persistent personal money
 * @property {number}   reputation       // 0..100
 * @property {number}   heat             // 0..100 regulatory attention
 * @property {number}   tosBreaksThisShift
 * @property {(null|'quota'|'reputation'|'tos_limit'|'sponsor')} failureReason
 *
 * @property {Stream[]}    streams        // full live directory
 * @property {(string|null)[]} frontPage  // slot array, holds streamId or null. length = slots
 * @property {number}   slots            // front page capacity (perks.js keeps = baseSlots + perk bonuses)
 * @property {number}   baseSlots        // (S2.0) slots before perks; engine/perks.js reconciles `slots`
 * @property {number}   ticksNoStake     // legacy mirror of Stake runtime.ticksUnsatisfied
 *
 * @property {DMThread[]} threads        // discord conversations
 *
 * // ---- Sprint 2 (S2.0) additive; all backward-compatible ----
 * @property {Object.<string,boolean>} perks       // owned perks. Persisted. WS-E applies via engine/perks.js
 * @property {Object.<string,number>}  relationships // streamerId → −100..100 standing. WS-F drives
 * @property {Sponsor[]} sponsors        // seeded from data/sponsors.json. WS-G migrates jackpot.js to read this
 * @property {boolean}  muted            // audio mute. Persisted. WS-H reads
 * @property {Career}   [career]         // localStorage career blob; additive meta-progression + WS-I run history
 *
 * // ---- Sprint 3 (S3.0 + WS-K) additive ----
 * @property {Object[]} liveEvents       // temporary world events; engine/events.js owns lifecycle
 * @property {Mutator|null} mutator      // seeded run modifier; initialized before UI mount
 * @property {number}   wonAtShift       // clearing this shift sets phase 'won'
 * @property {number}   viewerGrowthPerShift // stream viewer multiplier on ADVANCE_SHIFT
 *
 * @property {GameEvent[]} eventQueue     // engine pushes; UI drains each commit
 * @property {RNG}      rng              // seeded PRNG, see §6
 * @property {number}   seed
 */
```

### Run mutator (`src/data/mutators.json`, runtime extended by `engine/mutators.js`)

```js
/**
 * @typedef {Object} Mutator
 * @property {'crackdown'|'gold_rush'|'drama_week'|'sponsor_war'|'slow_news_day'} id
 * @property {string} name
 * @property {string} icon
 * @property {'good'|'bad'|'neutral'} tone
 * @property {string} blurb
 * @property {string} summary
 * @property {Object.<string,number>} effects // run-start/per-tick multipliers
 * @property {number} rosterSize
 * @property {{initialized:boolean,lastHeat:number,extraAudits:number}} runtime
 */
```

### Sponsor (`src/data/sponsors.json`, runtime extended by `engine/jackpot.js`)

```js
/**
 * @typedef {Object} Sponsor
 * @property {string} id
 * @property {string} name
 * @property {'gambling'|'family'} kind
 * @property {'featureTag'|'featureCategoryAvoidGambling'} demand
 * @property {string} [tag]                   // featureTag requirement
 * @property {string} [wantsTag]              // required content for family contract
 * @property {string} [avoidAdjacentTag]      // forbidden tag in a neighboring slot
 * @property {string} blurb
 * @property {number} graceTicks              // first warning at this miss streak
 * @property {number} failTicks               // consecutive misses before sponsor drops
 * @property {number} [warningEveryTicks]
 * @property {number} warningReputationPenalty
 * @property {number} dropMoneyPenalty
 * @property {number} dropReputationPenalty
 * @property {boolean} terminal               // dropped contract immediately fires player
 * @property {number} payoutPerShift           // prorated by satisfied/evaluated ticks
 * @property {string} color
 * @property {SponsorRuntime} [runtime]        // engine-owned; never authored
 */
/**
 * @typedef {Object} SponsorRuntime
 * @property {number} shift
 * @property {boolean} satisfied
 * @property {string} detail
 * @property {number} ticksUnsatisfied
 * @property {number} satisfiedTicks
 * @property {number} evaluatedTicks
 * @property {number|null} lastWarningTick
 * @property {boolean} dropped
 * @property {number|null} dropTick
 * @property {number} payoutEarned
 * @property {number} [satisfactionPct]
 */
```

**Persistence (S2.0):** `store.persist()` writes a `career` blob to
`localStorage['kickstaff.career.v1']` (`bank` = money, `perks`, `muted`,
`bestEngagement`). `store.load()` hydrates money/perks/muted from it, so **money
and perks carry across runs** (roguelite meta). Guarded — no-ops under
`file://`/Node/private mode. WS-I extends the blob (leaderboard, seenArcs, runs);
merge, don't overwrite unknown keys. **(WS-F, v8)** `engine/dm.js` additionally
mirrors `state.relationships` into `career.relationships` each tick (only on
change) and restores it on the first step of a run, so streamer standing carries
across restarts too — no store.js change needed (`persist()` preserves unknown
career keys).

### Career + local run entry (`localStorage['kickstaff.career.v1']`)

WS-I only adds keys inside the existing career blob; older saves without them
remain valid. `runHistory` keeps the newest 20 completed runs and `leaderboard`
keeps the best 10 by `score`. A run is completed on `phase === 'fired'|'won'`.

```js
/**
 * @typedef {Object} Career
 * @property {number} [bank]
 * @property {Object.<string,boolean>} [perks]
 * @property {boolean} [muted]
 * @property {number} [bestEngagement]
 * @property {Object.<string,number>} [relationships]
 * @property {number} [runs]
 * @property {number} [bestRunScore]
 * @property {number} [lifetimeEngagement]
 * @property {number} [lifetimeShifts]
 * @property {RunEntry[]} [runHistory]
 * @property {RunEntry[]} [leaderboard]
 * @property {Object.<string,RunEntry>} [dailyBest] // UTC YYYY-MM-DD -> best run
 */
/**
 * @typedef {Object} RunEntry
 * @property {string} id
 * @property {'standard'|'daily'} mode
 * @property {string|null} dailyKey
 * @property {number} seed
 * @property {string} startedAt
 * @property {string} finishedAt
 * @property {'fired'|'won'} result
 * @property {(null|'quota'|'reputation'|'tos_limit'|'sponsor')} failureReason
 * @property {number} score
 * @property {number} shiftsSurvived
 * @property {number} totalEngagement
 * @property {number} peakEngagement
 * @property {number} money
 * @property {number} moneyEarned
 * @property {number} reputation
 * @property {number} heat
 * @property {number} tosBreaks
 * @property {string|null} [mutatorId]     // absent on pre-WS-K legacy entries
 * @property {string} [mutatorName]       // display label captured with the run
 * @property {number} [rosterSize]        // seeded directory size, normally 16–18
 */
```

**Daily mode (WS-I):** `?mode=daily` derives a stable unsigned seed from the UTC
date key. **WS-K:** both daily and standard modes use a separate setup RNG to
shuffle, choose 16–18 streams, guarantee Stake + wholesome inventory, and apply
independent ±15% jitter to viewers/riskRate/jackpotChance. Mutator selection uses
another seed-salted RNG. The same UTC day therefore reproduces roster, jitter,
mutator, and gameplay RNG without setup consuming `state.rng`; standard mode uses
the existing time-based seed and receives the same per-run variance.

## 2. Stream (`src/data/streams.json` entries, hydrated at load)

```js
/**
 * @typedef {Object} Stream
 * @property {string}  id
 * @property {string}  streamerId          // FK -> streamers.json / DMThread.streamerId
 * @property {string}  title
 * @property {string}  category            // 'Slots'|'IRL'|'Just Chatting'|'Sports'|'Gambling'|'Pools'
 * @property {number}  viewers
 * @property {string}  color               // hex, for the placeholder thumbnail
 * @property {string[]} tags               // e.g. ['controversial','gambling','stake']
 * @property {number}  controversy         // 0..100 engagement multiplier driver
 * @property {boolean} isGambling
 * @property {boolean} isStake             // counts toward the sponsor requirement
 *
 * // --- risk model (see engine/risk.js) ---
 * @property {number}  risk                // 0..100 current, starts 0..low
 * @property {number}  riskRate            // base risk gained per featured tick
 * @property {number}  tosThreshold        // risk value that triggers tos_break (e.g. 100)
 *
 * // --- gambling model (see engine/jackpot.js) ---
 * @property {number}  jackpotChance       // per featured tick, 0..1 (gambling only)
 * @property {number}  jackpotPayout       // engagement+money on hit
 *
 * // --- runtime ---
 * @property {'live'|'featured'|'pulled'|'banned'} state
 * @property {number}  cooldown            // ticks until a pulled stream can re-feature
 */
```

**Engagement earned per featured tick** (canonical formula — engine/economy.js):
`floor(viewers/1000 * (1 + controversy/100) * engagementScale)`, where
`engagementScale` is a global balance knob in `data/tos-rules.json` (default 0.4).
Jackpots add a scaled engagement spike on top (see engine/jackpot.js). The raw
`viewers/1000 * (1 + controversy/100)` term is unchanged; `engagementScale` only
tunes the absolute magnitude so a full shift lands in range of the starting quota.

**Risk per featured tick** (canonical — engine/risk.js):
`risk += riskRate * (1 + controversy/120)`. At `risk >= tosThreshold` → `tos_break`.

## 3. DM Thread (`src/data/dms.json`)

```js
/**
 * @typedef {Object} DMThread
 * @property {string}  id
 * @property {string}  streamerId
 * @property {string}  name                // display handle
 * @property {string}  avatarColor         // hex
 * @property {boolean} unread
 * @property {DMMessage[]} messages         // ordered
 * @property {DMChoice[]}  choices           // currently offered replies; [] when none pending
 *
 * // --- optional authoring fields (engine/dm.js, added v4) ---
 * @property {number} [arrivesAt]           // shift tick a top-level thread opens (0/omit = present at start)
 * @property {boolean} [hidden]             // continuation thread; revealed via another thread's unlockThreadIds
 * @property {{at:number, from?:('them'|'system'), text:string, choices?:DMChoice[]}} [followUp]
 *                                         // one scheduled beat engine/dm.js delivers once at tick `at`
 *
 * // --- optional relationship-band variants (engine/dm.js, added v8 / WS-F) ---
 * //   Each shift engine/dm.js rebuilds a thread from `loyal` / `default` / `hostile`
 * //   based on state.relationships[streamerId] (>=25 loyal, <=-25 hostile).
 * //   `default` is the top-level messages/choices/followUp above. Omit a band to
 * //   fall back to default. lets a streamer's DMs change shift-to-shift from how
 * //   you treated them last shift (burned → hostile; loyal → kickback).
 * @property {{messages:DMMessage[], choices:DMChoice[], followUp?:object}} [loyal]
 * @property {{messages:DMMessage[], choices:DMChoice[], followUp?:object}} [hostile]
 *
 * // --- engine bookkeeping (never authored; mutated by engine/dm.js) ---
 * @property {boolean} [_arrived]
 * @property {boolean} [_revealed]
 * @property {boolean} [_fuDelivered]
 * @property {string|null} [_pendingForce]  // set by the DM_CHOOSE reducer from DMEffect.forceFeatureStreamId
 * @property {number}  [_forceGrace]
 */
/**
 * @typedef {Object} DMMessage
 * @property {'them'|'me'|'system'} from
 * @property {string} text
 */
/**
 * @typedef {Object} DMChoice
 * @property {string} label
 * @property {DMEffect} effect              // applied via DM_CHOOSE
 */
/**
 * @typedef {Object} DMEffect
 * @property {number} [money]               // delta
 * @property {number} [reputation]          // delta
 * @property {number} [heat]                // delta
 * @property {string} [forceFeatureStreamId]// must be featured or penalty
 * @property {string} [reply]               // streamer's follow-up text
 * @property {string[]} [unlockThreadIds]   // reveal more threads
 * @property {number} [relationship]        // (S2.0) standing delta with this thread's streamer…
 * @property {string} [relationshipStreamerId] // …or an explicit streamerId to move instead
 */
```

## 4. Actions (`store.dispatch({type, payload})`)

UI is the only caller. Reducer lives in `store.js`.

| type | payload | effect |
|------|---------|--------|
| `PROMOTE_STREAM` | `{streamId, slot}` | move live stream into a front-page slot |
| `PULL_STREAM`    | `{streamId}` | remove from front page → `pulled` + cooldown |
| `DM_OPEN`        | `{threadId}` | mark thread read |
| `DM_CHOOSE`      | `{threadId, choiceIndex}` | apply `DMEffect`, append reply |
| `START_SHIFT`    | `{}` | reset per-shift counters, phase→playing, running=true |
| `ADVANCE_SHIFT`  | `{}` | after a cleared shift, raise quota and prepare the next shift paused |
| `SET_RUNNING`    | `{running}` | pause/resume clock |
| `DISMISS_EVENT`  | `{eventId}` | UI acknowledged a toast |
| `PURCHASE_PERK`  | `{perkId, cost}` | (S2.0) if affordable & unowned: deduct `cost`, set `perks[perkId]=true`, persist. Cost comes from `data/perks.json` (WS-E) — store stays generic |
| `TOGGLE_MUTE`    | `{}` | (S2.0) flip `state.muted`, persist |
| `ADJUST_RELATIONSHIP` | `{streamerId, delta}` | (S2.0) move `relationships[streamerId]` by delta, clamped −100..100 |

Reducers must be pure state transforms + may push events. They must NOT run
engine steps.

## 5. Events (`state.eventQueue` items)

```js
/**
 * @typedef {Object} GameEvent
 * @property {string} id                    // unique, use rng or counter
 * @property {'jackpot'|'tos_break'|'audit'|'sponsor_warning'|'dm_incoming'|'viral'|'shift_end'|'info'} type
 * @property {string} message               // human text for toast feed
 * @property {string} [streamId]
 * @property {string} [threadId]
 * @property {'good'|'bad'|'neutral'} tone
 */
```

Engine steps push events; `ui/toast.js` drains and displays them, then dispatches
`DISMISS_EVENT`. Any UI may also react (e.g. discord.js reacts to `dm_incoming`).

## 6. Engine step signature

Every engine module exports a pure-ish stepper called by `clock.tick()`:

```js
// engine/<name>.js
export function step(state) { /* mutate state, push to state.eventQueue */ }
```

Call order in `clock.tick()` is fixed: **events → risk → perks → jackpot →
economy → dm → audit → mutators** (events update the world first; mutators run
last for run-specific tick overrides). Do not reorder without updating
ARCHITECTURE.md.

RNG contract (`engine/rng.js`):
```js
export function makeRng(seed) // -> { next():number in [0,1), int(n):int in [0,n), pick(arr) }
```
Store it at `state.rng`. **Never call `Math.random()` anywhere.**

## 7. Store API (`src/state/store.js`)

```js
store.getState()                 // -> GameState (treat as read-only in UI)
store.dispatch(action)           // apply reducer + commit
store.subscribe(fn)              // fn(state) called on EVERY commit; returns unsubscribe
store.subscribe(fn, selector)    // fn(state) only when selector(state) changes vs. last
                                 //   commit (shallow compare). selector returns a cheap
                                 //   signature (string/number or flat array/object).
store.commit()                   // notify subscribers (engine calls after a tick batch)
store.load(dataBundle)           // hydrate streams, streamers, threads, sponsors, rules, seed;
                                 //   also hydrates money/perks/muted from the career blob
store.persist()                  // (S2.0) snapshot money/perks/muted → localStorage career blob
store.resetCareer()              // delete full career save + reset in-memory meta progression
```

## Contract changes log
- v1 (initial) — this document.
- v2 (WS-C, 2026-07-13) — per-tick engagement formula (§2) gains a global
  `engagementScale` multiplier (knob in `data/tos-rules.json`, default 0.4).
  Only `engine/economy.js` computes engagement, so no other module is affected;
  the relative reward structure is unchanged. Needed for the balance pass because
  `store.js` (quota=2500) and `data/streams.json` (viewer counts) are owned by
  lead and outside WS-C's editable set — scaling engagement in economy is the
  only lever that keeps the placeholder quota meaningful.
- v3 (lead, 2026-07-13) — `store.subscribe` gains an optional second `selector`
  arg (§7). Backwards compatible: `subscribe(fn)` is unchanged. Enables the
  render-optimization task assigned to WS-B/GLM (see HANDOFF.md) so panes only
  re-render when their slice changes.
- v4 (WS-B/GLM, 2026-07-13) — `DMThread` (§3) gains **optional** authoring fields
  `arrivesAt`, `hidden`, `followUp`, plus engine bookkeeping fields (`_arrived`,
  `_revealed`, `_fuDelivered`, `_forceGrace`). `engine/dm.js` is the only reader/
  writer of these (the store's `DM_CHOOSE` reducer already sets `_pendingForce`
  from `DMEffect.forceFeatureStreamId`). Fully backwards compatible: existing
  `dms.json` entries (none of these fields) behave exactly as before. Needed so
  WS-B can schedule thread arrivals/unlocks/follow-ups across a shift and
  enforce force-feature deals without touching store.js (lead-owned).
- v5 (Phase 2/Codex, 2026-07-13) — added the `ADVANCE_SHIFT` action (§4). It
  performs the existing shift/quota increment and reset behind the store, then
  leaves the clock paused for the briefing. This removes direct engine imports
  from Phase 2 UI and keeps cross-module communication store-mediated.
- v6 (Phase 2/Codex, 2026-07-13) — added data-driven cross-shift difficulty
  fields and `failureReason` to `GameState` (§1). `ADVANCE_SHIFT` now compounds
  quota and stream risk rates using values loaded from `tos-rules.json`; three
  TOS breaks or zero reputation can end a shift immediately. Existing actions
  and event shapes are unchanged.
- v7 (Sprint 2 / S2.0 / lead, 2026-07-13) — **additive, backward-compatible.**
  `GameState` gains `perks`, `relationships`, `sponsors`, `baseSlots`, `muted`,
  `career` (§1). New actions `PURCHASE_PERK`, `TOGGLE_MUTE`, `ADJUST_RELATIONSHIP`
  (§4). `DMEffect` gains optional `relationship` / `relationshipStreamerId` (§3).
  Tick order inserts `perks.step` after `risk` (§6). New `store.persist()` +
  localStorage career blob (§1, §7). New `data/sponsors.json` (Stake + one
  conflicting sponsor seed). New `engine/perks.js` stub. New index.html mount
  slots `#sponsorSlot` (WS-G), `#shopSlot` (WS-E), `#leaderboardSlot` (WS-I) and a
  HUD mute button. Verified: game boots unchanged, all new actions + persistence
  work. Unlocks Sprint 2 workstreams WS-E/F/G/H/I.
- v8 (Sprint 3 / S3.0+WS-J / lead, 2026-07-14) — **additive.** `GameState` (§1)
  gains `liveEvents` (active world events; `engine/events.js` owns lifecycle),
  `mutator` (this run's modifier, null until WS-K draws it), `wonAtShift`
  (default 10; clearing it sets `phase:'won'` — a real victory, endless scaling
  continues via `ADVANCE_SHIFT`, which now also accepts phase `'won'`), and
  `viewerGrowthPerShift` (audience inflation applied to every stream's viewers in
  `ADVANCE_SHIFT`; hydrated from `tos-rules.json` alongside `wonAtShift`).
  Tick order (§6) is now **events → risk → perks → jackpot → economy → dm →
  audit → mutators**; `clock.endShift` calls `events.clearAll(state)` to revert
  live-event stat changes before payout/inflation. `engine/events.js` additionally
  exports `clearAll(state)` and `_setRules(rules)` (sim/test hook) beyond the
  standard `step`. New data files: `data/events.json` (WS-J), `data/mutators.json`
  reserved for WS-K. Curve knobs retuned: `quotaGrowthPerShift` 1.25→1.24, new
  `viewerGrowthPerShift` 1.11. `scripts/integration-check.mjs` now derives the
  quota assertion from rules (was hard-coded 3125) and asserts inflation.
- v8 (WS-F/GLM, 2026-07-13) — **additive, backward-compatible.** `DMThread` (§3)
  gains optional relationship-band variants `loyal` / `hostile` (each
  `{messages, choices, followUp?}`). `engine/dm.js` now rebuilds every thread each
  shift from the band matching `state.relationships[streamerId]` (>=25 loyal,
  <=-25 hostile, else default), so a streamer's DMs change shift-to-shift from how
  you treated them. Bands are sourced from the immutable authored `dms.json`
  (imported as a JSON module) so an early `DM_CHOOSE` can't corrupt the template.
  Force-feature honour/renege now also moves standing (+25 / −35); unresolved
  deals settle at shift end (no dodging bribes by running the clock). Standing is
  mirrored into `career.relationships` and restored per run. No store.js / action
  changes — uses S2.0's `DMEffect.relationship` + `state.relationships` + the
  career blob. Existing `dms.json` entries without variants behave exactly as
  before.
- v9 (WS-G/Codex, 2026-07-13) — formalized the previously seeded `Sponsor`
  schema and its engine-owned runtime status. `engine/jackpot.js` now evaluates
  every contract in `state.sponsors`; `engine/economy.js` prorates authored
  payouts by satisfied ticks. `ticksNoStake` remains as a backwards-compatible
  mirror of the Stake contract. No actions, event types, or store APIs changed.
- v10 (WS-I/Codex, 2026-07-14) — formalized additive `Career` / `RunEntry`
  persistence fields, local top-10/newest-20 lists, and UTC daily-seed behavior.
  No store actions or existing APIs changed; WS-I writes through the existing
  `state.career` + `store.persist()` seam.
- v11 (WS-K/Codex, 2026-07-14) — formalized `Mutator`, added optional
  `mutatorId` / `mutatorName` / `rosterSize` to `RunEntry`, and expanded run
  setup determinism to seeded 16–18 stream rosters with ±15% stat variance.
  Mutators initialize through the existing persistence seam before UI mount;
  no store actions or existing APIs changed. Legacy career entries remain valid.
- v12 (Career reset/Codex, 2026-07-14) — added `store.resetCareer()` (§7). It
  removes the single `kickstaff.career.v1` localStorage blob and clears its
  in-memory mirrors (`career`, money, perks, relationships, and mute state).
  The career ledger exposes it behind an explicit destructive confirmation.

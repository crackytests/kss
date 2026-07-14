# Architecture

Dependency-free ES modules. One central **store** holds all game state. The
**engine** modules are pure(ish) simulation that read/mutate state through the
store on each tick. The **ui** modules subscribe to the store and render; user
actions dispatch back into the store. Nothing renders except ui/, nothing
simulates except engine/.

```
                       ┌──────────────────┐
   data/*.json ──load──▶     store.js      ◀── actions ── ui/*.js
                       │  (state + pub/sub)│──── notify ──▶ (render)
                       └───────▲──┬────────┘
                               │  │ tick()
                          reads│  │mutates
                               │  ▼
          engine/ clock · events · risk · perks · jackpot · economy
                  dm · audit · mutators · persistence
```

## The one rule

**All cross-module communication goes through `store.js`.** No UI module imports
an engine module. No engine module touches the DOM. This is what lets separate
agents build `ui/discord.js` and `engine/jackpot.js` in parallel without ever
reading each other's code — they only share the store's action names and the
state shape in `CONTRACTS.md`.

## Data flow per tick

1. `clock.tick()` advances time, then calls the engine reducers in order:
   `events.step(state)` → `risk.step(state)` → `perks.step(state)` →
   `jackpot.step(state)` → `economy.step(state)` → `dm.step(state)` →
   `audit.step(state)` → `mutators.step(state)`.
2. Each `step` mutates `state` and pushes any `events` onto `state.eventQueue`.
3. `store.commit()` fires once → all subscribed UI views re-render from the new
   state. UI drains `eventQueue` for toasts/animations.

## User action flow

UI calls `store.dispatch({type, payload})`. The store's reducer switch applies
the change (e.g. `PROMOTE_STREAM`, `PULL_STREAM`, `DM_CHOOSE`) and commits.
Engine steps never run from user actions directly — only from the clock — so the
sim stays deterministic per tick.

## Determinism / RNG

All randomness goes through `state.rng` (a seeded PRNG in `src/engine/rng.js`).
Never call `Math.random()`. This makes runs reproducible for daily-seed and for
debugging. Contract detail in `CONTRACTS.md`.

## Files & ownership (see BUILD_PLAN.md for agent assignments)

| File | Responsibility |
|------|----------------|
| `src/state/store.js` | State shape, reducers, pub/sub, action dispatch |
| `src/engine/rng.js` | Seeded PRNG (`state.rng`) |
| `src/engine/clock.js` | Tick scheduler, shift/day progression, quota resolution |
| `src/engine/risk.js` | Risk accrual and TOS-break detection |
| `src/engine/jackpot.js` | Gambling jackpot rolls + data-driven sponsor contracts |
| `src/engine/economy.js` | Engagement, salary, sponsor bonuses, reputation, payout |
| `src/engine/dm.js` | Scheduled DMs and forced-feature enforcement |
| `src/engine/audit.js` | Heat-driven audits, fines, and heat decay |
| `src/engine/events.js` | Seeded temporary world events and exact stat reversion |
| `src/engine/mutators.js` | Seeded run modifiers and Crackdown tick behavior |
| `src/engine/persistence.js` | UTC daily seed, roster variance + terminal-run career archival |
| `src/ui/hud.js` | Top bar: meters, clock, quota, shift |
| `src/ui/browse.js` | Live directory list + promote controls |
| `src/ui/frontpage.js` | Front-page slots + risk meters + pull controls |
| `src/ui/discord.js` | DM app: threads, messages, choices |
| `src/ui/toast.js` | Event feed / notifications (drains eventQueue) |
| `src/ui/shift-overlay.js` | Fictional CEO-parody shift memos + detailed sponsor/safety/finance/talent performance reviews |
| `src/ui/sponsor-bar.js` | Live sponsor satisfaction, patience, and payout strip |
| `src/ui/leaderboard.js` | Local career ledger, daily challenge, top-10, and history |
| `src/main.js` | Loads data, resolves run mode/seed, mounts UI, starts clock |

# Handoff — for GLM 5.2, ChatGPT 5.6, and any agent continuing this project

> **SPRINTS 1, 2, AND 3 ARE COMPLETE.** Sprint 3 status: **S3.0, WS-J, and WS-K
> are DONE** (2026-07-14) — live events fire/revert in-game,
> the shift-6 wall is now a skill gradient, and shift 10 is a real victory
> (`phase:'won'`, endless after; 🏆).
>
> **WS-K shipped:** every run now fields a deterministic 16–18 stream subset with
> ±15% viewer/risk/jackpot variance and draws one of five seeded mutators.
> Briefings announce the rule; results and career entries retain it. Daily mode
> reproduces roster, jitter, and mutator exactly. See `CONTRACTS.md` v11 and
> `scripts/mutator-check.mjs`.

## Current status (Sprint 1 — all DONE)

- **Phase 0 (foundation): DONE.** The game boots and the full core loop runs
  end-to-end: browse → feature → engagement accrues → risk climbs → TOS breaks
  fire penalties → jackpots pay out → sponsor requirement enforced → shift ends
  with pass/fail. Verified in-browser.
- **WS-A (Browse + Front Page UX): DONE** (baseline, playable). Owner may still
  polish.
- **WS-B (Discord/DM system): DONE** (GLM 5.2). `engine/dm.js` implemented
  (arrivals/unlocks/follow-ups + force-feature enforcement), 11 streamer arcs in
  `data/dms.json`, `ui/discord.js` chrome rebuilt (server rail, avatars,
  typing/unread badges, auto-scroll, selector-gated render), `styles/discord.css`
  expanded. Contract v4 logged.
- **Render-optimization cross-cutting pass: DONE** (GLM 5.2). `browse.js` and
  `discord.js` now subscribe with a selector (re-render only on slice change);
  `frontpage.js` keeps its slot structure stable and updates risk meters in place
  each tick, so pull buttons stay clickable mid-interaction. No store-contract
  changes. Other agents may now resume UI work safely.
- **WS-C, WS-D: DONE.** Jackpot/economy, audit/heat, and event polish are live.
- **Phase 2 MVP (content + integration): DONE.** Shift briefings/results, 24
  streams, 12 top-level DM arcs, category filters, carried-risk feedback, and a
  data-driven five-day difficulty curve are implemented and verified.
- **Livestream thumbnail reels: DONE (Codex, 2026-07-13).** All 24 directory
  cards now keep a stable per-stream visual identity: the same host, set,
  palette, and camera layout remain on-screen while a subtle three-beat camera
  cycle supplies motion. A `tos_break` event opens a stream-specific replay
  using two generated incident beats, then cuts to a TOS removal card. Four
  incident atlases are preloaded at boot; reduced motion shows the final beat.

## How to run

```bash
python -m http.server 8080   # from J:\kick, then open http://localhost:8080
```
Must be served over http:// (ES modules + fetch won't run from file://).

## Rules of the road (non-negotiable)

1. **Read `docs/CONTRACTS.md` first.** It defines state shape, action names,
   event types, data schemas, and the `step(state)` engine contract. Everything
   integrates through these.
2. **Stay in your workstream's files** (`docs/BUILD_PLAN.md` ownership matrix).
   Two agents never edit the same file.
3. **All cross-module communication goes through the store.** UI dispatches
   actions; engine modules mutate state in `step()` and push events. UI never
   imports engine; engine never touches the DOM.
4. **Never call `Math.random()`** — use `state.rng` (`engine/rng.js`).
5. If you must change a contract, edit `CONTRACTS.md` + log it in `BUILD_PLAN.md`
   so others resync.

## Pick up here — SPRINT 2 (active)

> Do **S2.0 (lead)** first — it lands the additive store contract changes
> (`state.perks`, `state.relationships`, `state.sponsors`, `state.muted`, the
> `PURCHASE_PERK`/`TOGGLE_MUTE`/`ADJUST_RELATIONSHIP` actions, and the
> `localStorage` career persistence + shared UI mount slots). The five
> workstreams unlock once it's in and logged in `CONTRACTS.md`. Full scope +
> acceptance tests: `BUILD_PLAN.md` → "Sprint 2".

- **Claude (lead):** S2.0 foundation, then **WS-E** — Perks Shop & meta-progression
  (`ui/shop.js`, `engine/perks.js`, `data/perks.json`, `styles/shop.css`).
- **GLM 5.2 → WS-F — DONE (2026-07-13).** Streamer Relationships & multi-shift
  arcs. Extends its own `engine/dm.js`, `ui/discord.js`, `data/dms.json`: threads
  rebuild each shift from a `loyal`/`default`/`hostile` variant chosen by
  `state.relationships`; force-feature honour/renege moves standing (+25/−35);
  unresolved deals settle at shift end; standing mirrors into `career.relationships`
  and restores per run. 7 variant arcs (loyalty: slotking/rollarob/cozycook/
  ballgame; betrayal: dramahouse/cryptobro/rumorroom); every choice moves standing;
  ALLY/COOL/HOSTILE chip in the thread header. Contract v8 logged. Verified via
  both node harnesses.
- **ChatGPT 5.6 → WS-G — DONE (2026-07-13).** Stake and BrightFizz now run as
  independent data-driven contracts with conflicting slot demands, authored
  patience/drop costs, prorated payouts, and a live sponsor strip. Dedicated
  sponsor checks plus the five-day balance harness pass.
- **ChatGPT 5.6 → WS-I — DONE (2026-07-14).** `?mode=daily` now derives a shared
  UTC seed and deterministic directory order without consuming gameplay RNG.
  Terminal runs archive to the existing career blob with bounded recent-history,
  top-10, lifetime totals, and per-day bests. The career ledger exposes the daily
  switch, lifetime stats, ranks, and recent failure details. Same-day board
  identity and a terminal-run save surviving reload were verified in-browser;
  `scripts/persistence-check.mjs` covers the deterministic and storage contracts.
- **Spawned agent → WS-H** — Audio & Juice (`engine/audio.js`, `styles/juice.css`,
  Web Audio synth, respects `state.muted` + reduced-motion).

Ownership matrix + shared mount-point notes: `BUILD_PLAN.md` → "Sprint 2 ownership
matrix". Do not start a workstream's files before S2.0 is logged.

## Pick up here — Sprint 1 (historical, all done)

### GLM 5.2 → WS-B (Discord/DM system)
Files: `src/ui/discord.js`, `src/engine/dm.js`, `src/data/dms.json`, `src/styles/discord.css`.
- `engine/dm.js` is a stub. Make `step(state)` schedule `dm_incoming` events over
  the shift via `state.rng`, unlock threads, and enforce `forceFeatureStreamId`
  (penalty if the promised stream isn't featured within a grace window —
  `_pendingForce` is already set on threads by the store's `DM_CHOOSE` reducer).
- Expand `discord.js` chrome (typing dots, unread badges reacting to
  `dm_incoming`, server/channel rail for flavor).
- Author 8–12 streamer arcs in `dms.json`: feature-me, ignore-my-strike, bribe,
  threat, sob-story. Use the `DMEffect` schema (money/reputation/heat/
  forceFeatureStreamId/reply/unlockThreadIds).
- Acceptance in `BUILD_PLAN.md` WS-B.

#### GLM 5.2 → also owns the render-optimization task (cross-cutting, do in ONE coordinated pass)
The panes rebuild `innerHTML` wholesale every tick (1s), which resets scroll and
kills hover/focus mid-interaction. Fix it using the **selector-aware subscribe**
lead added to the store (CONTRACTS.md §7, change-log v3):

```js
// only re-render when THIS pane's slice actually changes:
store.subscribe(render, (s) => browseSignature(s)); // return a cheap string/array sig
```

- `src/ui/browse.js` and `src/ui/discord.js`: subscribe with a selector so they
  re-render only when the directory / thread list / active thread changes — not
  every tick. (discord.js is already yours.)
- `src/ui/frontpage.js`: risk meters DO change every tick, so don't gate the whole
  pane. Instead update meter widths/labels in place (mutate the existing DOM
  nodes) rather than rebuilding the slot list, so pull buttons stay clickable.
- `src/ui/hud.js` legitimately updates every tick (the clock) — leave it, or give
  it a selector if you prefer.

**Ownership exception:** this one task authorizes GLM to edit `browse.js` and
`frontpage.js` (normally WS-A / lead). Do it in a single pass *before* any other
agent resumes UI work, and note completion here so there's no collision. Do NOT
change the store's `subscribe`/`commit` contract — it's already in place.

### Then → Phase 2 content + integration
- Shift-start briefing screen and richer game-over screen. **DONE (Codex,
  2026-07-13):** `src/ui/shift-overlay.js` owns the modal flow; the store's
  `ADVANCE_SHIFT` action prepares each new shift paused. Both quota-clear and early
  sponsor-failure paths were verified in-browser, including restart and day-2
  progression. **Voice/UI refresh (2026-07-13):** both screens are now explicitly
  labeled fictional parody memos from Eddie, written with readable Australian
  phrasing and recurring tongue-in-cheek Stake pressure. The performance review
  now reports quota pace/margin, cash and sponsor attribution, contract uptime,
  policy exposure, bans, front-page mix/risk, and talent relationships.
- 20+ streams, more categories, flavor. **DONE (Codex, 2026-07-13):** 24 streams
  and matching streamer profiles; 12 top-level DM arcs; Chat/IRL/Sports filters.
- Cross-shift difficulty curve tuning. **DONE (Codex, 2026-07-13):** quota grows
  25% and risk speed 6% per cleared shift; three TOS breaks or zero reputation
  fires immediately. `scripts/simulate-balance.mjs` clears days 1–5 across all
  24 seeded runs with a competent strategy, then hits the intended day-6 wall.

### Next → optional stretch / deeper campaign
- Perks shop, daily seed, or leaderboard (see `GAME_DESIGN.md`).
- Multi-shift DM story beats; current authored arcs are a one-time career layer.
- Further accessibility/responsive polish and content tuning from playtest data.

## Known issues / notes for whoever continues
- **UI re-renders each pane wholesale every tick** — RESOLVED by GLM 5.2's
  render-optimization pass (see "Current status" above). `browse.js`/`discord.js`
  use selector-aware subscribe; `frontpage.js` updates meters in place.
- **Balance:** WS-C's engagement/payout tuning is joined by Phase 2 quota/risk
  progression in `tos-rules.json`. Run `node scripts/simulate-balance.mjs` after
  changing stream stats or difficulty knobs.
- `engine/dm.js` now formalizes force-feature enforcement: a `forceFeatureStreamId`
  deal (set on a thread as `_pendingForce` by the `DM_CHOOSE` reducer) must be
  honoured within `FORCE_GRACE_TICKS` (8) or the streamer blows the whistle
  (money/reputation/heat penalty). Clearing is per-shift.
- **Content rating: R** (matches the real platform's edge). Explicit profanity,
  crude/adult/edgy humor, gambling degeneracy, and innuendo are all in-bounds and
  wanted for authenticity — write hard-R, not PG. Hard lines still apply:
  fictional only (no real people/brands/logo assets), no slurs/hate at protected
  groups, nothing sexual involving minors and no explicit sexual media, no real
  how-to for crimes/self-harm. Full rules in GAME_DESIGN.md "Tone & content
  guardrails" — read it before writing any player-facing copy.
```

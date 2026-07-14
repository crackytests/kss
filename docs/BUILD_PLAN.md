# Build Plan — Multi-Agent

The project is split so multiple agents/models build in parallel with **zero
shared files**. Everyone reads `CONTRACTS.md`; nobody edits another workstream's
files. The store + data schemas are the only integration surface.

## Phase 0 — Foundation ✅ (done by lead / Claude Opus)

Owns the shared surface so parallel work can't conflict.
- [x] Repo scaffold, `index.html`, CSS reset/layout
- [x] `docs/` (design, architecture, contracts, this plan, handoff)
- [x] `src/state/store.js` — state shape, reducers, pub/sub (**contract-locked**)
- [x] `src/engine/rng.js` — seeded PRNG
- [x] `src/engine/clock.js` — tick loop + shift progression
- [x] `src/engine/risk.js` — risk/TOS engine (reference implementation of the pattern)
- [x] `src/data/*.json` — seed content (streams, streamers, dms, tos rules)
- [x] `src/ui/hud.js` + `src/ui/toast.js` — HUD + event feed (render pattern reference)
- [x] `src/main.js` — boot wiring; **game boots and the core loop runs end to end**

> Phase 0 delivers a *playable skeleton*: you can promote/pull streams, risk
> climbs, TOS breaks fire, the clock advances. It's deliberately thin so the
> workstreams below have a live target to build against.

## Phase 1 — Parallel workstreams

Each workstream = one agent, one set of files, one acceptance test. Order within
a workstream is up to the agent.

### WS-A · Front Page & Browse UX  — *files: `src/ui/browse.js`, `src/ui/frontpage.js`, `src/styles/board.css`*
The tactile core. Make promoting/pulling feel good and legible.
- Directory list with filters (category, tag, "controversial", "gambling").
- Front-page slots with live risk meters (color from safe→danger), pull button,
  and a visible "pull sweet-spot" affordance.
- Enforce & surface the Stake-slot requirement (warning styling when missing).
- Acceptance: can fill/empty slots, meters animate per tick, empty-Stake warning
  shows, no direct engine imports (dispatch-only).

### WS-B · Discord DM System — *files: `src/ui/discord.js`, `src/engine/dm.js`, `src/data/dms.json` (extend), `src/styles/discord.css`*
The narrative + bribery layer.
- Discord-style pane: thread list (unread badges), message view, choice buttons.
- `engine/dm.js` `step()` schedules `dm_incoming` events over the shift (rng),
  unlocks threads, and enforces `forceFeatureStreamId` (penalty if not featured).
- Author 8–12 streamer arcs (feature-me / ignore-my-strike / bribe / threat).
- Acceptance: threads arrive over time, choices apply DMEffect via `DM_CHOOSE`,
  a bribe visibly moves money + reputation, a forced-feature that's ignored fires
  a penalty event.

### WS-C · Gambling & Economy — *files: `src/engine/jackpot.js`, `src/engine/economy.js` (extend), `src/data/tos-rules.json` (tune)*
The reward math + tuning.
- `jackpot.js`: per-tick rolls for featured gambling streams, jackpot events +
  payouts, sponsor (Stake) tracking → `sponsor_warning` when `ticksNoStake` high.
- `economy.js`: finalize engagement/money/reputation deltas, end-of-shift payout,
  quota check → `phase` transitions (`shift_end`/`fired`/next shift).
- Balance pass so the "pull at the last safe tick" strategy is optimal but risky.
- Acceptance: jackpots fire and pay out, ignoring the Stake requirement is
  punished, a full shift resolves to pass/fail with sensible numbers.

### WS-D · Audit, Heat & Events polish — *files: `src/engine/audit.js`, `src/ui/toast.js` (extend), `src/styles/theme.css`*
The pressure + feel layer.
- `audit.js`: heat-driven random audits that scan the front page; fine any stream
  over the audit risk line; raise/lower heat.
- Toast/event feed polish: tone colors, jackpot celebration, TOS-break alarm.
- Global theme pass (Kick-ish green/black, but original — no real logos/brand).
- Acceptance: audits trigger at high heat and fine live over-risk streams; event
  feed is readable and distinguishes good/bad/neutral.

## Phase 2 — Integration & content (any agent)
- [x] End-to-end tuning across shifts (25% quota growth, 6% risk-speed growth,
  three-break firing threshold; deterministic balance harness).
- [x] Shift-start briefing and game-over scorecards (Codex, 2026-07-13); refreshed
  as fictional Australian CEO parody memos with expanded operational reporting.
- [x] Content pass: 24 streams, 24 streamer profiles, 12 top-level DM arcs,
  category filters, and carried-risk feedback (Codex, 2026-07-13).
- Optional stretch: perks shop, daily seed, leaderboard (see GAME_DESIGN.md).

## Ownership matrix (no two agents touch the same file)

| File | Owner |
|------|-------|
| store.js, rng.js, clock.js, risk.js, hud.js, main.js, index.html, data/streams.json, data/streamers.json | Phase 0 / lead |
| ui/browse.js, ui/frontpage.js, styles/board.css | WS-A |
| ui/discord.js, engine/dm.js, styles/discord.css | WS-B |
| engine/jackpot.js, engine/economy.js, data/tos-rules.json | WS-C |
| engine/audit.js, ui/toast.js, styles/theme.css | WS-D |

> `data/dms.json` is authored by WS-B. `data/streams.json`/`streamers.json` are
> owned by lead but WS-B/WS-C may *append* entries (coordinate via this file).

## Contract changes
Log any change to `CONTRACTS.md` here with date + reason so other agents resync.
- 2026-07-13 (WS-C): §2 per-tick engagement formula now multiplies by a global
  `engagementScale` knob (`data/tos-rules.json`, default 0.4). Balance pass —
  scales the large per-tick engagement down to fit the placeholder 2500 quota so
  a full shift resolves to a real pass/fail. Only `engine/economy.js` computes
  engagement, so no other workstream needs code changes; just be aware totals are
  ~0.4× their old magnitude. See CONTRACTS.md contract-changes log v2.
- 2026-07-13 (WS-B/GLM): §3 `DMThread` gains **optional** authoring fields
  (`arrivesAt`, `hidden`, `followUp`) + engine bookkeeping (`_arrived`,
  `_revealed`, `_fuDelivered`, `_forceGrace`). Only `engine/dm.js` reads/writes
  them; `store.js` is unchanged (`DM_CHOOSE` already sets `_pendingForce`).
  Backwards compatible. See CONTRACTS.md contract-changes log v4.
- 2026-07-13 (Phase 2/Codex): §4 adds `ADVANCE_SHIFT`, which raises the quota,
  resets the board, and prepares the new shift paused for its briefing. This
  keeps Phase 2 UI dispatch-only. See CONTRACTS.md contract-changes log v5.
- 2026-07-13 (Phase 2/Codex): §1 adds the difficulty multipliers, per-shift TOS
  limit, and structured failure reason. These are hydrated from `tos-rules.json`
  and consumed by store/clock/economy/results. See CONTRACTS.md v6.
- 2026-07-13 (WS-F/GLM): §3 `DMThread` gains optional relationship-band variants
  `loyal`/`hostile` (each `{messages, choices, followUp?}`) + `_arc` bookkeeping.
  `engine/dm.js` rebuilds threads each shift from the band matching
  `state.relationships`, moves standing on force-feature honour/renege, settles
  unresolved deals at shift end, and mirrors standing into `career.relationships`
  for cross-run memory. No store.js/action changes (uses S2.0 surface). See
  CONTRACTS.md contract-changes log v8.
- 2026-07-13 (WS-G/Codex): formalized the seeded `Sponsor` schema and runtime
  contract status (CONTRACTS.md v9). Jackpot/economy now consume
  `state.sponsors`; `ticksNoStake` stays as a legacy Stake mirror. No store or
  action changes.
- 2026-07-14 (WS-I/Codex): formalized additive `Career` / `RunEntry` fields and
  UTC daily-seed behavior (CONTRACTS.md v10). WS-I extends the existing career
  blob and persist API; no new store actions or changed APIs.
- 2026-07-14 (WS-K/Codex): formalized `Mutator` and optional mutator/roster
  metadata on `RunEntry` (CONTRACTS.md v11). Run setup now deterministically
  chooses and jitters a 16–18 stream roster plus one mutator without advancing
  gameplay RNG. Existing actions and store APIs are unchanged.
- 2026-07-14 (Career reset/Codex): added `store.resetCareer()` (CONTRACTS.md
  v12) and a confirmed reset control in the career ledger. The method removes
  the complete browser-local career blob and clears all in-memory meta mirrors.

## Suggested agent assignment for this project
- **Claude Opus (lead):** Phase 0 + WS-A (interactive core).
- **GLM 5.2:** WS-B (Discord/DM system) + Phase 2 content.
- **ChatGPT 5.6:** WS-C (gambling/economy) + WS-D (audit/heat/polish).

See `HANDOFF.md` for exact starting instructions to paste to each model.

---

# Sprint 2 — "Depth & Replayability"

Sprint 1 shipped a complete, balanced MVP: full core loop, DM narrative, economy,
audits, content pass, shift briefing/scorecards, and the render-opt pass. It is
*complete but flat* — every run plays about the same. Sprint 2 adds the three
things that make a sim replayable: **meta-progression** (spend what you earn),
**memory** (the world remembers your choices across shifts), and **juice** (it
feels good to play). Same rules as Sprint 1: read `CONTRACTS.md`, stay in your
files, everything through the store, never `Math.random()`.

**Content rating for all new copy: R** — see GAME_DESIGN.md "Tone & content
guardrails". Write to the real platform's edge; respect the hard lines.

## Phase S2.0 — Foundation (lead / Claude, do FIRST) — additive, backward-compatible

Locks the shared contract surface so the five workstreams below never collide.
All additions are *additive* — the MVP keeps working unchanged. **DONE & verified
2026-07-13 (lead); see CONTRACTS.md change-log v7.**
- [x] `store.js` + `CONTRACTS.md §1`: added `state.perks`, `state.relationships`,
  `state.sponsors` (seeded from `data/sponsors.json`), `state.baseSlots`,
  `state.muted`, `state.career`.
- [x] New actions (`CONTRACTS.md §4`): `PURCHASE_PERK {perkId, cost}`,
  `TOGGLE_MUTE {}`, `ADJUST_RELATIONSHIP {streamerId, delta}`; `DMEffect` gains
  optional `relationship`/`relationshipStreamerId` so DM choices move standing
  without engine imports.
- [x] Persistence seam: `store.persist()` + hydrate-on-`load()` to
  `localStorage['kickstaff.career.v1']` (bank/perks/muted/bestEngagement). Money
  and perks carry across runs; per-shift state still resets. Guarded for
  file:///Node/private mode.
- [x] Tick order: `perks.step` inserted after `risk` (`clock.js`); new
  `engine/perks.js` stub (WS-E owns).
- [x] Mount slots exposed in `index.html`: `#sponsorSlot` (WS-G), `#shopSlot`
  (WS-E), `#leaderboardSlot` (WS-I); HUD mute button wired to `TOGGLE_MUTE`.
- [x] `data/sponsors.json` seed (Stake + BrightFizz conflicting sponsor).

## Phase S2.1 — Parallel workstreams

### WS-E · Perks Shop & Meta-progression — DONE (lead, 2026-07-13) — *`src/ui/shop.js`, `src/engine/perks.js`, `src/data/perks.json`, `src/styles/shop.css`*
Shipped & verified: 4 perks (risk_xray, auto_pull, heat_scrubber, extra_slot).
Shop renders in a right-docked panel during `shift_end`; `PURCHASE_PERK` deducts
+ persists; `engine/perks.js` reconciles the 6th slot, auto-pulls at 90% risk,
and scrubs heat; `risk_xray` reveal added to `ui/frontpage.js` (lead-owned).
Verified in-browser: buy → money/persist/slots/x-ray all correct.

<details><summary>original scope</summary>

Spend `money` between shifts on upgrades that bend the rules.
- Shop surfaces in the between-shift overlay (coordinate the mount point with the
  shift-overlay owner; shop renders into a container, does not rewrite the overlay).
- `engine/perks.js` applies owned-perk effects each tick / at relevant hooks:
  auto-pull-at-threshold, **risk x-ray** (reveal exact `riskRate` so you can time
  pulls), **+1 front-page slot**, **heat scrubber** (passive heat cooldown), and a
  **jackpot-luck** bump. Perks read from `state.perks`; never hard-code.
- Acceptance: buy a perk with money → it persists across shifts (localStorage) and
  visibly changes play (e.g. +1 slot appears; x-ray shows a rate readout).

</details>

### WS-F · Streamer Relationships & Multi-shift Arcs — DONE (GLM 5.2, 2026-07-13) — *`src/engine/dm.js`, `src/ui/discord.js`, `src/data/dms.json`* (extends its own WS-B files)
Shipped & verified: `engine/dm.js` now rebuilds every thread each shift from a
`loyal`/`default`/`hostile` variant chosen by `state.relationships[streamerId]`
(>=25 loyal, <=-25 hostile); arcs recur every shift instead of dying after day 1.
Force-feature honour/renege moves standing (+25/−35) and unresolved deals settle
at shift end (no bribing the clock). Standing mirrors into `career.relationships`
and restores per run, so the world remembers you across restarts. 7 arcs carry
full variant content (loyalty: slotking/rollarob/cozycook/ballgame; betrayal:
dramahouse/cryptobro/rumorroom); every choice moves standing. The thread header
shows an ALLY/COOL/HOSTILE chip. Verified in-engine + via both harnesses.
<details><summary>original scope</summary>

The world remembers you.
- `state.relationships[streamerId]` moves on DM choices (honor a deal → up; take a
  bribe then pull them → down). Persist a summary in `career.seenArcs`.
- Threads reference history ("you screwed me last shift…"); a streamer you burned
  returns hostile; a loyalty path unlocks recurring kickbacks (money) with rising
  heat. 6–8 multi-shift arcs. Reuse the `DMEffect` schema + new
  `ADJUST_RELATIONSHIP` action; no new store contract needed beyond S2.0.
- Acceptance: a choice in shift N changes a thread's content in shift N+1; standing
  is visible in the thread header; at least one betrayal and one loyalty arc pay off.

</details>

### WS-G · Multiple Sponsors & Conflicting Demands — DONE (Codex, 2026-07-13) — *`src/engine/jackpot.js`, `src/engine/economy.js`, `src/data/sponsors.json`, `src/ui/sponsor-bar.js`, `src/styles/sponsor.css`*
Shipped & verified: Stake and BrightFizz evaluate independently from
`state.sponsors`; Stake still requires a Stake-tagged stream and remains a
terminal contract, while BrightFizz requires wholesome inventory and rejects
gambling in an adjacent front-page slot. Both expose live patience/uptime in a
standalone contract strip, apply authored warning/drop costs, and pay prorated
shift bonuses. `scripts/sponsor-check.mjs` covers conflict, recovery, both drop
paths, and payout; the full balance harness still clears days 1–5 and hits the
day-6 wall.

### WS-H · Audio & Juice — DONE (2026-07-13) — *`src/engine/audio.js`, `src/styles/juice.css`*
Shipped. `mountAudio()` subscribes once and does two jobs: (1) drains new
`eventQueue` items (seen-id Set, same pattern as toast.js) and plays a
Web-Audio-synthesized cue per type — jackpot cha-ching, tos_break klaxon, audit
siren, dm ping, sponsor buzzer, info click; AudioContext is created lazily on
first user gesture (autoplay policy) and `state.muted` silences everything.
(2) Drives `juice.css` by toggling additive classes on DOM other workstreams
already render — `.juice-pop` on changed HUD stats, `.juice-danger` on risk
meters ≥75%, `body.juice-shake` on tos_break/audit. All motion is
reduced-motion-guarded. Neat trick: because WS-H couldn't edit other WS's JS, it
reaches them purely via class toggles — everything stays in its own two files.

> **Verification note:** the build agent was killed by a session limit *during*
> browser verification (code was already written). Lead completed the verification:
> unmuted jackpot spawns exactly 6 oscillators (4-note arpeggio + 2 sparkle),
> muted spawns 0; shake / meter-danger / number-pop classes all confirmed
> applying in-browser; clean boot, zero console errors.
Make wins feel like wins.
- `engine/audio.js` subscribes to `eventQueue`; synth SFX via **Web Audio API**
  (no asset files): jackpot cha-ching, TOS-break alarm, DM ping, audit siren,
  button clicks. Respects `state.muted` (from S2.0) and `prefers-reduced-motion`.
- `juice.css`: number-pop on engagement/money, meter pulse near threshold, subtle
  screen-shake on TOS break / audit (motion-guarded). Hooks are additive classes.
- Acceptance: mute toggle silences all SFX; reduced-motion disables shake; a
  jackpot and a TOS break are audibly/visibly distinct.

### WS-I · Persistence, Daily Seed & Leaderboard — DONE (Codex, 2026-07-14) — *`src/engine/persistence.js`, `src/ui/leaderboard.js`, `src/styles/leaderboard.css`*
Shipped. `?mode=daily` hashes the UTC date into a shared seed and uses a separate
seeded RNG to shuffle the starting directory, preserving the gameplay RNG
sequence. Terminal runs write a scored `RunEntry` through S2.0's career seam;
history is bounded to the newest 20, leaderboard to the best 10, and UTC daily
bests plus lifetime runs/engagement/shifts are retained. The career drawer shows
mode/seed, daily CTA and best, career bank/perks, ranks, and recent failures.
Acceptance: two live same-day loads produced identical boards/seed; a sponsor-
failed daily run appeared after reload. `scripts/persistence-check.mjs` verifies
date rollover, deterministic ordering, bounded ranking, and localStorage reload.

## Sprint 2 ownership matrix (no two agents touch the same file)

| File | Owner |
|------|-------|
| store.js, CONTRACTS.md, data/sponsors.json (schema seed) | S2.0 / lead |
| ui/shop.js, engine/perks.js, data/perks.json, styles/shop.css | WS-E |
| engine/dm.js, ui/discord.js, data/dms.json | WS-F (GLM) |
| engine/jackpot.js, engine/economy.js, data/sponsors.json, ui/sponsor-bar.js, styles/sponsor.css | WS-G (ChatGPT) |
| engine/audio.js, styles/juice.css | WS-H |
| engine/persistence.js, ui/leaderboard.js, styles/leaderboard.css | WS-I |

> Shared mount points (shift-overlay container for WS-E; HUD region for WS-G's
> sponsor bar) are exposed by lead in S2.0 as empty `<div>` slots so no workstream
> rewrites another's UI file.

## Sprint 2 suggested assignment
- **Claude Opus (lead):** S2.0 foundation + WS-E (perks shop).
- **GLM 5.2:** WS-F (relationships / multi-shift arcs — its DM domain).
- **ChatGPT 5.6:** WS-G (multiple sponsors) then WS-I (persistence / leaderboard).
- **Spawned agent:** WS-H (audio & juice — self-contained).

---

# Sprint 3 — "Every Run Is Different" (replayability)

**Sprint 2 status: ALL DONE** (S2.0, WS-E/F/G/H/I). Two builders only this
sprint: **Claude (lead)** and **ChatGPT 5.6**. GLM sits this one out.

## Why these items (findings from the Sprint-2 review)

1. **The Shift-6 Wall.** `simulate-balance.mjs` proves it: quota compounds
   ×1.25/shift (2,500 → 7,630 by shift 6) while achievable engagement stays
   flat ≈6,600–7,000 (and actually *declines* as risk speeds up). Clear rate:
   shifts 1–5 = 100%, shift 6 = **0%**. Every run ends the same way at the same
   place regardless of skill. This is the #1 replayability killer.
2. **Every run sees the same 24 streams** with identical stats. Daily mode
   shuffles order, but stats/roster never vary. Nothing surprises a repeat player.
3. **Nothing happens mid-shift that you don't cause.** The `viral` event type
   has existed in CONTRACTS §5 since v1 and *no engine has ever fired it*. There
   is no live-events system — no spikes, raids, or dead hours to react to.
4. **`phase:'won'` exists and nothing sets it.** There is no victory, so there
   is no "one more run to finally beat it" hook.

## Phase S3.0 — Foundation (lead, FIRST; additive, contract v8) — **DONE 2026-07-14**

- [x] `store.js`: `state.mutator`, `state.wonAtShift` (10), `state.liveEvents`,
  `state.viewerGrowthPerShift`; `ADVANCE_SHIFT` accepts `'won'` (endless) and
  applies audience inflation to stream viewers.
- [x] `clock.js`: tick order **events → risk → perks → jackpot → economy → dm →
  audit → mutators**; victory check in `endShift` (🏆 → `phase:'won'`);
  `events.clearAll` reverts live events before payout/inflation.
- [x] `engine/mutators.js` stub wired (WS-K's seam); `engine/events.js` built in
  full by WS-J (below). Logged as `CONTRACTS.md` v8.

## Phase S3.1 — Two parallel workstreams

### WS-J · Live Events & Killing the Wall — **DONE (Claude lead, 2026-07-14)** — *files: `src/engine/events.js`, `src/data/events.json`, `src/data/tos-rules.json` (curve knobs), `scripts/simulate-balance.mjs` (extend)*
Shipped & verified. Five event types (Viral Moment / Raid / Drama Wave / Dead
Hours / Category Boom) spawn seeded + durational, mutate stream stats, announce
via toasts (the `viral` type finally fires), and revert exactly on expiry or at
shift end. Curve fixed: `viewerGrowthPerShift` 1.11 inflation + quota growth
1.25→1.24. Balance sim (extended to a no-perk pass + all-perks pass; `won`
counts as clear; three health gates enforced):

| shift | baseline clear | all-perks clear |
|-------|----------------|-----------------|
| 1–8   | 100%           | 100%            |
| 9     | 96%            | 100%            |
| 10 (win) | 13% · **3/24 wins** | 96% · **23/24 wins** |

The old wall (0% at shift 6) is now a skill gradient; meta-progression is what
carries you to the shift-10 victory. In-browser: events fire/expire/revert live
alongside sponsors/jackpots/DMs; 🏆 win toast at shift 10; endless continues.

<details><summary>original scope</summary>

The world moves without you; the difficulty curve becomes beatable-but-tense.
- `events.js step()`: seeded random live events with durations, pushed to the
  feed (finally firing `viral`): **Viral Moment** (stream ×2–4 viewers, N ticks),
  **Raid** (viewers migrate from one stream to another), **Drama Wave**
  (controversy & riskRate up + engagement up on tagged streams), **Dead Hours**
  (directory-wide viewer sag), **Category Boom** (one category surges). Featured
  viral streams = huge engagement but risk accelerates — a reactive
  decision every time.
- **Curve fix:** audience inflation per shift (viewer growth applied in
  `ADVANCE_SHIFT` via a `tos-rules.json` knob) + softened quota growth so supply
  and demand both rise. Target: a skilled no-perk player clears ~shift 6–7,
  perks + event play reaches `wonAtShift` 10; careless play still dies by 3–5.
- Extend `simulate-balance.mjs` to model events + inflation; publish the new
  table in this file when done.
- Acceptance: events visibly fire with toasts/audio; featuring a viral stream is
  strong but risky; sim shows a skill gradient instead of a wall at 6; shift 10
  triggers `phase:'won'`.

</details>

### WS-K · Run Mutators & Roster Variance — **DONE (Codex, 2026-07-14)** — *files: `src/engine/mutators.js`, `src/data/mutators.json`, `src/engine/persistence.js`, `src/ui/shift-overlay.js`, `src/ui/leaderboard.js`, `scripts/mutator-check.mjs`*
No two runs start the same.
- [x] **Roster variance:** extend `orderStreamsForRun` — each run fields a seeded
  SUBSET of the directory (e.g. 16–18 of 24) with ±15% seeded jitter on
  viewers/riskRate/jackpotChance. Daily mode: same date = same roster+jitter+mutator.
- [x] **Run mutators:** each run draws 1 seeded modifier from `mutators.json`, e.g.
  **Crackdown** (audit chance ×2, heat cools slower), **Gold Rush** (jackpot
  chance ×2, payouts +50%), **Drama Week** (all controversy +20), **Sponsor War**
  (sponsor payouts ×2, patience halved), **Slow News Day** (viewers −25%, quota
  −20%). `mutators.js step()`/hooks apply effects; briefing screen announces the
  mutator; leaderboard entries record it.
- [x] Acceptance: two runs with different seeds get different rosters + mutators;
  same daily seed reproduces both exactly; mutator named in briefing + run history;
  effects measurably apply. Verified by `node scripts/mutator-check.mjs`; existing
  `node scripts/integration-check.mjs` remains green.

## Sprint 3 ownership matrix

| File | Owner |
|------|-------|
| store.js, clock.js, main.js, CONTRACTS.md, stubs | S3.0 / lead |
| engine/events.js, data/events.json, data/tos-rules.json, scripts/simulate-balance.mjs | WS-J (Claude) |
| engine/mutators.js, data/mutators.json, engine/persistence.js, ui/shift-overlay.js, ui/leaderboard.js | WS-K (ChatGPT 5.6) |

> Only planned overlap: WS-J tunes curve knobs in `tos-rules.json`; WS-K must
> not touch it (mutator multipliers live in `mutators.json`). Both engines are
> pure `step(state)` modules — no UI imports, `state.rng` only. **R-rated copy**
> for event/mutator flavor text per GAME_DESIGN.md guardrails.

---

# Sprint 4 — "Release Cut" (ship it publicly)

Sprints 1–3 complete. Goal: the game meets players. Distribution: **GitHub
Pages**. Title stays **"Kick Staff Simulator"** (user decision, accepted parody
framing). Two builders: Claude (lead) + ChatGPT 5.6.

## Phase R0 — Version control — DONE (lead, 2026-07-14)
- [x] `git init` (branch `main`), `.gitignore`, `.nojekyll`; baseline commit
  `f0571a9` "Sprints 1-3 complete — full game". Rule: one commit per milestone.

## Phase R1 — Parallel workstreams

### WS-L · First-run experience & shell — DONE (Claude lead, 2026-07-14) — *`ui/title.js`, `ui/tutorial.js`, `styles/title.css` (new), + lead-owned `index.html`/`main.js`/`hud.js` wiring, additive `audio.setVolume`*
Shipped & verified in-browser (commit `0a787c8`):
- **Title screen** over the paused game: Career / Daily mode select (navigates,
  one-shot sessionStorage skip re-lands on the briefing), career ledger, settings,
  and the **18+ R-rated content notice**. Board inert while up.
- **Tutorial**: five skippable steps (directory → front page → the pull → the
  sponsor → DMs) firing on the first real tick of shift 1 (not at boot — the
  START_SHIFT running-flag race is guarded); pauses/resumes the clock; persists
  `career.tutorialDone`; verified it never re-fires for returning players.
- **Settings** (from title or HUD ⚙️): volume slider → new additive
  `audio.setVolume(0..1)` scaling the master bus (persisted as `career.volume`),
  mute, reset career (`store.resetCareer()` + reload).
- **Responsive**: board stacks to one column ≤900px; page scrolls; verified at 375px.
- Also fixed a stale `persistence-check.mjs` assertion that predated Sprint 4
  (WS-K made every run a seeded roster subset; the check still asserted authored
  order — it now asserts determinism/subset/bounds). All five scripts green.

### WS-M · R-rated copy & content QA pass — **ChatGPT 5.6** — OPEN
Files: all `src/data/*.json` copy fields (dms, stream titles, events, mutators,
sponsors, perks blurbs) + UI strings ONLY in files you own (`ui/shift-overlay.js`,
`ui/leaderboard.js`, `ui/sponsor-bar.js`). Engine toast strings (`engine/*.js`):
**strings-only edits** — do not touch logic, formulas, or field names.
- Rewrite all player-facing copy to the R-rated register (GAME_DESIGN.md →
  "Tone & content guardrails"): strong profanity/crude adult humor in-bounds;
  hard lines stay (fictional only, no slurs/hate at protected groups, nothing
  sexual involving minors, no real-world how-to).
- Voice-consistency pass: each of the 24 streamers gets ONE recognizable voice
  across stream titles + DM arcs (loyal/default/hostile variants included).
- QA sweep: every DM choice reachable, no orphaned `unlockThreadIds`, event/
  mutator flavor reads right in toasts + briefing.
- Acceptance: all five `scripts/*.mjs` stay green (catches JSON slips); spot-read
  in-browser. Commit as one milestone.

## Phase R2 — Deploy — DONE (2026-07-14) 🚀
**LIVE at https://crackytests.github.io/kss/** (repo: github.com/crackytests/kss,
Pages deploy-from-branch `main`/root). WS-M (hard-R copy pass, ChatGPT commit
`5a395b8`) shipped in the deployed build — all five check scripts green on it,
JSON valid, copy spot-checked against the hard lines (no real people/platforms).
Public smoke test passed: zero console errors under the `/kss/` subpath, title →
18+ notice → 5-step tutorial (fires once, persists) → featured stream earning
engagement with the clock running, and daily mode produced an identical
18-stream roster across two loads.

## Sprint 4 ownership matrix

| File | Owner |
|------|-------|
| ui/title.js, ui/tutorial.js, styles/title.css, index.html, main.js, hud.js, engine/audio.js (setVolume only), .gitignore/.nojekyll | WS-L (Claude lead) |
| data/*.json copy fields; UI strings in shift-overlay/leaderboard/sponsor-bar; strings-only in engine/*.js | WS-M (ChatGPT 5.6) |
| scripts/persistence-check.mjs (stale-assertion fix) | lead (logged here) |

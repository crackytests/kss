# Kick Staff Simulator

A satirical management sim. You play a **Featured Page curator** for a streaming
platform. Browse live streams, promote the spicy ones for engagement, keep a
gambling ("Stake") stream on the front page for the sponsor, cash in when
gamblers hit jackpots on air — and yank streams **before** they actually break
TOS, or eat the penalty. Meanwhile streamers slide into your DMs on a fake
Discord asking for special treatment.

It's a game about the incentives of platform curation. Everything is fictional
and satirical.

> **Rating: R.** Deliberately edgy to match the real platform it satirizes —
> strong language, adult/crude humor, gambling, innuendo. Still fictional, with
> hard lines (no real people/brands, no hate/slurs, nothing sexual involving
> minors, no real-world how-to for crimes). See
> [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) → "Tone & content guardrails".

## Run it

No build step. Any static file server works:

```bash
# from the repo root (J:\kick)
python -m http.server 8080
# then open http://localhost:8080
```

or

```bash
npx serve .
```

## Repo map

| Path | What |
|------|------|
| `index.html` | App shell, mounts the three panes (Browse / Front Page / Discord) + HUD |
| `src/main.js` | Bootstrap + game loop wiring |
| `src/state/store.js` | Single source of truth. Pub/sub. **Contract-locked.** |
| `src/engine/*` | Pure simulation modules (risk, jackpot, economy, clock) |
| `src/ui/*` | View modules that render from state and dispatch actions |
| `src/data/*.json` | Content: streams, streamers, DM threads, TOS rules |
| `scripts/*.mjs` | Deterministic integration and balance checks |
| `docs/` | The plan. Read `BUILD_PLAN.md` first. |

## Verify it

```bash
node scripts/integration-check.mjs
node scripts/simulate-balance.mjs
```

The first command checks terminal states and cross-shift progression. The second
runs 24 seeded careers through the real engine with a competent curator strategy
and prints the clear-rate curve.

## For AI agents picking this up

**Read `docs/CONTRACTS.md` before writing any code.** Every module talks through
the store and the data schemas defined there. Stay inside your assigned module
(see `docs/BUILD_PLAN.md`) and do not change shared contracts without updating
that file. Handoff notes for GLM 5.2 / ChatGPT 5.6 are in `docs/HANDOFF.md`.

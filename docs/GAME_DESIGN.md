# Game Design — Kick Staff Simulator

## Premise

You are a **Featured Page curator** working a shift at a live-streaming platform.
Management judges you on one number: **engagement**. But engagement comes from
controversy and gambling, both of which flirt with the platform's own Terms of
Service. Your job is to ride that line — surface the spicy content, keep the
sponsor's slot machine spinning on the homepage, and pull anything the second
before it detonates into an actual violation.

The satire: the game's optimal strategy is to platform exactly the content the
TOS pretends to forbid, right up until the moment it becomes a liability.

## Core loop (one "shift" = one in-game day)

1. **Browse** the live directory. Each stream shows viewers, category, tags, a
   controversy rating, and a live **risk meter**.
2. **Promote** streams into the Front Page's limited slots (default 5).
3. **Watch the meters.** Featured streams accrue engagement every tick.
   Controversial streams accrue it faster — but their **risk** climbs faster too.
4. **Pull** a stream before its risk crosses the TOS-break threshold. Pull too
   early and you leave engagement on the table; pull too late and you eat a
   penalty (and possibly a public scandal).
5. **Keep a Stake stream featured at all times.** The gambling sponsor requires
   at least one gambling stream on the front page. Every tick it's featured, a
   dice roll can trigger a **jackpot** → big bonus + engagement spike.
6. **Answer your DMs.** Streamers message you on a fake Discord asking to be
   featured, to have a strike ignored, or offering bribes. Choices have
   consequences on money, reputation, and future risk.
7. At end of shift, **payout** resolves: salary + bonuses − penalties. Hit the
   engagement quota to keep your job and advance to the next shift.

## The central tension (risk/reward)

| Lever | Reward | Danger |
|-------|--------|--------|
| Feature controversial stream | High engagement/tick | Risk climbs fast → TOS break |
| Feature gambling stream | Jackpot bonuses + sponsor happy | Also carries risk; sponsor pressure |
| Keep stream featured longer | More cumulative engagement | Risk keeps rising |
| Pull early | Safe | Lost engagement, empty slot |
| Take a bribe | Money now | Reputation drop, forced-feature risk |

Skill = reading the risk curve and timing the pull. The sweet spot is the last
tick before the threshold.

## Resources / meters

- **Engagement** — the score. Quota per shift. Drives promotion/failure.
- **Money** — personal. From salary + jackpot bonuses + bribes. Cosmetic/meta
  progression + used to buy "perks" (later milestone).
- **Reputation** — hidden-ish. Bribes and scandals lower it; clean shifts raise
  it. Low reputation → HR events, audits (more penalties), streamer distrust.
- **Heat** — regulatory attention. Rises with each near-miss and public TOS
  break. High heat → random audits that scan the front page for live violations.

## Fail / win states

- **Fired** if engagement quota missed, OR reputation hits zero, OR too many TOS
  breaks in one shift.
- **Sponsor pulls out** if the front page ever goes N ticks with no Stake stream
  → instant large penalty, possible firing.
- **Advance** by clearing the shift quota; each shift raises quota, risk rates,
  and DM pressure. Endless / high-score framing.

## Stream lifecycle

`live` → (promote) → `featured` → (pull) → `pulled` (cools down, can re-feature)
`featured` → (risk crosses threshold) → `tos_break` → `banned` (gone, penalty)

## Event types (fired by the sim on ticks)

- `jackpot` — gambling stream featured hits a payout.
- `tos_break` — featured stream crossed its threshold.
- `dm_incoming` — a streamer opens/updates a Discord thread.
- `audit` — regulator scans the front page; any risk above audit line = fine.
- `sponsor_warning` — no Stake stream featured for too long.
- `viral` — random stream's controversy/viewers spike (opportunity).

## Tone & content guardrails

**Content rating: R.** This is deliberate — the game satirizes a real,
lightly-moderated streaming platform, and a sanitized PG version would miss the
target. So the writing leans into it: strong/explicit profanity, crude humor,
adult and edgy themes, gambling degeneracy, sexual innuendo, and unhinged
streamer personas are all in-bounds and encouraged for authenticity. Think
late-night-cable / hard-R comedy, not a kids' game.

Satire, not endorsement. The joke is always on the *system* — the incentives
that make platforming this stuff profitable — with the player-curator as the
complicit cog. Gambling is shown as a rigged house-always-wins spectacle whose
"jackpots" pay the curator, mirroring how platforms actually profit.

R-rated does **not** mean anything goes. Hard lines that keep it defensible
satire (do not cross even in an R register):
- **Fictional only** — invented streamers/handles/platform. No real people,
  companies, or real brand/logo assets. (Kick-ish green/black is fine; the name
  "Kick" in the title is parody-of-a-platform framing, not real brand content.)
- **No hate** — no slurs or dehumanizing content aimed at protected groups. Edgy
  ≠ bigoted. Punch at the system, not at real marginalized people.
- **Nothing sexual involving minors, ever**, and no real sexual/graphic media —
  innuendo and implication carry the "Pools/hot tub" bit, not explicit content.
- **No real how-to for actual crimes/self-harm** — violations are named as
  categories ("unlabeled gambling promo", "DMCA restream", "harassment"), not
  depicted as working instructions.
- **No targeting real individuals** — DM threats/drama are between fictional
  characters.

Content tags ("controversial", "gambling", "edgy-irl", "drama", "rage",
"restream-risk") are flavor categories, not depictions of real illegal acts.

## Stretch / later milestones (post-MVP)

- Perks shop (auto-pull timer, risk x-ray, extra slot).
- Multiple sponsors with conflicting demands.
- "Story" streamer arcs across shifts via DMs.
- Leaderboard / daily seed.

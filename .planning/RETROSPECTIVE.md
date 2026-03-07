# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 — Data Layer

**Shipped:** 2026-03-07
**Phases:** 5 | **Plans:** 12 | **Commits:** 73

### What Was Built
- Express + SQLite backend with round-trip Map serialization (SaveEnvelope pattern)
- bcrypt-hashed login, cookie sessions, auto-save after every matchday
- 25-man squads with nationality-weighted realistic names from randomuser.me (graceful fallback)
- Per-player season stats (G/A/App), league top scorers, FM-style player profile with canvas avatar
- systemd + nginx deployment config for VPS
- Gap closure: shirt number persistence wired through main.ts, Hub kickoff stats fix

### What Worked
- Serialization-first approach (Phase 5 Plan 1) — proving Map round-trip before building any persistence eliminated the #1 data loss risk upfront
- Milestone audit after Phase 8 caught two real integration gaps (SQD2-03 wiring, SERV-03 config) — Phase 9 closed them cleanly
- Small, atomic plans (2-3 tasks each) — fast execution, easy to verify, minimal rework
- TDD for server-side code — 13 auth tests, serialization tests, caught edge cases early
- 2-day milestone execution — tight scope kept momentum high

### What Was Inefficient
- Phase 2 (Tactical Layer) left partially complete from v1.0 — halftime/subs plan never finished, carried forward as debt
- STATE.md accumulated duplicate/stale frontmatter blocks — needed manual cleanup
- Some SUMMARY.md files lacked structured one_liner field — made automated extraction harder
- Performance metrics in STATE.md became inconsistent across phases (different time formats, missing entries)

### Patterns Established
- `MAP_TAG` sentinel (`__MAP__` key with entries array) for serializing Map types through JSON
- `SaveEnvelope` wrapping game state with version + savedAt metadata
- Cookie-session for same-origin single-player auth (no JWT complexity)
- `concurrently` for cross-platform dual-server dev scripts
- `bcryptjs` (pure JS) over native `bcrypt` for zero-build-tool deployment
- `setOnPlayerClick` callback pattern for loose coupling between screens
- Gap closure as a dedicated phase after milestone audit

### Key Lessons
1. **Serialize first, persist second** — proving data survives round-trip before building any persistence layer avoids cascading bugs
2. **Milestone audits catch integration gaps** — individual phase verifications pass but cross-phase wiring can still be missing
3. **Keep deployment config in repo** — deployment files not tracked in source = invisible drift between environments
4. **Cookie sessions are sufficient for single-player games** — JWT/OAuth adds complexity with zero benefit for same-origin personal projects

### Cost Observations
- Model mix: ~70% sonnet (execution), ~20% opus (planning/orchestration), ~10% haiku (research)
- 12 plans across 5 phases in ~2 days
- Notable: Plans averaging 2-5 minutes each; Phase 8 Plan 3 (player profile) took ~30min due to canvas avatar complexity

---

## Milestone: v1.2 — Player Development

**Shipped:** 2026-03-07
**Phases:** 3 | **Plans:** 5 | **Commits:** 27

### What Was Built
- Procedural pixel art portraits — 20x24 grid scaled to 120x120, seeded from player ID, 10 nationality palettes, 5 hair styles, session cache
- Training drill system — `applyDrill` pure function with age decay curve, `work_rate` personality weighting, BASE_DELTA=0.004 tuned via 5-season headless sim
- Training scheduler on hub — 3 days per match week, squad-wide drill/rest toggle, drill type selection with targeted attributes display
- Attribute delta display on player profiles — "+N" chips after training blocks applied at kickoff

### What Worked
- TDD for training economy — headless 5-season sim proved BASE_DELTA=0.004 before any UI existed (same "prove riskiest thing first" pattern from v1.0/v1.1)
- Pure function approach for `applyDrill` and `applyTrainingBlock` — testable without any UI, clean separation
- Reusing `work_rate` personality trait as training proxy avoided adding a new field to all existing players/saves
- Milestone audit caught no gaps — all 9 requirements mapped and delivered cleanly
- Phase archival from v1.1 kept context window clean — no old phase directories cluttering searches

### What Was Inefficient
- SUMMARY.md files lack structured `one_liner` field — automated extraction via `summary-extract` failed, had to grep `## Accomplishments` manually
- Phase 10 initially had TBD plans in roadmap — needed manual plan creation after research
- Training gains display rounding issue (single-session gains ~0.002 round to 0 via Math.round) — only visible after 2-3 blocks accumulate; could have been caught earlier with a display-threshold test
- 5 of 10 nationality palettes unused because teamGen only generates 5 nationalities — wasted effort building unused palettes

### Patterns Established
- `createRng('portrait-${player.id}')` namespace prefixing for seedrandom — prevents cross-system seed collisions
- Fixed RNG call order as append-only contract — inserting calls changes all downstream outputs
- `DRILL_LABELS` as single source of truth — both hub scheduler and profile delta panel import from `training.ts`
- `TRAINING_DAYS_PER_MATCHDAY = 3` locked constant — changing requires re-running economy sim

### Key Lessons
1. **Headless economy sims before UI** — proving training balance with 5 seasons of headless data prevented tuning rework after UI was built
2. **Reuse existing traits over adding new fields** — `work_rate` as training personality proxy avoided migration issues with existing saves
3. **Display threshold testing matters** — rounding at display layer can hide real gains; test the display code, not just the calculation
4. **Build only what's used** — 5 unused nationality palettes represent wasted effort; validate consumption before building full coverage

### Cost Observations
- Model mix: ~65% sonnet (execution), ~25% opus (planning/orchestration), ~10% haiku (research)
- 5 plans across 3 phases, 44 minutes total execution time
- Notable: Average 9 min/plan — fastest milestone yet; training logic plan completed in 3 minutes

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | ~150 | 4 (2 shipped) | Engine-first approach, TDD for physics/AI |
| v1.1 | 73 | 5 | Serialization-first, milestone audit + gap closure |
| v1.2 | 27 | 3 | Headless economy sim before UI, pure function training |

### Cumulative Quality

| Milestone | Tests | Test Files | LOC (TypeScript) |
|-----------|-------|------------|------------------|
| v1.0 | ~550 | ~28 | ~12,000 |
| v1.1 | 606 | 31 | 26,876 |
| v1.2 | 642+ | 33+ | 28,270 |

### Top Lessons (Verified Across Milestones)

1. **Prove the riskiest assumption first** — v1.0 proved emergent behavior; v1.1 proved Map serialization; v1.2 proved training economy headlessly
2. **Small atomic plans execute faster than large ones** — consistent across all three milestones (v1.2 averaged 9 min/plan)
3. **Milestone audits with gap closure phases produce cleaner shipped milestones** — v1.1 needed gap closure; v1.2 audit found zero gaps
4. **Reuse over creation at data boundaries** — cookie sessions over JWT (v1.1), work_rate over new trait (v1.2) — avoid migration complexity

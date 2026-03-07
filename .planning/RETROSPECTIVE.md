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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | ~150 | 4 (2 shipped) | Engine-first approach, TDD for physics/AI |
| v1.1 | 73 | 5 | Serialization-first, milestone audit + gap closure |

### Cumulative Quality

| Milestone | Tests | Test Files | LOC (TypeScript) |
|-----------|-------|------------|------------------|
| v1.0 | ~550 | ~28 | ~12,000 |
| v1.1 | 606 | 31 | 26,876 |

### Top Lessons (Verified Across Milestones)

1. **Prove the riskiest assumption first** — v1.0 proved emergent behavior before management screens; v1.1 proved Map serialization before persistence
2. **Small atomic plans execute faster than large ones** — consistent across both milestones
3. **Milestone audits with gap closure phases produce cleaner shipped milestones** — introduced in v1.1, should continue

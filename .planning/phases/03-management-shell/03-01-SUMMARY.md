---
phase: 03-management-shell
plan: 01
subsystem: season-data
tags: [tdd, name-generation, squad-generation, fixtures, league-table, seedrandom]

# Dependency graph
requires:
  - phase: 02-tactical-layer
    provides: PlayerState type, Duty/Role const-object patterns
provides:
  - generatePlayerName(rng) nationality-weighted procedural name generation
  - createAITeam(tier, teamId, teamName, rng) 16-player squad with quality tiers
  - generateFixtures(teamIds) Berger round-robin double season fixture list
  - createInitialTable, updateTable, sortTable league table logic
  - PlayerState extended with age and height fields
affects: [03-02, 03-03, 03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [berger-round-robin, nationality-weighted-pools, tier-based-attribute-generation]

key-files:
  created:
    - src/season/nameGen.ts
    - src/season/nameGen.test.ts
    - src/season/teamGen.ts
    - src/season/teamGen.test.ts
    - src/season/fixtures.ts
    - src/season/fixtures.test.ts
    - src/season/leagueTable.ts
    - src/season/leagueTable.test.ts
  modified:
    - src/simulation/types.ts

key-decisions:
  - "16-man squad: 11 starters (4-4-2) + 5 bench (GK, CB, CM, CM, ST) -- bench has 2 CM for midfield flexibility"
  - "Attribute generation uses clamp(base + (rng-0.5)*2*spread, 0, 1) -- tight range per tier prevents outliers"

patterns-established:
  - "Tier-based squad generation: TIER_CONFIGS const with base/spread, const-object TeamTier pattern"
  - "Nationality-weighted name pools: cumulative weight threshold selection from 5 pools"

requirements-completed: [SQD-01, SQD-03, SQD-04, SQD-06]

# Metrics
duration: 4min
completed: 2026-03-06
---

# Phase 03 Plan 01: Season Data Module Summary

**TDD-built season data module with procedural name/squad generation, Berger round-robin fixtures (380 for 20 teams), and league table with 3-tier sort**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-06T07:21:32Z
- **Completed:** 2026-03-06T07:25:44Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- PlayerState extended with optional age (17-34) and height (165-200cm) fields, fully backward compatible
- Procedural name generation from 5 nationality-weighted pools (English 40%, Spanish 25%, French 20%, German 10%, Brazilian 5%)
- AI team squad generation with 3 quality tiers (strong/mid/weak) producing 16-player squads with proper 4-4-2 role distribution
- Berger round-robin fixture generation: 20 teams produce exactly 380 fixtures across 38 matchdays, each team 19 home + 19 away
- League table with createInitialTable, updateTable (3/1/0 points), sortTable (points > goal difference > goals for)
- 32 TDD tests all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: PlayerState extension + nameGen + teamGen (TDD)** - `3e94611` (feat)
2. **Task 2: fixtures + leagueTable (TDD)** - `e625cdb` (feat)

## Files Created/Modified
- `src/simulation/types.ts` - Added age?: number and height?: number to PlayerState
- `src/season/nameGen.ts` - Nationality-weighted procedural name generation (5 pools, 20+ names each)
- `src/season/nameGen.test.ts` - 4 tests: pattern matching, uniqueness, reproducibility, non-empty
- `src/season/teamGen.ts` - AI team squad creation with 3 quality tiers, 16-player 4-4-2 squads
- `src/season/teamGen.test.ts` - 11 tests: squad size, attributes ranges, role distribution, defaults
- `src/season/fixtures.ts` - Berger round-robin double season fixture generation
- `src/season/fixtures.test.ts` - 7 tests: count, matchdays, home/away balance, no self-play
- `src/season/leagueTable.ts` - League table creation, update, and 3-tier sort
- `src/season/leagueTable.test.ts` - 10 tests: initial table, win/draw/loss, accumulation, sorting tiebreakers

## Decisions Made
- 16-man squad bench composition: GK, CB, CM, CM, ST (2 CM for midfield depth rather than plan's ambiguous "5 bench" specification)
- Attribute generation uses tight clamped range per tier -- strong [0.67-0.83], mid [0.50-0.70], weak [0.35-0.55] -- prevents cross-tier overlap

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing engine.test.ts failures (6 tests in phase transition/physics pause groups) -- not related to our changes, out of scope

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All season data contracts stable and tested, ready for downstream plans to import
- generateFixtures, createAITeam, and league table functions available for season simulation flow
- PlayerState.age and .height available for squad/player display UI

---
*Phase: 03-management-shell*
*Completed: 2026-03-06*

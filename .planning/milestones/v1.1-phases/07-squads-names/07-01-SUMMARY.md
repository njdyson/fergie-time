---
phase: 07-squads-names
plan: 01
subsystem: season
tags: [squad-generation, name-service, randomuser-api, player-state]

# Dependency graph
requires:
  - phase: 01-engine-core
    provides: PlayerState interface, simulation types
provides:
  - nameService.ts with fetchNames and getNames (API + fallback)
  - 25-man squad generation via ROLES_25 with shirtNumber
  - 7-man bench validation and AI sim bench slicing
affects: [07-02-squads-names, ui-squad-display]

# Tech tracking
tech-stack:
  added: [randomuser.me API integration]
  patterns: [API-with-fallback, nationality-weighted batching]

key-files:
  created:
    - src/season/nameService.ts
    - src/season/nameService.test.ts
  modified:
    - src/season/teamGen.ts
    - src/season/teamGen.test.ts
    - src/season/season.ts
    - src/season/season.test.ts
    - src/simulation/types.ts
    - src/simulation/engine.ts

key-decisions:
  - "ROLES_25 bench composition adjusted from plan listing to match stated totals (5 CB not 4)"
  - "Last nationality in getNames gets remainder count to ensure exact total"

patterns-established:
  - "API-with-fallback: try external API, catch any error, fall back to local generation"
  - "Nationality-weighted batching: separate fetch per nationality with Math.round allocation"

requirements-completed: [SQD2-01, SQD2-02, SQD2-03, NAME-01, NAME-02, NAME-03]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 7 Plan 01: Squad Data Layer Summary

**25-man squad generation with ROLES_25, shirtNumber 1-25, name service via randomuser.me API with nationality-weighted fallback**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T12:16:09Z
- **Completed:** 2026-03-06T12:21:38Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- nameService.ts with fetchNames (per-nationality API call) and getNames (weighted batching + fallback)
- createAITeam expanded from 16 to 25 players with exported ROLES_25 and shirtNumber assignment
- validateSquadSelection updated to accept 7-man bench, simOneAIFixture bench sliced to 7
- Full test suite passes: 590 tests across 30 files

## Task Commits

Each task was committed atomically:

1. **Task 1: Name service with API fetch, nationality weighting, and fallback** - `0c761a1` (feat)
2. **Task 2: Expand squads to 25, add shirtNumber, update validation and AI sim bench** - `7de0194` (feat)

_Note: TDD tasks — tests written first (RED), then implementation (GREEN), committed together._

## Files Created/Modified
- `src/season/nameService.ts` - API fetch with nationality weighting and fallback to procedural generation
- `src/season/nameService.test.ts` - 8 tests covering fetch, weighting, fallback scenarios
- `src/season/teamGen.ts` - ROLES_25 (25 roles), shirtNumber, optional names parameter
- `src/season/teamGen.test.ts` - Updated from 16 to 25 players, added shirtNumber and names tests
- `src/season/season.ts` - Bench validation 5->7, AI sim bench slice(11,18)
- `src/season/season.test.ts` - Updated makeSquad to 25 players, bench tests to 7
- `src/simulation/types.ts` - Added shirtNumber to PlayerState interface
- `src/simulation/engine.ts` - Updated JSDoc comments for 7-man bench

## Decisions Made
- ROLES_25 bench composition adjusted: plan listing had 4 CB but stated 5 as target. Fixed bench to include 2 CB (not 1) to match intended 5 CB total.
- Last nationality (BR) in getNames receives remainder allocation to guarantee exact count.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ROLES_25 composition to match stated totals**
- **Found during:** Task 2 (role distribution test)
- **Issue:** Plan's listed roles had 4 CB total but stated target was 5 CB. Internal inconsistency in plan.
- **Fix:** Changed bench from [GK, CB, LB, CM, CAM, LW, ST] to [GK, CB, CB, LB, CM, CAM, ST] and reserves from [CB, RB, CDM, CM, RW, ST, GK] to [CB, RB, CDM, CM, LW, RW, GK]
- **Files modified:** src/season/teamGen.ts, src/season/season.test.ts
- **Verification:** Role distribution test passes with correct counts
- **Committed in:** 7de0194

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fixed internal inconsistency in plan's role listing. Correct totals achieved.

## Issues Encountered
- Vitest does not support `-x` flag; used `--bail 1` instead for fail-fast behavior.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- nameService.ts ready for Plan 02 to wire into team creation UI
- ROLES_25 exported for Plan 02 squad selection UI
- shirtNumber available on PlayerState for squad list rendering

---
*Phase: 07-squads-names*
*Completed: 2026-03-06*

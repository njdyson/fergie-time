---
phase: 03-management-shell
plan: 03
subsystem: ui-screens
tags: [management-screens, quicksim, squad-selection, league-table, fixtures, dark-theme]

# Dependency graph
requires:
  - phase: 03-management-shell
    provides: SeasonState, SquadSelection, validateSquadSelection, fixtures, leagueTable, sortTable
  - phase: 01-engine-core
    provides: SimulationEngine, MatchConfig, MatchPhase
provides:
  - quickSimMatch(config) headless engine runner to FULL_TIME with halftime latch handling
  - HubScreen class showing team position, next fixture, last result
  - FixturesScreen class showing all 38 matchdays with player team highlighted
  - TableScreen class showing sorted league table with 10 columns
  - SquadScreen class with selection toggles, attribute bars, inline validation
affects: [03-04, 03-05, 03-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [screen-class-pattern, inline-dark-theme-styling, selection-toggle-cycle]

key-files:
  created:
    - src/season/quickSim.ts
    - src/ui/screens/hubScreen.ts
    - src/ui/screens/fixturesScreen.ts
    - src/ui/screens/tableScreen.ts
    - src/ui/screens/squadScreen.ts
  modified:
    - src/season/season.ts
    - src/season/season.test.ts

key-decisions:
  - "quickSimMatch now uses real SimulationEngine with MatchConfig -- replaces stub from Plan 02"
  - "Halftime latch handled automatically in quickSim via isHalftimeLatched()/startSecondHalf()"
  - "Screen classes follow update()/getElement() pattern -- standalone modules wired by Plan 05"

patterns-established:
  - "Screen class pattern: constructor(container), update(state), getElement() -- consistent across all 4 screens"
  - "Selection toggle cycle: starter -> bench -> not-selected -> starter with badge color feedback"

requirements-completed: [SQD-01, SQD-02, SQD-03, SQD-04]

# Metrics
duration: 5min
completed: 2026-03-06
---

# Phase 03 Plan 03: Quick-Sim + Management Screens Summary

**Headless quickSimMatch with real engine runner plus 4 standalone management screens (Hub, Fixtures, Table, Squad) with dark-themed inline styling and squad selection toggles**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-06T07:32:59Z
- **Completed:** 2026-03-06T07:38:07Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- quickSimMatch drives real SimulationEngine headlessly to FULL_TIME, handling halftime latch automatically
- HubScreen displays team name, season number, league position (ordinal), next fixture with H/A indicator, and last result
- FixturesScreen renders all 38 matchdays grouped with played/unplayed distinction, player team highlighted, current matchday auto-scrolled
- TableScreen shows 20 teams in compact monospace grid with Pos/Team/P/W/D/L/GF/GA/GD/Pts columns, player team highlighted
- SquadScreen renders 16 players with 10 attribute mini-bars, fitness bar (inverted fatigue), selection toggle (XI/SUB/OUT), inline validation warning, and getSelection() API
- Personality traits intentionally hidden from squad screen per design decision

## Task Commits

Each task was committed atomically:

1. **Task 1: quickSimMatch runner** - `93bd3e3` (feat)
2. **Task 2: Hub, Fixtures, Table, Squad screens** - `e0c35b1` (feat)

## Files Created/Modified
- `src/season/quickSim.ts` - Real headless engine runner replacing stub
- `src/season/season.ts` - Updated to pass MatchConfig to quickSimMatch
- `src/season/season.test.ts` - Added vi.mock for quickSim to keep tests fast
- `src/ui/screens/hubScreen.ts` - Hub screen with position, next fixture, last result
- `src/ui/screens/fixturesScreen.ts` - Fixture list grouped by matchday with highlights
- `src/ui/screens/tableScreen.ts` - League table with sorted rows and player highlight
- `src/ui/screens/squadScreen.ts` - Squad management with attribute bars, selection toggles, validation

## Decisions Made
- quickSimMatch updated from stub to real engine -- signature changed from (squad, squad, rng) to (MatchConfig) for proper engine integration
- Halftime latch handled automatically in quick-sim loop -- engine latches at halftime, quickSim calls startSecondHalf() to continue
- vi.mock added to season.test.ts to isolate unit tests from full engine execution -- keeps tests fast (76ms vs potentially 10s+)
- Screen classes are pure output modules receiving data -- wiring into app router deferred to Plan 05

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed quickSimMatch signature mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified MatchConfig-based signature but existing season.ts called quickSimMatch with (homeSquad, awaySquad, rng)
- **Fix:** Updated both quickSim.ts (new signature) and season.ts call site (construct MatchConfig from squads)
- **Files modified:** src/season/quickSim.ts, src/season/season.ts
- **Verification:** All 65 season tests pass
- **Committed in:** 93bd3e3

**2. [Rule 1 - Bug] Handled halftime latch in headless simulation**
- **Found during:** Task 1
- **Issue:** SimulationEngine latches at halftime and never reaches FULL_TIME without explicit startSecondHalf() call
- **Fix:** Added isHalftimeLatched() check in tick loop, calling startSecondHalf() automatically
- **Files modified:** src/season/quickSim.ts
- **Verification:** TypeScript compiles, engine contract correct
- **Committed in:** 93bd3e3

**3. [Rule 2 - Missing Critical] Added test mock for quickSimMatch**
- **Found during:** Task 1
- **Issue:** Season tests would run 9 full engine simulations per advanceMatchday call, making tests unacceptably slow
- **Fix:** Added vi.mock('./quickSim.ts') returning deterministic {homeGoals:1, awayGoals:0}
- **Files modified:** src/season/season.test.ts
- **Verification:** 65 tests pass in 76ms
- **Committed in:** 93bd3e3

---

**Total deviations:** 3 auto-fixed (2 bug, 1 missing critical)
**Impact on plan:** All fixes necessary for correctness and test performance. No scope creep.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 screen classes ready for router wiring in Plan 05
- quickSimMatch ready for production use in matchday advancement
- SquadScreen.getSelection() returns SquadSelection compatible with validateSquadSelection()

---
*Phase: 03-management-shell*
*Completed: 2026-03-06*

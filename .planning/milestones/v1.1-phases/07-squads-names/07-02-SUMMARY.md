---
phase: 07-squads-names
plan: 02
subsystem: ui
tags: [squad-screen, name-service, shirt-numbers, async-flow, game-creation]

# Dependency graph
requires:
  - phase: 07-01
    provides: nameService.ts getNames, 25-player createAITeam with shirtNumber, validateSquadSelection 7-bench
  - phase: 06-auth-persistence
    provides: season state, main.ts game creation flow, SquadScreen component
provides:
  - Async name fetch wired into new game creation via getNames(500)
  - Player team created via createAITeam('mid') with fetched names
  - createSeason accepts optional names parameter for AI team assignment
  - Squad screen shows 25 players with 11+7 default selection and Bench N/7 counter
  - Click-to-edit shirt numbers with uniqueness and 1-99 range validation
  - getUpdatedPlayers() and onShirtNumberChange() callback on SquadScreen
  - Opponent bench uses slice(11,18) for correct 7-man bench
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [async-game-creation, inline-edit-with-validation, callback-registration]

key-files:
  created: []
  modified:
    - src/main.ts
    - src/season/season.ts
    - src/ui/screens/squadScreen.ts

key-decisions:
  - "Player team uses createAITeam('mid') instead of createMatchRosters() so all 25 players receive names from fetched pool"
  - "names.slice(0, 25) for player team, names.slice(25) passed to createSeason for AI teams"
  - "shirtNumbers stored as Map<string, number> on SquadScreen instance for O(1) lookup during validation"

patterns-established:
  - "Inline-edit with validation: replace cell content with input on click, validate on blur/Enter, flash red and revert on invalid, stopPropagation to avoid row toggle"
  - "Callback registration: onShirtNumberChange(cb) for consumers to react to edits"

requirements-completed: [SQD2-03, SQD2-04, NAME-01, NAME-02, NAME-03]

# Metrics
duration: pre-committed
completed: 2026-03-06
---

# Phase 7 Plan 02: Squad UI and Name Wiring Summary

**Async name fetch (500 names) wired into new game creation, squad screen expanded to 25 players with 11+7 matchday selection, and click-to-edit shirt numbers with uniqueness validation**

## Performance

- **Duration:** Pre-committed (commit 615c574 at 2026-03-06T12:27:05Z)
- **Started:** 2026-03-06T12:21:38Z (after Plan 01)
- **Completed:** 2026-03-06T12:27:05Z
- **Tasks:** 1 auto task + 1 human-verify checkpoint
- **Files modified:** 3

## Accomplishments
- main.ts now async: fetches 500 names via getNames, creates player team with createAITeam('mid'), passes remaining 475 names to createSeason for AI teams
- createSeason accepts optional names parameter, slices 25 names per AI team (19 teams)
- Squad screen expanded: 25 players listed, default selection is 11 starters + indices 11-17 as bench, remaining 7 are reserves
- Bench counter updated from N/5 to N/7; opponent bench slice corrected from (11,16) to (11,18)
- Shirt numbers displayed from p.shirtNumber (not sequential index), click-to-edit with 1-99 range check and team-uniqueness check
- Added getUpdatedPlayers() and onShirtNumberChange() to SquadScreen for persistence integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire name fetch, 25-man squads, and editable shirt numbers into UI** - `615c574` (feat)

## Files Created/Modified
- `src/main.ts` - Async game creation: getNames(500), createAITeam for player team, createSeason with names slice; opponent bench slice(11,18)
- `src/season/season.ts` - createSeason accepts optional names parameter, passes slice to each createAITeam call
- `src/ui/screens/squadScreen.ts` - 25-player display, 11+7 default, Bench N/7, shirt number column with click-to-edit, uniqueness/range validation, getUpdatedPlayers(), onShirtNumberChange()

## Decisions Made
- Player team is built via createAITeam('mid') (not createMatchRosters()) so fetched names reach all player-team players via the same names array
- names.slice(0, 25) reserved for player team in main.ts; names.slice(25) passed to createSeason for the 19 AI teams (19x25=475)
- Shirt numbers maintained as a Map<string, number> on the SquadScreen instance rather than mutating PlayerState directly until getUpdatedPlayers() is called

## Deviations from Plan

None - plan executed exactly as written. The three files were updated per specification. All must_have truths confirmed by code inspection and test suite.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 7 is now complete: 25-man squads with realistic names, editable shirt numbers, and 11+7 matchday selection are all wired end-to-end
- Full test suite passes: 592 tests across 30 files
- Persistent shirt number edits are available via getUpdatedPlayers() for any future auto-save integration
- No blockers for next milestone phase

---
*Phase: 07-squads-names*
*Completed: 2026-03-06*

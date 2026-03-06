---
phase: 03-management-shell
plan: 05
subsystem: season-loop
tags: [season-lifecycle, fatigue, quick-sim, matchday, champion]

# Dependency graph
requires:
  - phase: 03-management-shell
    provides: SeasonState, advanceMatchday, quickSimMatch, SquadScreen, HubScreen, fullTimeOverlay Continue button
provides:
  - Full matchday flow: squad selection -> player match -> AI batch sim -> fatigueMap update -> Hub navigation
  - Season completion with champion banner and New Season reset
  - FatigueMap integration into MatchConfig for player and opponent squads
affects: [03-06]

# Tech tracking
tech-stack:
  added: []
  patterns: [initMatchWithConfig-helper, currentMatchPlayerSide-tracking, simulating-loading-state]

key-files:
  created: []
  modified:
    - src/main.ts
    - src/ui/fullTimeOverlay.ts

key-decisions:
  - "Extracted initMatchWithConfig() helper from startMatch() to avoid duplicating engine setup across legacy and season paths"
  - "currentMatchPlayerSide module-level variable tracks home/away for post-match fatigue capture"
  - "Continue button shows Simulating... with 50ms setTimeout to allow UI repaint before synchronous AI batch"

patterns-established:
  - "initMatchWithConfig: reusable engine setup accepting roster config, used by both legacy startMatch and season squad kickoff"
  - "Post-match fatigue capture from engine snapshot players matching currentMatchPlayerSide"

requirements-completed: [SQD-02, SQD-04, SQD-05]

# Metrics
duration: 3min
completed: 2026-03-06
---

# Phase 03 Plan 05: Season Loop Wiring Summary

**Full matchday flow wired: squad selection with fatigueMap feeds MatchConfig, post-match captures fatigue, AI batch sims 19 fixtures via advanceMatchday, season completion shows champion**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-06T07:47:09Z
- **Completed:** 2026-03-06T07:49:54Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Squad kickoff finds opponent from season fixtures and applies fatigueMap to all players before match
- Post-match fatigue captured from engine snapshot into seasonState.fatigueMap
- advanceMatchday() called after Continue: runs 19 AI quick-sims, updates table, applies recovery
- Season completion detected and champion banner rendered on Hub
- Continue button shows "Simulating..." loading state during AI batch processing

## Task Commits

Each task was committed atomically:

1. **Task 1: Squad selection feeds MatchConfig with fatigueMap** - `4345ee7` (feat)
2. **Task 2: Post-match fatigue capture + AI sim batch + season lifecycle** - `45cba7c` (feat)

## Files Created/Modified
- `src/main.ts` - initMatchWithConfig helper, season squad kickoff with opponent lookup and fatigueMap, post-match fatigue capture and advanceMatchday call
- `src/ui/fullTimeOverlay.ts` - Continue button shows "Simulating..." state before AI batch runs

## Decisions Made
- Extracted initMatchWithConfig() to avoid duplicating engine/debug/poll setup between legacy and season paths
- currentMatchPlayerSide stored as module-level variable, set during initMatchWithConfig call from squad kickoff
- 50ms setTimeout before onContinue callback allows UI to repaint "Simulating..." text before synchronous advanceMatchday blocks

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Complete season loop: play -> AI sim -> table update -> Hub -> next matchday
- Ready for Plan 06 (final phase 3 plan)
- Fatigue persists between matches making squad rotation meaningful
- Season end triggers champion display and New Season reset

---
*Phase: 03-management-shell*
*Completed: 2026-03-06*

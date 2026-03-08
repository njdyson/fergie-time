---
phase: 13-hub-day-loop
plan: 02
subsystem: ui
tags: [hub, day-loop, schedule, continue-button, jsdom, vitest]

# Dependency graph
requires:
  - phase: 13-hub-day-loop/13-01
    provides: advanceDay, getDaySchedule, isMatchDay, DayDescriptor — day-loop state machine this plan wires into Hub UI

provides:
  - hubScreen.ts day schedule list: vertical Day 1/2/3/Match Day rows with past/current/future visual styles
  - Continue button (blue gradient) shown on training days; Kick Off (green gradient) shown on match day
  - onContinue callback on HubScreen that calls advanceDay + auto-saves + re-renders
  - main.ts Continue handler with Phase 14/15 extension point comments
  - main.ts Kick Off handler simplified (no more bulk applyTrainingBlock)
  - migrateSeasonState supports old saves without currentDay field

affects:
  - 14-coaching-emails (hooks COACH-01 into Continue handler extension point)
  - 15-transfers (hooks XFER-02 into Continue handler extension point)

# Tech tracking
tech-stack:
  added:
    - jsdom (dev dependency — required for @vitest-environment jsdom in hubScreen.test.ts)
  patterns:
    - "Day schedule card renders getDaySchedule descriptors as vertical list with status-based styling (past/current/future)"
    - "onContinue callback pattern mirrors onKickoff on HubScreen — callbacks stored, fired on button click"
    - "@vitest-environment jsdom annotation for per-file DOM environment in node-default vitest setup"

key-files:
  created:
    - src/ui/screens/hubScreen.test.ts
  modified:
    - src/ui/screens/hubScreen.ts
    - src/main.ts

key-decisions:
  - "applyTrainingBlock removed from Kick Off handler — training now applied day-by-day via Continue presses, so no bulk apply needed at match time"
  - "jsdom installed as dev dep for UI unit tests; @vitest-environment jsdom per-file annotation keeps node default for non-DOM tests"
  - "Past day drill selectors read from state (locked), current/future read from DOM — ensures fired schedule is complete and correct"
  - "buildDayRow private method pattern keeps update() readable while handling 3 distinct day status styles"

patterns-established:
  - "onContinue/onKickoff callback registration on HubScreen — same push-array pattern used throughout the screen"
  - "Extension point comments in Continue handler: marks exactly where Phase 14 (COACH-01) and Phase 15 (XFER-02) hook in"

requirements-completed: [HUB-01, HUB-02, HUB-03, HUB-04]

# Metrics
duration: 6min
completed: 2026-03-08
---

# Phase 13 Plan 02: Hub Day Loop (UI Layer) Summary

**Day-by-day Hub schedule list with Continue/Kick Off button swap: training days show Continue, match day shows Kick Off, each Continue calls advanceDay and re-renders**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-08T00:11:12Z
- **Completed:** 2026-03-08T00:17:21Z
- **Tasks:** 2 auto + 1 checkpoint
- **Files modified:** 3

## Accomplishments

- Rewrote `hubScreen.ts` training card as a vertical day schedule list: Day 1, Day 2, Day 3, Match Day
- Past days show `#0f172a` muted background with locked drill display and "Done" indicator
- Current day has `border-left: 3px solid #60a5fa` accent + `#1e3a5f` highlighted background
- Future days show editable drill toggles and dropdowns for pre-planning
- Match day row shows "Ready to Kick Off" indicator with no drill selector
- Schedule card header: "N days until [Opponent] (H/A)" or "Match Day vs..." on match day
- Added `onContinue` callback to `HubScreen` class
- `main.ts` Continue handler calls `advanceDay`, auto-saves, re-renders
- `main.ts` Kick Off handler simplified — `applyTrainingBlock` removed (training applied incrementally)
- `migrateSeasonState` now also migrates `currentDay: 0` for saves predating Plan 01
- 5 unit tests in `hubScreen.test.ts` verify Continue vs Kick Off rendering and callback firing

## Task Commits

1. **Task 1: Rewrite Hub screen with day schedule list** - `6a028a5` (feat)
2. **Task 2: Wire Continue and Kick Off handlers in main.ts** - `d97b67e` (feat)
3. **Task 3: Visual verification checkpoint** - approved by user

## Files Created/Modified

- `src/ui/screens/hubScreen.ts` — Replaced flat training scheduler with day schedule list; added `onContinue`; Continue/Kick Off button swap logic
- `src/ui/screens/hubScreen.test.ts` — 5 unit tests: Continue vs Kick Off rendering and callback firing (jsdom environment)
- `src/main.ts` — `advanceDay` import; `onContinue` handler with extension points; simplified `onKickoff`; `currentDay` migration

## Decisions Made

- `applyTrainingBlock` removed from Kick Off handler — training is now applied incrementally via Continue presses, so bulk application at match time would double-count
- `jsdom` installed as a dev dependency; `@vitest-environment jsdom` per-file annotation preserves the project's `node` default for pure-logic tests
- Past day drill selectors read from `state.trainingSchedule` (locked), current/future days read from DOM — ensures `onScheduleChange` fires a complete and correct schedule
- `buildDayRow` extracted as a private method to keep `update()` readable while handling three distinct status styles

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing jsdom dependency for vitest DOM environment**
- **Found during:** Task 1 (hubScreen.test.ts execution)
- **Issue:** vitest uses `node` environment by default; `document.createElement` required for HubScreen tests but `jsdom` package not installed
- **Fix:** `npm install --save-dev jsdom` + `@vitest-environment jsdom` annotation in test file
- **Files modified:** package.json, package-lock.json
- **Verification:** All 5 tests pass
- **Committed in:** `6a028a5` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking dependency)
**Impact on plan:** Essential for running DOM-dependent UI tests. No scope creep.

## Issues Encountered

- TypeScript `exactOptionalPropertyTypes` required omitting `result: undefined` from fixture mock (set `result` as absent rather than explicitly undefined). Fixed inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Hub day schedule UI complete; Continue/Kick Off flow wired end-to-end and visually verified
- Phase 14 (COACH-01 coaching emails) will add logic after `advanceDay` in the Continue handler (extension point documented)
- Phase 15 (XFER-02 transfer bid processing) will add logic in same Continue handler extension point

---
*Phase: 13-hub-day-loop*
*Completed: 2026-03-08*

---
phase: 13-hub-day-loop
plan: 01
subsystem: season
tags: [training, day-loop, state-machine, pure-functions, tdd]

# Dependency graph
requires:
  - phase: 12-training-ui
    provides: applyDrill, TRAINING_DAYS_PER_MATCHDAY, TrainingSchedule — the per-session drill application this plan wraps day-by-day

provides:
  - dayLoop.ts with advanceDay(), getDaySchedule(), isMatchDay(), DayAdvanceResult, DayDescriptor exports
  - SeasonState.currentDay field tracking position in training block (0-2 training, 3 match day)
  - createSeason, finalizeMatchday, startNewSeason all initialize/reset currentDay to 0

affects:
  - 13-02-hub-day-loop (wires dayLoop into Hub UI, replaces applyTrainingBlock with day-by-day advanceDay calls)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Day loop as pure state machine: advanceDay returns new state, never mutates input (matches recordPlayerResult/finalizeMatchday pattern)"
    - "DayDescriptor with past/current/future status for UI progress bar rendering"
    - "trainingDeltas accumulated additively across days — each advanceDay call merges into existing map"

key-files:
  created:
    - src/season/dayLoop.ts
    - src/season/dayLoop.test.ts
  modified:
    - src/season/season.ts

key-decisions:
  - "currentDay is a plain number on SeasonState (not a Map or object) — simplest representation, serializes transparently"
  - "advanceDay throws on match day rather than returning error result — enforces precondition at call site, cleaner API"
  - "getDaySchedule marks match day as status=current when currentDay===TRAINING_DAYS_PER_MATCHDAY (user is on match day waiting for Kick Off)"

patterns-established:
  - "advanceDay pure function pattern: read schedule slot, apply drill, diff attributes, merge deltas, return new state"
  - "DayDescriptor status progression: past < currentDay, current === currentDay, future > currentDay"

requirements-completed: [HUB-03]

# Metrics
duration: 4min
completed: 2026-03-08
---

# Phase 13 Plan 01: Hub Day Loop (Data Layer) Summary

**Pure day-loop state machine with advanceDay/getDaySchedule/isMatchDay functions and SeasonState.currentDay field for day-by-day training block progression**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-08T00:04:16Z
- **Completed:** 2026-03-08T00:08:34Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 3

## Accomplishments

- Added `currentDay: number` to `SeasonState` interface — tracks position in training block (0=day 1, 1=day 2, 2=day 3, 3=match day)
- Created `src/season/dayLoop.ts` with three pure exports: `advanceDay`, `getDaySchedule`, `isMatchDay`
- `advanceDay` applies exactly one drill session per call, accumulates per-player trainingDeltas additively, and increments currentDay by 1
- `getDaySchedule` returns 4 descriptors (3 training + 1 match) with past/current/future status for Hub UI progress bar
- `isMatchDay` guards against advancing past match day (throws on attempt)
- All three functions are pure — they return new state, never mutate input (consistent with existing season.ts functional pattern)
- 25 tests all pass; no new TypeScript errors introduced

## Task Commits

TDD task committed in two phases:

1. **RED phase: failing tests** - `17d2986` (test)
2. **GREEN phase: implementation** - `c910656` (feat)

## Files Created/Modified

- `src/season/dayLoop.ts` — New module: advanceDay, getDaySchedule, isMatchDay pure functions; DayAdvanceResult and DayDescriptor types
- `src/season/dayLoop.test.ts` — 25 tests covering all behaviors from plan spec
- `src/season/season.ts` — Added `currentDay: number` to SeasonState interface; initialized to 0 in createSeason, finalizeMatchday, startNewSeason

## Decisions Made

- `currentDay` is a plain number on SeasonState (not a Map or object) — simplest representation, serializes transparently through JSON without special handling
- `advanceDay` throws `Error('Cannot advance past match day')` rather than returning a result union — enforces precondition at the call site and keeps the happy-path API clean
- `getDaySchedule` marks match day as `status='current'` when `currentDay === TRAINING_DAYS_PER_MATCHDAY` — the user is "on" match day waiting to press Kick Off

## Deviations from Plan

None — plan executed exactly as written. The TDD flow (RED commit, GREEN commit) followed the spec precisely.

## Issues Encountered

Minor: `exactOptionalPropertyTypes` strictness required conditional spread for `trainingSchedule` in the test mock helper. Fixed inline without any plan deviation.

## Next Phase Readiness

- `dayLoop.ts` data layer is complete and tested
- Plan 02 can now wire `advanceDay` and `getDaySchedule` into the Hub UI Continue button and day progress bar
- `SeasonState.currentDay` is additive (all consumers still compile — field has a default of 0 in all constructors)

---
*Phase: 13-hub-day-loop*
*Completed: 2026-03-08*

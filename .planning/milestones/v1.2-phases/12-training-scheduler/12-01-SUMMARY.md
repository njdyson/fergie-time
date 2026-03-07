---
phase: 12-training-scheduler
plan: 01
subsystem: training
tags: [typescript, vitest, tdd, training, season-state]

# Dependency graph
requires:
  - phase: 11-training-logic
    provides: applyDrill pure function, DrillType, DRILL_ATTRIBUTE_MAP, BASE_DELTA tuning

provides:
  - applyTrainingBlock pure function — processes full drill/rest schedule, returns updatedSquad and per-player deltas
  - DRILL_LABELS record — human-readable labels for all 8 DrillType values
  - TRAINING_DAYS_PER_MATCHDAY constant (3) — matches Phase 11 economy tuning
  - TrainingDayPlan, TrainingSchedule, TrainingDeltas types in season.ts
  - Optional trainingSchedule and trainingDeltas fields on SeasonState

affects:
  - 12-training-scheduler (plans 02-03, hub screen and player profile integration)
  - main.ts kickoff handler (applyTrainingBlock wired at kickoff)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN/REFACTOR: failing test commit then implementation commit
    - Type imports cross-file: training.ts imports TrainingSchedule/TrainingDeltas from season.ts; season.ts imports DrillType from training.ts
    - Optional SeasonState fields with undefined safe defaults (same pattern as squadSelectionMap?)

key-files:
  created:
    - src/season/training.test.ts (extended — 13 new test cases appended to existing 17)
  modified:
    - src/season/training.ts
    - src/season/season.ts

key-decisions:
  - "TRAINING_DAYS_PER_MATCHDAY = 3 locked — changing requires re-running headless 5-season sim and re-tuning BASE_DELTA"
  - "TrainingDeltas typed as Map<string, Partial<Record<keyof PlayerAttributes, number>>> for O(1) player lookup and correct Map serialization via existing serialize.ts"
  - "Schedule entries sorted by day index in applyTrainingBlock for deterministic order regardless of object key insertion"
  - "Delta accumulation uses gain > 0 guard — negative gains never recorded, ensuring delta values are always non-negative"

patterns-established:
  - "DRILL_LABELS: Record<DrillType, string> — single source of truth for display labels, imported by both hub scheduler and profile delta panel"
  - "applyTrainingBlock returns { updatedSquad, deltas } — caller owns state update; function is purely computational"

requirements-completed: [TRAIN-02, TRAIN-03, TRAIN-05]

# Metrics
duration: 3min
completed: 2026-03-07
---

# Phase 12 Plan 01: Training Block Computation and State Types Summary

**applyTrainingBlock pure function with per-player delta accumulation, DRILL_LABELS display map, and TrainingSchedule/TrainingDeltas types on SeasonState**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T22:10:01Z
- **Completed:** 2026-03-07T22:12:39Z
- **Tasks:** 1 (TDD: RED commit + GREEN commit)
- **Files modified:** 3

## Accomplishments
- Implemented `applyTrainingBlock` pure function — processes drill/rest schedule in day-index order, accumulates per-player attribute deltas across all sessions
- Added `DRILL_LABELS` record mapping all 8 DrillTypes to title-cased human-readable labels (single source of truth for hub and profile screens)
- Added `TRAINING_DAYS_PER_MATCHDAY = 3` constant (locked to Phase 11 economy tuning — 570 sessions over 5 seasons)
- Extended `SeasonState` with optional `trainingSchedule?` and `trainingDeltas?` fields (undefined-safe for old saves)
- 13 new tests added to training.test.ts; all 30 tests pass (plus 642 total suite passing — no regressions)

## Task Commits

TDD tasks committed in two phases:

1. **RED — Failing tests** - `3e4192c` (test)
2. **GREEN — Implementation** - `dfcd9bc` (feat)

## Files Created/Modified
- `src/season/training.ts` — Added `TRAINING_DAYS_PER_MATCHDAY`, `DRILL_LABELS`, `applyTrainingBlock`; added import for `TrainingSchedule`/`TrainingDeltas` from season.ts
- `src/season/season.ts` — Added `TrainingDayPlan`, `TrainingSchedule`, `TrainingDeltas` type exports; added optional fields to `SeasonState`; added imports for `PlayerAttributes` and `DrillType`
- `src/season/training.test.ts` — Extended with 13 new test cases covering all required behaviors

## Decisions Made
- `TrainingDeltas` is `Map<string, Partial<Record<keyof PlayerAttributes, number>>>` — Map type ensures correct serialization via existing `server/serialize.ts` Map reviver/replacer
- Schedule entries sorted by numeric key in `applyTrainingBlock` for deterministic processing order (JavaScript object key order is not guaranteed for numeric keys in all contexts)
- Delta accumulation only records `gain > 0` — ensures delta values are always non-negative and rest days leave empty delta objects

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `applyTrainingBlock`, `DRILL_LABELS`, and `TRAINING_DAYS_PER_MATCHDAY` all exported and ready for hub screen integration (Plan 02)
- `TrainingSchedule` and `TrainingDeltas` types ready for SeasonState usage in main.ts kickoff handler
- `trainingSchedule?` and `trainingDeltas?` on SeasonState are optional — old saves deserialize safely without migration

---
*Phase: 12-training-scheduler*
*Completed: 2026-03-07*

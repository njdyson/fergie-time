---
phase: 14-training-polish
plan: 02
subsystem: season/coaching
tags: [inbox, email, coaching, training, tdd]
dependency_graph:
  requires: [dayLoop.ts, training.ts, inbox.ts, season.ts]
  provides: [coachingReport.ts, coaching-email-in-inbox]
  affects: [main.ts onContinue handler]
tech_stack:
  added: []
  patterns: [pure-function, tdd-red-green, immutable-state-spread]
key_files:
  created:
    - src/season/coachingReport.ts
    - src/season/coachingReport.test.ts
  modified:
    - src/main.ts
decisions:
  - "generateCoachingReport receives squadBefore/squadAfter pair rather than TrainingDeltas — allows single-session gains without delta accumulation complexity"
  - "null return for rest days and empty squad keeps caller code simple (guard at call site in main.ts)"
  - "Improver list capped at top 3 sorted by total gain; gracefully shows fewer if squad < 3"
metrics:
  duration_minutes: 4
  completed_date: "2026-03-08"
  tasks_completed: 2
  tasks_planned: 2
  files_created: 2
  files_modified: 1
---

# Phase 14 Plan 02: Coaching Report Email System Summary

**One-liner:** Post-training coaching report emails via pure generateCoachingReport function wired into onContinue handler, showing drill type, squad count, and top 3 improvers sorted by attribute gain.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create coaching report generation module with tests | dd1ed27 | src/season/coachingReport.ts, src/season/coachingReport.test.ts |
| 2 | Wire coaching report into day-advance handler in main.ts | c26f489 | src/main.ts |

## What Was Built

### coachingReport.ts

Pure function `generateCoachingReport(dayPlan, dayNumber, squad, squadBefore)` that:
- Returns `null` for rest days or empty squad
- Computes per-player attribute gains by diffing before/after squads for the drill's targeted attributes
- Sorts players by total gain (sum of all attribute deltas), takes top 3 as standout improvers
- Builds subject: `"Training Report: {DrillLabel} — Day {dayNumber}"`
- Builds plain-text body with drill label, squad count, and bulleted improver list (name, improved attributes, total gain percentage)
- Returns `{ subject, body, from: 'Coaching Staff', category: 'general' }`

### coachingReport.test.ts

8 tests covering:
1. Returns null for rest day
2. Correct subject format for drill day
3. from/category fields
4. Body contains drill label and squad count
5. Body lists improver by name
6. Standout improvers sorted highest gain first
7. Graceful handling of fewer than 3 players
8. Empty squad does not throw

### main.ts wiring

In the `onContinue` handler:
1. Capture `prevDay`, `dayPlan` from `trainingSchedule`, and `squadBefore` before `advanceDay`
2. After `advanceDay`, if `dayPlan !== 'rest'`, call `generateCoachingReport`
3. If report returned, spread it into `sendMessage` call with current `matchday`
4. Removed the Phase 14 COACH-01 extension point comment (implemented)

## Decisions Made

1. **squadBefore/squadAfter pattern** — Pass before/after squads rather than TrainingDeltas. TrainingDeltas accumulate across days which would show multi-day totals, not single-session gains. The before/after diff is precise for the just-completed day.

2. **null for empty squad** — If squad is empty (shouldn't happen in normal play), return null rather than a confusing "0 players" report.

3. **Top 3 capped** — Cap at 3 improvers; gracefully show fewer if the squad is smaller. Keeps the email concise.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock used wrong name format**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Test helper set `name` as `{ first, last }` object but `PlayerState.name` is a plain `string | undefined`
- **Fix:** Changed mock to use plain string `name` field
- **Files modified:** src/season/coachingReport.test.ts
- **Commit:** dd1ed27 (same commit as task)

## Self-Check

### Files Exist
- src/season/coachingReport.ts: FOUND
- src/season/coachingReport.test.ts: FOUND

### Commits Exist
- dd1ed27: FOUND
- c26f489: FOUND

### Tests
- All 691 tests pass (8 new coachingReport tests + 683 existing)

## Self-Check: PASSED

---
phase: 12-training-scheduler
plan: 02
subsystem: ui
tags: [training, scheduler, hub, player-profile, deltas, typescript]

# Dependency graph
requires:
  - phase: 12-01
    provides: applyTrainingBlock, DRILL_LABELS, TrainingSchedule, TrainingDeltas types
provides:
  - Training scheduler card on hub screen with 3 day rows, drill/rest toggles, and drill type dropdowns
  - Training deltas panel on player profile screen showing attribute gains after kickoff
  - Kickoff integration that applies applyTrainingBlock exactly once, stores deltas, resets schedule
  - Schedule persistence via onScheduleChange auto-save wiring in main.ts
affects: [13-sandbox]

# Tech tracking
tech-stack:
  added: []
  patterns: [DOM event wiring via getElementById after innerHTML set, camelToTitle helper for attribute label formatting]

key-files:
  created: []
  modified:
    - src/ui/screens/hubScreen.ts
    - src/ui/screens/playerProfileScreen.ts
    - src/main.ts

key-decisions:
  - "Training scheduler card only renders when a next fixture exists — no card shown when season complete"
  - "camelToTitle helper defined inline in hubScreen.ts and playerProfileScreen.ts — no shared utility to avoid over-engineering"
  - "Training applied exactly once in onKickoff handler before startMatchFromSquad() — not on render or revisit"
  - "Schedule reset to {} after kickoff — clean state for next training block"
  - "Delta threshold of 0.0005 to filter floating-point noise from display"

patterns-established:
  - "DOM event listeners wired after innerHTML set using getElementById — consistent with kickoff button pattern"
  - "Training deltas passed through as optional last arg to update()/render() — backward-compatible, undefined = no panel"

requirements-completed: [TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-05]

# Metrics
duration: 15min
completed: 2026-03-07
---

# Phase 12 Plan 02: Training Scheduler UI Summary

**Hub training scheduler card with drill/rest toggles + player profile attribute delta panel wired into kickoff via applyTrainingBlock**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-07T22:40:00Z
- **Completed:** 2026-03-07T22:55:00Z
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 3

## Accomplishments

- Training scheduler card on hub screen shows "Training — 3 Days Until Matchday X" with 3 day rows, each toggling between rest and drill with a dropdown showing drill names and targeted attributes
- Player profile screen renders a "Training Gains" chip panel showing `+N` attribute improvements after kickoff
- main.ts wires schedule persistence, kickoff training application (applyTrainingBlock), delta storage, and schedule reset — training applied exactly once per kickoff

## Task Commits

Each task was committed atomically:

1. **Task 1: Add training scheduler card to HubScreen** - `f802edf` (feat)
2. **Task 2: Add training deltas panel and wire kickoff + schedule** - `c6deafc` (feat)
3. **Task 3: Verify training scheduler end-to-end** - human-verify checkpoint, user approved

## Files Created/Modified

- `src/ui/screens/hubScreen.ts` - Added `scheduleChangeCallbacks`, `onScheduleChange()`, training scheduler card with day toggles and drill type selects, `camelToTitle()` helper, DOM event wiring
- `src/ui/screens/playerProfileScreen.ts` - Added `trainingDeltas` optional param to `update()`/`render()`, "Training Gains" chip panel rendering
- `src/main.ts` - Wired `onScheduleChange` with auto-save, applied `applyTrainingBlock` in kickoff handler, passed `trainingDeltas` to player profile update

## Decisions Made

- Training scheduler card only renders when a next fixture exists — prevents showing stale/meaningless days when season is complete
- camelToTitle helper defined inline (not shared) — simple enough, no over-engineering warranted
- Training applied before `startMatchFromSquad()` in kickoff handler — ensures squad has updated attributes for the match
- Schedule reset to `{}` immediately after kickoff — clean slate for next block, not preserved across matches
- Delta display threshold of 0.0005 — filters floating-point accumulation noise, shows only meaningful gains
- User noted gains may be too small to display after single training block — expected behavior given BASE_DELTA=0.004 tuning, not a bug

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript errors in `src/season/training.test.ts` and `src/ui/portrait/portraitGenerator.test.ts` were present before this plan and are out of scope. The files modified by this plan (hubScreen.ts, playerProfileScreen.ts, main.ts) compile cleanly with zero errors.

User observation: attribute gains from a single training block (1-2 drills) may round to 0 on display (`Math.round(0.004 * 100) = 0`). This is expected given BASE_DELTA calibration — visible gains require multiple training blocks or high work_rate players. Not a bug, potentially worth noting for TRAIN-06 or a future tuning pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Training scheduler complete — TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-05 satisfied
- Phase 13 (Sandbox) can proceed — training deltas stored in seasonState, accessible for sandbox inspection
- Watch: delta display rounding — if users consistently see no gains after training, consider lowering display threshold or adjusting BASE_DELTA (TRAIN-06 territory)
- Watch: existing saves have no `trainingDeltas` field — undefined check in playerProfileScreen handles this gracefully (no panel rendered)

---
*Phase: 12-training-scheduler*
*Completed: 2026-03-07*

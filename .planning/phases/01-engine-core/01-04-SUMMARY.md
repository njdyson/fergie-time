---
phase: 01-engine-core
plan: 04
subsystem: simulation/match
tags: [match-state, phase-machine, goal-detection, tdd, pure-functions]

# Dependency graph
requires:
  - "src/simulation/types.ts (MatchPhase, SimSnapshot, BallState, PlayerState, TeamId, MatchEvent)"
  - "src/simulation/math/vec2.ts (Vec2)"
provides:
  - "advancePhase() — tick-driven phase state machine with KICKOFF→FIRST_HALF→HALFTIME→SECOND_HALF→FULL_TIME"
  - "checkGoal() — pure goal detection using ball position, goal dimensions, and crossbar height"
  - "createInitialSnapshot() — SimSnapshot factory at tick 0 with 22 players in 4-4-2 and ball at center"
  - "applyGoal() — immutable score increment + ball reset"
  - "getKickoffPositions() — 11-position 4-4-2 formation layout for each team"
  - "TICKS_PER_HALF=2700, TOTAL_MATCH_TICKS=5400 (sim time compression constants)"
  - "PITCH_WIDTH=105, PITCH_HEIGHT=68, GOAL_WIDTH=7.32, CROSSBAR_HEIGHT=2.44"
affects:
  - "01-05 (agent/utility AI — needs SimSnapshot, matchPhase, score)"
  - "01-06 (match loop — will call advancePhase each tick)"
  - "01-07 (event system — consumes MatchEvent output from advancePhase)"
  - "01-08 (stats tracking — depends on SimSnapshot)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure functions throughout: advancePhase, checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions"
    - "Immutable snapshot: applyGoal returns new object, never mutates input"
    - "Const-object pattern: MatchPhase used as `as const` object (established in 01-01)"
    - "Goal-takes-priority rule: justScored=true overrides halftime/fulltime transitions"
    - "Symmetric team layout: away positions mirror home positions by x-flip (x_away = PITCH_WIDTH - x_home)"

key-files:
  created:
    - src/simulation/match/phases.ts
    - src/simulation/match/phases.test.ts
    - src/simulation/match/state.ts
    - src/simulation/match/state.test.ts
  modified: []

key-decisions:
  - "Simulation time compression: 5400 ticks = 90-minute match (3 real minutes at 30 ticks/sec). TICKS_PER_HALF=2700 makes halftime the midpoint. Each tick ~= 1 match-second."
  - "Goal-takes-priority: when justScored=true, advancePhase returns KICKOFF regardless of tick (even if tick=2700 coincides with halftime). This is the simplest correct behavior — a goal mid-transition is always followed by a restart."
  - "4-4-2 kickoff formation: GK at x=5, 4 DEF at x=20, 4 MID at x=35, 2 FWD at x=48. Away team mirrors by x-flip. This is a starting formation — agents will move from these anchors based on utility AI."
  - "Goal detection excludes boundary: y must be strictly inside [GOAL_MIN_Y, GOAL_MAX_Y] (open interval), z must be strictly less than CROSSBAR_HEIGHT. A ball exactly on the post or crossbar is no goal."

patterns-established:
  - "Match phase transitions as pure function: no mutable state, testable in isolation"
  - "SimSnapshot immutability: all state changes return new objects"
  - "Physics constants co-located with their consumers (PITCH_WIDTH/HEIGHT/GOAL_WIDTH in state.ts)"

requirements-completed: [ENG-11, ENG-13]

# Metrics
duration: ~3 min
completed: 2026-03-03
---

# Phase 01 Plan 04: Match State Machine and Goal Detection Summary

**Pure-function match phase state machine (5 states, tick-driven) and goal detection (pitch dimensions, goal bounds, crossbar height) with 63 tests passing — both files immutable and side-effect-free**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T00:21:35Z
- **Completed:** 2026-03-03T00:24:49Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 4

## Accomplishments

- Implemented `advancePhase()` — pure function handling all 5 MatchPhase states and the goal→kickoff restart cycle
- Implemented `checkGoal()` — pure function detecting goals on both ends using PITCH_WIDTH, GOAL_WIDTH, and CROSSBAR_HEIGHT bounds
- Implemented `createInitialSnapshot()` — SimSnapshot factory with 22 players in 4-4-2 kickoff formation and ball at center
- Implemented `applyGoal()` — immutable score increment with ball reset to center
- Implemented `getKickoffPositions()` — 11-position 4-4-2 layout per team (home occupies left half, away mirrors by x-flip)
- 63 tests covering all transitions, edge cases (width boundaries, crossbar, goal-at-halftime-tick), immutability, and formation bounds

## Task Commits

Each task was committed atomically:

1. **TDD RED (tests)** - `461a99f` — failing tests for phases.ts and state.ts
2. **TDD GREEN (implementation)** - `c0b7170` — phases.ts and state.ts

## Files Created

- `src/simulation/match/phases.ts` — `advancePhase()`, `TICKS_PER_HALF`, `TOTAL_MATCH_TICKS`
- `src/simulation/match/phases.test.ts` — 25 tests (phase transitions, constants, goal restart)
- `src/simulation/match/state.ts` — `checkGoal()`, `createInitialSnapshot()`, `applyGoal()`, `getKickoffPositions()`, pitch + goal dimension constants
- `src/simulation/match/state.test.ts` — 38 tests (goal detection, snapshot factory, score mutation, immutability)

## Decisions Made

- **Simulation time compression:** 5400 ticks represents a 90-minute match at 30 ticks/sec = 3 real minutes. TICKS_PER_HALF=2700. Each tick represents ~1 second of match time. This compression is explicit in the constant names and documented in phases.ts.

- **Goal takes priority over halftime:** When `justScored=true` at tick 2700, `advancePhase` returns KICKOFF rather than HALFTIME. Goals interrupt phase progression — the kickoff restart always follows before the half ends.

- **4-4-2 kickoff formation:** GK at x=5, 4 DEF at x=20 (spread y), 4 MID at x=35, 2 FWD at x=48. Away team is x-flipped. These are formation anchors — the utility AI agents will move from these positions during play.

- **Open-interval goal detection:** Ball exactly on post (y == GOAL_MIN_Y or GOAL_MAX_Y) or exactly on crossbar (z == CROSSBAR_HEIGHT) is not a goal. This matches physical reality — the ball must be fully inside the frame.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed erroneous `async` and dynamic `await import()` in test**
- **Found during:** RED phase, first test run
- **Issue:** One test in state.test.ts used `await import('../types.ts')` inside a synchronous `it()` callback, causing esbuild transform error: "await can only be used inside an async function"
- **Fix:** Changed to a static top-level import of `MatchPhase` from `'../types.ts'`. Removed the `async` callbacks from applyGoal tests (they were unnecessary).
- **Files modified:** `src/simulation/match/state.test.ts`
- **Verification:** Test suite runs cleanly after fix

---

Total deviations: 1 auto-fixed (Rule 1 - test syntax error)

## Pre-existing Issues (Out of Scope)

`src/simulation/physics/ball.test.ts` has 6 failing tests from plan 01-02 (TDD RED committed, no GREEN implementation). These are pre-existing failures unrelated to this plan. Logged to deferred items.

## Self-Check: PASSED

---
phase: 01-engine-core
plan: 05
subsystem: simulation/engine + renderer + loop
tags: [engine, game-loop, canvas-renderer, tdd, fixed-timestep, interpolation]

# Dependency graph
requires:
  - "src/simulation/types.ts (SimSnapshot, PlayerState, BallState, MatchPhase)"
  - "src/simulation/math/vec2.ts (Vec2)"
  - "src/simulation/physics/ball.ts (integrateBall)"
  - "src/simulation/match/phases.ts (advancePhase, TICKS_PER_HALF, TOTAL_MATCH_TICKS)"
  - "src/simulation/match/state.ts (checkGoal, createInitialSnapshot, applyGoal, getKickoffPositions)"
provides:
  - "SimulationEngine — tick(dt) producing immutable SimSnapshot, getCurrentSnapshot()"
  - "createTestRosters() — 22-player 4-4-2 formation factory for dev and testing"
  - "MatchConfig — seed, homeRoster, awayRoster, initialBallVelocity, initialBallPosition"
  - "startGameLoop / stopGameLoop — fixed-timestep accumulator at 30 ticks/sec, 60fps render"
  - "CanvasRenderer — draw(prev, curr, alpha) with interpolation for smooth display"
  - "drawPitch — full FIFA pitch markings (outline, halfway, center circle, penalty areas, D-arcs, corners, goals)"
affects:
  - "01-06 (agent AI — adds player movement by returning ActionIntents from engine.tick)"
  - "01-07 (event system — engine already emits goal/kickoff/halftime/fulltime MatchEvents)"
  - "01-08 (contact resolution — stub in engine.tick marked TODO: Plan 08)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixed-timestep accumulator: FIXED_DT_MS=33.33ms, spiral-of-death cap at 200ms, alpha interpolation"
    - "Snapshot interpolation: lerp(prev, curr, alpha) for positions between physics ticks"
    - "Coordinate mapping: pitchToCanvas() maps (0..105, 0..68) metres to canvas pixels with PITCH_PADDING offset"
    - "Ball airborne rendering: radius scales with Z height, shadow alpha inversely proportional to height"
    - "Player direction indicator: line from center in velocity direction (only when speed > 0.1 m/s)"
    - "TDD: RED commit (33 failing tests) followed by GREEN commit (33 passing)"

key-files:
  created:
    - src/simulation/engine.ts
    - src/simulation/engine.test.ts
    - src/loop/gameLoop.ts
    - src/renderer/canvas.ts
    - src/renderer/pitch.ts
  modified:
    - index.html
    - src/main.ts

key-decisions:
  - "MatchConfig.initialBallVelocity and initialBallPosition added as optional overrides — needed to make the visual demo show a moving ball on load and to enable goal-detection tests without waiting 3500 ticks"
  - "Physics paused during HALFTIME and FULL_TIME — engine returns early without calling integrateBall or checkGoal, preventing ball from moving during breaks"
  - "Ball airborne visual: Y offset proportional to Z height gives depth perception in top-down 2D; radius scales 1.0x (ground) to 1.5x (MAX_BALL_Z=20m)"
  - "PITCH_PADDING=20px keeps pitch lines within the canvas frame with a visible margin on all sides"

patterns-established:
  - "Engine stub pattern: TODO Plan XX comments at each future integration point (agent AI, contacts, fatigue)"
  - "Renderer has no simulation knowledge beyond SimSnapshot — clean separation maintained"

requirements-completed: [ENG-14, ENG-15]

# Metrics
duration: ~5 min
completed: 2026-03-03
---

# Phase 01 Plan 05: Simulation Engine Shell, Game Loop, and Canvas Renderer Summary

**SimulationEngine with fixed-timestep accumulator game loop (30 ticks/sec, 60fps render) and Canvas 2D renderer showing pitch, 22 player circles, and a moving ball with interpolation**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-03T00:32:51Z
- **Completed:** 2026-03-03T00:37:39Z
- **Tasks:** 2 (TDD for Task 1, standard for Task 2)
- **Files created:** 5

## Accomplishments

- Implemented `SimulationEngine` — wraps all simulation subsystems (integrateBall, advancePhase, checkGoal, applyGoal) behind a clean `tick(dt): SimSnapshot` interface
- Implemented `createTestRosters()` — generates 22 players in 4-4-2 formation with default attributes for both testing and initial visual rendering
- Implemented `startGameLoop` / `stopGameLoop` — fixed-timestep accumulator pattern at 30 ticks/sec with 200ms spiral-of-death guard and alpha interpolation for smooth 60fps rendering
- Implemented `CanvasRenderer` — draws interpolated frames via `draw(prev, curr, alpha)` with coordinate mapping from simulation metres to canvas pixels
- Implemented `drawPitch` — full FIFA pitch markings: outline, halfway line, center circle and spot, penalty areas, goal areas (six-yard boxes), D-arcs, corner arcs, penalty spots, and goal nets
- Player rendering: filled circles (home=blue #3366cc, away=red #cc3333) with velocity direction indicator
- Ball rendering: circle with Z-scaled radius (1x–1.5x), shadow ellipse with alpha proportional to height, airborne Y-offset for depth perception
- 33 tests pass covering all engine behaviors

## Task Commits

Each task committed atomically:

1. **TDD RED (engine tests)** - `45e37dc` — 33 failing tests for SimulationEngine
2. **TDD GREEN (engine implementation)** - `b2db10d` — engine.ts, 33 tests pass
3. **Task 2 (game loop + renderer)** - `abfa01a` — gameLoop.ts, canvas.ts, pitch.ts, index.html, main.ts

## Files Created

- `src/simulation/engine.ts` — SimulationEngine class + MatchConfig interface + createTestRosters factory
- `src/simulation/engine.test.ts` — 33 tests (construction, tick progression, ball physics, phase transitions, goal detection, physics pause)
- `src/loop/gameLoop.ts` — startGameLoop / stopGameLoop with fixed-timestep accumulator
- `src/renderer/canvas.ts` — CanvasRenderer with interpolation and coordinate mapping
- `src/renderer/pitch.ts` — drawPitch with full FIFA pitch markings

## Decisions Made

- **MatchConfig overrides:** `initialBallVelocity` and `initialBallPosition` added as optional override fields. Needed for goal-detection tests (place ball near goal line, no waiting 3500 ticks) and for the dev demo (visible moving ball on load).

- **Physics pause during breaks:** Engine returns early without integrateBall or checkGoal during HALFTIME and FULL_TIME. Ball position stays frozen. This matches football reality and prevents the ball from drifting off-pitch during breaks.

- **Ball Z rendering:** Radius scales from 1x (ground) to 1.5x (at MAX_BALL_Z=20m). Y-offset applies a small upward shift proportional to Z height, giving visual depth in 2D top-down view. Shadow alpha decreases from 0.35 (ground) to 0 (MAX_BALL_Z).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Pre-existing unused variable in agent.test.ts blocked build**
- **Found during:** Task 2 build verification (`npm run build`)
- **Issue:** `src/simulation/ai/agent.test.ts` line 129 declared `const rng = createRng('test')` then used `createRng('test')` again on line 136, leaving `rng` unused. TypeScript `noUnusedLocals: true` failed the tsc step.
- **Fix:** Removed the unused `const rng = createRng('test')` line. The subsequent `evaluateAction(...)` call already passes `createRng('test')` directly.
- **Files modified:** `src/simulation/ai/agent.test.ts`
- **Commit:** `abfa01a`

---

Total deviations: 1 auto-fixed (Rule 3 - blocking build issue from pre-existing TDD RED file)

## Self-Check: PASSED

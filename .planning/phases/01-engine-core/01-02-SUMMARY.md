---
phase: 01-engine-core
plan: 02
subsystem: simulation/physics
tags: [physics, ball, gravity, friction, bounce, ccd, tdd]

# Dependency graph
requires:
  - "01-01 (Vec2, BallState type)"
provides:
  - "integrateBall(ball: BallState, dt: number): BallState — pure 2.5D physics integration"
  - "continuousCollisionCheck(ballPos, ballVel, playerPos, dt, playerRadius): boolean — parametric CCD"
  - "GRAVITY, GROUND_FRICTION, BOUNCE_COEFFICIENT, SETTLE_THRESHOLD constants"
affects: [01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-09, 01-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "2.5D ball physics: Z-axis projectile + XY ground plane, ground resting guard prevents discrete-time micro-bounce loop"
    - "Settle on incoming vz: |vz_incoming| * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD fires settle — physically correct for discrete timestep"
    - "CCD via parametric ray-circle: quadratic discriminant check with t in [0,1] catches tunneling fast balls"
    - "Pure functions: both integrateBall and continuousCollisionCheck return new state, never mutate input"

key-files:
  created:
    - src/simulation/physics/ball.ts
    - src/simulation/physics/ball.test.ts
  modified: []

key-decisions:
  - "Ground resting guard (z===0 && vz===0 short-circuit): in discrete timestep physics, gravity applied to a ball at rest produces downward vz each tick which would trigger a perpetual micro-bounce. Guard prevents this cleanly without changing the physical model."
  - "Settle condition applied to incoming vz (before BOUNCE_COEFFICIENT): checking |vz_incoming| * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD is physically correct. Checking outgoing vz alone fails in discrete time because gravity amplifies the ball's return speed above the settle threshold even for tiny bounces."
  - "Test scenarios use specific z values and dt to ensure ground contact actually occurs in one tick — with dt=33ms, large z values and small vz will not reach ground within one tick."

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 01 Plan 02: 2.5D Ball Physics Summary

**Pure `integrateBall` function and `continuousCollisionCheck` utility with gravity, ground friction, bounce coefficient, and parametric CCD — 25 tests passing, all 155 suite tests green**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-03T00:21:32Z
- **Completed:** 2026-03-03T00:29:15Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files created:** 2

## Accomplishments

- Implemented `integrateBall` as a pure function operating on `BallState` with Z-axis gravity (9.8 m/s^2), XY ground friction (0.985 per-tick), and BOUNCE_COEFFICIENT=0.55 bounce
- Resolved discrete-time physics pitfall: added ground resting guard and adjusted settle condition to use incoming vz before coefficient, preventing perpetual micro-bounce loop
- Implemented `continuousCollisionCheck` using parametric ray-circle intersection — catches fast balls tunneling through player radius per tick
- Exported all 4 physics constants for test verification and consumer use
- 25 tests cover all behavioral requirements from the plan spec

## Task Commits

Each TDD phase was committed atomically:

1. **TDD RED: Failing ball physics tests** - `0821c5f` (test)
2. **TDD GREEN: Ball physics implementation** - `af153c2` (feat)

## Files Created

- `src/simulation/physics/ball.ts` — `integrateBall`, `continuousCollisionCheck`, GRAVITY, GROUND_FRICTION, BOUNCE_COEFFICIENT, SETTLE_THRESHOLD
- `src/simulation/physics/ball.test.ts` — 25 tests: constants, friction, gravity, bounce, CCD

## Decisions Made

- **Ground resting guard:** When `ball.z === 0 && ball.vz === 0`, the integration skips gravity and returns the grounded state unchanged. Without this, each tick applies gravity to a resting ball, producing a downward vz, then a micro-bounce — creating a perpetual oscillation loop invisible to the eye but consuming settle logic endlessly.

- **Settle on incoming vz (before coefficient):** The plan spec says "settles when vz < 0.1" but the check must apply to the incoming downward vz times BOUNCE_COEFFICIENT, not the outgoing vz alone. With dt=33ms, GRAVITY adds 0.327 m/s per tick, meaning even a ball that bounces upward at 0.2 m/s will return with ~0.5 m/s speed — always above any outgoing threshold. Checking `Math.abs(vz_incoming) * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD` correctly expresses "the bounce would produce imperceptible movement."

- **CCD coefficient sign convention:** The standard parametric ray-circle formula uses `d = playerPos - ballPos` (vector from ball to player), with `b = -2 * d.dot(move)` and `c = d.dot(d) - r^2`. The `minus` root of the quadratic gives the first contact point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Discrete-time micro-bounce loop in ground physics**
- **Found during:** Task GREEN (TDD testing)
- **Issue:** Ball at rest (z=0, vz=0): each tick, gravity sets `vz = -0.327`, `z = 0 + 0*dt = 0`, then `z <= 0` triggers bounce giving `vz = +0.180`, which is above SETTLE_THRESHOLD so ball launches upward forever
- **Fix:** Added `if (ball.z === 0 && ball.vz === 0)` early-exit to skip physics for fully-grounded balls
- **Files modified:** `src/simulation/physics/ball.ts`
- **Committed in:** `af153c2`

**2. [Rule 1 - Bug] Settle condition never triggered in discrete time**
- **Found during:** Task GREEN (TDD testing — parabolic arc test failed at 500 ticks)
- **Issue:** Ball in oscillating micro-bounce cycle where even tiny outgoing vz values caused return impact speed above threshold due to discrete gravity accumulation. The check `Math.abs(vz_out) < SETTLE_THRESHOLD` was correct semantically but unreachable in the discrete system.
- **Fix:** Changed to `Math.abs(vz_in) * BOUNCE_COEFFICIENT < SETTLE_THRESHOLD` — fires on incoming speed, meaning "this bounce would produce bounce height below perceptible threshold"
- **Files modified:** `src/simulation/physics/ball.ts`
- **Committed in:** `af153c2`

**3. [Rule 2 - Test accuracy] Initial test scenarios built on wrong z/vz combinations**
- **Found during:** First GREEN test run (6 of 22 failing)
- **Issue:** Several test cases used z/vz pairs where the ball did not actually reach the ground within a single 33ms tick (e.g., `z=5, vz=-20` gives `z_new = 4.33`, not negative). Tests expected ground contact but ball remained airborne.
- **Fix:** Recalculated all test parameters to verify ground contact occurs within one tick. Added small-dt (2ms and 5ms) test cases for precise settle-threshold boundary tests.
- **Files modified:** `src/simulation/physics/ball.test.ts`
- **Committed in:** `af153c2`

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs in implementation, 1 Rule 2 test accuracy fix)
**Impact on plan:** Deviations addressed fundamental discrete-time physics correctness. The final behavior matches the plan spec: ball decelerates on ground, follows parabolic arc, bounces with coefficient 0.55, and settles. No scope creep.

## Issues Encountered

- The reference code in research Pattern 7 does not handle the ground resting guard or discrete-time settle convergence. The reference code would produce the same perpetual bounce loop. This is a known discrete-time physics issue that requires an explicit ground constraint.

## User Setup Required

None.

## Next Phase Readiness

- `integrateBall` and `continuousCollisionCheck` are ready for import in all subsequent Phase 1 plans
- Both functions are pure and side-effect free — safe to use in the immutable simulation tick pattern
- Physics constants are exported and can be used by consumer modules for calibration
- The grounded-state pattern (z=0, vz=0) is the canonical settled ball state — consumer code can check this pair to determine if the ball is at rest

---
*Phase: 01-engine-core*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 3 expected files exist on disk. Both task commits verified: 0821c5f (RED), af153c2 (GREEN). All 155 tests pass (25 new + 130 existing).

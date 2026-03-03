---
phase: 01-engine-core
plan: 03
subsystem: simulation/physics
tags: [steering, reynolds, vec2, physics, tdd]

# Dependency graph
requires:
  - "01-01: Vec2 immutable class"
provides:
  - "Reynolds steering behaviors: seek, arrive, separation, pursuit, clampVelocity"
  - "BASE_PLAYER_SPEED constant (8.0 m/s) for caller attribute-speed computation"
affects: [01-06, 01-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure steering functions: all take Vec2 inputs, return Vec2 outputs, never mutate"
    - "TDD RED-GREEN: failing tests committed before implementation"
    - "Inverse-distance separation: 1/dist weight gives stronger repulsion for close neighbors"
    - "Look-ahead pursuit: lookAhead = distance/maxSpeed — proportional prevents overshoot"

key-files:
  created:
    - src/simulation/physics/steering.ts
    - src/simulation/physics/steering.test.ts
  modified: []

key-decisions:
  - "All steering functions return desired velocity, not steering force — caller subtracts current velocity when needed. Keeps the functions simpler and callers explicit about integration."
  - "separation() uses strict dist < radius (not <=) to exclude neighbors exactly at the boundary — consistent with open interval interpretation."
  - "BASE_PLAYER_SPEED = 8.0 m/s — mid-range of average footballer sprint (8-9 m/s). Callers multiply by pace attribute and (1 - fatiguePenalty)."

# Metrics
duration: ~3min
completed: 2026-03-03
---

# Phase 01 Plan 03: Steering Behaviors Summary

**Craig Reynolds seek/arrive/separation/pursuit with attribute-capped velocity — 25 tests passing, all functions pure Vec2-in Vec2-out**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T00:21:31Z
- **Completed:** 2026-03-03T00:23:56Z
- **Tasks:** 2 (TDD RED + TDD GREEN)
- **Files modified:** 2 created

## Accomplishments

- Implemented all four Craig Reynolds steering behaviors following the research Pattern 6 model
- seek: normalizes direction from position to target, scales to maxSpeed — handles coincident points via Vec2.normalize() zero-guard
- arrive: full speed outside slowing radius, proportionally decelerates inside, zero at target (dist < 0.01)
- separation: summed inverse-distance repulsion from all neighbors within radius — skips zero-distance neighbors to prevent division by zero
- pursuit: predicts future target position using lookAhead = distance/maxSpeed — degrades to seek for stationary targets
- clampVelocity: direction-preserving speed cap, zero-safe via Vec2.normalize()
- Exported BASE_PLAYER_SPEED = 8.0 constant for callers computing attribute-derived maxSpeed

## Task Commits

Each task was committed atomically (TDD workflow):

1. **TDD RED — Failing steering tests** - `e08925b` (test)
2. **TDD GREEN — Steering implementation** - `2997025` (feat)

## Files Created/Modified

- `src/simulation/physics/steering.ts` — All steering behaviors: seek, arrive, separation, pursuit, clampVelocity, BASE_PLAYER_SPEED (~118 lines)
- `src/simulation/physics/steering.test.ts` — 25 tests covering all behaviors, edge cases, and constant assertions

## Decisions Made

- **Return desired velocity, not steering force:** The functions return desired velocity (normalized direction * maxSpeed) rather than raw steering force. Callers that need steering force subtract current velocity themselves: `steeringForce = seek(...) - currentVelocity`. This keeps the functions simpler and makes caller intent explicit.
- **BASE_PLAYER_SPEED = 8.0 m/s:** Represents a player with pace=1.0 and no fatigue. Average footballer sprint is 8-9 m/s; 8.0 is a conservative middle. Callers in Plan 06/08 will compute: `maxSpeed = pace * BASE_PLAYER_SPEED * (1 - fatiguePenalty)`.
- **separation() uses strict < for radius:** Neighbors at exactly the radius boundary are excluded (strict less-than). Consistent with the open interval interpretation and the Vec2 normalize contract.

## Deviations from Plan

None — plan executed exactly as written. The steering behavior specifications in the plan exactly matched Pattern 6 from the research document. TDD RED-GREEN workflow followed cleanly: 25 tests written first (all failing), then implementation written to make them pass.

Pre-existing failures in `ball.test.ts`, `phases.test.ts`, and `state.test.ts` are out-of-scope TDD RED states from Plans 01-02, 01-04, and 01-05 — not caused by this plan.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Steering functions ready for import by the agent system (Plans 06/08)
- `BASE_PLAYER_SPEED` exported for callers computing attribute-derived maxSpeed
- All functions pure — suitable for headless simulation and test isolation
- Vec2 dependency chain confirmed working end-to-end

---
*Phase: 01-engine-core*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 2 expected files exist on disk. Both task commits verified in git log (e08925b, 2997025).

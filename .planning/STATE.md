---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
last_updated: "2026-03-03T14:58:00.000Z"
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 10
  completed_plans: 1
  current_phase: 02-tactical-layer
  current_plan: 01
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events
**Current focus:** Phase 2 — Tactical Layer

## Current Position

Phase: 2 of 4 (Tactical Layer) — IN PROGRESS
Plan: 1 of 10 in current phase — COMPLETE (1/10)
Status: Phase 2 plan 01 complete — formation templates, role/duty system, TacticalConfig engine wiring
Last activity: 2026-03-03 — Plan 02-01 complete: 5 formation templates, autoAssignRole, duty weight modifiers wired into selectAction, TacticalConfig per team. 441 tests pass, build succeeds.

Progress: [█░░░░░░░░░] 10%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: ~4.9 min
- Total execution time: ~44 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Engine Core | 10 | ~64 min | ~6.4 min |
| 2. Tactical Layer | 1 | ~15 min | ~15 min |

**Recent Trend:**
- Last 5 plans: 01-06 (7 min), 01-07 (3 min), 01-08 (8 min), 01-09 (7 min), 01-10 (20 min incl. checkpoint)
- Trend: consistent ~3-8 min per plan; plan 10 longer due to human-verify checkpoint

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: Engine-first build order — no management screen has value until the match engine produces genuine emergent football. Research unanimous on this.
- [Roadmap]: Observability tooling (per-agent decision logging, score range audit) is Phase 1 work, not a later addition — emergent behavior cannot be tuned in a black box.
- [Roadmap]: Utility AI calibration thresholds (goals per match: mean ~2.5, action domination cap: ~40%) are literature-informed estimates, not empirically derived. Treat as starting targets.
- [01-01]: Use const-object pattern instead of TypeScript enum — Vite 7 tsconfig has `erasableSyntaxOnly: true`. Pattern: `const X = { ... } as const; type X = (typeof X)[keyof typeof X]`. Apply to all future plans.
- [01-01]: ActionType has 8 values (PASS_FORWARD + PASS_SAFE separate) despite ENG-03 "7 actions" — the count is behavioral, not structural. More granular options = better utility AI decisions.
- [01-03]: Steering functions return desired velocity (not steering force) — callers subtract current velocity to get force. Keeps functions simpler, callers explicit about integration.
- [01-03]: BASE_PLAYER_SPEED = 8.0 m/s for pace=1.0/fatigue=0 — callers compute maxSpeed = pace * BASE_PLAYER_SPEED * (1 - fatiguePenalty).
- [01-04]: Simulation time compression: 5400 ticks = 90-minute match (3 real minutes at 30/sec). TICKS_PER_HALF=2700.
- [01-04]: Goal takes priority over halftime — justScored=true always returns KICKOFF even at tick 2700.
- [01-04]: 4-4-2 kickoff formation as formation anchors — GK at x=5, DEF at x=20, MID at x=35, FWD at x=48. Away mirrors by x-flip.
- [01-05]: MatchConfig supports initialBallVelocity and initialBallPosition for testing and dev init — enables goal-detection tests without waiting 3500 ticks.
- [01-05]: Physics paused during HALFTIME and FULL_TIME — engine returns early without integrateBall/checkGoal during breaks.
- [01-05]: Fixed-timestep accumulator at FIXED_DT_MS=33.33ms with 200ms spiral-of-death guard. Alpha interpolation gives smooth 60fps from 30 tick/sec simulation.
- [Phase 01-06]: Scale PERSONALITY_WEIGHTS by ~0.3x — original 0.40-0.50 weights caused personality to dominate consideration product; scaled to max ~0.15 per trait to preserve trait differentiation without overriding context-driven scores
- [Phase 01-06]: NOISE_SCALE = 0.12 — gives composure=0.2 stdDev=0.096, sufficient for >30% action variance in ambiguous contexts (research recommendation was 0.08 but proved insufficient for the variance spec)
- [Phase 01-07]: Physical vs technical attenuation split (0.5 vs 0.2 factor) — fatigue makes you slow, not unskilled; skill attributes degrade only mildly
- [Phase 01-07]: Personality erosion from base values (not cumulative) — applyFatigueToPersonality takes canonical base, ensuring stateless per-tick calculation
- [Phase 01-08]: Linear difference formula (tackling-dribbling+1)/2 for tackle base probability — ratio formula cannot reach >70% spec threshold after distance penalty
- [Phase 01-08]: Threshold distance penalty: no penalty within 1m contact range, inverse-quadratic beyond — preserves close-range spec examples and far-range degradation
- [Phase 01-08]: Hard MAX_TACKLE_REACH=4m with rng consumption on early return — deterministic rng stream preserved for match replay reproducibility
- [Phase 01-09]: Possession denominator excludes loose ball ticks: homeTicksWithBall / (home + away) not /totalTicks — meaningful possession stat even during dead ball periods
- [Phase 01-09]: auditScoreRanges with empty entries returns no flags — zero-data state is not meaningful for calibration audit
- [Phase 01-09]: DebugOverlay caches snapshot on draw() for click hit testing — correct async pattern for canvas event handling
- [Phase 01-10]: Ball stopped (velocity zeroed) at HALFTIME/FULL_TIME/SECOND_HALF transition — matches physical reality, fixes test regression from AI-generated ball velocity
- [Phase 01-10]: Intent resolution synchronous — all agents select simultaneously from read-only context, then intents applied sequentially
- [Phase 01-10]: createMatchRosters() uses 8 named archetypes (not random) — ensures observable behavioral differences from the start
- [Phase 01-10]: Player oscillation/jitter is a known calibration concern (action scores flip each tick) — deferred to Phase 2 tuning pass
- [Phase 02-01]: LM/RM role labels replaced by LW/RW — Role type has 10 values; wide midfielders map to LW/RW in the taxonomy
- [Phase 02-01]: dutyModifier passed as optional closure to selectAction — backward compatible, zero callsite changes needed in existing code
- [Phase 02-01]: TacticalConfig per-team stored in engine — setHomeTactics/setAwayTactics enable halftime changes; config applies from next tick
- [Phase 02-01]: Phase-transition tests given 30s timeout — 5400-tick full-match tests flake at 5s default under parallel test load

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 - PRIORITY]: Player oscillation / jitter — utility AI action scores flip each tick causing players to run back and forth. Root cause: context signals (distanceToBall, formationAnchor) produce different winning actions on alternating ticks. Fix approaches: (a) action hysteresis bonus; (b) EMA-smoothed context distances; (c) recalibrate consideration curves; (d) action cooldowns.
- [Phase 3]: AI manager heuristic complexity is under-specified — needs scoping during Phase 3 planning to bound how simple "simple heuristics" can be.
- [Phase 4]: Pixel-art procedural portrait generation has no standard approach — needs dedicated research before Phase 4 planning begins.

## Session Continuity

Last session: 2026-03-03
Stopped at: Completed 02-tactical-layer/02-01-PLAN.md
Resume file: .planning/phases/02-tactical-layer/02-02-PLAN.md

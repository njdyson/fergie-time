---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in-progress
stopped_at: "Completed 03-04-PLAN.md"
last_updated: "2026-03-06T07:44:28Z"
last_activity: "2026-03-06 — Plan 03-04 complete: Screen router with nav tabs, season init, fullTimeOverlay Continue button."
progress:
  total_phases: 4
  completed_phases: 2
  total_plans: 19
  completed_plans: 17
  percent: 89
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events
**Current focus:** Phase 3 — Management Shell

## Current Position

Phase: 3 of 4 (Management Shell) — IN PROGRESS
Plan: 4 of 6 in current phase — COMPLETE (4/6)
Status: Phase 3 plan 04 complete — Screen router, nav tabs, season init, fullTimeOverlay Continue button
Last activity: 2026-03-06 — Plan 03-04 complete: Screen state machine with nav tabs routing 5 views, SeasonState at startup, and fullTimeOverlay Continue button.

Progress: [████████░░] 89%

## Performance Metrics

**Velocity:**
- Total plans completed: 9
- Average duration: ~4.9 min
- Total execution time: ~44 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Engine Core | 10 | ~64 min | ~6.4 min |
| 2. Tactical Layer | 2 | ~21 min | ~10.5 min |
| 3. Management Shell | 4 | ~15 min | ~3.8 min |

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
- [Phase 02-02]: D key toggles ALL debug panels together (sidebar + stats + tuning) — per user notes, simpler mental model for developer mode
- [Phase 02-02]: Formation returns Vec2[] when any player dragged >0.5m from template position — engine accepts both FormationId and Vec2[]
- [Phase 02-02]: Duties preserved across formation changes — user intent should survive shape changes
- [Phase 02-03]: 16-man squad pattern: 11 starters in active simulation, 5 bench stored separately in MatchConfig — keeps actor count at 22 max, simpler bench UI state
- [Phase 02-03]: Halftime latch mechanism using isHalftimeLatched() guard — prevents repeated auto-pause during long halftime period, latch cleared on startSecondHalf()
- [Phase 02-03]: Formation changes apply at second-half kickoff via _applyInitialFormation(), not immediately — maintains state consistency, allows review before commit
- [Phase 02-03]: Substituted player inherits role/duty/anchor from outgoing player, but retains own attributes/personality — preserves tactical role while representing individual player strengths
- [Phase 03-01]: 16-man squad bench composition: GK, CB, CM, CM, ST — 2 CM for midfield flexibility over plan's ambiguous "5 bench" specification
- [Phase 03-01]: Attribute generation uses clamp(base + (rng-0.5)*2*spread, 0, 1) — tight range per tier prevents cross-tier overlap
- [Phase 03-02]: AI tier distribution: 4 strong + 10 mid + 5 weak (19 AI teams) — player team not assigned a tier
- [Phase 03-02]: quickSim.ts created as stub returning {1,0} deterministically — Plan 05 will implement full logic
- [Phase 03-02]: fatigueMap uses playerId keys across all teams — separate from readonly PlayerState.fatigue
- [Phase 03-03]: quickSimMatch uses real SimulationEngine with MatchConfig — replaces stub, handles halftime latch automatically
- [Phase 03-03]: Screen class pattern: constructor(container), update(state), getElement() — consistent standalone modules wired by Plan 05
- [Phase 03-04]: App starts on Hub screen — no auto-match-start on load; match requires explicit Squad selection + Kick Off
- [Phase 03-04]: SquadScreen wrapped in inner container div — Kick Off button appended as sibling so it survives innerHTML re-renders
- [Phase 03-04]: fullTimeOverlay Continue button replaces click-anywhere-to-close — backward compatible via optional onContinue callback

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 - PRIORITY]: Player oscillation / jitter — utility AI action scores flip each tick causing players to run back and forth. Root cause: context signals (distanceToBall, formationAnchor) produce different winning actions on alternating ticks. Fix approaches: (a) action hysteresis bonus; (b) EMA-smoothed context distances; (c) recalibrate consideration curves; (d) action cooldowns.
- [Phase 3]: AI manager heuristic complexity is under-specified — needs scoping during Phase 3 planning to bound how simple "simple heuristics" can be.
- [Phase 4]: Pixel-art procedural portrait generation has no standard approach — needs dedicated research before Phase 4 planning begins.

## Session Continuity

Last session: 2026-03-06T07:44:28Z
Stopped at: Completed 03-04-PLAN.md
Resume file: .planning/phases/03-management-shell/03-04-SUMMARY.md

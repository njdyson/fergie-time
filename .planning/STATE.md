# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-02)

**Core value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events
**Current focus:** Phase 1 — Engine Core

## Current Position

Phase: 1 of 4 (Engine Core)
Plan: 4 of 10 in current phase
Status: In progress — executing
Last activity: 2026-03-03 — Plan 01-04 complete: match phase state machine and goal detection (63 tests)

Progress: [████░░░░░░] 40%

## Performance Metrics

**Velocity:**
- Total plans completed: 4
- Average duration: ~4.5 min
- Total execution time: ~18 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Engine Core | 4 | ~18 min | ~4.5 min |

**Recent Trend:**
- Last 5 plans: 01-01 (6 min), 01-02 (n/a — skipped to 01-03), 01-03 (3 min), 01-04 (3 min)
- Trend: —

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

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 1]: Utility AI calibration for football simulation is poorly documented — response curve design for consideration normalization needs focused research during Phase 1 planning.
- [Phase 3]: AI manager heuristic complexity is under-specified — needs scoping during Phase 3 planning to bound how simple "simple heuristics" can be.
- [Phase 4]: Pixel-art procedural portrait generation has no standard approach — needs dedicated research before Phase 4 planning begins.

## Session Continuity

Last session: 2026-03-03
Stopped at: 01-04-PLAN.md complete. Ready to execute 01-05-PLAN.md.
Resume file: None

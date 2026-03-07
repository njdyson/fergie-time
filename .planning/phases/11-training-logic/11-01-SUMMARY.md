---
phase: 11-training-logic
plan: 01
subsystem: training
tags: [tdd, pure-function, training, economy, simulation]
dependency_graph:
  requires:
    - src/simulation/types.ts (PlayerState, PlayerAttributes, PersonalityVector)
    - src/season/teamGen.ts (createAITeam — used in economy sim test)
    - seedrandom (deterministic RNG for headless sim)
  provides:
    - src/season/training.ts (DrillType, DRILL_ATTRIBUTE_MAP, applyDrill, ALL_DRILL_TYPES)
    - src/season/training.test.ts (17 unit tests + 5-season headless economy sim)
  affects:
    - Phase 12 (scheduler UI — will consume applyDrill as its backbone)
tech_stack:
  added: []
  patterns:
    - Pure function (no mutation, no side effects)
    - Const-object enum pattern (DrillType follows project convention)
    - TDD (RED→GREEN, no refactor needed)
    - Asymptotic diminishing returns via (1 - currentValue) term
key_files:
  created:
    - src/season/training.ts
    - src/season/training.test.ts
  modified: []
decisions:
  - BASE_DELTA = 0.004 — verified safe by 5-season headless sim (570 sessions, weak-tier squad never exceeds 0.95)
  - work_rate used as training proxy (0.6 + work_rate * 0.8), per Phase 11 research decision (no new trait)
  - Age curve: ≤20→1.0, piecewise linear decay to 36+→0.15 (matches research spec exactly)
  - undefined age defaults to 25 (safe midpoint, avoids NaN, matches plan spec)
metrics:
  duration: 3 min
  completed_date: "2026-03-07"
  tasks_completed: 2
  files_created: 2
requirements_satisfied:
  - TRAIN-04
  - TRAIN-06
---

# Phase 11 Plan 01: Training Drill System Summary

Pure training drill system implemented as `applyDrill(players, drillType)` — a pure function using the formula `gain = BASE_DELTA * ageFactor * trainingFactor * (1 - currentValue)` with `BASE_DELTA=0.004` tuned via headless 5-season simulation to keep the training economy sound.

## What Was Built

**`src/season/training.ts`** — Pure training logic (159 lines):
- `DrillType` const-object with 8 drill types: fitness, passing, shooting, defending, set_pieces, tactics, dribbling, aerial
- `DRILL_ATTRIBUTE_MAP` mapping each drill to targeted `PlayerAttributes` keys
- `getAgeFactor(age)`: piecewise linear decay — ≤20 returns 1.0, 36+ returns 0.15
- `getTrainingFactor(personality)`: `0.6 + work_rate * 0.8`, range [0.6, 1.4]
- `applyDrill(players, drill)`: public API — maps over squad, calls `applyDrillToPlayer` per player
- `ALL_DRILL_TYPES` array for iteration convenience

**`src/season/training.test.ts`** — Unit tests + headless sim (310 lines, 17 tests):
- Targeted attribute improvement for passing and fitness drills
- Non-target attribute stability (passing drill leaves pace/strength unchanged)
- Immutability: original PlayerState not mutated, new object references returned
- Age factor: age 19 gains more than age 32, undefined age equals age 25
- Personality factor: work_rate=1.0 gains ~2.33x more than work_rate=0.0
- Diminishing returns: value at 0.50 gains more than value at 0.85
- Attribute cap: value at 1.0 produces zero gain; value at 0.999 stays ≤ 1.0
- Edge cases: empty array, multi-player call
- DRILL_ATTRIBUTE_MAP completeness: all 8 drill types present
- DrillType const-object string values correct
- 5-season headless economy simulation: 570 sessions, no attribute exceeds 0.95

## Key Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| BASE_DELTA | 0.004 | Tuned via headless sim: weak-tier squad (base ~0.45) after 570 sessions stays below 0.95 |
| Training proxy trait | work_rate | Research decision: no new trait needed, work_rate semantic fits |
| Age default | 25 | Safe midpoint when age field undefined; equal to age 25 deterministically |
| No potential cap | Asymptotic (1-v) | TRAIN-06 requirement — growth never truly stops, just slows |

## Verification

```
npx vitest run src/season/training.test.ts
✓ 17 tests pass (0 failures)
```

Success criteria met:
1. All 17 tests pass including 5-season headless economy simulation
2. 17 test cases (exceeds minimum 10)
3. No attribute exceeds 0.95 in headless sim for players starting below 0.70
4. `applyDrill` is a pure function — no mutation, no side effects, no external state
5. `DrillType` uses const-object pattern consistent with project conventions

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/season/training.ts` exists: FOUND
- `src/season/training.test.ts` exists: FOUND
- RED commit `251582f`: FOUND
- GREEN commit `392658e`: FOUND

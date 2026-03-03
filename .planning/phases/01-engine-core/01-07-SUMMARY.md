---
phase: 01-engine-core
plan: 07
subsystem: simulation/ai
tags: [fatigue, attribute-attenuation, personality-erosion, glycogen-curve, tdd, pure-functions]

# Dependency graph
requires:
  - "01-01: PersonalityVector, PlayerAttributes types from types.ts"
  - "01-06: personality erosion concept, base personality vector patterns"
provides:
  - "accumulateFatigue: gradual-then-steep glycogen depletion curve with stamina and work_rate modifiers"
  - "applyFatigueToAttributes: physical 50% attenuation, technical 20% attenuation at full fatigue"
  - "applyFatigueToPersonality: lerp toward CONSERVATIVE_DEFAULTS with EROSION_FACTOR=0.6"
  - "CONSERVATIVE_DEFAULTS: cautious personality vector for fatigue erosion target"
  - "ATTENUATION_FACTOR=0.5, EROSION_FACTOR=0.6 tuning constants"
affects: [01-08, 01-09, 01-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Glycogen-depletion curve: baseRate 0.004/min (first 60 min) → 0.012/min (final 30 min) — steepness matches real physiological pattern"
    - "Stamina modifier: staminaMod = 1.5 - stamina → high stamina reduces fatigue rate, low stamina increases it"
    - "Physical vs technical attenuation split: pace/strength/stamina at 0.5x factor, skill attributes at 0.2x — fatigue makes you slow, not unskilled"
    - "Personality erosion via lerp to conservative defaults — per-tick from base values, NOT cumulative mutation"

key-files:
  created:
    - src/simulation/ai/fatigue.ts
    - src/simulation/ai/fatigue.test.ts
  modified: []

key-decisions:
  - "Physical vs technical attenuation split (0.5 vs 0.2 factor): plan specified 'fatigue makes you slow, not unskilled' — physical and technical attributes use different factors to model this correctly"
  - "Erosion from base values (not cumulative): applyFatigueToPersonality takes the player's base trait and current fatigue, never the previously-eroded value — ensures per-tick calculation is stateless and consistent"

patterns-established:
  - "Pure fatigue functions: accumulateFatigue, applyFatigueToAttributes, applyFatigueToPersonality are all stateless — safe for headless simulation and test isolation"
  - "Lerp-to-defaults erosion: applying lerp from base to target gives stable, predictable erosion without compounding errors"

requirements-completed: [ENG-06, ENG-07]

# Metrics
duration: ~3min
completed: 2026-03-03
---

# Phase 01 Plan 07: Fatigue System Summary

**Glycogen-depletion fatigue curve with gradual-then-steep accumulation, physical 50%/technical 20% attribute attenuation, and personality erosion toward conservative defaults — 38 tests passing**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-03T07:24:18Z
- **Completed:** 2026-03-03T07:27:08Z
- **Tasks:** 2 (TDD RED + TDD GREEN)
- **Files modified:** 2 created

## Accomplishments

- Implemented `accumulateFatigue` with physiologically-motivated curve: gentle 0.004/min rate in first 60 match-minutes, steep 0.012/min in final 30 minutes
- Stamina modifier (1.5 - stamina) produces meaningful divergence: high-stamina (0.9) player ends at ~30-40% fatigue vs low-stamina (0.2) at ~60-75% at fulltime
- Attribute attenuation splits physical from technical — pace/strength/stamina at 50% reduction at full fatigue, skill attributes at 20% reduction
- Personality erosion via lerp to CONSERVATIVE_DEFAULTS ensures tired players avoid risk, lower directness and aggression
- All calculations are pure functions with no mutation; fatigue resets naturally between matches by starting at 0

## Task Commits

Each task was committed atomically (TDD workflow):

1. **TDD RED — Failing tests for fatigue system** - `45faf34` (test)
2. **TDD GREEN — Full implementation** - `6683a3a` (feat)

## Files Created/Modified

- `src/simulation/ai/fatigue.ts` — `accumulateFatigue`, `applyFatigueToAttributes`, `applyFatigueToPersonality`, `CONSERVATIVE_DEFAULTS`, `ATTENUATION_FACTOR`, `EROSION_FACTOR`
- `src/simulation/ai/fatigue.test.ts` — 38 tests: accumulation curve shape, stamina/work_rate differentiation, attribute attenuation ratios, personality erosion math, immutability, full match simulation integration

## Decisions Made

- **Physical vs technical attenuation split (0.5 vs 0.2):** The plan explicitly stated "fatigue makes you slow, not unskilled, but tired players do miscontrol slightly." This is modeled with different factors per attribute category — physical at 0.5x, technical at 0.2x.
- **Erosion from base values (not cumulative):** Each call to `applyFatigueToPersonality` takes the player's canonical base personality, not the previously-eroded result. This ensures the function is stateless and deterministic — the engine always has a stable reference point.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — the math for all three functions was precisely specified in the plan and implemented directly.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Fatigue functions ready for integration into the simulation engine tick loop (Plan 08/09)
- `accumulateFatigue` accepts tick and dt — matches the engine's fixed-timestep architecture (01-05)
- `applyFatigueToAttributes` and `applyFatigueToPersonality` can be called per-player per-tick before agent context is built
- All functions are pure and stateless — suitable for headless simulation and parallel test runs

---
*Phase: 01-engine-core*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 3 expected files exist on disk. Both task commits verified in git log (45faf34, 6683a3a). Full test suite: 285 tests passing (38 new fatigue tests + 247 existing), 1 pre-existing failure in spatial.test.ts (unrelated, existed before this plan).

---
phase: 01-engine-core
plan: 10
subsystem: simulation
tags: [utility-ai, formation, steering, fatigue, canvas, debug, gameloop]

# Dependency graph
requires:
  - phase: 01-05
    provides: SimulationEngine shell, Canvas renderer, game loop
  - phase: 01-06
    provides: Utility AI agent system, action considerations, personality weights
  - phase: 01-07
    provides: Fatigue accumulation, attribute attenuation, personality erosion
  - phase: 01-08
    provides: Contact resolution (tackle, shield, aerial)
  - phase: 01-09
    provides: Stats accumulation, decision log ring buffer, debug overlay
provides:
  - Formation anchors (4-4-2) with ball-position influence and possession shift
  - Fully integrated SimulationEngine with all subsystems in tick()
  - createMatchRosters() with varied archetypes (maverick, metronome, poacher, etc.)
  - CanvasRenderer with match HUD (score, time, phase), stats overlay, heatmap
  - DebugOverlay wired to DecisionLog with click-to-inspect
  - GameLoop with speed controls (1x/2x/4x) and pause/resume
  - HTML UI control buttons (Pause, Reset, speed, Stats, Debug, Heatmap)
  - main.ts wiring engine + renderer + debug + post-match console audit
affects:
  - Phase 2 — Tactical/Management UI will build on this engine integration
  - Phase 3 — Player data layer will replace createMatchRosters() archetypes
  - Calibration — utility AI oscillation (player jitter) identified as known concern requiring tuning in early Phase 2 or dedicated calibration pass

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Tick sequence: phase → fatigue → effective-attrs → spatial-grid → formation-anchors → agent-ctx → selectAction → log → resolve-intents → separation → ball-physics → goal-check → stats → snapshot
    - Formation anchors: ball-pull (0.15 factor) + possession shift (±10m/5m) + pitch clamp
    - Intent resolution: simultaneous intent generation, sequential resolution per player
    - Break detection: HALFTIME + FULL_TIME + HALFTIME→SECOND_HALF transition all skip physics
    - createMatchRosters: 8 named archetypes (goalKeeper, aggressiveDefender, steadyDefender, metronome, boxToBox, maverick, poacher, technician)
    - UI control bar: HTML buttons with active-state CSS sync'd to keyboard shortcuts via keydown listener

key-files:
  created:
    - src/simulation/tactical/formation.ts
    - src/simulation/tactical/formation.test.ts
  modified:
    - src/simulation/engine.ts
    - src/renderer/canvas.ts
    - src/renderer/debug.ts
    - src/loop/gameLoop.ts
    - src/main.ts
    - index.html

key-decisions:
  - "Ball stopped (velocity zeroed) at HALFTIME, FULL_TIME, and first SECOND_HALF tick to prevent physics resuming from carry-over ball velocity — matches physical reality of break/kickoff"
  - "Intent resolution is synchronous and per-player: all agents select simultaneously (read-only context), then each intent is applied sequentially with updated ball/player state — avoids collision conflicts without full double-buffering"
  - "createMatchRosters() uses 8 named archetypes rather than random attributes — ensures visually distinct behavioral patterns at launch without needing real player data"
  - "Separation force applied as post-processing correction (not as an action) to prevent player overlap without affecting AI decision context"
  - "Player oscillation/jitter is a known calibration issue (action scores flip each tick), not a structural defect — deferred to Phase 2 tuning pass, not fixed here"

patterns-established:
  - "Tick sequence: phase-advance → fatigue → spatial-grid → formation → context → AI → log → resolve → ball-physics → goals → stats"
  - "Break handling: check current AND new phase; skip physics during any break or break-transition tick"
  - "Formation anchors: underscore prefix (_formation) for intentionally-unused typed params preserving API shape"
  - "UI buttons expose setPaused/setSpeedMultiplier/getIsPaused from gameLoop module; keyboard shortcuts and buttons stay in sync via shared keydown listener"

requirements-completed: [ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, ENG-07, ENG-08, ENG-09, ENG-10, ENG-11, ENG-12, ENG-13, ENG-14, ENG-15]

# Metrics
duration: 20min
completed: 2026-03-03
---

# Phase 01 Plan 10: Full Engine Integration Summary

**Complete 90-minute match simulation with utility AI agents, formation anchors, fatigue, debug overlay, UI control buttons, and post-match score range audit — approved with known calibration concerns**

## Performance

- **Duration:** ~20 min (including checkpoint and UI controls addition)
- **Started:** 2026-03-03T07:47:15Z
- **Completed:** 2026-03-03T08:10:00Z
- **Tasks:** 3 of 3
- **Files modified:** 8

## Accomplishments
- Formation anchor system for 4-4-2 with ball-position gravitational pull (0.15 factor) and possession shift (+10m attacking, -5m defending), all clamped to pitch — 21 TDD tests
- Full engine tick() integration: 15-step pipeline wiring fatigue, spatial grid, formation anchors, AI agent selectAction, decision logging, intent resolution, separation forces, ball physics, goal detection, and stats accumulation
- createMatchRosters() with 8 named archetypes (maverick striker, metronome midfielder, poacher, technician, aggressive/steady defenders, goalkeeper) producing distinct behavioral profiles
- CanvasRenderer extended with score/time HUD, stats overlay (S key), spatial heatmap (H key)
- GameLoop with speed controls 1x/2x/4x (keys 1/2/3) and pause/resume (P key), plus exposed API for button wiring
- HTML control bar: Pause, Reset, 1x/2x/4x speed, Stats, Debug, Heatmap buttons with active-state styling synced to keyboard shortcuts
- main.ts: full match lifecycle (startMatch/reset), full button wiring, post-match console audit at full-time

## Task Commits

Each task was committed atomically:

1. **Task 1: Formation anchors and basic tactical context** - `6b8bd59` (feat + test, TDD)
2. **Task 2: Full engine integration** - `55d02ad` (feat)
3. **Task 3: UI control buttons (post-checkpoint)** - `b9b96c3` (feat)

## Files Created/Modified
- `src/simulation/tactical/formation.ts` - Formation type, ROLES_442, computeFormationAnchors() with ball/possession influence
- `src/simulation/tactical/formation.test.ts` - 21 tests covering shape, mirroring, influence, edge cases (TDD)
- `src/simulation/engine.ts` - Full 15-step tick() integration, createMatchRosters() with archetypes, getDecisionLog()
- `src/renderer/canvas.ts` - Match HUD (score, minute, phase), stats overlay (S), heatmap (H), key hints
- `src/renderer/debug.ts` - DebugOverlay with debugEnabled flag parameter, wired to DecisionLog
- `src/loop/gameLoop.ts` - Speed controls (1/2/3 = 1x/2x/4x), pause/resume (P), getIsPaused/setPaused/setSpeedMultiplier exports
- `src/main.ts` - Full match lifecycle, button wiring, keyboard-button sync, post-match audit logging
- `index.html` - Control bar HTML with Pause/Reset/speed/overlay toggle buttons and active-state CSS

## Decisions Made
- Ball velocity zeroed at HALFTIME/FULL_TIME/SECOND_HALF transition to prevent physics resuming with carry-over velocity
- Intent resolution is synchronous: all agents select simultaneously from read-only context, intents applied sequentially
- createMatchRosters() uses 8 named archetypes (not random) to ensure observable behavioral differences from the start
- Separation forces are post-processing corrections, not AI actions — keeps agent decisions independent of overlap correction
- Player oscillation/jitter deferred: identified during verification as calibration issue, not structural defect; noted as known concern for Phase 2 tuning

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ball position test failing after halftime due to AI-generated ball velocity**
- **Found during:** Task 2 (engine integration)
- **Issue:** Existing test "ball does not move during HALFTIME" expected ball to be stationary at halftime (previously guaranteed since no AI moved ball). After integration, players kick ball, which can still have velocity when halftime arrives.
- **Fix:** Zero out ball velocity in the halftime early-return snapshot. Also added a break-transition check: HALFTIME→SECOND_HALF first tick also skips physics.
- **Files modified:** src/simulation/engine.ts
- **Verification:** All 33 engine tests pass including "ball does not move during HALFTIME"
- **Committed in:** 55d02ad (Task 2 commit)

**2. [Rule 2 - Missing Critical] UI control buttons added post-verification**
- **Found during:** Task 3 checkpoint (human verification)
- **Issue:** Human verifier identified missing pause/reset/stop buttons as needed for calibration iteration — without them, watching a full match of jittery players is required before any tuning change
- **Fix:** Added HTML control bar (index.html) and wired buttons in main.ts; exposed setPaused/setSpeedMultiplier/getIsPaused from gameLoop.ts for programmatic control
- **Files modified:** index.html, src/main.ts, src/loop/gameLoop.ts
- **Verification:** Build passes, buttons rendered, keyboard-button sync works
- **Committed in:** b9b96c3 (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 2 missing critical)
**Impact on plan:** Both fixes essential for correctness and usability. No scope creep.

## Known Concerns (Deferred)

**Player oscillation / jitter (utility AI action oscillation):**
- **Observed:** Players run back and forth, oscillating between positions every 1-2 ticks
- **Root cause:** Action scores flip each tick because context changes (distanceToBall, formationAnchor) produce different winning actions on alternating ticks — classic utility AI oscillation problem
- **Severity:** Visual — simulation runs correctly at the structural level; goals can occur, ball moves, stats accumulate
- **Deferred to:** Phase 2 calibration pass or dedicated tuning plan
- **Fix approaches:** (a) action hysteresis — add small bonus to previously selected action; (b) smooth context signals — use exponential moving average for distances; (c) reconsider consideration function response curves; (d) add action cooldowns per agent

## Issues Encountered
- TypeScript erasableSyntaxOnly (vite 7): unused `_formation` parameter required underscore prefix
- engine.ts had several unused imports/variables from integration requiring cleanup before build
- TypeScript canvas narrowing: `canvasEl` required explicit `const canvasEl: HTMLCanvasElement` assignment after null check to work inside closures

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- All Phase 1 engine requirements implemented (ENG-01 through ENG-15)
- Human verification: approved with known issues (structural integration confirmed working)
- Phase 2 planning should include a calibration/tuning task as first priority to address player oscillation
- UI controls (Pause/Reset/speed) make iterative calibration practical without watching full matches
- Score range audit available at full-time in browser console for measuring action frequency distribution

## Self-Check: PASSED

All created files confirmed present. All three task commits verified:
- `6b8bd59` feat(01-10): formation anchors and tactical context for 4-4-2
- `55d02ad` feat(01-10): full engine integration — wire all subsystems into tick()
- `b9b96c3` feat(01-10): add pause/reset/speed UI buttons and match controls

---
phase: 01-engine-core
plan: 09
subsystem: simulation/match, simulation/ai, renderer
tags: [stats, decision-log, ring-buffer, audit, debug-overlay, tdd, observability]

# Dependency graph
requires:
  - "01-01: ActionType const-object, MatchStats, ActionIntent, PlayerState types"
  - "01-04: MatchStats interface in SimSnapshot"
  - "01-06: ActionType values, agent decision system"
provides:
  - "StatsAccumulator: mutable accumulator for shots/passes/tackles/possession per tick"
  - "createEmptyStats(): zero-initialized MatchStats"
  - "accumulateStats(): functional API for one-shot stats update"
  - "DecisionLog class: per-agent ring buffer (300 entries), log/getEntries/getLatest/clear"
  - "auditScoreRanges(): post-match calibration audit, degenerate (>40%) and underused (<5%) flags"
  - "DebugOverlay class: click-to-inspect Canvas overlay showing action scores panel"
affects: [01-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Ring buffer: pre-allocated fixed array + head pointer; oldest entry overwritten when full; O(1) log, O(N) getEntries"
    - "StatsAccumulator: mutable raw-count class + immutable getSnapshot() for integration into SimSnapshot"
    - "Possession percentage: homeTicksWithBall / (home + away) * 100; null carrier = loose ball excluded from denominator"
    - "Audit thresholds: >0.40 = degenerate (action dominates 40%+ of decisions); <0.05 = underused; 0 entries returns no flags"
    - "DebugOverlay caches last snapshot for click hit testing between draw frames"
    - "Panel auto-positions to avoid canvas edges; renders top 3 actions by score"

key-files:
  created:
    - src/simulation/match/stats.ts
    - src/simulation/match/stats.test.ts
    - src/simulation/ai/decisionLog.ts
    - src/simulation/ai/decisionLog.test.ts
    - src/renderer/debug.ts
  modified:
    - src/simulation/physics/spatial.ts
    - src/simulation/physics/contact.test.ts
    - src/simulation/ai/decisionLog.test.ts

key-decisions:
  - "Possession denominator excludes loose ball ticks: homeTicksWithBall / (home + away) not / totalTicks — gives meaningful possession stat even during dead ball periods without distorting team contribution"
  - "auditScoreRanges with empty entries returns no flags: with zero data there is no meaningful frequency to audit; flagging all 8 actions as underused would be noise, not signal"
  - "DebugOverlay caches snapshot on draw() call: click handler needs the last known player positions but draw() is async to the event loop — storing cachedSnapshot/cachedPitchToCanvas on the instance is the correct pattern without introducing callbacks"

patterns-established:
  - "StatsAccumulator: separate mutable accumulator from immutable snapshot — callers hold the accumulator across ticks, snapshots go into SimSnapshot for renderer/replay"
  - "Ring buffer via pre-allocated array + mod arithmetic: efficient, no GC pressure, predictable memory"

requirements-completed: [ENG-12]

# Metrics
duration: ~7min
completed: 2026-03-03
---

# Phase 01 Plan 09: Match Statistics, Decision Log, and Debug Overlay Summary

**Match stats accumulation from ActionIntents, per-agent decision ring buffer with score range audit, and click-to-inspect Canvas overlay — 45 tests passing, build succeeds**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-03T07:36:29Z
- **Completed:** 2026-03-03T07:43:37Z
- **Tasks:** 3 (2 TDD, 1 auto)
- **Files created:** 5, modified: 3

## Accomplishments

- Implemented `StatsAccumulator` class: records shots, passes, and tackle attempts per team from ActionIntents each tick; records possession ticks (null = loose ball excluded from denominator); `getSnapshot()` returns an immutable `MatchStats` object
- Implemented `createEmptyStats()` and `accumulateStats()` functional API alongside the accumulator
- Implemented `DecisionLog` class with per-agent ring buffer (BUFFER_SIZE=300 = 10 seconds at 30fps): O(1) log, O(N) ordered retrieval via head pointer mod arithmetic
- Implemented `auditScoreRanges()`: computes selection frequency for all 8 ActionTypes, flags degenerate (>40%) and underused (<5%), returns empty flags for zero-entry input
- Implemented `DebugOverlay` class: click detection within 15px of player, yellow highlight circle, semi-transparent panel with player ID/role, fatigue bar, top 3 action scores with color-coded bars, selected action highlighted
- Fixed pre-existing build failures from 01-08 that blocked the `npm run build` requirement

## Task Commits

Each task was committed atomically (TDD workflow):

1. **TDD RED — Failing tests for stats** - `5cbd8da` (test)
2. **TDD GREEN — Stats accumulator implementation** - `3ea1665` (feat)
3. **TDD RED — Failing tests for decision log** - `b0514a7` (test)
4. **TDD GREEN — Decision log implementation** - `fee67c7` (feat)
5. **Debug overlay + build fixes** - `bc42abf` (feat)

## Files Created/Modified

- `src/simulation/match/stats.ts` — `createEmptyStats`, `StatsAccumulator`, `accumulateStats`
- `src/simulation/match/stats.test.ts` — 22 tests: empty stats, shots/passes/tackles per team, possession percentage, null carrier, immutability
- `src/simulation/ai/decisionLog.ts` — `DecisionLog` class (ring buffer, 300 entries), `AgentDecisionEntry` and `ScoreAuditReport` interfaces, `auditScoreRanges`
- `src/simulation/ai/decisionLog.test.ts` — 23 tests: buffer storage, multi-agent isolation, ring wraparound, order after overflow, clear(), audit frequency, degenerate/underused flags, boundary conditions
- `src/renderer/debug.ts` — `DebugOverlay` class: click handling, highlight rendering, panel with action score bars
- `src/simulation/physics/spatial.ts` — removed unused `width`/`height` private fields (pre-existing TS6133)
- `src/simulation/physics/contact.test.ts` — removed unused type imports (pre-existing TS6192)

## Decisions Made

- **Possession excludes loose ball from denominator:** `homeTicksWithBall / (home + away)` not `/totalTicks`. When the ball is loose (null carrier), neither team gains a tick, so the percentage reflects only contested possession time. This matches standard football stats conventions and prevents 90-minute averages from being diluted by stoppage time.

- **auditScoreRanges with empty entries returns no flags:** With zero data, flagging all 8 actions as underused would be pure noise. The function now returns empty `degenerate` and `underused` arrays when `entries.length === 0`.

- **DebugOverlay caches snapshot per draw frame:** The click handler runs asynchronously on user input, but needs the last rendered player positions to find the nearest player. Storing `cachedSnapshot` and `cachedPitchToCanvas` as instance fields (updated at the start of each `draw()` call) is the correct pattern — no callbacks or state management overhead required.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] auditScoreRanges flagged all actions as underused on empty input**
- **Found during:** Task 2 TDD GREEN (first test run, 1 failure)
- **Issue:** With `total === 0`, every action has frequency 0.0 which is `< 0.05` — so all 8 actions were incorrectly added to `underused`. The test `returns empty report for no entries` failed.
- **Fix:** Added `if (total > 0)` guard around the degenerate/underused loop — with no data, neither array is populated.
- **Files modified:** `src/simulation/ai/decisionLog.ts`
- **Commit:** `fee67c7` (TDD GREEN commit)

**2. [Rule 3 - Blocking] Pre-existing TS6133 in spatial.ts blocked `npm run build`**
- **Found during:** Task 3 build verification
- **Issue:** `SpatialGrid` stored `width` and `height` as private class fields in the constructor but never read them — TypeScript `noUnusedLocals` (which covers private class fields) caused `TS6133`. This was introduced in plan 01-08 and carried forward.
- **Fix:** Removed `private readonly width` and `private readonly height` fields; constructor parameters prefixed with `_` (unused param convention) so TypeScript no longer flags them.
- **Files modified:** `src/simulation/physics/spatial.ts`
- **Commit:** `bc42abf`

**3. [Rule 3 - Blocking] Pre-existing TS6192 in contact.test.ts blocked `npm run build`**
- **Found during:** Task 3 build verification
- **Issue:** `contact.test.ts` imported `type { TackleResult, AerialResult }` but used neither as a TypeScript type annotation — only in string literals inside `describe()` and `it()` call arguments. `TS6192: All imports in import declaration are unused`.
- **Fix:** Removed the unused `import type { TackleResult, AerialResult }` line.
- **Files modified:** `src/simulation/physics/contact.test.ts`
- **Commit:** `bc42abf`

**4. [Rule 1 - Bug] Unused ScoreAuditReport type import in decisionLog.test.ts**
- **Found during:** Task 3 build verification
- **Issue:** Test file imported `ScoreAuditReport` as a type but never used it as a type annotation.
- **Fix:** Removed from import line.
- **Files modified:** `src/simulation/ai/decisionLog.test.ts`
- **Commit:** `bc42abf`

---

**Total deviations:** 4 auto-fixed (1 Rule 1 logic bug, 1 Rule 1 unused import, 2 Rule 3 pre-existing build blockers)
**Impact on plan:** All fixes required for correctness and build success. No scope creep.

## Issues Encountered

- Pre-existing unused-variable errors from plan 01-08 (`spatial.ts`, `contact.test.ts`) were blocking `npm run build`. Both were trivial fixes (remove unused fields/imports) but required deviation tracking.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `StatsAccumulator` is ready for integration into the simulation engine tick loop (plan 01-10)
- `DecisionLog` is ready to receive entries from `selectAction` output per tick — caller needs to call `log.log({ tick, agentId, scores, selected })` after each agent decision
- `auditScoreRanges` is ready for post-match calibration reporting
- `DebugOverlay` is ready to wire into the browser entry point alongside `CanvasRenderer`

---
*Phase: 01-engine-core*
*Completed: 2026-03-03*

## Self-Check: PASSED

All 6 expected files exist on disk. All 5 task commits verified in git log (5cbd8da, 3ea1665, b0514a7, fee67c7, bc42abf). Both test files: 45 tests passing across stats and decisionLog suites. Build: tsc + vite build succeeds.

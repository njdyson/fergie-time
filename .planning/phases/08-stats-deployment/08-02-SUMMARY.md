---
phase: 08-stats-deployment
plan: "02"
subsystem: stats-ui
tags: [stats, ui, squad-screen, stats-screen, game-loop]
dependency_graph:
  requires: [playerStats-module, QuickSimResult-playerStats, SeasonState-playerSeasonStats]
  provides: [stats-capture-hook, StatsScreen, squad-inline-stats, stats-nav-tab]
  affects: [season.ts, main.ts, squadScreen.ts, statsScreen.ts, index.html]
tech_stack:
  added: []
  patterns: [HTML template rendering, sortable table, toggle view pattern, dark theme palette]
key_files:
  created:
    - src/ui/screens/statsScreen.ts
  modified:
    - src/season/season.ts
    - src/main.ts
    - src/ui/screens/squadScreen.ts
    - index.html
decisions:
  - Guard simResult.playerStats with fallback empty Map for test mock compatibility
  - Stats merge happens at full-time before vidiprinter to ensure capture even on early browser close
  - StatsScreen uses inline HTML template rendering matching squad/hub screen patterns
  - My Squad table defaults sort to goals descending; Top Scorers hardcoded by goals desc then assists desc then apps asc
metrics:
  duration: 5m 4s
  completed_date: "2026-03-07"
  tasks: 2
  files: 5
---

# Phase 8 Plan 02: Stats Capture and UI Summary

**One-liner:** Post-match stats merge wired into watched match (full-time callback) and AI fixtures (simOneAIFixture), plus StatsScreen with sortable 14-column My Squad table and league Top Scorers view, G/A/App inline columns on Squad screen, and Stats nav tab.

## What Was Built

### Task 1: Post-match stats capture

1. **season.ts** — `simOneAIFixture` now calls `mergeAllMatchStats` after each AI fixture sim, merging `simResult.playerStats` (from `quickSimMatch`) into `state.playerSeasonStats`. Includes `??` guard for test mock compatibility (mocked quickSimMatch returns no playerStats).

2. **main.ts** — In the full-time poll callback, before `showFullTimeOverlay` is called, `mergeAllMatchStats` is called with the watched match's player stats and score-derived `goalsConceded`. This captures stats immediately at full-time before the vidiprinter begins.

3. **Season reset** — Confirmed already in place from Plan 01: `startNewSeason` initializes `playerSeasonStats: new Map<string, PlayerSeasonStats>()`.

### Task 2: Stats screen and squad inline columns

4. **src/ui/screens/statsScreen.ts** (new) — `StatsScreen` class with:
   - Toggle bar: "My Squad" / "Top Scorers"
   - My Squad view: sortable 14-column table (Name, Pos, App, G, A, Shots, SoT, Pass%, Tackles, YC, RC, CS, Mins, G/G). Click column header to sort; active column highlighted in ACCENT_BLUE.
   - Top Scorers view: top 20 players across all 20 teams sorted by goals desc → assists desc → appearances asc. Rank 1 in gold, rank 2-3 in orange.
   - Player name clickable in both views (`onPlayerClick` callback for Plan 03 player profile).
   - `update(seasonState: SeasonState)` signature.

5. **src/ui/screens/squadScreen.ts** — `update()` now accepts optional 4th parameter `playerSeasonStats?: Map<string, PlayerSeasonStats>`. Three new grid columns appended: G (green for non-zero), A (blue for non-zero), App. Shows '-' when no stats recorded yet.

6. **index.html** — Stats nav tab button added between Squad and Tactics. `stats-screen` container div added alongside other screen divs.

7. **main.ts** — STATS added to ScreenId const-object. `StatsScreen` imported and instantiated. `nav-stats` click handler added. `showScreen()` map updated for STATS. `updateCurrentScreen()` calls `statsScreenView.update(seasonState)` when on STATS. `showVidiprinter()` hides stats-screen. `squadScreenViewInner.update()` now passes `seasonState.playerSeasonStats` as 4th argument.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test mock missing playerStats field causes `matchStats is not iterable` error**

- **Found during:** Task 1 verification (season.test.ts)
- **Issue:** The existing `vi.mock('./quickSim.ts')` returns `{ homeGoals: 1, awayGoals: 0 }` with no `playerStats` field. After adding `mergeAllMatchStats(state.playerSeasonStats, simResult.playerStats, ...)` in `simOneAIFixture`, this threw "matchStats is not iterable" because `undefined` is not iterable.
- **Fix:** Added `??` fallback: `const matchPlayerStats = simResult.playerStats ?? new Map();` before the `mergeAllMatchStats` call.
- **Files modified:** `src/season/season.ts`
- **Commit:** 525563e

## Verification

```
npx vitest run src/season/season.test.ts  -- 33/33 passed
npx vitest run --bail 1                   -- 606/606 passed
```

All 606 tests pass. No regressions.

## Self-Check: PASSED

- `src/ui/screens/statsScreen.ts` — EXISTS
- `src/season/season.ts` — MODIFIED (simOneAIFixture merges stats)
- `src/main.ts` — MODIFIED (full-time stats capture, STATS routing, StatsScreen)
- `src/ui/screens/squadScreen.ts` — MODIFIED (G/A/App columns)
- `index.html` — MODIFIED (Stats nav tab, stats-screen div)
- Commits: 525563e (feat Task 1), 7937159 (feat Task 2) — both present

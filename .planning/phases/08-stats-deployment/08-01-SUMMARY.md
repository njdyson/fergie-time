---
phase: 08-stats-deployment
plan: "01"
subsystem: season-stats
tags: [tdd, stats, player-data, season-state]
dependency_graph:
  requires: []
  provides: [playerStats-module, QuickSimResult-playerStats, SeasonState-playerSeasonStats]
  affects: [season.ts, quickSim.ts, gameLog.ts]
tech_stack:
  added: []
  patterns: [TDD red-green, immutable merge pattern, const-object enum]
key_files:
  created:
    - src/season/playerStats.ts
    - src/season/playerStats.test.ts
  modified:
    - src/simulation/match/gameLog.ts
    - src/season/quickSim.ts
    - src/season/season.ts
decisions:
  - minutesPlayed fixed at 90 for all players (no sub tracking yet — per plan spec)
  - yellowCards/redCards added to PlayerLogStats interface (count events from game log)
  - playerSeasonStats field is non-optional on SeasonState (always present, empty Map on new season)
  - simOneAIFixture only passes {homeGoals, awayGoals} to fixture.result to avoid Map leaking into Fixture type
metrics:
  duration: 3m 26s
  completed_date: "2026-03-07"
  tasks: 4
  files: 5
---

# Phase 8 Plan 01: Player Season Stats Data Layer Summary

**One-liner:** PlayerSeasonStats module with TDD-tested merge functions, yellowCards/redCards in PlayerLogStats, quickSimMatch returning per-player stats, and SeasonState.playerSeasonStats Map.

## What Was Built

Four implementation items executed under TDD:

1. **playerStats.test.ts** (RED) — 14 failing tests covering accumulation, merge, clean sheet logic, cards, multi-player mergeAll
2. **playerStats.ts** (GREEN) — `PlayerSeasonStats` interface (13 fields), `createEmptySeasonStats()`, `mergeMatchStats()`, `mergeAllMatchStats()`
3. **gameLog.ts** — Added `yellowCards`/`redCards` to `PlayerLogStats` interface; populated in `getPlayerStats()` by counting `yellow_card`/`red_card` log entries per player
4. **quickSim.ts** — `QuickSimResult` extended with `playerStats: Map<string, PlayerLogStats>` from `engine.gameLog.getPlayerStats()`
5. **season.ts** — `SeasonState` extended with `playerSeasonStats: Map<string, PlayerSeasonStats>`; initialized as empty Map in both `createSeason()` and `startNewSeason()`

## Key Design Points

- **Extensible schema**: Adding a new stat field requires only adding to `PlayerSeasonStats` interface and one line in `mergeMatchStats()` — satisfies STAT-02
- **Clean sheet logic**: GK role + teamConceded === 0 → increment by 1; non-GK never gets clean sheets
- **minutesPlayed**: Fixed at 90 per appearance (no substitution tracking yet — documented decision)
- **Immutable merge**: `mergeMatchStats` returns a new object (functional style), no mutation
- **MAP_TAG serialization**: `playerSeasonStats` Map will serialize automatically via existing `mapReplacer/mapReviver` in server/serialize.ts — no changes needed there

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] simOneAIFixture stored full QuickSimResult as Fixture.result**

- **Found during:** Task 3 (QuickSimResult extension)
- **Issue:** After adding `playerStats: Map<...>` to `QuickSimResult`, `simOneAIFixture` was storing the full result object (including the Map) into `fixture.result` which is typed as `{ homeGoals: number; awayGoals: number }`. This would cause type errors and serialize a Map into the fixture record.
- **Fix:** Changed assignment to explicitly destructure `{ homeGoals: simResult.homeGoals, awayGoals: simResult.awayGoals }`
- **Files modified:** `src/season/season.ts`
- **Commit:** ee001d7

## Verification

```
npx vitest run src/season/playerStats.test.ts  -- 14/14 passed
npx vitest run src/season/season.test.ts       -- 33/33 passed
npx vitest run --bail 1                        -- 606/606 passed
```

All 606 tests pass. Previous count was 590+ — the new 14 playerStats tests bring the total to 606.

## Self-Check: PASSED

- `src/season/playerStats.ts` — EXISTS
- `src/season/playerStats.test.ts` — EXISTS
- Commits: 9505a4c (test RED), f4bccb6 (feat GREEN), ee001d7 (quickSim+season) — all present

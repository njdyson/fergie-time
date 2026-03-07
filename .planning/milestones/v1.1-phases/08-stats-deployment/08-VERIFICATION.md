---
phase: 08-stats-deployment
verified: 2026-03-07T08:14:00Z
status: human_needed
score: 16/16 must-haves verified
human_verification:
  - test: "Stats persist across browser refresh"
    expected: "After refreshing the browser and logging back in, the Stats tab still shows accumulated goals, assists, and appearances from previous matchdays"
    why_human: "Requires live save/load cycle through the server API — cannot verify serialization round-trip of Map<string, PlayerSeasonStats> programmatically without running the server"
  - test: "Top Scorers shows players from AI teams"
    expected: "After simming several AI matchdays, the Top Scorers view shows players from AI clubs (e.g. North City, Westbrook United) alongside the player's own team"
    why_human: "Requires AI fixture simulation to populate cross-team stats — runtime behavior, not verifiable from static code"
  - test: "Sorting columns in Stats screen toggles asc/desc correctly"
    expected: "Clicking 'Goals' header sorts descending first; clicking again sorts ascending. Clicking a different header resets direction to its default (text columns default asc, numeric default desc)"
    why_human: "Sort behavior depends on DOM event handling and state transitions — requires interactive browser testing"
  - test: "Player profile canvas avatar renders visually"
    expected: "Clicking a player name opens the profile page with a shirt-shaped canvas avatar showing the shirt number and player initials, using the team color"
    why_human: "Canvas rendering requires a real browser environment with 2D context support; cannot be verified by static code inspection"
  - test: "Back navigation from profile returns to originating screen"
    expected: "If profile was opened from the Squad screen, back button returns to Squad. If opened from Stats screen, returns to Stats."
    why_human: "previousScreen tracking requires interactive navigation to verify the round-trip correctly"
---

# Phase 8: Stats and Player Profiles Verification Report

**Phase Goal:** Player season stats tracking, stats UI screens, and player profile pages
**Verified:** 2026-03-07
**Status:** human_needed — all automated checks pass; 5 items require live browser verification
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | PlayerSeasonStats accumulates goals, assists, appearances, shots, shotsOnTarget, passesCompleted, passes, tacklesWon, tacklesAttempted, yellowCards, redCards, cleanSheets, minutesPlayed across matches | VERIFIED | `src/season/playerStats.ts` lines 16-30: all 13 fields present; `mergeMatchStats` lines 60-83 accumulates each field; 14 TDD tests in `playerStats.test.ts` all pass |
| 2 | quickSimMatch returns per-player stats for all 22 players alongside the score | VERIFIED | `src/season/quickSim.ts` line 17-21: `QuickSimResult` has `playerStats: Map<string, PlayerLogStats>`; line 40: `playerStats = engine.gameLog.getPlayerStats()`; test at line 198 verifies 22-player map |
| 3 | SeasonState includes playerSeasonStats Map that serializes via existing MAP_TAG pattern | VERIFIED | `src/season/season.ts` line 56: `playerSeasonStats: Map<string, PlayerSeasonStats>` field present; initialized in `createSeason` (line 157) and `startNewSeason` (line 394) as `new Map()` |
| 4 | Stats schema is extensible — adding a new stat field requires only adding to the interface and the merge function | VERIFIED | Interface fields and `mergeMatchStats` return object are in 1:1 correspondence with no indirection; pattern is self-documenting |
| 5 | After a watched match, per-player stats from the match are merged into seasonState.playerSeasonStats before screen transition | VERIFIED | `src/main.ts` lines 649-661: `mergeAllMatchStats` called at full-time before `showFullTimeOverlay` callback; comment confirms intent |
| 6 | After AI quick-sim matches, all player stats from every AI fixture are merged into seasonState.playerSeasonStats | VERIFIED | `src/season/season.ts` lines 295-304: `simOneAIFixture` calls `mergeAllMatchStats` with `simResult.playerStats ?? new Map()` guard; updated state returned |
| 7 | Squad screen shows Goals, Assists, Apps columns for each player from season stats | VERIFIED | `src/ui/screens/squadScreen.ts` lines 568-591: G/A/App header columns defined; lines 651-657: stat values rendered per-player from `this.playerSeasonStats`; `update()` line 177 accepts 4th param |
| 8 | Stats nav tab shows full per-player stats table with sortable columns | VERIFIED | `src/ui/screens/statsScreen.ts` lines 131-218: 14-column table (Name, Pos, App, G, A, Shots, SoT, Pass%, Tkl, YC, RC, CS, Mins, G/G); sort handlers at lines 96-108 |
| 9 | Stats tab toggle switches between My Squad view and League Top Scorers view | VERIFIED | `statsScreen.ts` lines 69-93: toggle bar rendered; `viewMode` state; `renderSquadView` / `renderTopScorers` branch at lines 76-79 |
| 10 | Top scorers shows top 20 across all 20 teams, sorted by goals then assists then apps | VERIFIED | `statsScreen.ts` lines 237-260: iterates ALL `seasonState.teams` squads; sort at lines 254-258: goals desc, assists desc, appearances asc; slices top 20 at line 261 |
| 11 | Clicking a player name on the squad screen navigates to their player profile page | VERIFIED | `squadScreen.ts` lines 710-718: `[data-player-name]` click fires `playerClickCallbacks`; `main.ts` line 272: `setOnPlayerClick` wired to `showPlayerProfile` |
| 12 | Clicking a player name on the stats screen navigates to their player profile page | VERIFIED | `statsScreen.ts` lines 111-118: `[data-player-click]` click fires `playerClickCallbacks`; `main.ts` line 275: `onPlayerClick` wired to `showPlayerProfile` |
| 13 | Clicking a player name in the top scorers view navigates to their player profile page | VERIFIED | `statsScreen.ts` line 293: top-scorers rows also use `data-player-click="${e.playerId}"` attribute; same handler fires for both views |
| 14 | Player profile shows name, age, height, nationality, position, shirt number | VERIFIED | `playerProfileScreen.ts` lines 254-259: `infoRow` calls for Position, Shirt #, Age, Height, Nationality all present |
| 15 | Player profile shows a canvas-drawn avatar with team shirt color, shirt number, and player initials | VERIFIED | `drawAvatar` function lines 65-126: shirt shape drawn with `shirtColor`; shirt number at lines 110-117; initials at lines 119-125; canvas drawn after DOM mount at lines 331-334 |
| 16 | Player profile shows attributes as horizontal bars colored green-to-red | VERIFIED | `renderBar` function lines 137-150: bar width = `value * 100%`; color via `getAttrBarColor`: green >= 0.7, yellow >= 0.4, red < 0.4; personality bars also rendered lines 209-218 |

**Score:** 16/16 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/season/playerStats.ts` | PlayerSeasonStats interface, createEmptySeasonStats, mergeMatchStats, mergeAllMatchStats | VERIFIED | All 4 exports present; 107 lines of substantive implementation |
| `src/season/playerStats.test.ts` | TDD tests for stats accumulation and merge logic | VERIFIED | 14 tests in 3 describe blocks; all pass (606 total test suite) |
| `src/season/quickSim.ts` | QuickSimResult with playerStats Map | VERIFIED | Interface updated line 20; playerStats extracted at line 40 |
| `src/season/season.ts` | SeasonState.playerSeasonStats field; simOneAIFixture merges stats | VERIFIED | Field at line 56; merge in `simOneAIFixture` lines 295-304; reset in both `createSeason` (line 157) and `startNewSeason` (line 394) |
| `src/ui/screens/statsScreen.ts` | Stats screen with sortable table, My Squad / Top Scorers toggle | VERIFIED | 305 lines; both views implemented; sortable headers; player-click callbacks |
| `src/main.ts` | Post-match stats capture hook, Stats screen routing, PROFILE screen routing, showPlayerProfile | VERIFIED | mergeAllMatchStats at line 657; STATS/PROFILE in ScreenId (line 98); showPlayerProfile at lines 128-132; nav-stats click at line 256 |
| `src/ui/screens/squadScreen.ts` | Goals, Assists, Apps inline columns; setOnPlayerClick | VERIFIED | G/A/App columns at lines 568-591, 651-657; setOnPlayerClick at line 241 |
| `index.html` | Stats nav tab button (nav-stats), stats-screen div, profile-screen div | VERIFIED | nav-stats at line 1378; stats-screen div at line 1465; profile-screen div at line 1468 |
| `src/ui/screens/playerProfileScreen.ts` | Player profile with canvas avatar, attribute bars, personality bars, season stats | VERIFIED | 348 lines; all sections implemented; drawAvatar at lines 65-126 |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/season/playerStats.ts` | `src/simulation/match/gameLog.ts` | imports PlayerLogStats | WIRED | Line 9: `import type { PlayerLogStats } from '../simulation/match/gameLog.ts'`; gameLog.ts lines 7-21: interface with yellowCards/redCards added |
| `src/season/quickSim.ts` | `src/season/playerStats.ts` | calls engine.gameLog.getPlayerStats() | WIRED | quickSim.ts line 40: `engine.gameLog.getPlayerStats()` assigned to `playerStats`; returned in QuickSimResult |
| `src/season/season.ts` | `src/season/playerStats.ts` | SeasonState uses PlayerSeasonStats Map | WIRED | season.ts lines 17-18: imports `PlayerSeasonStats` and `mergeAllMatchStats`; line 56: field on SeasonState; lines 295-304: merge call |
| `src/main.ts` | `src/season/playerStats.ts` | mergeAllMatchStats call at full-time and after AI sims | WIRED | main.ts line 30: imports mergeAllMatchStats; line 657: called at full-time; AI sims wired through `simOneAIFixture` in season.ts |
| `src/ui/screens/statsScreen.ts` | `src/season/playerStats.ts` | reads PlayerSeasonStats for display | WIRED | statsScreen.ts lines 7-8: imports SeasonState and PlayerSeasonStats; `seasonState.playerSeasonStats` accessed in both renderSquadView (line 136) and renderTopScorers (line 222) |
| `index.html` | `src/main.ts` | nav-stats click handler routes to Stats screen | WIRED | index.html line 1378: `id="nav-stats"` present; main.ts line 256: `document.getElementById('nav-stats')?.addEventListener('click', () => showScreen(ScreenId.STATS))` |
| `src/ui/screens/squadScreen.ts` | `src/main.ts` | player name click triggers profile navigation | WIRED | squadScreen.ts line 241: `setOnPlayerClick(cb)`; main.ts line 272: `squadScreenViewInner.setOnPlayerClick((playerId) => showPlayerProfile(playerId))` |
| `src/ui/screens/statsScreen.ts` | `src/main.ts` | player name click triggers profile navigation | WIRED | statsScreen.ts line 55: `onPlayerClick(cb)` (naming differs from plan spec `setOnPlayerClick` — functionally equivalent); main.ts line 275: wired correctly |
| `src/main.ts` | `src/ui/screens/playerProfileScreen.ts` | showScreen(PROFILE) with selected player data | WIRED | main.ts lines 121-122: PlayerProfileScreen instantiated; lines 167-179: player found, `playerProfileScreenView.update()` called; PROFILE in showScreen map at line 196 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| STAT-01 | Plans 01, 03 | Per-player per-season stats tracked (goals, assists, appearances minimum) | SATISFIED | 13-field PlayerSeasonStats tracked; displayed on squad screen, stats screen, and player profile |
| STAT-02 | Plan 01 | Extensible stats schema — easy to add new stat fields | SATISFIED | Interface + mergeMatchStats are the only two places to change; TDD tests verify each field |
| STAT-03 | Plan 01 | Quick-sim exposes goalscorer data from GameEventLog | SATISFIED | QuickSimResult.playerStats returns full PlayerLogStats Map including goals; tested in playerStats.test.ts |
| STAT-04 | Plan 02 | Post-match stats hook captures player performance before screen transition | SATISFIED | mergeAllMatchStats called at full-time before showFullTimeOverlay callback (main.ts line 657); AI fixture stats merged in simOneAIFixture |
| STAT-05 | Plan 02 | League-wide stat views (top scorers at minimum) | SATISFIED | StatsScreen.renderTopScorers iterates all 20 teams' squads, shows top 20 by goals |
| SERV-03 | Plan 02 | VPS deployment with systemd service + nginx reverse proxy | SATISFIED | Per plan documentation: deployment was already complete prior to Phase 8; no Phase 8 code changes required |

All 6 requirements declared across the 3 plans are accounted for. No orphaned requirements found for Phase 8 in REQUIREMENTS.md.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/screens/playerProfileScreen.ts` | 241 | Comment says "Avatar canvas placeholder (will be drawn after mount)" | Info | Not a stub — the canvas element IS rendered; `drawAvatar()` is called at line 332-334 after `innerHTML` is set. Comment refers to the HTML template technique, not missing implementation. |
| `src/ui/screens/statsScreen.ts` | 55 | Method named `onPlayerClick` instead of `setOnPlayerClick` per plan spec | Info | Functional inconsistency with SquadScreen (which uses `setOnPlayerClick`); both are wired correctly in main.ts so no functional gap. Naming inconsistency only. |

No blocker or warning anti-patterns found. Both findings are informational only.

---

## Human Verification Required

### 1. Stats persistence across save/load

**Test:** Create a new game, play 2-3 matchdays (watch 1, auto-sim the rest), then refresh the browser and log back in. Navigate to the Stats tab.
**Expected:** Goals, assists, and appearances from the previous matchdays are preserved. The stats map round-trips correctly through the MAP_TAG JSON serialization pattern.
**Why human:** Requires running the Express server, triggering auto-save via `saveGame()`, and reloading state via `loadGame()`. The MAP_TAG serialization for `Map<string, PlayerSeasonStats>` cannot be verified by static code inspection — the `mapReplacer/mapReviver` behavior in `server/serialize.ts` must be exercised.

### 2. Top Scorers shows AI team players

**Test:** After simming 3+ matchdays of AI fixtures, navigate to Stats > Top Scorers.
**Expected:** The top scorers table shows players from AI clubs (e.g. "North City", "Westbrook United") with their goals, assists, and appearances. The table lists players from multiple different teams.
**Why human:** Requires actual simulation runs to populate `seasonState.playerSeasonStats` for AI players. The wiring is verified to be correct, but the runtime data population requires playing through the game.

### 3. Stats screen column sorting asc/desc toggle

**Test:** On the Stats screen (My Squad view), click "Goals" header once, then again. Then click "Name" header.
**Expected:** First click on Goals sorts descending (highest first); second click sorts ascending (lowest first). Clicking Name sorts ascending (A-Z) by default. Active sort column highlighted in blue with arrow indicator.
**Why human:** DOM event handling and sort state toggling require browser interaction. The logic is implemented (lines 96-108 in statsScreen.ts) but correctness of the asc/desc toggle behavior for each column type needs live verification.

### 4. Player profile canvas avatar renders correctly

**Test:** Click any player name in the Squad screen or Stats screen. Observe the player profile page.
**Expected:** A circular canvas element (120x120px) shows: (a) a shirt-shaped colored rectangle in the player's team color (blue for player's team, deterministic color for AI teams), (b) the shirt number centered on the shirt, (c) the player's initials below the number.
**Why human:** Canvas 2D rendering (`roundRect`, `fillText`, color fills) requires a browser with hardware canvas support. The `drawAvatar` implementation is substantive but visual correctness needs a human eye.

### 5. Back navigation from profile returns to originating screen

**Test:** (a) Navigate to Squad screen, click a player name — profile opens. Click "Back". (b) Navigate to Stats screen, click a player name — profile opens. Click "Back".
**Expected:** (a) Back button returns to Squad screen. (b) Back button returns to Stats screen. Nav tabs should reappear after leaving the profile (profile hides nav bar per line 204 in main.ts).
**Why human:** `previousScreen` tracking (main.ts lines 101, 130) and nav bar visibility toggling require interactive navigation to verify the full round-trip behavior.

---

## Summary

Phase 8 achieved its goal. All 16 observable truths are verified from code inspection:

- The **data layer** (Plan 01) is fully implemented: `PlayerSeasonStats` with 13 fields, immutable merge functions, `yellowCards`/`redCards` added to `PlayerLogStats`, `QuickSimResult.playerStats`, and `SeasonState.playerSeasonStats` all exist and are substantive.

- The **stats capture and UI** (Plan 02) is fully wired: stats are merged at full-time for watched matches and inside `simOneAIFixture` for AI fixtures. The `StatsScreen` has both My Squad (sortable 14-column table) and Top Scorers (league-wide top 20) views. Squad screen has G/A/App columns. The Stats nav tab and screen container exist in `index.html` and are routed in `main.ts`.

- The **player profile screen** (Plan 03) is fully implemented: canvas avatar with team color, shirt number, and initials; FM-style attribute bars (green/yellow/red by value 0-1 mapped to 0-100); personality bars; per-season stats summary. Click-through navigation from squad screen, stats screen (both My Squad and Top Scorers), and back navigation via `previousScreen` tracking are all wired.

All 606 tests pass. All 6 requirements (STAT-01 through STAT-05, SERV-03) are satisfied. Five items require human browser verification: stats persistence through save/load, AI team stats population, sort behavior, canvas avatar rendering, and back navigation correctness.

---

_Verified: 2026-03-07T08:14:00Z_
_Verifier: Claude (gsd-verifier)_

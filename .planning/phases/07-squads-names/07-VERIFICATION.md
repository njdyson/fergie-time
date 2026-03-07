---
phase: 07-squads-names
verified: 2026-03-07T07:00:00Z
status: human_needed
score: 13/14 must-haves verified
human_verification:
  - test: "Start a new game and navigate to the squad screen"
    expected: "Exactly 25 players are listed with realistic nationality-appropriate names (not procedural 'James Smith' style), each showing a shirt number (1-25), with the counter reading 'Starters: 11/11 | Bench: 7/7' for the default selection"
    why_human: "DOM rendering, name realism assessment, and default selection state require browser interaction"
  - test: "Click a shirt number badge on any player row"
    expected: "A picker grid (1-40) opens; selecting a number updates the player's shirt number, selecting an already-used number is blocked (greyed, not-allowed cursor), backdrop click dismisses without change"
    why_human: "Click interaction and UI popup behavior cannot be verified without a browser"
  - test: "Disconnect internet and create a new game"
    expected: "Game creates successfully; player names are procedurally generated (less realistic but functional — two-word format 'Firstname Lastname')"
    why_human: "Requires simulating network failure; fallback path confirmed in code but end-to-end behavior needs human verification"
  - test: "Select a valid 11+7 squad and kick off, then advance matchday"
    expected: "Match completes normally; AI matchday results appear in vidiprinter; league table updates"
    why_human: "Full gameplay loop correctness requires interactive verification"
---

# Phase 7: Squads and Names Verification Report

**Phase Goal:** All teams field 25-man squads with realistic nationality-weighted names, replacing the 16-player placeholder rosters with Premier League-scale depth
**Verified:** 2026-03-07T07:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every team has 25 players with correct positional distribution | VERIFIED | `ROLES_25` in `teamGen.ts` defines 25 roles; `createAITeam` maps over all 25; `createSeason` calls `createAITeam` for each AI team; `startNewSeason` also calls `createAITeam` (no names, falls back to procedural) |
| 2 | Matchday squad allows 11 starters + 7 subs; bench shows N/7 counter | VERIFIED | `validateSquadSelection` enforces `bench.length !== 7` (line 170 of `season.ts`); `squadScreen.ts` renders `Bench: ${benchCount}/7` (line 551); default selection assigns `i < 18` as bench (line 159) |
| 3 | Player names look realistic and nationality-appropriate | HUMAN NEEDED | Code is correct: `getNames` fetches from randomuser.me with GB/ES/FR/DE/BR weighting and shuffles results; but actual name quality requires visual inspection |
| 4 | If randomuser.me is unreachable, game still creates with fallback names | VERIFIED | `getNames` wraps entire fetch in try/catch and falls back to `Array.from({ length: count }, () => generatePlayerName(rng))` (lines 98-104 of `nameService.ts`); tests confirm both network-error and non-OK-status fallback paths |
| 5 | Players have editable shirt numbers visible on squad screen | VERIFIED | `shirtNumbers: Map<string, number>` field on `SquadScreen`; shirt number column rendered as clickable circle (`data-shirt`); `startShirtNumberEdit` opens picker; `getUpdatedPlayers()` and `onShirtNumberChange()` exported |

**Score:** 4/5 automated truths verified; 1 requires human assessment (name realism)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/season/nameService.ts` | Name fetching with API + fallback; exports `fetchNames`, `getNames` | VERIFIED | File exists, 106 lines, exports both functions; `fetchNames` calls randomuser.me; `getNames` wraps in try/catch with `generatePlayerName` fallback |
| `src/season/nameService.test.ts` | Tests for NAME-01, NAME-02, NAME-03 | VERIFIED | 8 tests covering: URL construction, response parsing, non-OK throws, exact count, First-Last format, network-error fallback, non-OK fallback, nationality proportions — all 8 pass |
| `src/season/teamGen.ts` | 25-man squad generation with `shirtNumber`; exports `createAITeam`, `ROLES_25` | VERIFIED | `ROLES_25` exported (25 entries, 3 GK/5 CB/2 LB/2 RB/2 CDM/3 CM/1 CAM/2 LW/2 RW/3 ST); `shirtNumber: index + 1` assigned; `names` optional param accepted |
| `src/simulation/types.ts` | `shirtNumber` on `PlayerState` | VERIFIED | Line 312: `readonly shirtNumber?: number;` present |
| `src/ui/screens/squadScreen.ts` | 25-player squad display with 11+7 selection, shirt numbers, inline editing | VERIFIED | All features present: 25-player rendering loop, `i < 18` bench threshold, `Bench: ${benchCount}/7`, `data-shirt` cells, `startShirtNumberEdit` popup, `getUpdatedPlayers()`, `onShirtNumberChange()` |
| `src/main.ts` | Async name fetch wired into game creation | VERIFIED | Lines 1487-1492: `await getNames(500, ...)`, `createAITeam('mid', ...)` with `names.slice(0, 25)`, `createSeason(... names.slice(25))` |
| `src/season/season.ts` | `createSeason` accepts names parameter; `startNewSeason` uses 25 players | VERIFIED | `createSeason` signature includes `names?: PlayerName[] | string[]` (line 107); passes `names?.slice(index * 25, (index + 1) * 25)` per AI team; `startNewSeason` calls `createAITeam` without names (acceptable — procedural fallback) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/main.ts` | `src/season/nameService.ts` | `import getNames` + `await getNames(500, ...)` | WIRED | Line 3: `import { getNames }`, line 1488: `await getNames(500, ...)` — both import and await usage confirmed |
| `src/main.ts` | `src/season/season.ts` | `createSeason(... names.slice(25))` | WIRED | Line 1492: `createSeason('player-team', teamName, playerSquad, 'season-1', names.slice(25))` — names passed correctly |
| `src/ui/screens/squadScreen.ts` | `src/simulation/types.ts` | `PlayerState.shirtNumber` rendering | WIRED | Line 589: `const shirtNum = this.shirtNumbers.get(p.id) ?? p.shirtNumber ?? ''` — reads from `shirtNumbers` Map (initialised from `p.shirtNumber`) and renders in UI |
| `src/season/nameService.ts` | randomuser.me API | `fetch` with `?nat=` parameter | WIRED | Line 31: `fetch(\`https://randomuser.me/api/?results=${count}&nat=${natCode.toLowerCase()}&gender=male&inc=name,nat\`)` |
| `src/season/nameService.ts` | `src/season/nameGen.ts` | `generatePlayerName` fallback | WIRED | Line 6: `import { generatePlayerName }` — used in catch block (line 102) |
| `src/season/teamGen.ts` | `src/simulation/types.ts` | `shirtNumber` field | WIRED | Line 136: `shirtNumber: index + 1` in `PlayerState` object literal |
| `src/season/season.ts` | `src/season/teamGen.ts` | `createAITeam` with names slice | WIRED | Line 116: `createAITeam(tier, teamId, teamName, rng, names?.slice(index * 25, (index + 1) * 25))` |
| `src/main.ts` (`simOneAIFixture` path) | opponent bench slice | `opponentSquad.slice(11, 18)` | WIRED | Line 1439: `opponentSquad.slice(11, 18)` — corrected from prior `slice(11, 16)` |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SQD2-01 | 07-01 | 25-man squads for all teams | SATISFIED | `ROLES_25` has 25 entries; `createAITeam` produces 25 players; `createSeason` creates 19 AI teams + player team all at 25; `SeasonTeam.squad` comment updated to "25 players" |
| SQD2-02 | 07-01, 07-02 | 18-man matchday selection (11 starters + 7 subs) | SATISFIED | `validateSquadSelection` enforces bench == 7; `SquadScreen` default assigns indices 11-17 to bench; `Bench: N/7` counter rendered |
| SQD2-03 | 07-01, 07-02 | Squad numbers editable per player | SATISFIED | Shirt number column with `data-shirt` click handler; picker popup (1-40 grid); uniqueness enforced (used numbers greyed); `getUpdatedPlayers()` exposes edits |
| SQD2-04 | 07-02 | Squad screen updated for 25 players with matchday selection UI | SATISFIED | `SquadScreen` renders all 25 rows; 11+7 default; role picker for starters; SUB/OUT options; `Bench: N/7` counter; sorting; auto-pick button |
| NAME-01 | 07-01, 07-02 | Fetch realistic names from randomuser.me at game creation | SATISFIED | `getNames(500)` called in `main.ts` new-game flow; names flow into `createAITeam` for all 20 teams |
| NAME-02 | 07-01, 07-02 | Nationality-weighted name fetching (matching existing weightings) | SATISFIED | `NAT_WEIGHTS` in `nameService.ts`: GB=0.40, ES=0.25, FR=0.20, DE=0.10, BR=0.05 — matches `nameGen.ts` distribution; test at line 136 of `nameService.test.ts` verifies proportions |
| NAME-03 | 07-01, 07-02 | Fallback to generic name pool if API unavailable | SATISFIED | `getNames` catch block calls `generatePlayerName(rng)` for each of `count` names; two test cases confirm network-error and non-OK-status fallback |

All 7 requirements from the PLAN frontmatter are satisfied. No orphaned requirements found — REQUIREMENTS.md traceability table maps SQD2-01 through SQD2-04 and NAME-01 through NAME-03 to Phase 7.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/screens/squadScreen.ts` | 390 | Shirt number picker shows 1-40, not 1-99 as Plan 02 specified | Info | Deviation from plan spec; the success criterion says "editable" not "1-99 range"; range 1-40 is practical for squad numbers and uniqueness is still enforced |
| `src/simulation/engine.ts` | 205 | JSDoc says "11 starters + 5 bench" in `createMatchRosters` | Info | Legacy function; Plan 02 deferred updating `createMatchRosters` — season path uses `createAITeam` instead; no functional impact |
| `src/ui/screens/squadScreen.ts` | 269 | `benchAvailable = currentState === 'bench' ? 7 : 7 - benchCount` | Info | Correct logic but the role picker comment uses a raw literal 7 — acceptable since bench cap is 7 |

No blocker or warning anti-patterns found. The shirt number range deviation (1-40 vs 1-99) is a minor cosmetic implementation choice and does not prevent goal achievement.

---

### Human Verification Required

#### 1. Squad Screen Appearance (25 players + realistic names)

**Test:** Run `npm run dev`, create a new game, navigate to Squad screen
**Expected:** 25 player rows visible; player names include non-English names (Spanish, French, German, Brazilian) as well as English — not a grid of "James Smith" clones; each player has a numbered circle (1-25); counter reads "Starters: 11/11 | Bench: 7/7" for default selection; remaining 7 players show "OUT" badge
**Why human:** DOM rendering and name quality/diversity assessment cannot be automated

#### 2. Shirt Number Edit Interaction

**Test:** Click any numbered circle in the "#" column on the squad screen
**Expected:** A popup grid of numbers 1-40 appears; current number highlighted; already-used numbers greyed with not-allowed cursor; clicking a free number dismisses popup and updates the player's circle; clicking the backdrop dismisses without change; clicking a shirt number does NOT toggle the player's starter/bench/out status
**Why human:** Click event behavior and popup UI require interactive browser testing

#### 3. Fallback Names (Offline Mode)

**Test:** Disconnect network, create a new game
**Expected:** Game creation completes without error; player names follow procedural "Firstname Lastname" format (may feel less realistic); squad screen loads normally with 25 players
**Why human:** Requires network isolation; fallback code path confirmed in source but end-to-end flow needs real-world testing

#### 4. Full Matchday Cycle with 25-Man Squads

**Test:** Select a valid 11+7 squad, kick off, play or skip the match, advance matchday
**Expected:** Match runs normally; AI fixtures produce results; vidiprinter shows correct team names; league table updates with 20-team results; no JS errors in console
**Why human:** Full gameplay loop with 25-man squads cannot be verified without running the app

---

### Gaps Summary

No functional gaps found. All automated must-haves pass:

- `nameService.ts` fetches from randomuser.me with nationality weighting and falls back correctly
- `createAITeam` produces exactly 25 players with `ROLES_25` distribution and unique `shirtNumber` 1-25
- `validateSquadSelection` enforces `bench.length === 7`
- `simOneAIFixture` uses `homeSquad.slice(11, 18)` and `awaySquad.slice(11, 18)`
- `squadScreen.ts` renders all 25 players with `Bench: N/7` counter and shirt number edit UI
- `main.ts` is fully wired: `await getNames(500)` → `createAITeam` → `createSeason(names.slice(25))`
- All 78 season tests pass (6 test files: `nameService`, `teamGen`, `season`, `leagueTable`, `nameGen`, `fixtures`)

The single deviation from plan spec (shirt number picker shows 1-40 instead of 1-99) is an implementation choice that still satisfies the requirement "Squad numbers editable per player" — squad numbers in football rarely exceed 40, and uniqueness is enforced within the picker.

Phase goal status is **human_needed**: all automated checks pass; the 4 human items above confirm visual rendering, interaction behavior, and the fallback offline path.

---

_Verified: 2026-03-07T07:00:00Z_
_Verifier: Claude (gsd-verifier)_

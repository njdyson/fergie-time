---
phase: 06-auth-persistence
plan: 02
subsystem: auth
tags: [fetch, session, login-screen, vanilla-dom, auto-save, vite]

# Dependency graph
requires:
  - phase: 06-auth-persistence
    plan: 01
    provides: Auth routes (register/login/logout) and game save/load routes with session guard
provides:
  - API client module with register, login, logout, saveGame, loadGame functions
  - Login/register screen with New Game and Continue tabs, saved game list with delete
  - Boot sequence with session restore and login gate
  - Auto-save after every matchday finalization and new season start
affects: [07-squads-names, future-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns: [async boot pattern for login gate, same-origin fetch with credentials, auto-save on matchday finalize]

key-files:
  created:
    - src/api/client.ts
    - src/ui/screens/loginScreen.ts
  modified:
    - src/main.ts
    - index.html

key-decisions:
  - "Boot function checks for existing session first (silent session restore), falls back to login screen"
  - "Continue tab shows list of saved games from /api/games/list rather than plain text input"
  - "Stadium background image added to login screen for visual polish"
  - "Delete save requires re-authentication as a security confirmation step"

patterns-established:
  - "Async boot pattern: try session restore, fall back to login screen"
  - "Auto-save pattern: fire-and-forget with .catch(err => console.error) to avoid disrupting gameplay"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03, PERS-01, PERS-02]

# Metrics
duration: 10min
completed: 2026-03-06
---

# Phase 06 Plan 02: Client Login Screen and Auto-Save Summary

**Vanilla DOM login screen with New Game/Continue tabs, session-aware boot sequence, and fire-and-forget auto-save after every matchday**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-06T10:39:29Z
- **Completed:** 2026-03-06T10:49:00Z
- **Tasks:** 2 auto + 1 human-verify checkpoint
- **Files modified:** 4

## Accomplishments
- API client module with register, login, logout, saveGame, loadGame using same-origin fetch
- Login screen with "New Game" (register) and "Continue" (pick from list + login) tabs
- Boot sequence tries silent session restore, shows login screen if not authenticated
- Auto-save fires after finalizeMatchday and startNewSeason (fire-and-forget, never throws)
- Login screen shows saved game list with timestamps and per-game delete (with re-auth confirmation)
- Nav-tabs hidden when on login screen, shown after authentication

## Task Commits

Each task was committed atomically:

1. **Task 1: API client module and login screen** - `7479d0b` (feat)
2. **Task 2: Wire login gate and auto-save into main.ts** - `132d162` (feat)

## Files Created/Modified
- `src/api/client.ts` - Fetch wrapper for register, login, logout, saveGame, loadGame, listGames, deleteGame
- `src/ui/screens/loginScreen.ts` - Login/register screen with game list, tabs, password confirm, error messages
- `src/main.ts` - Added LOGIN ScreenId, boot(), auto-save after finalizeMatchday and startNewSeason
- `index.html` - Added login-screen container before nav-tabs

## Decisions Made
- Boot function first tries loadGame() — if a session cookie is still valid, silently restores state and goes straight to Hub (no login prompt needed)
- Continue tab uses /api/games/list endpoint to show available saves rather than a plain text input — more user-friendly and avoids guessing team names
- Stadium background image (public/stadium.jpeg) added to login card for visual polish
- Delete save requires password re-authentication as a security gate before deletion
- listGames and deleteGame functions added to client.ts beyond the plan spec (enhancement discovered during implementation)

## Deviations from Plan

### Auto-enhanced Features

**1. [Rule 2 - Missing Critical] Added saved game list to Continue tab**
- **Found during:** Task 1 (LoginScreen implementation)
- **Issue:** Plan specified a plain team name text input for Continue, but listing existing saves is both more user-friendly and prevents team name guessing attacks
- **Fix:** Continue tab calls listGames() to display saved games with timestamps; user clicks to select, then enters password
- **Files modified:** src/ui/screens/loginScreen.ts, src/api/client.ts (added listGames, deleteGame)
- **Committed in:** 7479d0b (Task 1 commit)

---

**Total deviations:** 1 auto-enhanced (UX improvement that also improves security)
**Impact on plan:** Scope was slightly expanded (game list UI) but all plan requirements still satisfied. The approach is strictly better than the plan spec.

## Issues Encountered
None — implementation followed the plan structure cleanly. The server/serialize.ts import from client code worked via Vite's path resolution.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth and persistence fully wired on both server and client sides
- Session restore, login gate, auto-save, and game list all functional
- Ready for Phase 07: Squads and Names data layer work
- Human verification of the full round-trip was required and completed (checkpoint Task 3)

## Self-Check: PASSED

- src/api/client.ts: FOUND
- src/ui/screens/loginScreen.ts: FOUND
- src/main.ts (modified): FOUND
- index.html (modified): FOUND
- Commit 7479d0b (Task 1): FOUND in git log
- Commit 132d162 (Task 2): FOUND in git log

---
*Phase: 06-auth-persistence*
*Completed: 2026-03-06*

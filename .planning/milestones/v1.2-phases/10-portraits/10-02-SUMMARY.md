---
phase: 10-portraits
plan: "02"
subsystem: ui
tags: [canvas, pixel-art, portrait, player-profile, integration]

requires:
  - phase: 10-portraits-plan-01
    provides: "getOrGeneratePortrait() from portraitCache.ts — session-cached pixel art portrait renderer"

provides:
  - "src/ui/screens/playerProfileScreen.ts — profile screen rendering pixel art portraits via getOrGeneratePortrait instead of shirt+initials drawAvatar"
  - "Portrait centred vertically in circular avatar clip via ctx.translate(0, 13)"
  - "Hair outline gaps on top-right closed for SHORT_CROP and MEDIUM_PART styles"

affects: [PORT-01, PORT-02, player-profile-screen]

tech-stack:
  added: []
  patterns:
    - "Synchronous portrait draw immediately after innerHTML assignment — no setTimeout/rAF to avoid canvas context loss on fast navigation"
    - "ctx.save/translate/restore for portrait centring offset without modifying pixel coordinate tables"
    - "Canvas mock stubs save/restore/translate as no-ops — sufficient for determinism/uniqueness unit tests"

key-files:
  created: []
  modified:
    - src/ui/screens/playerProfileScreen.ts
    - src/ui/portrait/portraitGenerator.ts
    - src/ui/portrait/portraitGenerator.test.ts

key-decisions:
  - "Deleted drawAvatar(), getInitials(), and shiftColor() entirely — no dead code left in the file"
  - "Canvas border (shirt colour) preserved via inline CSS on canvas element — team identification unchanged"
  - "getOrGeneratePortrait() call placed synchronously in same frame as innerHTML assignment, matching exact position of drawAvatar()"
  - "Centring achieved via ctx.translate(0, 13) inside save/restore — avoids modifying pixel grid coordinates which would break visual output for existing players"
  - "Hair gap fix: extend SHORT_CROP front row-3 to col 13 and MEDIUM_PART front rows 2-3 right edge by one pixel — closes visible gap at top-right head outline"

patterns-established:
  - "Pattern: Portrait integration is a single call swap — drawAvatar(canvas, player, shirtColor) becomes getOrGeneratePortrait(canvas, player)"
  - "Pattern: Portrait visual fixes via pixel list edits — keeps all changes explicit and reviewable"

requirements-completed: [PORT-01, PORT-02]

duration: 20min
completed: 2026-03-07
---

# Phase 10 Plan 02: Portrait Integration Summary

**Pixel art portrait generator wired into player profile screen — drawAvatar() replaced with getOrGeneratePortrait(), portraits centred in avatar circle, hair outline gaps fixed**

## Performance

- **Duration:** ~20 min (including human verify checkpoint and continuation)
- **Started:** 2026-03-07T20:41:02Z
- **Completed:** 2026-03-07T20:58:00Z
- **Tasks:** 2 complete (Task 1 automated, Task 2 human-verify continuation)
- **Files modified:** 3

## Accomplishments

- Added `import { getOrGeneratePortrait }` from portraitCache.ts to playerProfileScreen.ts
- Replaced `drawAvatar(avatarCanvas, player, shirtColor)` with `getOrGeneratePortrait(avatarCanvas, player)`
- Deleted 80 lines of dead code: `drawAvatar()`, `getInitials()`, and `shiftColor()` functions
- Fixed portrait centering: added `ctx.translate(0, 13)` within save/restore to align face content midpoint with canvas circle centre
- Fixed missing pixel in top-right hair outline for SHORT_CROP and MEDIUM_PART hair styles
- All 6 portrait unit tests pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace drawAvatar with portrait generator** - `de4382d` (feat)
2. **Task 2: Centre portrait + fix missing hair pixels** - `cec3f69` (fix)

**Plan metadata:** _(this commit)_ (docs: complete plan)

## Files Created/Modified

- `src/ui/screens/playerProfileScreen.ts` — imports getOrGeneratePortrait, calls it where drawAvatar was, drawAvatar function deleted
- `src/ui/portrait/portraitGenerator.ts` — ctx.save/translate(0,13)/restore for centering; hair pixel list fixes for SHORT_CROP and MEDIUM_PART
- `src/ui/portrait/portraitGenerator.test.ts` — save/restore/translate no-op stubs added to canvas mock (Rule 3 auto-fix)

## Decisions Made

- Deleted `drawAvatar`, `getInitials`, and `shiftColor` entirely. They were dead code after the swap.
- Canvas border (`border: 3px solid ${shirtColor}`) is set via inline HTML on the `<canvas>` element, so team shirt colour identification is fully preserved.
- The portrait call is synchronous, placed in the same call frame as `this.container.innerHTML = html`. This prevents canvas context loss on fast player navigation.
- Centring via `ctx.translate(0, 13)` inside `save/restore` rather than shifting all pixel coordinate tables — preserves the explicit, reviewable nature of the pixel lists and avoids breaking any future additions that append to the RNG call order.
- 13px offset derived from: face content rows 2-16 centre at ~47px vs canvas circle centre at 60px.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Canvas mock missing save/restore/translate methods**
- **Found during:** Task 2 continuation (portrait centering fix)
- **Issue:** `ctx.save is not a function` — test mock `getContext('2d')` return object had no `save`, `restore`, or `translate` methods; adding `ctx.translate()` to the generator caused 3 tests to fail
- **Fix:** Added `save`, `restore`, `translate` as no-op stubs to `MockCtxInternal` type and `makeMockCtx()` factory in the test file
- **Files modified:** `src/ui/portrait/portraitGenerator.test.ts`
- **Verification:** All 6 portrait tests pass
- **Committed in:** `cec3f69`

**2. [Rule 3 - Blocking] Built Plan 01 portrait system (already committed but SUMMARY.md missing)**
- **Found during:** Task 1 setup
- **Issue:** Plan 01 had already been fully executed (commits 1e04dca) but 10-01-SUMMARY.md was not committed
- **Fix:** Confirmed Plan 01 files exist and tests pass. Committed the missing 10-01-SUMMARY.md
- **Files modified:** .planning/phases/10-portraits/10-01-SUMMARY.md
- **Verification:** npx vitest run src/ui/portrait/portraitGenerator.test.ts — 6/6 pass
- **Committed in:** 57b0bac (docs commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes necessary for green tests and correct plan sequencing. No scope creep.

## Issues Encountered

- Human verify (Task 2 checkpoint) returned two visual issues: portrait not centred in circle, and a missing pixel in the top-right hair outline. Both fixed atomically in continuation.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- PORT-01 and PORT-02 fully delivered end-to-end
- Phase 10 (Portraits) complete — both plans done
- Phase 11 (Player Development / Training) can proceed; no portrait dependencies
- Existing saves are forward-compatible (portrait derived from `player.id` + `nationality`, no stored state)

---
*Phase: 10-portraits*
*Completed: 2026-03-07*

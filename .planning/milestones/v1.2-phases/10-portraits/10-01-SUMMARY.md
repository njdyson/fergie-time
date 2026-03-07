---
phase: 10-portraits
plan: 01
subsystem: ui
tags: [canvas, pixel-art, seedrandom, portrait, nationality, cache]

requires: []
provides:
  - "src/ui/portrait/palettes.ts — NationalityPalette interface, 10 nationality palettes, FALLBACK_PALETTE, getPalette()"
  - "src/ui/portrait/portraitGenerator.ts — generatePortrait() seeded pixel art renderer for 120x120 canvas"
  - "src/ui/portrait/portraitCache.ts — getOrGeneratePortrait() with Map<string, ImageData> session cache"
affects: [10-portraits-plan-02, playerProfileScreen]

tech-stack:
  added: []
  patterns:
    - "Seeded RNG namespaced by feature: createRng('portrait-${player.id}') prevents cross-system RNG collisions"
    - "Fixed RNG call order: decision sequence documented in comment block, append-only for future features"
    - "Back-to-front layer compositing: hair-back, skin, ears, nose, eyes, mouth, facial-hair, hair-front"
    - "Session-level Map cache wrapping pure generator function — zero persistence, zero cost on repeat visits"

key-files:
  created:
    - src/ui/portrait/palettes.ts
    - src/ui/portrait/portraitGenerator.ts
    - src/ui/portrait/portraitCache.ts
    - src/ui/portrait/portraitGenerator.test.ts
  modified: []

key-decisions:
  - "Use 20x24 logical pixel grid scaled to 6x5 canvas pixels (20*6=120, 24*5=120) for clean integer scaling"
  - "Seed RNG with 'portrait-' prefix to namespace from other systems keying on player.id"
  - "Fixed RNG call order (skin, hairStyle, hairCol, eyeCol, facialHair) documented as append-only contract"
  - "getPalette() uses ternary guard instead of short-circuit &&, ensuring undefined nationality returns FALLBACK_PALETTE not false"

patterns-established:
  - "Pattern: Nationality palette constrains colour space before RNG selects within it — statistically different portraits per region"
  - "Pattern: TDD with canvas mock — node test environment requires manual Uint8ClampedArray buffer simulation"

requirements-completed: [PORT-01, PORT-02, PORT-03]

duration: 3min
completed: 2026-03-07
---

# Phase 10 Plan 01: Portrait Generation System Summary

**Deterministic 120x120 pixel art portrait generator using seeded RNG with nationality-driven colour palettes and session-level ImageData cache**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-07T20:40:58Z
- **Completed:** 2026-03-07T20:44:00Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments

- Built `palettes.ts` with 10 nationality palette entries (GB/ES/FR/DE/BR/IT/PT/NL/AR/NG) and fallback palette covering full skin/hair range
- Built `portraitGenerator.ts` with 5 hair styles (short crop, medium part, long, shaved, curly), 5 eye colours, bilateral face template, ear/nose shadows, and optional facial hair — all driven by `createRng('portrait-${player.id}')`
- Built `portraitCache.ts` with `Map<string, ImageData>` session cache preventing portrait regeneration on repeat profile visits
- All 6 tests pass: determinism, uniqueness, nationality palette variation, undefined nationality fallback, cache hit on second call

## Task Commits

Each task was committed atomically:

1. **RED — Failing tests** - `eaacd35` (test)
2. **GREEN — Implementation** - `1e04dca` (feat)

## Files Created/Modified

- `src/ui/portrait/palettes.ts` — NationalityPalette interface, 10 entries, FALLBACK_PALETTE, getPalette()
- `src/ui/portrait/portraitGenerator.ts` — generatePortrait() with seeded RNG, 20x24 grid, 5 hair styles, 5 eye colours, layered compositing
- `src/ui/portrait/portraitCache.ts` — getOrGeneratePortrait() with Map<string, ImageData> cache and clearPortraitCache()
- `src/ui/portrait/portraitGenerator.test.ts` — 6 tests: determinism, uniqueness, nationality diff, fallback, cache spy

## Decisions Made

- Used 20x24 logical pixel grid (6x5 scale factor) giving clean integer scaling to 120x120 canvas
- Namespaced RNG seed with `portrait-` prefix so future systems keying on player.id won't share sequence state
- RNG call order documented as append-only: skinIdx, hairStyleIdx, hairColIdx, eyeColIdx, hasFacialHair — inserting earlier would change all existing portraits
- `getPalette(undefined)` implemented with ternary guard (`nationality != null ? ... : undefined`) not `&&` short-circuit, because `&&` produces `false` not `undefined`, breaking the `??` fallback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getPalette(undefined) returning false instead of FALLBACK_PALETTE**
- **Found during:** Task 1 (GREEN — first test run)
- **Issue:** `(nationality != null && NATIONALITY_PALETTES[nationality]) ?? FALLBACK_PALETTE` evaluates `false ?? FALLBACK_PALETTE` when nationality is `undefined`, returning `false` not the fallback
- **Fix:** Changed to `(nationality != null ? NATIONALITY_PALETTES[nationality] : undefined) ?? FALLBACK_PALETTE`
- **Files modified:** src/ui/portrait/palettes.ts
- **Verification:** Test 4 passes — `getPalette(undefined)` returns FALLBACK_PALETTE by reference
- **Committed in:** 1e04dca (feat commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug)
**Impact on plan:** Fix required for correctness — undefined nationality would silently return false and crash drawLayer on palette access. No scope creep.

## Issues Encountered

None beyond the auto-fixed bug above.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Portrait engine complete: `generatePortrait()` and `getOrGeneratePortrait()` ready to integrate
- Plan 02 should replace `drawAvatar()` in `playerProfileScreen.ts` with `getOrGeneratePortrait(avatarCanvas, player)`
- Canvas border (team shirt colour) should be preserved — only the interior drawing changes

---
*Phase: 10-portraits*
*Completed: 2026-03-07*

## Self-Check: PASSED

- FOUND: src/ui/portrait/palettes.ts
- FOUND: src/ui/portrait/portraitGenerator.ts
- FOUND: src/ui/portrait/portraitCache.ts
- FOUND: src/ui/portrait/portraitGenerator.test.ts
- FOUND: .planning/phases/10-portraits/10-01-SUMMARY.md
- FOUND commit: eaacd35 (test RED)
- FOUND commit: 1e04dca (feat GREEN)
- All 6 tests pass

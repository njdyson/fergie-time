---
phase: 05-server-foundation
plan: 01
subsystem: database
tags: [json, serialization, map, round-trip, save-load]

# Dependency graph
requires: []
provides:
  - serializeState and deserializeState functions with tagged Map replacer/reviver
  - SaveEnvelope interface with version field
affects: [05-02, 05-03, 05-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [tagged-map-serialization, save-envelope-pattern]

key-files:
  created: [server/serialize.ts, server/serialize.test.ts]
  modified: []

key-decisions:
  - "MAP_TAG sentinel pattern for Map serialization -- uses __MAP__ key with entries array"
  - "SaveEnvelope wraps state with version and savedAt at top level, not inside state"

patterns-established:
  - "Tagged Map pattern: replacer converts Map to {__MAP__: true, entries: [...]}, reviver reconstructs"
  - "Save envelope: all persistence wraps SeasonState in {version, savedAt, state}"

requirements-completed: [PERS-03, PERS-04]

# Metrics
duration: 2min
completed: 2026-03-06
---

# Phase 5 Plan 01: SeasonState Round-Trip Serialization Summary

**Tagged Map replacer/reviver pattern preserving fatigueMap through JSON round-trip with versioned SaveEnvelope**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-06T10:00:15Z
- **Completed:** 2026-03-06T10:02:03Z
- **Tasks:** 2 (TDD RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Solved #1 data layer risk: Map instances survive JSON.stringify/parse round-trip
- 6 test cases covering Map preservation, empty Maps, version envelope, full createSeason() round-trip
- SaveEnvelope pattern established for all future persistence work

## Task Commits

Each task was committed atomically:

1. **TDD RED: Failing serialization tests** - `b2e187c` (test)
2. **TDD GREEN: Implement serialize/deserialize** - `64f5a54` (feat)

_TDD plan: test-first then implementation. No refactor needed._

## Files Created/Modified
- `server/serialize.ts` - serializeState/deserializeState with tagged Map replacer/reviver
- `server/serialize.test.ts` - 6 round-trip tests including full createSeason() validation

## Decisions Made
- Used `__MAP__` sentinel tag pattern (from research) for Map serialization
- SaveEnvelope places version at top level (not inside state) for forward compatibility
- No vitest config changes needed -- server/ tests auto-discovered

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Serialization foundation ready for Plan 02 (server tsconfig, Express setup)
- serializeState/deserializeState exported and tested for use by save/load endpoints
- Full test suite passes (551 tests, 27 files) with no regressions

---
*Phase: 05-server-foundation*
*Completed: 2026-03-06*

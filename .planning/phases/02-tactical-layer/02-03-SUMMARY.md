---
phase: 02-tactical-layer
plan: 03
subsystem: tactical
tags: [halftime, substitutions, squad-management, formation-changes, match-flow]

# Dependency graph
requires:
  - phase: 02-tactical-layer
    plan: 01
    provides: "TacticalConfig interface, setHomeTactics/setAwayTactics engine methods"
  - phase: 02-tactical-layer
    plan: 02
    provides: "TacticsBoard canvas class, formation presets, duty picker, drag-drop UI"
provides:
  - "16-man squad rosters with 5-player bench system"
  - "substitutePlayer() method with max-3-per-match enforcement"
  - "Halftime auto-pause with tactics board return flow"
  - "Formation/role/duty changes apply at second-half kickoff"
  - "Substitution UI with drag-to-swap bench interaction"
affects: [03-match-flow, 03-ai-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "16-man roster pattern: 11 starters in simulation, 5 bench stored separately until substitution"
    - "Halftime flow: snap.matchPhase HALFTIME → auto-pause → return tactics board → apply changes → kickoff"
    - "Substitution pattern: outgoing player retains role/duty/anchor, incoming bench player gets fresh fatigue"

key-files:
  created: []
  modified:
    - "src/simulation/engine.ts — substitutePlayer(), startSecondHalf(), isHalftimeLatched(), bench player storage"
    - "src/ui/tacticsBoard.ts — bench panel display, setBenchPlayers(), getSubstitutions(), sub counter"
    - "src/main.ts — halftime detection, auto-pause, Start 2nd Half button, sub application flow"
    - "index.html — bench panel container, Start 2nd Half button, substitution counter display"

key-decisions:
  - "Bench players stored separately in MatchConfig, not in active players array until subbed"
  - "Halftime latch mechanism prevents repeated auto-pause during long halftime period"
  - "Formation application deferred to second-half kickoff, applied to initial positions"
  - "Substituted player inherits tactical role/duty/anchor but retains own attributes/personality"

requirements-completed: [TAC-04, TAC-05]

# Metrics
duration: 8min
completed: 2026-03-03
---

# Phase 2 Plan 3: Halftime and Substitution Engine Summary

**16-man squad system with halftime formation/substitution changes, max 3 subs per match, formations apply to initial positions at second-half kickoff**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-03 (from human-verify checkpoint)
- **Completed:** 2026-03-03
- **Tasks:** 2 (1 implementation + 1 human-verify)
- **Files modified:** 4

## Accomplishments

- Expanded squad to 16 players (11 starters + 5 bench) with separate bench storage
- Added substitutePlayer() method with max-3-per-match tracking and substitution count enforcement
- Halftime detection triggers auto-pause and returns tactics board without manual intervention
- Formation/role/duty changes from halftime tactics board apply at second-half kickoff
- Bench panel UI allows drag-to-swap substitution interaction with visual feedback
- Halftime latch mechanism prevents repeated auto-pause during extended halftime period
- Initial formations properly apply to starting positions, not just during play
- All tests pass (457), build succeeds

## Task Commits

1. **Task 1: 16-man squad, halftime flow, and substitution engine** - `baefdcc` (feat)
2. **Task 2: Human-verify checkpoint** - Approved by user (tactical changes produce visible behavior differences)
3. **Auto-fix: Halftime latch and initial formation position** - `eec71fe` (fix)

**Plan metadata:** Will be committed with STATE.md updates

## Files Created/Modified

- `src/simulation/engine.ts` - Added substitutePlayer(teamId, outPlayerId, inPlayer), startSecondHalf(), isHalftimeLatched() methods; bench player array and substitution count tracking per team
- `src/ui/tacticsBoard.ts` - Added bench panel display, setBenchPlayers(bench) method, getSubstitutions() for pending subs, sub counter state management
- `src/main.ts` - Added halftime detection poll, auto-pause on halftime, tactics board return flow, "Start 2nd Half" button wiring, substitution application before second-half kickoff
- `index.html` - Added bench panel container, "Start 2nd Half" button, substitution counter display element

## Decisions Made

- **Bench storage:** Bench players stored separately in MatchConfig, not in active players array until substituted — keeps simulation at 22 actors max, cleaner bench UI state
- **Halftime latch:** Added isHalftimeLatched() check to prevent repeated auto-pause during long halftime period — halftime detected once, tactics board shown, latch cleared on second-half start
- **Formation timing:** Formation changes apply at second-half kickoff (startSecondHalf), not immediately — maintains state consistency, allows player to review and adjust before committing
- **Substitution UI:** Bench players clicked after field player selected to swap — familiar drag-to-drop pattern from chess/card games, visual feedback shows both directions
- **Fresh fatigue on subs:** Incoming bench player starts with fatigue=0 — represents fresh legs, critical for tactical value of subs late in match

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed halftime latch infinite re-trigger**
- **Found during:** Task 1 (halftime detection in main.ts)
- **Issue:** snap.matchPhase === HALFTIME checked every frame → tactics board shown repeatedly, state thrashing
- **Fix:** Added isHalftimeLatched() guard in engine, latch cleared on startSecondHalf()
- **Files modified:** src/simulation/engine.ts, src/main.ts
- **Verification:** Task 1 tests pass, halftime shows tactics board once, no state thrashing observed during human-verify
- **Committed in:** `eec71fe`

**2. [Rule 1 - Bug] Initial formation positions not applied at game start**
- **Found during:** Task 1 verification
- **Issue:** Formations only applied during formation changes at halftime; initial kickoff used 4-4-2 hardcoded default regardless of user selection
- **Fix:** Added _applyInitialFormation() call in startSecondHalf() and at engine initialization, applies tactics to player positions
- **Files modified:** src/simulation/engine.ts
- **Verification:** User confirmed formation presets visible at match start, different formations produce different initial shapes
- **Committed in:** `eec71fe`

---

**Total deviations:** 2 auto-fixed (1 blocking halftime latch, 1 bug in formation application)
**Impact on plan:** Both essential for correct halftime flow and user-visible formations. No scope creep beyond plan scope.

## Issues Encountered

None - plan executed cleanly after auto-fixes.

## Verification Status

- Build: PASS (npm run build succeeds, TypeScript clean)
- Tests: PASS (457 tests, all colors green)
- Human verify: APPROVED — User confirmed:
  - Halftime auto-pauses and shows tactics board
  - Formation changes at halftime produce visibly different team shapes (4-3-3 vs 4-5-1 obvious)
  - Substitutions work: selected bench player replaces field player
  - Max 3 subs enforced by UI disable after 3 made
  - Substituted player appears with correct name/attributes in debug overlay
  - Second half starts with new formation and subs applied

## Next Phase Readiness

- Halftime flow complete and tested
- Tactical changes now a core match-management mechanic
- Ready for Phase 3: Match Flow (goalkeeper behavior, final whistle, goal logic)
- Blocker note: Player oscillation/jitter remains from Phase 1 — tactical changes now expose this more clearly (formations change, but oscillation makes player positions erratic). Deferred to Phase 2 tuning pass post-Phase 3.

---

*Phase: 02-tactical-layer*
*Completed: 2026-03-03*

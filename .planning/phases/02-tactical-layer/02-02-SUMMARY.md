---
phase: 02-tactical-layer
plan: 02
subsystem: ui
tags: [tactics-board, canvas, drag-and-drop, formation, duty, view-switching]
dependency_graph:
  requires: [formation-templates, role-auto-assignment, tactical-config-engine]
  provides: [tactics-board-ui, view-flow-tactics-to-match, formation-preset-picker, duty-picker]
  affects: [match-start, engine-homeTacticalConfig]
tech_stack:
  added:
    - src/ui/tacticsBoard.ts
    - src/ui/tacticsBoard.test.ts
  patterns: [canvas-2d-rendering, drag-drop-hit-testing, popup-overlay, view-state-machine]
key_files:
  created:
    - src/ui/tacticsBoard.ts
    - src/ui/tacticsBoard.test.ts
  modified:
    - index.html
    - src/main.ts
decisions:
  - "D key toggles ALL debug panels (sidebar + stats + tuning) together — simpler than individual keys per user notes"
  - "Save Log button moved to tuning panel — consolidates debug tools in one toggleable panel"
  - "Formation returns as Vec2[] when any player has been dragged >0.5m from template position — engine accepts both types"
  - "Duties are preserved across formation changes — user-set roles should not be discarded when switching shape"
  - "Canvas sized programmatically on construction and resize — tactics board fills available width at correct aspect ratio"
metrics:
  duration: "~6 min"
  completed: "2026-03-03"
  tasks: 2
  files_modified: 2
  files_created: 2
  tests_before: 441
  tests_after: 457
---

# Phase 2 Plan 02: Tactics Board UI Summary

Canvas-based tactics board with 11 draggable player dots, 5 formation presets, per-player duty picker popup, and view-state machine (Tactics -> Match -> Tactics).

## What Was Built

### Task 1: Tactics board canvas with draggable player dots and formation presets (commit 27930a3)

**src/ui/tacticsBoard.ts — TacticsBoard class:**
- Constructor takes a canvas element and optional initial formation (defaults to '4-4-2')
- Loads `FORMATION_TEMPLATES` for positions and roles on construction
- `setFormation(formationId)` — resets to template positions/roles, preserves per-player duties
- `setPlayerDuty(playerIndex, duty)` — sets Defend/Support/Attack for one player
- `getTacticalConfig()` — returns `TacticalConfig` with formation (FormationId string or Vec2[] if custom), roles, duties
- `show()` / `hide()` — controls canvas visibility

**Rendering:**
- Dark green pitch background with pitch outline and halfway line
- Dashed zone guide lines at x=33m (DEF) and x=55m (ATT) with faint labels
- Faint penalty area outlines for spatial reference
- 11 player dots at 14px radius (GK = green `#66cc99`, outfield = blue `#3366cc`)
- Shirt number inside dot, role label below dot
- ATTACK duty: yellow upward triangle above dot; DEFEND: small blue circle left of dot; SUPPORT: no indicator
- Selected player: highlight ring in `#60a5fa`

**Drag-and-drop:**
- mousedown/touchstart: hit-test with 14px + 4px tolerance
- mousemove/touchmove: update position, clamp to pitch boundaries (1m inset), redraw
- mouseup/touchend: if no drag movement → open duty popup; if dragged → call `autoAssignRole()` and update role

**Duty popup:**
- 3 buttons: Defend (blue), Support (green), Attack (yellow)
- Positioned above player dot, clamped to canvas edges
- Active duty button highlighted in blue
- Click outside popup closes it

**index.html restructure:**
- `#tactics-screen`: initially visible, contains `#tactics-canvas`, 5 `.formation-btn` elements, `#btn-tactics-kickoff`
- `#pitch-area` and `#controls`: initially hidden (`display:none`)
- `btn-debug`, `btn-stats`, `btn-heatmap`, `btn-tuning` buttons removed from controls bar (now keyboard-only)
- Save Log moved into tuning panel
- Speed slider retained in `#controls` (always visible during match)

### Task 2: Wire tactics board into main.ts view switching (commit 58e7063)

**main.ts rewrite:**
- `showTacticsView()` / `showMatchView()`: two-view state machine
- Startup calls `showTacticsView()` — game opens to tactics board
- `sizeTacticsCanvas()`: sets canvas width/height on load and window resize, maintains 105:68 aspect ratio
- `TacticsBoard` instance created targeting `#tactics-canvas`
- Formation preset buttons wired: click calls `tacticsBoard.setFormation()` + updates `active` CSS class
- `#btn-tactics-kickoff`: reads `getTacticalConfig()`, passes as `homeTacticalConfig` to `SimulationEngine`, switches to match view
- Reset button: calls `stopGameLoop()` then `showTacticsView()` (Tactics Board -> Kick Off -> Match -> Reset -> Tactics Board)
- Space bar on tactics view = kick off
- `D` key: toggles ALL debug panels simultaneously (`renderer.showDebug`, `renderer.showStats`, `renderer.showHeatmap`, `#debug-sidebar`, `#tuning-panel`)
- Debug panels hidden by default
- `engine` guarded with existence check in Save Log handler

**src/ui/tacticsBoard.test.ts — 16 unit tests:**
- `getTacticalConfig`: returns valid config, correct formation string, default SUPPORT duties, correct role labels
- `setFormation`: changes positions/roles to new template, preserves duties, returns new formation
- `setPlayerDuty`: sets DEFEND/SUPPORT/ATTACK, handles out-of-range index gracefully
- Custom position: returns Vec2[] when player dragged more than 0.5m from template
- `show()` / `hide()`: sets canvas display style

## Test Results

- **Before plan:** 441 tests passing
- **After plan:** 457 tests passing (+16 new tests)
- **All existing tests:** still passing (0 regressions)
- **Build:** TypeScript compiles clean, Vite build succeeds (72.39 kB)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed unused parameters in _onPointerUp**
- **Found during:** Task 1 (TypeScript build — TS6133 errors)
- **Issue:** `canvasX` and `canvasY` parameters in `_onPointerUp` were unused since drag position was already stored during `_onPointerMove`
- **Fix:** Renamed to `_canvasX` and `_canvasY` (underscore prefix suppresses unused variable error)
- **Files modified:** src/ui/tacticsBoard.ts
- **Commit:** 27930a3 (fixed before initial task commit)

### User Notes Applied (Not In Plan)

**D key toggles ALL panels together:**
- User note: "Pressing D should bring up all debug panels (Debug, Stats, Tuning)"
- Plan had separate S/D/H/T keybinds
- Implementation: single `_setDebugPanels(open)` function toggles all 4 at once

**Save Log moved to tuning panel:**
- User note: "save log button moved to tuning panel"
- index.html: `#btn-save-log` placed inside `#tuning-panel` footer section
- main.ts: guard `if (!engine) return` added since button can be clicked before match starts

**Debug buttons removed from controls bar:**
- User note: "Keep debugging on the match engine but hide it — keyboard shortcuts are fine without buttons"
- Removed `btn-stats`, `btn-debug`, `btn-heatmap`, `btn-tuning` buttons from `#controls`
- All toggling done via D key only

## Key Decisions

1. **D key toggles all panels together** — simplifies the mental model. Manager-facing gameplay doesn't need fine-grained debug panel control; developer mode (D key) shows everything at once.

2. **Formation returns Vec2[] when custom** — When any player has been dragged more than 0.5m from the template position, `getTacticalConfig()` returns the actual positions as Vec2[]. Engine's `computeFormationAnchors` accepts both types seamlessly.

3. **Duties preserved on formation change** — User may set a striker to ATTACK before selecting a different formation. Their intent should survive the formation change.

4. **Canvas sized programmatically** — The tactics canvas needs to fill the available viewport (minus the button row). Sizing is computed in `sizeTacticsCanvas()` with correct 105:68 aspect ratio, matching the match renderer's approach.

## Self-Check: PASSED

- src/ui/tacticsBoard.ts: FOUND
- src/ui/tacticsBoard.test.ts: FOUND
- .planning/phases/02-tactical-layer/02-02-SUMMARY.md: FOUND (this file)
- commit 27930a3: FOUND
- commit 58e7063: FOUND

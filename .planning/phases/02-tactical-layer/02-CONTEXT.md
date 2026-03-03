# Phase 2: Tactical Layer - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Formation and role decisions by the manager mechanically alter how the team plays — changing shape produces a measurably different spatial footprint, not a cosmetic label. Covers TAC-01 through TAC-05.

</domain>

<decisions>
## Implementation Decisions

### Tactics board design
- Pre-match and halftime only — no mid-match editing
- Game opens to the tactics board; "Kick Off" transitions to match view
- At halftime, match pauses and returns to the tactics board automatically
- Top-down pitch diagram (birds-eye view), consistent with match canvas perspective
- No formation effectiveness feedback on the board — discovery through play

### Formation system
- Presets + customize: pick from 5 templates, then drag individual players to fine-tune
- Templates: 4-4-2, 4-3-3, 4-5-1, 3-5-2, 4-2-3-1
- Free drag with faint horizontal guide lines showing defensive/midfield/attack zones
- Dragging a player into a different zone auto-assigns their positional role

### Role & duty system
- 10 positional roles: GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST
- Per-player duty: Defend / Support / Attack (modifies utility AI weights per agent)
- Click a player dot on the tactics board to select, then pick duty from popup
- Auto-assigned role from position zone; duty defaults to Support, user can change

### Substitutions
- Halftime only — no mid-match subs
- 5 bench players (16-man squad total)
- Click a player on the board, select "Substitute", pick replacement from bench list
- Full tactical reshuffle allowed at halftime (reposition + re-duty all players, not just subs)
- Up to 3 substitutions per match (TAC-05)

### Claude's Discretion
- Utility weight calibration for roles and duties — balance mechanical impact vs personality expression
- Tactics board visual styling and layout details
- Guide line positioning and visual treatment
- Bench player attribute display format
- How the auto-assign role boundaries map to pitch zones

</decisions>

<specifics>
## Specific Ideas

No specific references — open to standard approaches. The key principle is "tactics as real mechanical levers" from PROJECT.md — formation changes must produce measurably different team behavior.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `formation.ts`: `computeFormationAnchors()` already handles ball influence (0.15 factor) and possession shift (+10m/-5m). Needs to be generalized from hard-coded 4-4-2 to accept arbitrary positions
- `types.ts`: `PlayerState` has `role: string` and `formationAnchor: Vec2` already wired into the engine
- `types.ts`: `AgentContext` includes `distanceToFormationAnchor` and `isInPossessionTeam` — formation data flows to agents
- `engine.ts`: `createMatchRosters()` has 8 named archetypes — can be extended for 16-man squads
- `personality.ts`: `PERSONALITY_WEIGHTS` matrix maps action types to trait weights — role/duty weights can layer on top

### Established Patterns
- Const-object pattern for enums (not TypeScript enum) — `erasableSyntaxOnly: true`
- TDD workflow: tests first, then implementation
- Engine tick loop (15-step pipeline) in `engine.ts` — formation anchors computed at step 4
- Separation of simulation from rendering — engine runs headlessly

### Integration Points
- `index.html`: Control bar and pitch area need tactics board screen added as a new view state
- `main.ts`: Match lifecycle (startMatch/reset) needs pre-match and halftime states
- `engine.ts`: `tick()` pipeline needs to accept dynamic formation positions
- `formation.ts`: Needs generalization from 4-4-2 to N-position template system
- `canvas.ts`: Renderer may need state awareness (match view vs tactics board)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-tactical-layer*
*Context gathered: 2026-03-03*

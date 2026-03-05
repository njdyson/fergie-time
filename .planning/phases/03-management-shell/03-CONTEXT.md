# Phase 3: Management Shell - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Give the match engine narrative stakes — the manager picks squads, plays fixtures, watches the table update, and a champion is declared at season end. Covers SQD-01 through SQD-06. Player development (training, youth graduates, portraits) is Phase 4.

</domain>

<decisions>
## Implementation Decisions

### AI team simulation
- All 19 AI fixtures quick-sim using the full headless match engine (no rendering) — authentic results from player attributes and personality, consistent with what the player watches
- All fixtures on the same matchday resolve together — player plays their match, all AI fixtures resolve, table updates as a batch
- 20 teams split into quality tiers (strong, mid, weak) at season generation — attribute ranges differ per tier, creating a believable table spread
- AI teams use a fixed formation (4-4-2) for now — AI manager preferred formations is a deferred idea for a future phase

### App navigation
- Season Hub is the home screen — shows current league position, next fixture, last result, and navigation buttons (Squad / Table / Fixtures / Kick Off)
- Top nav tabs: Hub | Squad | Fixtures | Table — all screens reachable in one click
- Match → full-time overlay (existing fullTimeOverlay) → "Continue" → Hub (table already updated)
- The current match canvas + tactics board occupy the "match" view; nav tabs are hidden during a live match

### Squad selection
- Squad screen has a toggle per player: Starting XI / Bench / Not Selected
- Manager sets lineup on the Squad screen, navigates to Tactics to confirm roles and duties, then kicks off
- Validation: "Kick Off" blocked if lineup is invalid (must have exactly 11 starters including 1 GK, and 5 bench)
- Inline warning shown when validation fails — no popup/modal
- Fatigue persists between matches within a season — end-of-match fatigue becomes the player's starting fatigue for the next match (partial recovery per matchday, Claude's discretion on the curve)
- Squad rotation is meaningful: resting players matters

### Player data model
- Add `age: number` to PlayerState — display-only in Phase 3, no mechanic effect (retirements are Phase 4)
- Add `height: number` (cm) to PlayerState — display-only in Phase 3, shown on squad screen (e.g. 181cm)
- Fitness on squad screen = residual fatigue carried from last match — no separate fitness stat; same underlying fatigue system, just persisted between matches
- Personality traits are HIDDEN from the manager — the squad screen shows only measurable stats: age, height, position, and skill attributes (pace, shooting, passing, dribbling, tackling, aerial, strength, stamina, positioning, vision)
- Personality/trait discovery is deferred to a future phase — manager learns player characters through observation, not from a stats screen
- Player names are procedurally generated (SQD-06) — nationality-weighted name lists, Claude's discretion on implementation

### Claude's Discretion
- Fatigue recovery curve between matchdays (how much fatigue clears per day/matchday gap)
- Season fixture scheduling algorithm (round-robin, home/away balance)
- Quality tier attribute ranges for AI teams
- Player name generation implementation
- Squad screen visual layout and information density
- Fixture list display format (calendar vs list)

</decisions>

<specifics>
## Specific Ideas

- "Exhibition Match" idea: a sandboxed match mode separate from the season — pick an opponent, play with no persistence (no fatigue carry, no league impact). Deferred to future phase but should be kept in mind when structuring the navigation so the path exists.
- The manager discovers player personality through observation in matches, not through a stats screen — this is a deliberate design choice to create a discovery loop.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/panels/squadPanel.ts`: `SquadPanel` class already renders a squad list with name, role, duty, attributes, fatigue. Needs extension for age/height/fitness display and the Starting XI / Bench toggle.
- `src/ui/panels/teamPanel.ts` + `playerPanel.ts`: Existing panel infrastructure for sidebar display.
- `src/ui/fullTimeOverlay.ts`: Already handles full-time result display — extend to trigger Hub navigation on "Continue".
- `src/simulation/engine.ts`: `createMatchRosters()` generates 8 named archetypes — needs generalization to produce 20 full team squads with quality tiers.
- `src/simulation/types.ts`: `PlayerState` has attributes, personality, role, duty, fatigue — add `age` and `height` fields here.

### Established Patterns
- Const-object enum pattern (not TypeScript enum) — `erasableSyntaxOnly: true` in tsconfig
- TDD: tests first, then implementation
- Separate simulation from rendering — engine runs headlessly; AI quick-sim uses engine without CanvasRenderer
- 16-man squad: 11 starters + 5 bench — already wired in engine; bench stored in MatchConfig separately

### Integration Points
- `index.html`: Needs top nav tabs added (Hub / Squad / Fixtures / Table) and a Hub screen element
- `src/main.ts`: Screen routing logic needed — currently single-screen; add view state machine (hub / squad / fixtures / table / match)
- `src/simulation/engine.ts`: `createMatchRosters()` → generalize to `createTeamSquad(tier)` or similar
- `src/loop/gameLoop.ts`: Match end event needs to trigger Hub return + table update
- New: `src/season/` module likely needed — fixture generation, league table, season state, AI simulation runner

</code_context>

<deferred>
## Deferred Ideas

- Exhibition Match — sandboxed match with no persistence, pick any opponent, eventually with multiplayer option (human vs human local). No league impact. Deferred to future phase; keep navigation structure extensible.
- AI manager preferred formations — each AI team has a preferred formation/style. Noted during AI simulation discussion. Future phase.
- Trait/personality discovery UI — scouting or observation notes that reveal player personality over time. Deferred beyond Phase 4.

</deferred>

---

*Phase: 03-management-shell*
*Context gathered: 2026-03-05*

# Phase 8: Stats + Player Profiles - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Per-player season statistics tracked across all matches (watched and quick-simmed) and displayed in the UI, with a player profile page for detailed per-player views. Covers STAT-01 through STAT-05. VPS deployment (SERV-03) is already complete — excluded from this phase.

</domain>

<decisions>
## Implementation Decisions

### Stats storage
- Season stats stored in SeasonState as a playerSeasonStats map (Map<string, PlayerSeasonStats>)
- Serialized with the game save — consistent with "server is a filing cabinet" architecture
- Stats accumulate across the season; reset on new season

### Stats display — squad screen (inline)
- Add 3 columns to the existing squad screen rows: Goals, Assists, Apps
- Compact display — these are summary numbers, not detailed breakdowns
- Consistent with existing dark theme palette

### Stats display — dedicated stats tab
- New top nav tab: Hub | Squad | Stats | Fixtures | Table
- Full per-player stats: Apps, Goals, Assists, Shots, Shots on Target, Pass Completion %, Tackles Won, Yellow Cards, Red Cards, Clean Sheets (GK), Minutes Played, Goals per Game ratio
- Sortable columns — click header to sort
- Toggle between "My Squad" view and "League Top Scorers" view on the same tab

### Top scorers view
- Lives on the Stats tab as a toggle/sub-view (not a separate nav tab)
- Shows top 20 scorers across all 20 teams
- Columns: Name, Team, Goals, Assists, Apps, Goals/Game ratio
- Tiebreak: goals first, then assists, then apps

### Player profile page
- Accessible by clicking any player name anywhere in the app (squad screen, stats tab, top scorers)
- Shows player overview: name, age, height, nationality, position, shirt number
- Generated avatar: team-colored shirt with shirt number + player initials, canvas-drawn
- Attributes displayed as visual bars (horizontal, colored green=high to red=low, FM-style)
- Per-season stats summary on the profile
- Match history as drill-down from season stats — click a season stat to see per-match breakdown (not on the same screen as the overview)

### Quick-sim stat attribution
- Expose full GameEventLog from quick-sim — the engine already runs tick-by-tick, just return the log
- quickSimMatch returns PlayerLogStats map (call engine.gameLog.getPlayerStats()) alongside the score
- All 20 teams get full per-player stats from every match — top scorers table is meaningful
- Performance: don't worry about it now — getPlayerStats() is cheap post-hoc computation

### Post-match stats capture (STAT-04)
- Capture at full-time before screen transition — same spot that already captures fatigue in main.ts
- Merge per-match PlayerLogStats into SeasonState.playerSeasonStats accumulator
- For quick-sim: merge all 19 AI match results into season stats in the same batch

### Claude's Discretion
- Stats tab visual layout and information density
- Exact PlayerSeasonStats interface shape (must be extensible per STAT-02)
- Sorting UI implementation (click-to-sort vs dropdown)
- Player profile layout and spacing
- Avatar canvas drawing implementation details
- Match history drill-down UI design
- How attribute bar colors scale (linear vs thresholds)

</decisions>

<specifics>
## Specific Ideas

- Top scorers should feel like the real Premier League golden boot table — name, team, goals prominently, with secondary stats alongside
- Stats should be visible quickly from the squad screen (the 3-column inline approach) without needing to navigate to a separate tab for the basics
- AI player stats should be just as real as player team stats — the league is a living world, not a backdrop
- Player profile avatar: team shirt color with the player's shirt number and initials — simple but gives each player a visual identity until proper portraits (DEV-06) are built
- Attribute bars like FM — scannable at a glance, green for high values, red for low

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GameEventLog` (src/simulation/match/gameLog.ts): Already computes per-player goals, assists, passes, shots, tackles via `getPlayerStats()` returning `PlayerLogStats`
- `PlayerLogStats` interface: Already has playerId, role, teamId, passes, passesCompleted, shots, shotsOnTarget, goals, assists, tacklesWon, tacklesAttempted
- `StatsAccumulator` (src/simulation/match/stats.ts): Team-level match stats (possession, shots, etc.)
- `fullTimeOverlay` (src/ui/fullTimeOverlay.ts): Already calls `engine.gameLog.getPlayerStats()` at full-time
- `SquadScreen` (src/ui/screens/squadScreen.ts): Existing 25-player display with dark theme, ready for stat columns

### Established Patterns
- Dark theme palette: PANEL_BG=#1e293b, TEXT=#94a3b8, TEXT_BRIGHT=#e2e8f0, ACCENT_BLUE=#60a5fa, GREEN=#4ade80
- Screen classes in src/ui/screens/ with mount/unmount pattern
- Nav tabs in index.html with routing in main.ts
- SeasonState serialized via server/serialize.ts with MAP_TAG sentinel for Maps
- Const-object enum pattern (not TypeScript enum)

### Integration Points
- `src/main.ts:605`: fullTimeOverlay callback already has `playerStats` — add season accumulation here
- `src/season/quickSim.ts`: quickSimMatch needs to return PlayerLogStats alongside score
- `src/season/season.ts:45`: SeasonState needs playerSeasonStats field
- `server/serialize.ts`: Needs to handle new Map in SeasonState (MAP_TAG pattern already established)
- `index.html`: Add Stats nav tab
- `src/main.ts`: Add Stats screen routing + player profile navigation

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-stats-deployment*
*Context gathered: 2026-03-07*

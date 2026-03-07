# Phase 8: Stats + Player Profiles - Research

**Researched:** 2026-03-07
**Domain:** In-game statistics accumulation, UI data display, Canvas avatar rendering
**Confidence:** HIGH (based directly on existing codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stats storage**
- Season stats stored in SeasonState as a playerSeasonStats map (Map<string, PlayerSeasonStats>)
- Serialized with the game save — consistent with "server is a filing cabinet" architecture
- Stats accumulate across the season; reset on new season

**Stats display — squad screen (inline)**
- Add 3 columns to the existing squad screen rows: Goals, Assists, Apps
- Compact display — these are summary numbers, not detailed breakdowns
- Consistent with existing dark theme palette

**Stats display — dedicated stats tab**
- New top nav tab: Hub | Squad | Stats | Fixtures | Table
- Full per-player stats: Apps, Goals, Assists, Shots, Shots on Target, Pass Completion %, Tackles Won, Yellow Cards, Red Cards, Clean Sheets (GK), Minutes Played, Goals per Game ratio
- Sortable columns — click header to sort
- Toggle between "My Squad" view and "League Top Scorers" view on the same tab

**Top scorers view**
- Lives on the Stats tab as a toggle/sub-view (not a separate nav tab)
- Shows top 20 scorers across all 20 teams
- Columns: Name, Team, Goals, Assists, Apps, Goals/Game ratio
- Tiebreak: goals first, then assists, then apps

**Player profile page**
- Accessible by clicking any player name anywhere in the app (squad screen, stats tab, top scorers)
- Shows player overview: name, age, height, nationality, position, shirt number
- Generated avatar: team-colored shirt with shirt number + player initials, canvas-drawn
- Attributes displayed as visual bars (horizontal, colored green=high to red=low, FM-style)
- Per-season stats summary on the profile
- Match history as drill-down from season stats — click a season stat to see per-match breakdown (not on the same screen as the overview)

**Quick-sim stat attribution**
- Expose full GameEventLog from quick-sim — the engine already runs tick-by-tick, just return the log
- quickSimMatch returns PlayerLogStats map (call engine.gameLog.getPlayerStats()) alongside the score
- All 20 teams get full per-player stats from every match — top scorers table is meaningful
- Performance: don't worry about it now — getPlayerStats() is cheap post-hoc computation

**Post-match stats capture (STAT-04)**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STAT-01 | Per-player per-season stats tracked (goals, assists, appearances minimum) | PlayerSeasonStats map on SeasonState; merge from PlayerLogStats at full-time |
| STAT-02 | Extensible stats schema — easy to add pass completion, shot/goal ratio, tackles etc. | Simple flat interface with all fields optional-default-zero; add fields without migration |
| STAT-03 | Quick-sim exposes goalscorer data from GameEventLog | quickSimMatch already runs full engine; return `engine.gameLog.getPlayerStats()` alongside score |
| STAT-04 | Post-match stats hook captures player performance before screen transition | Hook already exists at main.ts:605 in fullTimePoll; add accumulation call before fatigue write |
| STAT-05 | League-wide stat views (top scorers at minimum) | Gather all players across all teams in SeasonState; flatten, sort, slice top 20 |
| SERV-03 | VPS deployment with systemd service + nginx reverse proxy | EXCLUDED per CONTEXT.md — deployment already complete |

</phase_requirements>

---

## Summary

Phase 8 is entirely internal — there is no external library to adopt and no new infrastructure to stand up. The codebase is already 90% of the way to supporting season stats: `GameEventLog.getPlayerStats()` returns a complete `PlayerLogStats` map per match, the full-time overlay already calls it (main.ts:605), and `serialize.ts` has the MAP_TAG pattern ready to handle any new `Map<string, PlayerSeasonStats>` field on `SeasonState`. The work is to wire these existing pieces together.

The phase breaks into four logically independent streams:
1. **Data layer** — define `PlayerSeasonStats`, add `playerSeasonStats` field to `SeasonState`, write the merge accumulator, and update `quickSimMatch` to return stats.
2. **Capture hooks** — in `main.ts` call the accumulator at full-time (watched match) and inside `simOneAIFixture` (AI batch), then save.
3. **Stats UI** — new `StatsScreen` class (following `TableScreen` pattern), Squad screen inline columns, and player profile page with canvas avatar.
4. **Navigation** — add Stats tab to `index.html` nav, `STATS` to `ScreenId`, screen DOM element, and routing in `main.ts`.

SERV-03 (VPS deployment) is explicitly excluded per CONTEXT.md — already done.

**Primary recommendation:** Implement in data-first order: interface → accumulator → capture hooks → verify data flows → build UI on top of verified data.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (existing) | ~5.9.3 | Type-safe interfaces | Already the project language |
| Vanilla DOM + innerHTML (existing) | N/A | UI rendering | Matches every other screen in the project |
| HTML Canvas 2D API (existing) | Browser built-in | Avatar drawing | Already used in CanvasRenderer — no new dep needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest (existing) | ^3.2.3 | Unit tests for accumulator logic | Test merge function in isolation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vanilla DOM innerHTML (existing pattern) | React/Vue component | Component frameworks would require build changes and break the current architecture; existing screens prove innerHTML is fast enough |
| Canvas 2D avatar | SVG or CSS circles | Canvas 2D is already used in the project; SVG is valid but adds a different rendering model for a small feature |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── season/
│   ├── season.ts         # Add playerSeasonStats: Map<string, PlayerSeasonStats> to SeasonState
│   └── statsAccumulator.ts  # NEW: mergeMatchStats(), createEmptyStats()
├── season/quickSim.ts    # Return PlayerLogStats alongside QuickSimResult
├── ui/screens/
│   ├── statsScreen.ts    # NEW: StatsScreen class (My Squad + Top Scorers views)
│   └── playerProfile.ts  # NEW: PlayerProfileScreen class with canvas avatar
├── main.ts               # Add STATS ScreenId, capture hooks, nav wiring
└── index.html            # Add Stats nav tab, stats-screen div, player-profile-screen div
server/
└── serialize.ts          # No changes needed — MAP_TAG handles new Map automatically
```

### Pattern 1: PlayerSeasonStats Interface (STAT-02 extensibility)

**What:** Flat interface with explicit zero defaults — no nested objects. Any new stat field is addable without a migration.

**When to use:** The single source of truth for per-player season data.

```typescript
// src/season/statsAccumulator.ts
export interface PlayerSeasonStats {
  playerId: string;
  teamId: string;           // needed for top scorers cross-team view
  appearances: number;      // incremented once per match played
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  passes: number;
  passesCompleted: number;
  tacklesWon: number;
  tacklesAttempted: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;      // GK only: matches where team conceded 0
  minutesPlayed: number;    // 90 for starters, sub-dependent for bench
}

export function createEmptyStats(playerId: string, teamId: string): PlayerSeasonStats {
  return {
    playerId, teamId,
    appearances: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0,
    passes: 0, passesCompleted: 0, tacklesWon: 0, tacklesAttempted: 0,
    yellowCards: 0, redCards: 0, cleanSheets: 0, minutesPlayed: 0,
  };
}
```

### Pattern 2: Stats Accumulator (merge per-match into season totals)

**What:** Pure function that takes the current season map and a per-match PlayerLogStats map and returns a new season map. Stateless and testable.

```typescript
// src/season/statsAccumulator.ts
import type { PlayerLogStats } from '../simulation/match/gameLog.ts';

export function mergeMatchStats(
  seasonStats: Map<string, PlayerSeasonStats>,
  matchStats: Map<string, PlayerLogStats>,
  concededGoals: number,  // for clean sheet tracking
): Map<string, PlayerSeasonStats> {
  const updated = new Map(seasonStats);
  for (const [playerId, match] of matchStats) {
    const existing = updated.get(playerId) ?? createEmptyStats(playerId, match.teamId);
    const isGK = match.role === 'GK';
    updated.set(playerId, {
      ...existing,
      appearances: existing.appearances + 1,
      goals: existing.goals + match.goals,
      assists: existing.assists + match.assists,
      shots: existing.shots + match.shots,
      shotsOnTarget: existing.shotsOnTarget + match.shotsOnTarget,
      passes: existing.passes + match.passes,
      passesCompleted: existing.passesCompleted + match.passesCompleted,
      tacklesWon: existing.tacklesWon + match.tacklesWon,
      tacklesAttempted: existing.tacklesAttempted + match.tacklesAttempted,
      minutesPlayed: existing.minutesPlayed + 90,  // simplification for now
      cleanSheets: existing.cleanSheets + (isGK && concededGoals === 0 ? 1 : 0),
    });
  }
  return updated;
}
```

### Pattern 3: QuickSim stats exposure (STAT-03)

**What:** Extend `QuickSimResult` to include the player stats map. Engine already computes it; just surface it.

```typescript
// src/season/quickSim.ts
export interface QuickSimResult {
  homeGoals: number;
  awayGoals: number;
  playerStats: Map<string, PlayerLogStats>;  // ADD THIS
}

export function quickSimMatch(config: MatchConfig): QuickSimResult {
  // ... existing tick loop ...
  return {
    homeGoals: snap.score[0],
    awayGoals: snap.score[1],
    playerStats: engine.gameLog.getPlayerStats(),  // ADD THIS
  };
}
```

### Pattern 4: Post-match capture hook in main.ts (STAT-04)

**What:** In the existing `fullTimePoll` callback at main.ts:605–624, call `mergeMatchStats` before the screen transition.

```typescript
// src/main.ts — inside showFullTimeOverlay callback, before recordPlayerResult
const playerStats = engine.gameLog.getPlayerStats();
const playerGoalsAgainst = playerWasHome ? snap.score[1] : snap.score[0];
seasonState = {
  ...seasonState,
  playerSeasonStats: mergeMatchStats(
    seasonState.playerSeasonStats ?? new Map(),
    playerStats,
    playerGoalsAgainst,
  ),
};
```

Then in `simOneAIFixture` (season.ts), also merge AI match stats:

```typescript
// src/season/season.ts — in simOneAIFixture after quickSimMatch call
const updatedStats = mergeMatchStats(
  state.playerSeasonStats ?? new Map(),
  simResult.playerStats,
  // conceded: from the perspective of each team (home conceded awayGoals, away conceded homeGoals)
  // Note: mergeMatchStats sees teamId per player, so we pass both goals and let it determine per-team
  simResult.awayGoals,  // home team conceded
);
// NOTE: Need to handle both home and away GK clean sheets — see pitfall below
```

### Pattern 5: StatsScreen class (following TableScreen pattern)

**What:** Class with `update(state, playerTeamId)` method that rebuilds innerHTML. Two sub-views toggled by a button pair at the top.

```typescript
// src/ui/screens/statsScreen.ts
export class StatsScreen {
  private container: HTMLElement;
  private currentView: 'squad' | 'top-scorers' = 'squad';
  private sortColumn: string = 'goals';
  private sortAsc: boolean = false;

  constructor(container: HTMLElement) { ... }

  update(state: SeasonState, playerTeamId: string): void {
    this.render(state, playerTeamId);
  }

  private render(state: SeasonState, playerTeamId: string): void {
    if (this.currentView === 'squad') this.renderSquad(state, playerTeamId);
    else this.renderTopScorers(state);
  }

  // Click-to-sort: re-render with new sort column on <th> click
}
```

### Pattern 6: Canvas avatar drawing

**What:** Use an offscreen `<canvas>` element (or inline canvas in the profile page). Draw a colored circle (team color) with a shirt number and initials.

```typescript
// src/ui/screens/playerProfile.ts
function drawAvatar(canvas: HTMLCanvasElement, player: PlayerState, teamColor: string): void {
  const ctx = canvas.getContext('2d')!;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = Math.min(cx, cy) - 4;

  // Shirt body
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = teamColor;
  ctx.fill();

  // Shirt number
  const shirtNum = player.shirtNumber?.toString() ?? '';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(r * 0.7)}px 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(shirtNum, cx, cy);
}
```

**Team color mapping:** Each AI team has an `id` like `ai-team-0`. Map index to a color palette (or derive from name hash). Player team color can be ACCENT_BLUE by default.

### Pattern 7: Player profile navigation

**What:** Attach `data-player-id` attributes to player name cells in the squad screen, stats screen, and top scorers. In `main.ts`, delegate-listen on the screen containers and call `showScreen(ScreenId.PLAYER_PROFILE)` with the selected player.

```typescript
// Delegation pattern — attach once to container, not per-row
squadScreenEl.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('[data-player-id]');
  if (!target) return;
  const playerId = (target as HTMLElement).dataset.playerId!;
  showPlayerProfile(playerId);
});
```

### Anti-Patterns to Avoid

- **Storing stats on PlayerState directly:** PlayerState is a per-match simulation object; season stats belong on SeasonState. Merging season data into the match object conflates two different lifecycles.
- **Mutating the stats map in-place:** `mergeMatchStats` must return a new Map so SeasonState remains structurally immutable (consistent with spread-copy pattern used throughout).
- **Forgetting to handle the "player not in matchStats" case:** Players who did not touch the ball (e.g., substitutes who never came on) will not appear in `getPlayerStats()`. The accumulator must handle `stats.get(id) ?? createEmptyStats(...)` defensively.
- **Trying to compute "yellow cards" from PlayerState in the loop:** `PlayerState.yellowCards` tracks within-match cautions only (for discipline logic). Season yellow card totals must come from counting `yellow_card` events in `GameEventLog` entries, not from `PlayerState`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Stats serialization | Custom serializer for PlayerSeasonStats Map | Existing `MAP_TAG` pattern in `server/serialize.ts` | mapReplacer/mapReviver already handles any Map — just add the field to SeasonState |
| Sortable table | jQuery DataTables or custom sort library | Vanilla array `.sort()` + re-render | This is a static in-memory array of <25 or <500 rows; trivial to sort inline |
| Avatar images | Fetch from external API or static assets | Canvas 2D drawing | No network dependency, no asset pipeline, consistent with project's procedural generation ethos |

**Key insight:** The existing codebase provides all the primitives needed. Phase 8 is wiring work, not new capability work.

---

## Common Pitfalls

### Pitfall 1: Clean Sheet Attribution — Home vs Away GK
**What goes wrong:** `mergeMatchStats` receives a single `concededGoals` argument, but in a match there are two goalkeepers (one per team). Passing `awayGoals` tells the home GK's clean sheet correctly but also applies the same number to the away GK.
**Why it happens:** The function signature sees all players regardless of team; GK clean sheet logic needs to branch on `player.teamId`.
**How to avoid:** Pass both `homeGoalsAgainst` and `awayGoalsAgainst` and determine per-GK based on `match.teamId`:
```typescript
const conceded = match.teamId === 'home' ? homeGoalsAgainst : awayGoalsAgainst;
const cleanSheet = isGK && conceded === 0 ? 1 : 0;
```
**Warning signs:** Both GKs getting clean sheets in every match, or neither getting any.

### Pitfall 2: Season Stats Reset on New Season
**What goes wrong:** `startNewSeason` in `season.ts` doesn't zero the `playerSeasonStats` map — it carries over from the previous season.
**Why it happens:** `startNewSeason` copies fields from the old state; a new field will be included in the spread unless explicitly reset.
**How to avoid:** In `startNewSeason`, explicitly set `playerSeasonStats: new Map()` on the returned state object.

### Pitfall 3: Missing `playerSeasonStats` on Load
**What goes wrong:** Games saved before Phase 8 don't have a `playerSeasonStats` field. After deploy, `state.playerSeasonStats` is `undefined` and calls to `Map.get()` crash.
**Why it happens:** No migration logic in `deserializeState`.
**How to avoid:** Always access as `state.playerSeasonStats ?? new Map()` at all call sites. Alternatively, add a one-line migration in `deserializeState`:
```typescript
// server/serialize.ts — after parse
if (!envelope.state.playerSeasonStats) {
  (envelope.state as SeasonState).playerSeasonStats = new Map();
}
```

### Pitfall 4: Yellow Card Double-Counting
**What goes wrong:** `PlayerLogStats` returned by `getPlayerStats()` does NOT include yellow/red card counts — the current `getPlayerStats()` method only processes `pass`, `shot`, `goal`, `tackle` events. The `yellow_card` and `red_card` entries are in the log but not counted.
**Why it happens:** The switch statement in `getPlayerStats()` has no `case 'yellow_card'` or `case 'red_card'`.
**How to avoid:** Either (a) extend `PlayerLogStats` to include `yellowCards` and `redCards` and add these cases to `getPlayerStats()`, or (b) count them directly in `mergeMatchStats` by scanning `engine.gameLog.getEntries()` at the call site. Option (a) is cleaner — add to the interface and the switch.

### Pitfall 5: `PlayerSeasonStats` Map Not Handled by Existing MAP_TAG
**What goes wrong:** `server/serialize.ts` already handles any `Map` instance via `mapReplacer` — this will automatically handle `playerSeasonStats`. But the reviver reconstructs `Map<unknown, unknown>`, not `Map<string, PlayerSeasonStats>`. TypeScript will accept this since there's no runtime type enforcement, but if the value type assumption is wrong, runtime errors occur.
**Why it happens:** JSON reviver can't enforce TypeScript generics.
**How to avoid:** After deserialization, `state.playerSeasonStats` will be a `Map<string, PlayerSeasonStats>` with correctly-shaped objects because JSON preserves the structure. No additional action needed — but be aware that deserializing pre-phase-8 saves requires the `?? new Map()` guard (Pitfall 3).

### Pitfall 6: Player Profile — Team Color Not Available
**What goes wrong:** `PlayerState.teamId` is `'home'` or `'away'` for match-time players, but for season stats it references the actual team ID (e.g., `ai-team-3`). The team color needs to be derived from the `SeasonState.teams` array.
**Why it happens:** No `teamColor` field exists in the data model — AI teams are procedurally generated without persistent color assignment.
**How to avoid:** Assign colors deterministically from team index using a palette (e.g., 12 preset colors cycling, indexed by `ai-team-N`). Player team gets ACCENT_BLUE. Store palette in a constant in `playerProfile.ts`.

### Pitfall 7: Appearances vs. Minutes Played for Substitutes
**What goes wrong:** `getPlayerStats()` only includes players who touched the ball. A substitute who came on for 10 minutes and never touched the ball won't appear in `matchStats` — so appearances won't be counted for them.
**Why it happens:** The event log only records events, not roster participation.
**How to avoid:** For the watched match, the player roster is available from `snap.players`. For the simple version: add 1 appearance for every player in the starting 11 + bench who played (from `snap.players` or the roster). For the first iteration, track appearances only for players who appear in `getPlayerStats()` — this is an acceptable simplification that will naturally improve if minutes tracking is added later.

---

## Code Examples

Verified patterns from codebase inspection:

### Existing hook location (main.ts:596-625)
```typescript
// main.ts — existing fullTimePoll callback structure
fullTimePoll = setInterval(() => {
  if (!engine) return;
  const snap = engine.getCurrentSnapshot();
  if (snap.matchPhase === MatchPhase.FULL_TIME && !fullTimeLogged) {
    fullTimeLogged = true;
    logFullTime(snap);
    const canvasWrapper = document.getElementById('canvas-wrapper');
    if (canvasWrapper) {
      const playerStats = engine.gameLog.getPlayerStats();  // ← already here
      showFullTimeOverlay(canvasWrapper, snap.score, snap.players, playerStats, () => {
        // ← INSERT season stats merge HERE before fatigue write
        // 1. Record player team fatigue from match result
        for (const player of snap.players) {
          if (player.teamId === currentMatchPlayerSide) {
            seasonState.fatigueMap.set(player.id, player.fatigue);
          }
        }
        // 2. Record player result, then sim AI fixtures...
      });
    }
  }
}, 500);
```

### Existing ScreenId pattern (main.ts:95-96)
```typescript
const ScreenId = {
  LOGIN: 'LOGIN', HUB: 'HUB', SQUAD: 'SQUAD',
  FIXTURES: 'FIXTURES', TABLE: 'TABLE', TACTICS: 'TACTICS', MATCH: 'MATCH'
  // ADD: STATS: 'STATS', PLAYER_PROFILE: 'PLAYER_PROFILE'
} as const;
type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];
```

### Existing screen routing pattern (main.ts:156-170)
```typescript
function showScreen(screen: ScreenId): void {
  const screenMap: Record<string, string> = {
    LOGIN: 'login-screen', HUB: 'hub-screen', SQUAD: 'squad-screen',
    FIXTURES: 'fixtures-screen', TABLE: 'table-screen', TACTICS: 'tactics-screen', MATCH: 'pitch-area',
    // ADD: STATS: 'stats-screen', PLAYER_PROFILE: 'player-profile-screen'
  };
  // ...existing display toggle logic
}
```

### Existing nav tab pattern (index.html:1374-1380)
```html
<nav id="nav-tabs" style="...">
  <button id="nav-hub"      class="nav-tab" data-screen="HUB">Hub</button>
  <button id="nav-squad"    class="nav-tab" data-screen="SQUAD">Squad</button>
  <!-- ADD: <button id="nav-stats" class="nav-tab" data-screen="STATS">Stats</button> -->
  <button id="nav-tactics"  class="nav-tab" data-screen="TACTICS">Tactics</button>
  <button id="nav-fixtures" class="nav-tab" data-screen="FIXTURES">Fixtures</button>
  <button id="nav-table"    class="nav-tab" data-screen="TABLE">Table</button>
  <button id="nav-logout"   ...>Log Out</button>
</nav>
```

### Existing MAP_TAG serialization (server/serialize.ts)
```typescript
// No changes needed — mapReplacer auto-handles any Map instance
// The new playerSeasonStats: Map<string, PlayerSeasonStats> on SeasonState
// will be serialized/deserialized automatically by existing replacer/reviver.
```

### Existing TableScreen class pattern (src/ui/screens/tableScreen.ts)
```typescript
// Follow this exact pattern for StatsScreen:
export class TableScreen {
  private container: HTMLElement;
  constructor(container: HTMLElement) { this.container = container; ... }
  update(state: SeasonState, playerTeamId: string): void { ... rebuild innerHTML ... }
  getElement(): HTMLElement { return this.container; }
}
```

### Top scorers computation
```typescript
// Flatten all teams' players, join with season stats, sort
function getTopScorers(state: SeasonState, limit = 20): TopScorerRow[] {
  const rows: TopScorerRow[] = [];
  for (const team of state.teams) {
    for (const player of team.squad) {
      const stats = state.playerSeasonStats?.get(player.id);
      if (!stats || stats.goals === 0) continue;
      rows.push({
        name: player.name ?? player.id,
        teamName: team.name,
        goals: stats.goals,
        assists: stats.assists,
        apps: stats.appearances,
        goalsPerGame: stats.appearances > 0 ? stats.goals / stats.appearances : 0,
      });
    }
  }
  // Tiebreak: goals DESC, assists DESC, apps DESC
  return rows.sort((a, b) =>
    b.goals - a.goals || b.assists - a.assists || b.apps - a.apps
  ).slice(0, limit);
}
```

### Squad screen inline stat columns
```typescript
// In squadScreen.ts render() — add 3 columns after existing attribute columns
const stats = seasonStats?.get(p.id);
const goals   = stats?.goals        ?? 0;
const assists = stats?.assists      ?? 0;
const apps    = stats?.appearances  ?? 0;
// Column header additions: 'GOL', 'AST', 'APP'
// Row cell additions: goals, assists, apps
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| quickSimMatch returns score only | quickSimMatch returns score + PlayerLogStats | Phase 8 | All 19 AI matches contribute to top scorers table |
| No season stats | playerSeasonStats map on SeasonState | Phase 8 | Per-player season data persisted across matchdays |

**Not deprecated — still applies:**
- MAP_TAG sentinel: still the correct serialization pattern for any new Map on SeasonState
- Screen class pattern (TableScreen): still the correct pattern for new UI screens
- innerHTML re-render: still the correct UI update strategy (no VDOM needed for this scale)

---

## Open Questions

1. **Minutes Played for Substitutes**
   - What we know: `getPlayerStats()` only includes players who generate events; substitutes who were on the bench but never subbed on, or players subbed on who never touched the ball, won't appear.
   - What's unclear: Should minutes played be tracked precisely (requires recording when each sub occurred) or estimated (starters = 90 mins, bench players = 0 until improved)?
   - Recommendation: For v1, count `appearances` only for players in `getPlayerStats()` (event-active players). Document as known limitation. Minutes = appearances × 90 is a reasonable first approximation.

2. **Team Color Palette for Avatar**
   - What we know: AI teams have no stored color; only the ID (e.g., `ai-team-3`) and name are available.
   - What's unclear: Should colors be generated at season creation and stored, or derived deterministically at display time?
   - Recommendation: Derive deterministically at display time using a fixed palette of 20 colors indexed by team order in `state.teams`. This requires no new state and no migration.

3. **Match History Drill-down Storage**
   - What we know: The profile page shows per-season stats summary; clicking a stat shows per-match breakdown.
   - What's unclear: Per-match breakdown requires storing a list of per-match stats per player — not just season totals. This is additional state (`matchHistory: PlayerMatchStats[]`) on top of `PlayerSeasonStats`.
   - Recommendation: Include a `matchHistory` array in `PlayerSeasonStats` from the start (even if the drill-down UI is built last). Each `mergeMatchStats` call appends a snapshot. This avoids a schema change mid-phase.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection — `src/simulation/match/gameLog.ts` (PlayerLogStats interface, getPlayerStats method)
- Direct codebase inspection — `src/season/season.ts` (SeasonState interface, simOneAIFixture, startNewSeason)
- Direct codebase inspection — `src/season/quickSim.ts` (QuickSimResult, quickSimMatch)
- Direct codebase inspection — `src/main.ts:595-625` (fullTimePoll hook, existing fatigue capture)
- Direct codebase inspection — `server/serialize.ts` (MAP_TAG pattern)
- Direct codebase inspection — `src/ui/screens/tableScreen.ts` (screen class pattern)
- Direct codebase inspection — `src/ui/screens/squadScreen.ts` (dark theme palette, sort column pattern)
- Direct codebase inspection — `index.html:1373-1381` (nav tab structure)
- Direct codebase inspection — `src/simulation/types.ts:298-318` (PlayerState fields)

### Secondary (MEDIUM confidence)
- HTML Canvas 2D API for avatar drawing — browser built-in, well-established

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing
- Architecture: HIGH — patterns verified directly from codebase; analogous to existing screens
- Pitfalls: HIGH — identified from direct code inspection (getPlayerStats switch, MAP_TAG, startNewSeason spread, yellowCard absence)

**Research date:** 2026-03-07
**Valid until:** Stable — this phase builds on a stable codebase with no external library dependencies

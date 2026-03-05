# Phase 3: Management Shell - Research

**Researched:** 2026-03-05
**Domain:** Season management, league simulation, screen navigation, squad selection, procedural name generation
**Confidence:** HIGH (all findings derive from existing codebase analysis; no external library decisions required)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**AI team simulation**
- All 19 AI fixtures quick-sim using the full headless match engine (no rendering) — authentic results from player attributes and personality, consistent with what the player watches
- All fixtures on the same matchday resolve together — player plays their match, all AI fixtures resolve, table updates as a batch
- 20 teams split into quality tiers (strong, mid, weak) at season generation — attribute ranges differ per tier, creating a believable table spread
- AI teams use a fixed formation (4-4-2) for now — AI manager preferred formations is a deferred idea for a future phase

**App navigation**
- Season Hub is the home screen — shows current league position, next fixture, last result, and navigation buttons (Squad / Table / Fixtures / Kick Off)
- Top nav tabs: Hub | Squad | Fixtures | Table — all screens reachable in one click
- Match → full-time overlay (existing fullTimeOverlay) → "Continue" → Hub (table already updated)
- The current match canvas + tactics board occupy the "match" view; nav tabs are hidden during a live match

**Squad selection**
- Squad screen has a toggle per player: Starting XI / Bench / Not Selected
- Manager sets lineup on the Squad screen, navigates to Tactics to confirm roles and duties, then kicks off
- Validation: "Kick Off" blocked if lineup is invalid (must have exactly 11 starters including 1 GK, and 5 bench)
- Inline warning shown when validation fails — no popup/modal
- Fatigue persists between matches within a season — end-of-match fatigue becomes the player's starting fatigue for the next match (partial recovery per matchday, Claude's discretion on the curve)
- Squad rotation is meaningful: resting players matters

**Player data model**
- Add `age: number` to PlayerState — display-only in Phase 3, no mechanic effect
- Add `height: number` (cm) to PlayerState — display-only in Phase 3, shown on squad screen (e.g. 181cm)
- Fitness on squad screen = residual fatigue carried from last match — no separate fitness stat
- Personality traits are HIDDEN from the manager — squad screen shows only: age, height, position, and skill attributes (pace, shooting, passing, dribbling, tackling, aerial, strength, stamina, positioning, vision)
- Player names procedurally generated (SQD-06) — nationality-weighted name lists, Claude's discretion on implementation

### Claude's Discretion
- Fatigue recovery curve between matchdays (how much fatigue clears per day/matchday gap)
- Season fixture scheduling algorithm (round-robin, home/away balance)
- Quality tier attribute ranges for AI teams
- Player name generation implementation
- Squad screen visual layout and information density
- Fixture list display format (calendar vs list)

### Deferred Ideas (OUT OF SCOPE)
- Exhibition Match — sandboxed match with no persistence
- AI manager preferred formations
- Trait/personality discovery UI
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SQD-01 | Squad screen displays all players with attributes, personality traits, position, age, and fitness | Existing SquadPanel + SquadEntry extension; add age/height fields to PlayerState; toggle UI pattern |
| SQD-02 | Manager selects starting 11 and bench (5-7 subs) before each match | Toggle state machine on SquadEntry; validation: 11 starters incl. 1 GK + exactly 5 bench; Kick Off gate |
| SQD-03 | Fixture list generated as round-robin schedule for 20-team league | Berger algorithm (canonical round-robin); new `src/season/` module; 38-matchday schedule |
| SQD-04 | League table tracks points, wins, draws, losses, goals for/against, goal difference | LeagueTable data structure; update after each result batch; sort by pts, gd, gf |
| SQD-05 | Season ends with champion declared and squad carried forward to next season | Season state machine: active → complete; champion screen; reset fixtures + recover fatigue |
| SQD-06 | Player names procedurally generated | Nationality-weighted first/last name lists; seeded RNG; no external dependency |
</phase_requirements>

---

## Summary

Phase 3 adds a complete season management shell around the existing match engine. The technical work splits cleanly into three domains: (1) a new `src/season/` module that owns all season-level state — fixture generation, league table, AI squad creation, and the season state machine; (2) screen routing added to `src/main.ts` turning the single-screen app into a five-view state machine (hub / squad / fixtures / table / match); and (3) extensions to existing UI components — SquadPanel gets a pre-match selection toggle, fullTimeOverlay gets a "Continue" callback, and new HTML screens are added to `index.html` for Hub, Fixtures, and Table views.

The key architectural insight is that the AI quick-sim path reuses `SimulationEngine` headlessly. The engine already runs without a renderer; the AI runner drives it to FULL_TIME, reads the score, and discards the rest. This is the lowest-risk implementation path and guarantees AI results are mechanically identical to watched matches.

The primary risk area is performance: quick-simming 19 matches per matchday at 5400 ticks each could block the main thread for several seconds. This MUST be addressed by running quick-sims synchronously but in a deferred batch (after player's match resolves), or by chunking via `setTimeout` / `queueMicrotask`. Given the project is a desktop browser app with no Web Worker infrastructure, the recommended approach is a synchronous batch run immediately after full-time, but with a spinner/progress indicator so the UI does not appear frozen.

**Primary recommendation:** Build `src/season/` as a pure data module (no DOM dependencies), keep all AI simulation logic in it, and route the existing engine + game loop through a thin `MatchCoordinator` that bridges season state to match execution and back.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vitest | 3.2.3 | Unit testing | Already in project; all existing tests use it |
| TypeScript | 5.9.3 | Type safety | Already in project; `erasableSyntaxOnly: true` enforced |
| Vite | 7.3.1 | Dev server / build | Already in project |
| seedrandom | 3.0.5 | Seeded RNG | Already a dependency; used in engine for deterministic matches |

### No New Dependencies Required
All Phase 3 features can be built with the existing stack. Round-robin scheduling, name generation, league table sorting, and AI quick-sim are pure TypeScript logic with no external library needs.

**Installation:**
```bash
# No new packages needed
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── season/
│   ├── season.ts           # SeasonState, SeasonConfig, createSeason()
│   ├── season.test.ts      # Unit tests for season creation and lifecycle
│   ├── fixtures.ts         # generateFixtures() round-robin, Fixture type
│   ├── fixtures.test.ts    # Schedule generation tests
│   ├── leagueTable.ts      # LeagueTable, updateTable(), sortTable()
│   ├── leagueTable.test.ts # Table update and sort tests
│   ├── teamGen.ts          # createAITeam(tier), quality tier attribute ranges
│   ├── teamGen.test.ts     # Attribute range tests per tier
│   ├── nameGen.ts          # generatePlayerName(rng), nationality-weighted lists
│   └── nameGen.test.ts     # Name generation tests
├── simulation/
│   └── types.ts            # ADD age: number, height: number to PlayerState
└── ui/
    ├── screens/
    │   ├── hubScreen.ts     # Hub HTML builder + update logic
    │   ├── fixturesScreen.ts # Fixtures list HTML builder
    │   └── tableScreen.ts   # League table HTML builder
    └── panels/
        └── squadPanel.ts    # EXTEND: add selection toggle (Starting XI / Bench / Not Selected)
```

### Pattern 1: Screen State Machine in main.ts

**What:** A simple string-literal union type drives which screen is visible. One `showScreen(name)` function hides all views and shows the target.

**When to use:** Always — this is the navigation backbone. All nav tab clicks and the "Continue" button route through it.

**Example:**
```typescript
// const-object pattern (erasableSyntaxOnly compatible)
export const Screen = {
  HUB: 'HUB',
  SQUAD: 'SQUAD',
  FIXTURES: 'FIXTURES',
  TABLE: 'TABLE',
  MATCH: 'MATCH',
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];

let currentScreen: Screen = Screen.HUB;

function showScreen(screen: Screen): void {
  // Hide all screen containers, show target
  const containers: Record<Screen, HTMLElement | null> = {
    HUB: document.getElementById('hub-screen'),
    SQUAD: document.getElementById('squad-screen'),
    FIXTURES: document.getElementById('fixtures-screen'),
    TABLE: document.getElementById('table-screen'),
    MATCH: document.getElementById('pitch-area'),
  };
  for (const [key, el] of Object.entries(containers)) {
    if (el) el.style.display = key === screen ? '' : 'none';
  }
  // Hide nav tabs during match
  const navEl = document.getElementById('nav-tabs');
  if (navEl) navEl.style.display = screen === Screen.MATCH ? 'none' : '';
  currentScreen = screen;
}
```

### Pattern 2: Headless AI Quick-Sim

**What:** Drive `SimulationEngine` to FULL_TIME without a renderer. Read final score. Discard snapshot.

**When to use:** After the player's match resolves — one call per AI fixture, batched synchronously.

**Example:**
```typescript
import { SimulationEngine } from '../simulation/engine.ts';
import type { MatchConfig } from '../simulation/engine.ts';
import { MatchPhase } from '../simulation/types.ts';

export function quickSimMatch(config: MatchConfig): { homeGoals: number; awayGoals: number } {
  const engine = new SimulationEngine(config);
  const FIXED_DT_MS = 1000 / 30;

  // Drive to FULL_TIME — engine exits FULL_TIME immediately once set
  while (engine.getSnapshot().matchPhase !== MatchPhase.FULL_TIME) {
    engine.tick(FIXED_DT_MS);
  }

  const snap = engine.getSnapshot();
  return { homeGoals: snap.score[0], awayGoals: snap.score[1] };
}
```

### Pattern 3: Berger Round-Robin Schedule

**What:** The canonical algorithm for generating balanced round-robin tournament schedules with N teams. Produces N-1 matchdays for an even number of teams (20 teams = 19 matchdays × 2 halves = 38 total).

**When to use:** `generateFixtures()` in `src/season/fixtures.ts`.

**Example:**
```typescript
export interface Fixture {
  readonly matchday: number;    // 1..38
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  result?: { homeGoals: number; awayGoals: number };
}

export function generateFixtures(teamIds: string[], seed: string): Fixture[] {
  // Berger algorithm: fix team[0], rotate remaining N-1 teams
  const n = teamIds.length; // must be even (20)
  const fixed = teamIds[0]!;
  const rotating = teamIds.slice(1);
  const fixtures: Fixture[] = [];

  for (let round = 0; round < n - 1; round++) {
    const circle = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const home = round % 2 === 0 ? circle[i]! : circle[n - 1 - i]!;
      const away = round % 2 === 0 ? circle[n - 1 - i]! : circle[i]!;
      fixtures.push({ matchday: round + 1, homeTeamId: home, awayTeamId: away });
    }
    // Rotate: last element moves to front of rotating array
    rotating.unshift(rotating.pop()!);
  }

  // Second half: swap home/away for matchdays 20..38
  const secondHalf = fixtures.map(f => ({
    ...f,
    matchday: f.matchday + (n - 1),
    homeTeamId: f.awayTeamId,
    awayTeamId: f.homeTeamId,
  }));

  return [...fixtures, ...secondHalf];
}
```

### Pattern 4: League Table Data Structure

**What:** A record keyed by teamId, updated after each result batch. Sorted by points → goal difference → goals for.

**Example:**
```typescript
export interface TeamRecord {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export function updateTable(table: TeamRecord[], homeId: string, awayId: string, homeGoals: number, awayGoals: number): TeamRecord[] {
  return table.map(row => {
    if (row.teamId !== homeId && row.teamId !== awayId) return row;
    const isHome = row.teamId === homeId;
    const scored = isHome ? homeGoals : awayGoals;
    const conceded = isHome ? awayGoals : homeGoals;
    const won = scored > conceded ? 1 : 0;
    const drawn = scored === conceded ? 1 : 0;
    const lost = scored < conceded ? 1 : 0;
    return {
      ...row,
      played: row.played + 1,
      won: row.won + won,
      drawn: row.drawn + drawn,
      lost: row.lost + lost,
      goalsFor: row.goalsFor + scored,
      goalsAgainst: row.goalsAgainst + conceded,
      points: row.points + (won ? 3 : drawn ? 1 : 0),
    };
  });
}

export function sortTable(table: TeamRecord[]): TeamRecord[] {
  return [...table].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.goalsFor - a.goalsAgainst;
    const gdB = b.goalsFor - b.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return b.goalsFor - a.goalsFor;
  });
}
```

### Pattern 5: Quality Tier Attribute Generation

**What:** Three tiers — strong / mid / weak — with different attribute baselines and jitter ranges. Player attributes are seeded per player using the existing `jitterAttributes()` pattern from `engine.ts`.

**Recommended tier ranges (Claude's discretion):**
```typescript
export const TIER_CONFIGS = {
  strong: { base: 0.75, spread: 0.08 },  // top-6 quality
  mid:    { base: 0.60, spread: 0.10 },  // mid-table
  weak:   { base: 0.45, spread: 0.10 },  // relegation zone
} as const;

// 20-team distribution: 4 strong, 10 mid, 6 weak
// (creates a plausible table spread: strong teams 70+ pts, weak teams 30-40 pts)
```

### Pattern 6: Procedural Name Generation

**What:** Separate first/last name lists per nationality group. RNG selects nationality weight, then picks from that group's lists. No external library.

**Recommended nationality groups (Claude's discretion):**
- English, Spanish, French, German, Brazilian — covers common football name feel
- 3 groups minimum to create variety; each group has ~20 first names + ~20 last names
- Names stored as a static `const` array in `nameGen.ts` — no file I/O

**Example structure:**
```typescript
const NAME_POOLS = {
  english: {
    first: ['James', 'Jack', 'Tom', 'Liam', 'Harry', ...],
    last:  ['Smith', 'Jones', 'Taylor', 'Brown', 'Evans', ...],
  },
  spanish: {
    first: ['Carlos', 'Miguel', 'Diego', 'Luis', 'Alejandro', ...],
    last:  ['Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Ramirez', ...],
  },
  // ...
} as const;

export function generatePlayerName(rng: () => number): string {
  // Select nationality weighted: 40% english, 25% spanish, 20% french, 15% other
  const pool = selectNationality(rng);
  const first = pool.first[Math.floor(rng() * pool.first.length)]!;
  const last  = pool.last[Math.floor(rng() * pool.last.length)]!;
  return `${first} ${last}`;
}
```

### Pattern 7: Fatigue Recovery Curve (Claude's Discretion)

**What:** Partial recovery per matchday gap. End-of-match fatigue is the player's starting fatigue for the next match.

**Recommended curve:**
```typescript
// Recovery per matchday gap
// 1-day gap (mid-week fixture): recover 25% of remaining fatigue
// 7-day gap (standard week): recover 75% of remaining fatigue
// Never fully recover in-season (reflects cumulative wear)
export function recoverFatigue(currentFatigue: number, daysSinceLastMatch: number): number {
  const recoveryRate = Math.min(0.75, daysSinceLastMatch * 0.12);
  return Math.max(0, currentFatigue * (1 - recoveryRate));
}
// Example: fatigue=0.60, 7 days → 0.60 * 0.25 = 0.15 (well-rested)
// Example: fatigue=0.60, 3 days → 0.60 * 0.64 = 0.38 (partial recovery)
```

### Anti-Patterns to Avoid

- **Inline season state in main.ts:** Season state will grow significantly (19 teams × 16-man squads × 38 fixtures). Keep it in `src/season/` with a clean interface.
- **Running AI quick-sim on the render thread without deferral:** 19 × 5400 ticks = ~102,600 engine ticks. At 0.1ms/tick this is ~10 seconds. Must defer or batch.
- **Mutating PlayerState directly:** `PlayerState` is readonly throughout the engine. Season state tracks fatigue as a separate mutable `Map<playerId, number>` that is applied when building `MatchConfig`.
- **Generating all 20 team rosters inside engine.ts:** `createMatchRosters()` generates 2 teams for the demo match. Phase 3 needs 20 teams. Generalize into `teamGen.ts` in `src/season/`, not inside the engine module.
- **Using TypeScript enum:** Project enforces `erasableSyntaxOnly: true`. Always use the const-object pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded random numbers | Custom PRNG | `seedrandom` (already a dep) | Already imported in engine; consistent API |
| Match simulation | Custom headless runner | `SimulationEngine` driven to FULL_TIME | Engine already handles all physics, AI, state transitions |
| Player attribute jitter | New random spread logic | `jitterAttributes()` from engine.ts | Same function, same spread, consistent with demo match |
| Type runtime validation | Manual type guards | `zod` (already a dep) | Available if season state needs serialization/deserialization |

**Key insight:** The match engine is already a headless-capable black box. The quick-sim runner is ~15 lines. Everything complex is already built.

---

## Common Pitfalls

### Pitfall 1: Main-Thread Blocking During AI Quick-Sim

**What goes wrong:** Simulating 19 AI matches synchronously freezes the browser tab for several seconds, appearing as a hang.

**Why it happens:** 19 matches × 5400 ticks = ~102,600 engine ticks. At 30 ticks/sec simulation time this represents 3420 simulated match-seconds, but CPU time at ~100-200 ticks/ms is still 0.5-1 seconds. With 19 matches it scales to 10-20 seconds on slower hardware.

**How to avoid:** Run the AI simulation batch immediately after FULL_TIME, before navigating to Hub. Show a "Simulating..." indicator in the fullTimeOverlay during this phase. Use a single synchronous batch (no chunking needed if measured < 2 seconds on target hardware). Add a performance test that asserts one quick-sim completes in < 500ms.

**Warning signs:** UI appears frozen after clicking "Continue" on full-time overlay.

### Pitfall 2: Season State Scattered Across Modules

**What goes wrong:** Team squads, fixture results, fatigue maps, and table data end up stored in different module-level variables across `main.ts`, `engine.ts`, and `ui/` files.

**Why it happens:** Convenience — it's easy to add a variable near where it's used. But season state must persist across the entire season loop (38 matchdays).

**How to avoid:** A single `SeasonState` object owned by `src/season/season.ts`. All reads and updates go through it. Pass it as a parameter to renderers and coordinators — no global state outside the season module.

### Pitfall 3: Fatigue Persisting into AI Teams' Matches

**What goes wrong:** AI teams accumulate fatigue from quick-simmed matches, but since AI teams are created fresh each match (no persistence), the fatigue carry-forward only applies to the player's team.

**Why it happens:** The engine always starts fresh with whatever `fatigue` values are in `MatchConfig.homeRoster/awayRoster`. If AI team squads are created with `fatigue: 0` for every match, they never tire, making them unbalanced opponents in late-season.

**How to avoid:** Track fatigue for all 20 team squads in `SeasonState`. Apply the same `recoverFatigue()` curve to AI teams between matchdays. AI teams should tire in the same way as the player's team.

### Pitfall 4: Round-Robin Schedule With Odd Team Count

**What goes wrong:** The Berger algorithm requires an even team count. If a team is accidentally removed or a dummy team is not added, the algorithm produces incorrect results.

**Why it happens:** Off-by-one in team array construction.

**How to avoid:** Assert `teamIds.length % 2 === 0` at the start of `generateFixtures()`. With 20 teams this should always be true, but the guard makes the error explicit.

### Pitfall 5: Squad Validation Allowing GK on Bench

**What goes wrong:** Validation passes with 10 outfield starters + 1 GK + 5 bench players that include a second GK, but the bench GK is never usable in-season (no sub logic yet). More critically, validation could pass with 0 GKs if the player fills the GK slot with an outfield player during squad selection.

**Why it happens:** Validation only counts starters total (11) without checking the GK specifically.

**How to avoid:** Validation explicitly checks: `starters.length === 11 && starters.some(p => p.role === 'GK') && bench.length === 5`.

### Pitfall 6: PlayerState is Readonly — Cannot Mutate Fatigue

**What goes wrong:** Attempting to write `player.fatigue = newValue` causes a TypeScript error because `PlayerState` fields are `readonly`.

**Why it happens:** `PlayerState` is an immutable record by design — the engine produces new snapshots each tick.

**How to avoid:** Season-level fatigue is stored separately as `Map<playerId, number>` in `SeasonState`. When building `MatchConfig` for a match, spread the player record with the season fatigue value: `{ ...player, fatigue: seasonFatigue.get(player.id) ?? 0 }`.

---

## Code Examples

Verified patterns from existing codebase:

### Const-Object Enum Pattern (project requirement)
```typescript
// Source: src/simulation/types.ts (confirmed pattern)
export const Screen = {
  HUB: 'HUB',
  SQUAD: 'SQUAD',
  FIXTURES: 'FIXTURES',
  TABLE: 'TABLE',
  MATCH: 'MATCH',
} as const;
export type Screen = (typeof Screen)[keyof typeof Screen];
```

### Extending PlayerState With New Fields
```typescript
// Source: src/simulation/types.ts (current definition)
// ADD to existing interface — both fields are display-only in Phase 3
export interface PlayerState {
  readonly id: string;
  readonly teamId: TeamId;
  // ... (existing fields)
  readonly name?: string;
  readonly age?: number;     // ADD: display-only, no mechanic effect in Phase 3
  readonly height?: number;  // ADD: centimetres, e.g. 181, display-only
}
// Optional (?) preserves backward compatibility with all existing tests
```

### Engine Headless Drive Pattern
```typescript
// Source: src/simulation/engine.ts + src/loop/gameLoop.ts (confirmed patterns)
// SimulationEngine.tick(dt) accepts a dt in milliseconds (same as game loop)
// FIXED_DT_MS = 1000/30 ≈ 33.33ms
// MatchPhase.FULL_TIME is the terminal state

const engine = new SimulationEngine(config);
const FIXED_DT_MS = 1000 / 30;
while (engine.getSnapshot().matchPhase !== MatchPhase.FULL_TIME) {
  engine.tick(FIXED_DT_MS);
}
const { score } = engine.getSnapshot();
```

### SquadPanel Selection Toggle Extension
```typescript
// Source: src/ui/panels/squadPanel.ts (existing class to extend)
// Current SquadEntry has: name, role, number, duty, attributes?, personality?, fatigue?
// Phase 3 adds: selection state, age, height

export type SelectionState = 'starter' | 'bench' | 'unselected';

export interface SquadEntry {
  name: string;
  role: string;
  number: number;
  duty: Duty;
  attributes?: PlayerAttributes;
  fatigue?: number;
  age?: number;        // ADD
  height?: number;     // ADD (centimetres)
  selection?: SelectionState;  // ADD — for pre-match squad screen
}
```

### fullTimeOverlay "Continue" Callback
```typescript
// Source: src/ui/fullTimeOverlay.ts (existing show/hide/isVisible API)
// Extend show() with an optional onContinue callback
export function show(
  container: HTMLElement,
  score: readonly [number, number],
  players: readonly PlayerState[],
  statsMap: Map<string, PlayerLogStats>,
  onContinue?: () => void,   // ADD: called when user clicks Continue
): void {
  // ... existing build logic ...
  // Replace "Click anywhere to close" with a "Continue" button
  // Button click: hide() then onContinue?.()
}
```

### Seeded RNG (existing dependency)
```typescript
// Source: src/simulation/math/random.ts (createRng already exists in engine)
// seedrandom is already a project dependency
import seedrandom from 'seedrandom';
const rng = seedrandom('season-2024-teamA');
const value = rng(); // 0..1
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-screen app with match only | Multi-screen state machine | Phase 3 | Navigation model must be built fresh |
| Two test teams (home/away) | 20 teams with quality tiers | Phase 3 | `createMatchRosters()` must be generalized |
| No persistent fatigue | Fatigue carries between matches | Phase 3 | Season state must track per-player fatigue map |
| No player names | Procedurally generated names | Phase 3 (SQD-06) | nameGen.ts needed; PlayerState.name already optional |

**Deprecated/outdated for Phase 3:**
- `createMatchRosters()`: Still valid for the demo/test match, but will be superseded by `createAITeam(tier)` for season teams. Keep it for tests.
- fullTimeOverlay dismiss-on-click: Replace "click anywhere to close" with an explicit "Continue" button that triggers the Hub navigation flow.

---

## Open Questions

1. **Quick-sim performance on target hardware**
   - What we know: 19 × 5400 ticks at ~30-100 ticks/ms on modern hardware = roughly 0.5-1 second
   - What's unclear: The project has no performance benchmarks for a single engine run-to-completion
   - Recommendation: Add a quick-sim performance test in Wave 0 or early Wave 1 that asserts completion < 500ms. If it exceeds 1 second, chunk with `setTimeout(0)` between batches.

2. **AI matchday ordering relative to player's match**
   - What we know: Decisions says "All fixtures on the same matchday resolve together — player plays their match, all AI fixtures resolve, table updates as a batch"
   - What's unclear: Should the AI fixtures resolve before or after the player kicks off? Before would let the player see updated standings, but feels unnatural. After (post-fulltime) is cleaner UX.
   - Recommendation: AI fixtures resolve immediately after FULL_TIME of player's match, before navigating to Hub. Table shown on Hub reflects all results.

3. **Season second year: do AI team squads regenerate or persist?**
   - What we know: SQD-05 says "squad carries forward into a new season with reset fixtures" — this refers to the player's squad. AI teams are not specified.
   - What's unclear: Whether AI teams regenerate fresh or persist with accumulated fatigue/names across seasons.
   - Recommendation: Regenerate AI squads fresh at new season start with the same tier assignments. Player's squad carries forward. Simplest path, revisit in Phase 4 when player development makes continuity more meaningful.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.3 |
| Config file | `vitest.config.ts` or `vite.config.ts` (check root) — project uses `"test": "vitest run"` in package.json |
| Quick run command | `npx vitest run src/season/` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SQD-01 | Squad screen shows all players with correct fields | unit | `npx vitest run src/ui/panels/squadPanel` | Partial — squadPanel.ts exists, test needed |
| SQD-02 | Starting XI + bench selection validation (11+GK+5 bench) | unit | `npx vitest run src/season/` | No — Wave 0 |
| SQD-03 | Fixture list generates 38 matchdays, each team appears 2× per matchday, home/away balanced | unit | `npx vitest run src/season/fixtures` | No — Wave 0 |
| SQD-04 | Table updates correctly after win/draw/loss; sort by pts then GD then GF | unit | `npx vitest run src/season/leagueTable` | No — Wave 0 |
| SQD-05 | Season end detects champion, season 2 starts with reset fixtures, player squad carries forward | unit | `npx vitest run src/season/season` | No — Wave 0 |
| SQD-06 | Name generator produces valid first+last names from nationality pools | unit | `npx vitest run src/season/nameGen` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/season/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/season/fixtures.test.ts` — covers SQD-03
- [ ] `src/season/leagueTable.test.ts` — covers SQD-04
- [ ] `src/season/season.test.ts` — covers SQD-05
- [ ] `src/season/nameGen.test.ts` — covers SQD-06
- [ ] `src/season/teamGen.test.ts` — attribute ranges per tier
- [ ] Squad validation unit test (inline in season.test.ts or separate) — covers SQD-02
- [ ] Quick-sim performance test (one engine run to FULL_TIME < 500ms) — risk mitigation

---

## Sources

### Primary (HIGH confidence)
- `src/simulation/engine.ts` — SimulationEngine API, MatchConfig, createMatchRosters(), jitterAttributes()
- `src/simulation/types.ts` — PlayerState, MatchPhase, const-object patterns, PlayerAttributes
- `src/simulation/ai/fatigue.ts` — accumulateFatigue() rate constants and curve design
- `src/ui/panels/squadPanel.ts` — SquadPanel class, SquadEntry interface
- `src/ui/fullTimeOverlay.ts` — show/hide/isVisible API
- `src/loop/gameLoop.ts` — FIXED_DT_MS, tick contract, pause mechanism
- `index.html` — existing CSS classes, panel layout, HTML element IDs
- `src/main.ts` — current single-screen routing, how engine/renderer/panels connect
- `package.json` — confirmed: vitest 3.2.3, seedrandom 3.0.5, no missing deps

### Secondary (MEDIUM confidence)
- Berger algorithm for round-robin scheduling — well-documented combinatorics algorithm, verified against multiple sources; no library needed
- Quality tier attribute ranges — derived from existing archetype values in engine.ts (aggressiveDefender ~0.7-0.82, maverick ~0.82-0.88) as reference points for "strong" tier ceiling

### Tertiary (LOW confidence)
- Quick-sim performance estimate (0.5-1 second for 19 matches) — extrapolated from engine constants (5400 ticks/match), no direct benchmark in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all libraries confirmed in package.json
- Architecture: HIGH — derived directly from existing code patterns and integration points documented in CONTEXT.md
- Pitfalls: HIGH for correctness pitfalls (readonly PlayerState, GK validation); MEDIUM for performance (estimate only)
- Fixture algorithm: HIGH — Berger algorithm is well-established mathematics

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable codebase; valid until Phase 3 implementation begins deviating from this analysis)

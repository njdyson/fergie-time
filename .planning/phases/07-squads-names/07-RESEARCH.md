# Phase 7: Squads + Names - Research

**Researched:** 2026-03-06
**Domain:** Squad expansion (16 to 25 players), realistic name generation, matchday selection UI
**Confidence:** HIGH

## Summary

Phase 7 expands team rosters from 16 to 25 players and replaces the procedural name generator with realistic nationality-weighted names fetched from the randomuser.me API. The current codebase has a clean separation: `teamGen.ts` creates squads with roles from `nameGen.ts`, `season.ts` orchestrates team creation, and `squadScreen.ts` renders the UI with selection toggles. All of these have hardcoded assumptions about 16-player squads and 5-player benches that must change.

The randomuser.me API is free, supports nationality filtering via `?nat=gb,es,fr,de,br`, can return up to 5000 results per request, and supports seeded requests for reproducibility. The existing nationality weights in `nameGen.ts` (40% English, 25% Spanish, 20% French, 10% German, 5% Brazilian) map directly to randomuser.me nationality codes (GB, ES, FR, DE, BR).

The key architectural decisions are: (1) fetch names at game creation time and cache in the save state (not a separate DB table, since the server is just a filing cabinet), (2) expand the ROLES array from 16 to 25 with Premier League-realistic positional distribution, (3) update `validateSquadSelection` and `squadScreen` for 18-man matchday squads (11+7), and (4) add a `shirtNumber` field to `PlayerState`.

**Primary recommendation:** Fetch 500 names from randomuser.me at game creation (enough for 20 teams x 25 players), cache them in season state, and fall back to the existing `nameGen.ts` pool if the API is unreachable.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SQD2-01 | 25-man squads for all teams (up from 16) | Expand ROLES array to 25, update createAITeam and createMatchRosters, adjust SeasonTeam.squad comments |
| SQD2-02 | 18-man matchday squad selection (11 starters + 7 subs from 25) | Update validateSquadSelection (bench 5->7), update SquadScreen counters, update engine MatchConfig bench comments |
| SQD2-03 | Squad numbers editable per player (shirt numbers) | Add shirtNumber field to PlayerState, auto-assign 1-25, add inline edit UI in squadScreen |
| SQD2-04 | Squad screen updated for 25 players with matchday selection UI | SquadScreen already handles variable player counts via loop; update default selection logic and summary counters |
| NAME-01 | Fetch realistic names from randomuser.me at game creation, cached in DB | Fetch at season creation in createSeason, store in SeasonState (persisted via existing save/load), use ?nat= parameter |
| NAME-02 | Nationality-weighted name fetching (matching existing weightings) | Map existing weights to randomuser.me nat codes: GB(40%), ES(25%), FR(20%), DE(10%), BR(5%) |
| NAME-03 | Fallback to generic name pool if API unavailable | Existing nameGen.ts already works as fallback; wrap API call in try/catch, use generatePlayerName on failure |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| randomuser.me API | 1.4 | Realistic name generation | Free, no auth required, nationality filtering, seed support |
| fetch (built-in) | N/A | HTTP client for API calls | Built into all modern browsers, no extra dependency needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| seedrandom | ^3.0.5 | Deterministic RNG | Already in project, used for reproducible squad generation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| randomuser.me | faker.js | faker.js adds 2MB+ bundle size; randomuser.me is a network call at creation only |
| randomuser.me | Larger hardcoded pools | Less variety, still "procedurally obvious"; API gives real human names |
| Separate name_cache DB table | Names in SeasonState | Server is a filing cabinet (project decision); names travel with the save blob |

**Installation:**
No new packages needed. `fetch` is built into the browser. All squad changes are pure TypeScript refactoring.

## Architecture Patterns

### Recommended Project Structure
```
src/
  season/
    nameGen.ts           # Keep as fallback pool (NAME-03)
    nameService.ts       # NEW: fetch from randomuser.me + cache logic
    teamGen.ts           # Expand ROLES to 25, accept name list parameter
    season.ts            # Update createSeason to call nameService, update validation
  simulation/
    types.ts             # Add shirtNumber to PlayerState
    engine.ts            # Update bench comments (5 -> 7), no logic change needed
  ui/screens/
    squadScreen.ts       # 25 players, 11+7 selection, shirt number editing
```

### Pattern 1: Name Fetching at Creation Time
**What:** Fetch all 500 names needed for the league in a single batch at game creation, then distribute to teams.
**When to use:** During `createSeason()` flow in main.ts (or wherever new game is created).
**Example:**
```typescript
// nameService.ts
interface NameEntry {
  first: string;
  last: string;
  nationality: string;
}

const NAT_WEIGHTS: Array<{ code: string; weight: number }> = [
  { code: 'GB', weight: 0.40 },
  { code: 'ES', weight: 0.25 },
  { code: 'FR', weight: 0.20 },
  { code: 'DE', weight: 0.10 },
  { code: 'BR', weight: 0.05 },
];

async function fetchNames(count: number): Promise<NameEntry[]> {
  const natCodes = NAT_WEIGHTS.map(n => n.code).join(',');
  const url = `https://randomuser.me/api/?results=${count}&nat=${natCodes}&inc=name,nat`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`randomuser.me returned ${res.status}`);
  const data = await res.json();
  return data.results.map((r: any) => ({
    first: r.name.first,
    last: r.name.last,
    nationality: r.nat,
  }));
}
```

### Pattern 2: 25-Man Squad Role Distribution
**What:** Realistic Premier League squad composition with positional depth.
**When to use:** Replacing the 16-player ROLES array in teamGen.ts.
**Example:**
```typescript
// 25-man squad roles - Premier League realistic distribution
// Starters (11) - 4-4-2: GK, CB, CB, LB, RB, CDM, CM, LW, RW, ST, ST
// Bench (7): GK, CB, LB, CM, CAM, LW, ST
// Reserves (7): CB, RB, CDM, CM, RW, ST, GK
// Totals: 3 GK, 5 CB, 2 LB, 2 RB, 2 CDM, 4 CM, 1 CAM, 2 LW, 2 RW, 3 ST = 25
const ROLES_25: Role[] = [
  // Starters (11)
  'GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST', 'ST',
  // Matchday subs (7)
  'GK', 'CB', 'LB', 'CM', 'CAM', 'LW', 'ST',
  // Reserves (7)
  'CB', 'RB', 'CDM', 'CM', 'RW', 'ST', 'GK',
];
```

### Pattern 3: Graceful API Fallback
**What:** Try randomuser.me, fall back to existing procedural names if unreachable.
**When to use:** In nameService.ts.
**Example:**
```typescript
async function getNames(count: number, rng: () => number): Promise<string[]> {
  try {
    const entries = await fetchNames(count);
    return entries.map(e => `${e.first} ${e.last}`);
  } catch {
    // NAME-03: fallback to generic pool
    return Array.from({ length: count }, () => generatePlayerName(rng));
  }
}
```

### Anti-Patterns to Avoid
- **Fetching names per-team:** 20 separate API calls is slow and fragile. Fetch all 500 at once.
- **Storing names in a separate DB table:** Violates the "server is a filing cabinet" principle. Names are part of player state, already saved via SeasonState serialization.
- **Making createSeason async without updating all callers:** The function is currently synchronous. Making it async requires updating main.ts boot flow and season.test.ts.
- **Removing nameGen.ts:** Keep it as the fallback pool for NAME-03.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Realistic name generation | Custom name database | randomuser.me API | Real human name distributions, nationality-appropriate |
| Nationality weighting | Custom weighted random | API ?nat= parameter with proportional counts | Let the API handle distribution |
| Name caching | Custom cache layer | Store in PlayerState (already persisted) | Names only needed at creation time |

**Key insight:** Names are fetched once at game creation and become part of player state. No runtime caching needed -- the save system already handles persistence.

## Common Pitfalls

### Pitfall 1: Async Season Creation
**What goes wrong:** `createSeason()` is currently synchronous. Adding API fetch makes it async, breaking all callers.
**Why it happens:** fetch() is inherently async; cannot be avoided.
**How to avoid:** Separate name fetching from season creation. Fetch names first in main.ts, then pass them to createSeason as a parameter. Keep createSeason synchronous.
**Warning signs:** TypeScript errors about Promise<SeasonState> where SeasonState is expected.

### Pitfall 2: Hardcoded 16/5 Constants Throughout Codebase
**What goes wrong:** Many places assume 16-player squads and 5-player benches with hardcoded numbers.
**Why it happens:** The constants are inline, not centralized.
**How to avoid:** Search for all occurrences of `16`, `slice(11)`, `slice(11, 16)`, `bench.length !== 5`, `Bench: ${benchCount}/5` and update systematically.
**Warning signs:** Tests failing with "Expected 5 bench players, got 7" or similar.
**Known locations:**
- `season.ts:21` -- bench comment "5 players"
- `season.ts:28` -- squad comment "16 players"
- `season.ts:161-162` -- bench validation hardcoded to 5
- `season.test.ts:175-182` -- bench count tests expect 5
- `squadScreen.ts:101-110` -- default selection splits at 11/16
- `squadScreen.ts:172` -- UI shows "Bench: N/5"
- `main.ts:1361` -- opponent bench `slice(11, 16)`
- `engine.ts:66-68` -- bench comments say "up to 5"
- `engine.ts:184-185` -- createMatchRosters bench doc

### Pitfall 3: AI Quick-Sim Squad Selection
**What goes wrong:** `simOneAIFixture` in season.ts does `homeSquad.slice(0, 11)` for starters and `homeSquad.slice(11)` for bench. With 25 players, bench would be 14 players.
**Why it happens:** AI teams should pick an 18-man matchday squad, not use all 25 as bench.
**How to avoid:** AI matchday selection: first 11 are starters, next 7 are bench, remaining 7 are reserves (not in match).
**Warning signs:** AI teams having 14 substitutes available.

### Pitfall 4: Save Payload Size Increase
**What goes wrong:** 25 players x 20 teams = 500 players (up from 320). Save payload grows ~56%.
**Why it happens:** More player objects in SeasonState.
**How to avoid:** Already noted in STATE.md as a watch item. Monitor but don't optimize prematurely -- estimated 80-120KB is acceptable for SQLite TEXT column.
**Warning signs:** Slow save/load operations (unlikely at this scale).

### Pitfall 5: Shirt Number Conflicts
**What goes wrong:** Two players get the same shirt number, or numbers aren't persisted across saves.
**Why it happens:** No uniqueness enforcement if hand-editing is allowed.
**How to avoid:** Auto-assign 1-25 on creation, validate uniqueness on edit, store in PlayerState (already persisted).
**Warning signs:** Duplicate numbers visible on squad screen.

### Pitfall 6: createMatchRosters Player Team Bootstrap
**What goes wrong:** `createMatchRosters()` in engine.ts creates the initial player team with 16 players (11+5). This is used in main.ts for new game creation.
**Why it happens:** `createMatchRosters` is the bootstrap for the player's team before season starts.
**How to avoid:** Either expand `createMatchRosters` to 25 players, or create a separate `createPlayerTeam` function in teamGen.ts. The player team should also use realistic names.
**Warning signs:** Player team has 16 players while AI teams have 25.

## Code Examples

### Current PlayerState (needs shirtNumber field)
```typescript
// types.ts - ADD shirtNumber
export interface PlayerState {
  readonly id: string;
  readonly teamId: TeamId;
  // ... existing fields ...
  readonly name?: string;
  readonly age?: number;
  readonly height?: number;
  readonly shirtNumber?: number;  // NEW: 1-99, editable
}
```

### Updated validateSquadSelection
```typescript
// season.ts - update for 7-man bench
export function validateSquadSelection(
  selection: SquadSelection,
): { valid: boolean; reason?: string } {
  if (selection.starters.length !== 11) {
    return { valid: false, reason: `Expected 11 starters, got ${selection.starters.length}` };
  }
  const hasGK = selection.starters.some(p => p.role === 'GK');
  if (!hasGK) {
    return { valid: false, reason: 'No GK in starters — at least one goalkeeper is required' };
  }
  if (selection.bench.length !== 7) {
    return { valid: false, reason: `Expected 7 bench players, got ${selection.bench.length}` };
  }
  return { valid: true };
}
```

### randomuser.me API Response Shape
```typescript
// What the API returns (inc=name,nat)
interface RandomUserResponse {
  results: Array<{
    name: { title: string; first: string; last: string };
    nat: string; // "GB", "ES", "FR", "DE", "BR"
  }>;
  info: { seed: string; results: number; page: number; version: string };
}
```

### AI Matchday Squad Selection
```typescript
// In simOneAIFixture - pick 18 from 25
const homeSquad = homeTeam.squad.map(p => ({
  ...p, fatigue: state.fatigueMap.get(p.id) ?? 0,
}));
const matchConfig: MatchConfig = {
  seed: `${state.seed}-md-${md}-${fixture.homeTeamId}-${fixture.awayTeamId}`,
  homeRoster: homeSquad.slice(0, 11),   // starters
  awayRoster: awaySquad.slice(0, 11),
  homeBench: homeSquad.slice(11, 18),   // 7 subs (not all 14 remaining)
  awayBench: awaySquad.slice(11, 18),
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 16-player squads | 25-player squads | This phase | Requires role expansion, UI updates, validation changes |
| 5-player bench | 7-player bench (18-man matchday) | This phase | Matches real Premier League rules |
| Procedural names from static pools | API-fetched realistic names | This phase | Better immersion, nationality-appropriate names |
| No shirt numbers | Editable shirt numbers | This phase | New PlayerState field, UI column |

**Deprecated/outdated:**
- `createMatchRosters()` 16-player output: Must expand to 25 for player team bootstrap
- Hardcoded bench size of 5: All references must update to 7

## Open Questions

1. **Player team creation flow**
   - What we know: `createMatchRosters()` bootstraps the player team with archetypes. AI teams use `createAITeam()` with tier-based random attributes.
   - What's unclear: Should the player team also use `createAITeam()` now (with 'mid' tier), or keep the archetype approach but expand to 25?
   - Recommendation: Use `createAITeam()` for the player team too, with 'mid' tier. The archetype system was for demo matches, not season play. Player team names should come from the same API batch.

2. **Name distribution strategy**
   - What we know: Need 500 names (20 teams x 25 players). API supports up to 5000 per request.
   - What's unclear: Should we fetch proportionally (200 GB, 125 ES, 100 FR, 50 DE, 25 BR) or let the API distribute naturally with `?nat=gb,es,fr,de,br`?
   - Recommendation: Fetch 500 with all nat codes. The API distributes evenly across nationalities listed, so fetch proportionally in separate batches per nationality OR accept even distribution. Proportional batching (5 small calls) is cleaner for matching existing weights.

3. **Shirt number range**
   - What we know: Real football allows 1-99. Premier League uses 1-99.
   - What's unclear: Should we restrict to 1-25 (auto-assigned) or allow 1-99 (user choice)?
   - Recommendation: Auto-assign 1-25 on creation. Allow editing to any 1-99 range. Validate uniqueness within team.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.3 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SQD2-01 | createAITeam produces 25 players with correct role distribution | unit | `npx vitest run src/season/teamGen.test.ts -x` | Exists but needs update |
| SQD2-02 | validateSquadSelection accepts 11+7, rejects other counts | unit | `npx vitest run src/season/season.test.ts -x` | Exists but needs update |
| SQD2-03 | Players have shirtNumber field, unique within team | unit | `npx vitest run src/season/teamGen.test.ts -x` | Needs new tests |
| SQD2-04 | Squad screen renders 25 rows with correct selection defaults | unit | Manual verification (DOM rendering) | Manual-only |
| NAME-01 | Name service fetches from randomuser.me and returns name list | unit | `npx vitest run src/season/nameService.test.ts -x` | Needs new file |
| NAME-02 | Nationality weights match existing distribution | unit | `npx vitest run src/season/nameService.test.ts -x` | Needs new file |
| NAME-03 | Fallback to generic pool when API fails | unit | `npx vitest run src/season/nameService.test.ts -x` | Needs new file |

### Sampling Rate
- **Per task commit:** `npx vitest run src/season/ -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `src/season/nameService.test.ts` -- covers NAME-01, NAME-02, NAME-03
- [ ] Update `src/season/teamGen.test.ts` -- update assertions from 16 to 25 players, add shirtNumber tests
- [ ] Update `src/season/season.test.ts` -- update bench validation from 5 to 7

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/season/teamGen.ts`, `src/season/nameGen.ts`, `src/season/season.ts`, `src/ui/screens/squadScreen.ts`, `src/simulation/types.ts`, `src/simulation/engine.ts`, `src/main.ts`, `server/db.ts`
- randomuser.me official documentation (https://randomuser.me/documentation) -- API parameters, nationality codes, response format, batch size limits

### Secondary (MEDIUM confidence)
- Premier League squad rules (25-man squad, 18-man matchday) -- well-established football knowledge

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - randomuser.me API is simple, well-documented, no auth needed
- Architecture: HIGH - clear codebase patterns to follow, all touch points identified
- Pitfalls: HIGH - exhaustive grep of hardcoded values, all locations documented

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no fast-moving dependencies)

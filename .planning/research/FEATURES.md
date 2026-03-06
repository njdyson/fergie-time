# Feature Research

**Domain:** Persistent data layer for browser-based football management game (v1.1 milestone)
**Researched:** 2026-03-06
**Confidence:** HIGH

**Scope note:** This research covers ONLY the v1.1 Data Layer milestone features. The match engine, tactical system, and management shell (Phases 1-3) are already built. See prior research for those features.

---

## Feature Landscape

### Table Stakes (Must Ship in v1.1)

Features the milestone explicitly requires. Missing any of these means persistence is incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SQLite database | Backing store for all persistence; single-file, zero-config, already deployed VPS | LOW | `better-sqlite3` (synchronous, fast). ~4 tables: `games`, `save_states`, `cached_names`, `player_season_stats`. No ORM needed at this scale. |
| Express API server | Transport layer between browser client and SQLite on VPS | MEDIUM | ~6 REST endpoints. Vite dev proxy for local dev, standalone Express on VPS. CORS, JSON body parsing, bcrypt for passwords. |
| Game save/load (SeasonState persistence) | Entire point of the milestone -- game must survive browser close | HIGH | **Key challenge:** `SeasonState.fatigueMap` is a `Map<string,number>` which is not JSON-serializable. Must build serialize/deserialize layer. Full state is ~20 teams x 25 players with nested `PlayerAttributes` (10 floats), `PersonalityVector` (8 floats), `Vec2` positions + 380 fixtures + 20 table records. Estimate 500KB-1MB JSON per save. |
| Simple login (team name + password) | Identifies which save game to load; prevents accidental overwrites | LOW | NOT real auth. Hash password with bcrypt server-side, store alongside save. No email, no sessions, no CSRF. Return a simple token (game ID + HMAC) stored in localStorage. |
| 25-man squads | Explicit milestone target; mirrors Premier League squad rules; creates rotation depth | MEDIUM | Currently hardcoded: `teamGen.ts` ROLES array = 16 players, `season.ts` SquadSelection = 11 starters + 5 bench, `validateSquadSelection()` checks exact counts. Must expand ROLES to 25, decide matchday squad size (e.g., 11+7 matchday from 25 registered), update AI team generation, update squad screen layout. |
| Realistic names via randomuser.me | Explicit milestone target; replaces static 110-name-per-nationality pools in `nameGen.ts` | LOW | API is free, no key required. Supports `nat=gb,es,fr,de,br` matching existing nationality weights. Batch fetch `?inc=name,nat&results=500`, cache in DB. Draw from cache during player generation. Fallback to existing `nameGen.ts` if API unavailable. |
| Season player stats persisted in DB | Explicit milestone target; core management fantasy (who is my top scorer?) | MEDIUM | `GameEventLog.getPlayerStats()` already produces per-player `PlayerLogStats` with goals, assists, passes, passesCompleted, shots, shotsOnTarget, tacklesWon, tacklesAttempted. Currently discarded after each match. Must aggregate across matchdays and persist. Add `appearances` counter. |
| Auto-save after each matchday | Users should never lose progress; removes "remember to save" friction | LOW | Call PUT endpoint after `finalizeMatchday()`. Natural hook point already exists in the season flow in `main.ts`. |

### Differentiators (High Value, Not Blocking)

Features that add polish beyond minimum persistence. Build after table stakes are stable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Season stat leaderboards | "Top Scorer", "Most Assists" across the whole league -- core football management fantasy | MEDIUM | Requires storing per-match player stats for ALL teams, not just the player's team. **Blocker:** `quickSimMatch()` currently returns only `{homeGoals, awayGoals}`. Must expose `GameEventLog` from quick-sim runs to attribute goals/assists to specific AI players. The engine already tracks this internally -- just need to return it. |
| Match history browser | Browse previous matchday results with full stats | LOW | Store `PlayerLogStats[]` per match alongside match result. Already computed by `GameEventLog.getPlayerStats()` -- just persist the output. Display as a scrollable list on fixtures screen. |
| Nationality field on players | Display flag icons, enables future "foreign player limit" rules | LOW | randomuser.me returns nationality. Add `nationality` field to `PlayerState`. Already conceptually present in `nameGen.ts` weights but not stored on the player object. |
| Multiple save slots UI | Manage 2-3 different careers | LOW | Already works implicitly via different team name + password combos. Just needs a "New Game" vs "Continue" choice on login screen and a way to list existing games. |
| Player form indicator | Rolling average rating from last 5 matches | LOW | Derived from persisted per-match stats. A simple arrow up/down/steady indicator on squad screen. |

### Anti-Features (Explicitly Avoid)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full authentication (email, password reset, sessions) | "Real" user accounts | Massive scope for a single-player personal project. Requires email service, session management, CSRF, password reset. PROJECT.md explicitly excludes "commercial features." | Team name + bcrypt hash. No email. Token in localStorage. |
| Cloud sync / cross-device saves | Play on multiple machines | Requires real accounts, conflict resolution, real auth | Export/import save as JSON file if ever needed |
| Real-time save (every simulation tick) | Never lose mid-match progress | Thousands of DB writes per match. Match state is transient -- simulation runs in browser, only season state persists between matches. | Save after each matchday (~every 5 minutes of play) |
| Detailed AI match replay storage | Watch AI vs AI matches after the fact | Quick-sim runs headless at ~6000 ticks in <500ms. Full replay = 22 players x 6000 ticks x 9 AI matches = ~1.2M position records per matchday. Massive storage for zero user demand. | Store only final scores + goalscorer info from quick-sims |
| GraphQL API | "More flexible than REST" | 6 endpoints do not justify schema, resolvers, client library overhead | Simple REST with JSON |
| ORM (Prisma, Drizzle, TypeORM) | "Best practice" for DB | `better-sqlite3` is synchronous, dead simple. An ORM adds deps, migration tooling, abstraction for ~4 tables. | Raw SQL. Migrations as numbered `.sql` files. |
| WebSocket for live updates | Real-time state sync | Single-player game. No concurrent users for the same save. HTTP request-response is perfectly adequate. | Standard fetch() calls |

---

## Feature Dependencies

```
[SQLite database]
    |
    +--requires--> [Express API server]
    |                   |
    |                   +--enables--> [Simple login]
    |                   |                 |
    |                   |                 +--enables--> [Game save/load]
    |                   |                                   |
    |                   |                                   +--requires--> [SeasonState serialization]
    |                   |                                   |
    |                   |                                   +--enables--> [Auto-save after matchday]
    |                   |
    |                   +--enables--> [randomuser.me name cache]
    |                   |
    |                   +--enables--> [Season stats persistence]
    |                                     |
    |                                     +--requires--> [Per-match stat extraction hook]
    |                                     |
    |                                     +--enhanced-by--> [Quick-sim goalscorer tracking]
    |
[25-man squads] -- INDEPENDENT (pure frontend, no DB needed)

[Season stat leaderboards] --requires--> [Season stats persistence]
                           --requires--> [Quick-sim goalscorer tracking]
```

### Dependency Notes

- **SeasonState serialization is the hardest piece.** `SeasonState.fatigueMap` is a `Map<string, number>` which `JSON.stringify()` serializes as `{}`. Must convert to `Object.fromEntries()` on save and `new Map(Object.entries())` on load. `Vec2` objects on players are plain `{x, y}` -- should serialize fine. The `readonly` modifiers on interfaces are compile-time only, no runtime impact.
- **Season stats require a post-match hook.** After the player's match completes, `GameEventLog.getPlayerStats()` must be called and the results persisted via API. This hook does not exist yet -- the game currently transitions directly from full-time overlay to hub screen.
- **Quick-sim goalscorer tracking is a stretch goal.** Currently `quickSimMatch()` in `quickSim.ts` creates a `SimulationEngine`, runs it to `FULL_TIME`, and returns only `{homeGoals, awayGoals}`. The engine internally has a `GameEventLog` but it is not exposed. To track AI player stats, must either: (a) expose the log from the engine and return it from `quickSimMatch()`, or (b) probabilistically assign goals based on player attributes. Option (a) is cleaner but adds ~10% overhead to quick-sim time.
- **25-man squads is independently buildable.** Only touches `teamGen.ts` (ROLES array), `season.ts` (SquadSelection, validateSquadSelection), and UI. No DB dependency. Can and should be built first as a pure frontend change to validate before adding persistence.

---

## Existing Code Touchpoints

Specific files that must change for each feature:

| Feature | Files Affected | Nature of Change |
|---------|---------------|-----------------|
| 25-man squads | `teamGen.ts` (ROLES: 16 -> 25), `season.ts` (SquadSelection bench: 5 -> 7+, validateSquadSelection), `squadScreen.ts` (UI grid), `main.ts` (bench slicing logic at lines ~100, ~253-254) | Expand constants, update validation, resize UI |
| SeasonState serialization | `season.ts` (new `serializeSeason()`/`deserializeSeason()` functions) | Handle `fatigueMap` Map<->Object conversion, deep clone nested interfaces |
| Express API server | New `server/` directory with `index.ts`, `db.ts`, `routes.ts` | Entirely new code. Add to package.json scripts. |
| Simple login | New `ui/screens/loginScreen.ts`, server `routes.ts` | New screen inserted before hub. POST /api/games or /api/games/login |
| Save/load integration | `main.ts` (season init flow around line 99-104) | On login: GET state from API instead of `createSeason()`. After matchday: PUT state. |
| randomuser.me cache | Replace/augment `nameGen.ts`, new server endpoint | Server fetches from randomuser.me on first request, caches in `cached_names` table. Client calls `/api/names/batch` instead of `generatePlayerName()`. |
| Season stats | `main.ts` (post-match hook), new server endpoint | After full-time: extract `GameEventLog.getPlayerStats()`, POST to `/api/games/:id/stats`. New stats display on squad screen. |
| Quick-sim stats (stretch) | `quickSim.ts` (expose GameEventLog), `engine.ts` (getter for log) | Return `PlayerLogStats[]` from `quickSimMatch()` alongside score. |

---

## MVP Definition

### Must Have (v1.1 Core)

- [ ] SQLite schema + `better-sqlite3` setup -- foundation for everything
- [ ] Express server with 6 endpoints + Vite proxy -- transport layer
- [ ] `serializeSeason()` / `deserializeSeason()` -- handle Map, Vec2, readonly types
- [ ] Login screen (team name + password) -- gate to save game
- [ ] Auto-save after `finalizeMatchday()` -- zero-friction persistence
- [ ] 25-man squads with expanded ROLES array -- explicit milestone target
- [ ] randomuser.me batch fetch + DB cache -- explicit milestone target
- [ ] Per-match player stats extraction and DB storage -- explicit milestone target
- [ ] Season stats aggregation query (totals per player per season) -- display on squad screen

### Add After Core Works (v1.1.x)

- [ ] Quick-sim goalscorer attribution (expose GameEventLog from engine) -- enables league-wide stat tables
- [ ] Season stat leaderboard screen (top scorer, most assists across league) -- requires quick-sim stats
- [ ] Match history on fixtures screen -- per-matchday results with player stats
- [ ] Nationality field on PlayerState with flag icons -- flavor from randomuser.me data
- [ ] Player form arrow indicator -- derived from rolling match stats

### Future Consideration (v1.2+)

- [ ] Export/import save as JSON file -- poor man's cross-device sync
- [ ] Player of the month/season awards -- derived from season stats
- [ ] Historical season records across multiple seasons -- multi-season archive table
- [ ] Career stats (all-time goals, appearances across seasons) -- requires career stats table

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase Dependency |
|---------|------------|---------------------|----------|-----------------|
| SQLite + Express server | HIGH (enables everything) | MEDIUM | P1 | None |
| SeasonState serialization | HIGH (core save mechanism) | MEDIUM | P1 | None (pure logic) |
| Simple login screen | HIGH (gate to persistence) | LOW | P1 | Server |
| Auto-save after matchday | HIGH (zero-friction) | LOW | P1 | Server + serialization |
| 25-man squads | MEDIUM (depth decisions) | MEDIUM | P1 | None (independent) |
| randomuser.me name cache | MEDIUM (immersion) | LOW | P1 | Server + DB |
| Season player stats storage | HIGH (core fantasy) | MEDIUM | P1 | Server + post-match hook |
| Quick-sim goalscorer tracking | MEDIUM (league-wide stats) | MEDIUM | P2 | Engine change |
| Season stat leaderboards | MEDIUM (league context) | LOW | P2 | Quick-sim stats |
| Match history browser | LOW | LOW | P2 | Stats storage |
| Nationality on PlayerState | LOW | LOW | P3 | Name cache |
| Player form indicator | LOW | LOW | P3 | Stats storage |

---

## Competitor Feature Analysis (Persistence Patterns)

| Feature | Football Manager | Hattrick (browser) | Our Approach |
|---------|-----------------|---------------------|--------------|
| Save mechanism | Single file (.fm), auto-save configurable | Server-side, always-on | Server-side SQLite, auto-save after matchday |
| Auth model | N/A (offline desktop app) | Full account (email, password) | Team name + bcrypt hash, no email |
| Save size | 50-200MB (full database) | Server-managed | ~1MB JSON blob per save |
| Squad size | 25-50+ players | ~28 players | 25 (PL registration rules) |
| Player names | Licensed real-name DB (350k+ names) | Generated | randomuser.me cached in DB, nationality-weighted |
| Season stats depth | 30+ per-player stats, career history | Basic (goals, assists, rating) | 9 stats from existing `PlayerLogStats` + appearances |
| Stat granularity | Per-match + per-season + career | Per-season only | Per-match stored, per-season aggregated, career deferred |

---

## Sources

- **Codebase analysis (HIGH confidence):** `season.ts`, `teamGen.ts`, `nameGen.ts`, `gameLog.ts`, `quickSim.ts`, `stats.ts`, `types.ts`, `main.ts`, `engine.ts`
- **randomuser.me documentation (HIGH confidence):** https://randomuser.me/documentation -- free API, no key, supports gb/es/fr/de/br nationalities, JSON response with name fields
- **PROJECT.md milestone definition (HIGH confidence):** Explicit feature list and out-of-scope items
- **better-sqlite3 (MEDIUM confidence):** Training data -- synchronous SQLite bindings for Node.js, widely used for exactly this pattern
- **Express.js patterns (HIGH confidence):** Well-established REST API patterns, standard middleware stack

---
*Feature research for: Fergie Time v1.1 Data Layer*
*Researched: 2026-03-06*

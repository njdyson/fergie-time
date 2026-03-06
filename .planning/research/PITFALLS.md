# Pitfalls Research

**Domain:** Adding Express+SQLite backend to existing client-only browser game
**Project:** Fergie Time v1.1 Data Layer
**Researched:** 2026-03-06
**Confidence:** HIGH (codebase-specific analysis + established backend patterns)

---

## Critical Pitfalls

Mistakes that cause data loss, broken saves, or deployment failures.

---

### Pitfall 1: SeasonState Contains Non-Serializable Types (Map)

**What goes wrong:**
`SeasonState.fatigueMap` is a `Map<string, number>` (see `src/season/season.ts` line 45). `JSON.stringify()` silently converts Maps to `{}`. If you persist season state by serializing to JSON and storing in SQLite, all fatigue data is silently lost. The game loads back with zero fatigue for every player, breaking the fatigue/recovery system. No error is thrown -- the data vanishes.

**Why it happens:**
The game was built as a client-only app where state lives in memory. Maps are natural for in-memory lookups but are invisible to `JSON.stringify()`. This is JavaScript's most common serialization trap and it hits hardest when retrofitting persistence onto existing code.

**How to avoid:**
- Convert `fatigueMap` to `Record<string, number>` before serializing, or store fatigue as rows in a `player_fatigue` table keyed by `(game_id, player_id)`.
- Better: refactor `SeasonState` to use `Record<string, number>` instead of `Map` throughout. Maps provide no meaningful advantage here (string keys, simple lookups) and create a serialization landmine.
- Add a mandatory round-trip test: `deepEqual(deserialize(serialize(state)), state)` must pass before save/load is considered done.

**Warning signs:**
- Fatigue values are always 0 after loading a saved game.
- Tests pass but only exercise in-memory flow, never serialize/deserialize.

**Phase to address:**
Phase 1 (Database Schema + Save/Load). Must be caught during schema design before any persistence code is written.

---

### Pitfall 2: Dual State Ownership -- Client and Server Disagree on Truth

**What goes wrong:**
The current game generates all state client-side: `createSeason()` builds 20 teams, 380 fixtures, a full league table, and a fatigue map entirely in the browser (see `src/season/season.ts` lines 94-147). If you add a backend but keep the client generating state while also having the server validate or transform it, you create two sources of truth. The client creates a season, the server persists a different version, and saves corrupt silently.

**Why it happens:**
The instinct when adding a backend is "the server should be authoritative." That is correct for multiplayer games. For a single-player game where all game logic already runs client-side, attempting to move authority to the server means duplicating the entire simulation engine on the server -- a massive scope expansion for zero user benefit.

**How to avoid:**
- Explicitly decide: the client owns game logic and state, the server is a dumb persistence layer. Document this contract.
- API design: `POST /api/games/:id/save` accepts the full serialized state blob. `GET /api/games/:id/load` returns it verbatim. No server-side validation of game logic.
- The server validates only: auth (is this your save?), payload shape (is this valid JSON/meets size limits?), and schema version.
- Do NOT try to make the server replay or validate match results -- that requires porting the simulation engine to the server.

**Warning signs:**
- You find yourself importing game logic modules into server code.
- API endpoints accept partial state updates before full save/load works.
- Bug reports where "my league table doesn't match my fixtures."

**Phase to address:**
Phase 1 (API Design). The save/load contract must be defined before any endpoint is built.

---

### Pitfall 3: Static-Site Deploy Becomes a Process Management Problem

**What goes wrong:**
The current deploy (`deploy.yml`) is simple: SSH in, `git pull`, `npm run build`. This produces static files served by the web server at `ft.psybob.uk`. Adding Express means you now need: a Node.js process running permanently, a process manager (pm2 or systemd), a reverse proxy (nginx) routing `/api/*` to Express while serving static files directly, port management, log rotation, crash recovery, and environment variable management. The deployment pipeline triples in complexity.

**Why it happens:**
The operational gap between "serve static files" and "run a live process" is massive but invisible until deploy day. The existing `deploy.yml` has no concept of "restart the server" or "is the old process still running on port 3000?" The first deploy will fail because there is no mechanism to manage the Express lifecycle.

**How to avoid:**
- Use pm2 for process management. Create an `ecosystem.config.cjs` defining the Express app, env vars, log paths, and restart policy.
- Configure nginx as reverse proxy: static files from `dist/` served directly, `/api/*` proxied to Express on a local port.
- Update `deploy.yml` to: `git pull && npm install --production && npm run build && pm2 restart ecosystem.config.cjs`.
- Add `pm2 startup` and `pm2 save` on the VPS so the Express process survives server reboots.
- Test the full deploy cycle manually before automating. The first deploy will fail at least once -- do it interactively via SSH.
- Store the SQLite database file OUTSIDE the web root (e.g., `/var/data/fergie-time/game.db`), not in the project directory. The web server must never serve the `.db` file.

**Warning signs:**
- 502 errors on the VPS after deploy.
- Express process dies silently and nobody notices until the next play session.
- "Port 3000 already in use" from a previous crashed process.
- The `.db` file is downloadable via a direct URL.

**Phase to address:**
Phase 2 (Deployment). But plan the deployment model in Phase 1 -- API design should match the deploy architecture.

---

### Pitfall 4: randomuser.me Dependency Becomes a Game-Breaking Boot Blocker

**What goes wrong:**
The plan is to replace the procedural `nameGen.ts` with realistic names from randomuser.me. If this API call happens during season creation (the critical path), a slow response or outage blocks the "new game" flow entirely. randomuser.me is a free community service with no SLA -- it has documented outages (502 Bad Gateway errors reported on GitHub issues #42 and #66). If the API is down when someone starts a new game, the game is broken.

**Why it happens:**
External API dependencies feel harmless during development because the API is almost always up when you are testing. The failure mode only appears in production at the worst possible time. Developers treat "fetch names from API" as a simple call without considering the unhappy path.

**How to avoid:**
- Never call randomuser.me on the critical path of game creation.
- Pre-fetch and cache: create a `name_cache` table in SQLite. On server startup (or via a scheduled job), bulk-fetch names and store them. Draw from the cache when creating players.
- Batch API calls efficiently: `https://randomuser.me/api/?results=50&nat=gb,es,fr,de,br` fetches 50 names in one request with nationality filtering that matches the existing weight distribution in `nameGen.ts`.
- Keep the existing procedural `nameGen.ts` as a hard fallback. If the cache is empty AND the API is down, generate names locally. The game must always be playable.
- Add a cache refill threshold: when the cache drops below 100 unused names, trigger a background refill. Never let it hit zero.

**Warning signs:**
- "New game" takes 3+ seconds (waiting for API response).
- Intermittent failures creating new games that nobody can reproduce.
- Tests mock the API and never exercise the fallback path.

**Phase to address:**
Phase 3 (randomuser.me Integration). But the `name_cache` table schema should be designed in Phase 1.

---

### Pitfall 5: better-sqlite3 Synchronous Calls Blocking the Express Event Loop

**What goes wrong:**
better-sqlite3 is fully synchronous by design. Every database call blocks the Node.js event loop until completion. For a single-player game this is generally fine, but if the save operation serializes the full season state (20 teams x 25 players = 500 player records, 380 fixtures, league table, fatigue map) and writes it in individual INSERT statements without a transaction, the synchronous write blocks all other requests for potentially hundreds of milliseconds.

**Why it happens:**
better-sqlite3 is correctly recommended as "the best SQLite library for Node.js" -- it genuinely is faster than async alternatives for most patterns. But developers assume "fast" means "negligible." Without WAL mode and without wrapping bulk operations in transactions, the default rollback journal mode locks the entire database for every write, and individual inserts each incur fsync overhead.

**How to avoid:**
- Enable WAL mode immediately after opening the database: `db.pragma('journal_mode = WAL')`. This allows concurrent reads during writes.
- Wrap all bulk inserts in explicit transactions: `const insertMany = db.transaction((items) => { for (const item of items) insertStmt.run(item); })`. Transaction batching is 100x+ faster than individual inserts.
- For Fergie Time's scale (1 concurrent user, <1000 rows total): store season state as a single JSON blob in a `saves` table column rather than normalizing into many tables. One INSERT is always faster than 500.
- Normalize only what you need to query independently: player stats for leaderboards, name cache for lookup.
- Use async bcrypt for password operations -- bcrypt is CPU-intensive and will block the event loop if used synchronously.

**Warning signs:**
- Save operation takes >200ms (measure with `console.time`).
- API becomes unresponsive briefly during save.
- Login feels sluggish (synchronous bcrypt).

**Phase to address:**
Phase 1 (Database Setup). WAL mode and transaction patterns from the first line of database code.

---

### Pitfall 6: Auth Scope Creep -- Overengineering Security for a Personal Project

**What goes wrong:**
The requirement is "simple login -- team name + password, create new game / continue existing." Developers instinctively reach for JWT, refresh tokens, OAuth, passport.js, CSRF protection, rate limiting, and session stores. A week of auth work produces an overengineered system for a single-player personal project that only needs "which save file is mine?"

**Why it happens:**
Every auth tutorial teaches production-grade patterns. "Never roll your own auth" is good advice for commercial apps but inappropriate context for a personal game server. The threat model here is a personal VPS, not a banking application. Auth exists to separate save files, not protect sensitive data.

**How to avoid:**
- Implement the minimum: team name + bcrypt-hashed password. Store in a `games` table with `(id, team_name, password_hash, created_at)`.
- Use `express-session` with a cookie. No JWT -- sessions are simpler for same-origin apps.
- No email, no password reset, no OAuth. If someone forgets their password, they start a new game. Acceptable for a personal project.
- Do use bcrypt (salt rounds >= 12). Hashing passwords is trivial and non-negotiable, even for personal projects.
- Use async `bcrypt.compare()` and `bcrypt.hash()` to avoid blocking the event loop.
- Time-box auth implementation to 4 hours. If it takes longer, scope is wrong.

**Warning signs:**
- You are reading about refresh token rotation for a single-player game.
- Auth implementation takes more than a day.
- More auth middleware files than game logic endpoints.

**Phase to address:**
Phase 2 (Auth + Login Screen). Keep it simple.

---

### Pitfall 7: Hardcoded Squad Size of 16 Breaking with 25-Man Expansion

**What goes wrong:**
The current codebase has squads of 16 players (`src/season/season.ts` line 28: `squad: PlayerState[] // 16 players`). The v1.1 goal is 25-man squads. If squad size assumptions are scattered throughout the codebase (slicing arrays at index 11 for starters and 11-16 for bench, validation expecting exactly 5 bench players), the expansion silently breaks selection logic, AI team simulation, and save/load.

**Why it happens:**
Magic numbers are embedded throughout the game logic. `quickSimMatch` slices at index 11 for starters and uses `slice(11)` for bench. Validation expects `bench.length === 5`. These hardcoded values work for 16-man squads but break for 25.

**How to avoid:**
- Search the entire codebase for hardcoded `16`, `5` (bench size), and `slice(11)` patterns. Replace with named constants: `SQUAD_SIZE = 25`, `STARTING_XI = 11`, `BENCH_SIZE = 7` (matching PL rules for 25-man squads).
- Update `validateSquadSelection` to accept the new bench size.
- Update AI team simulation (`simOneAIFixture`) which currently does `homeSquad.slice(0, 11)` for starters and `slice(11)` for bench -- this will include 14 bench players with 25-man squads, which may or may not be intentional.
- Add a test that generates a 25-man squad, saves it, loads it, and verifies all 25 players survive.

**Warning signs:**
- AI teams field different bench sizes than the player team.
- Save files contain 16 players when they should contain 25.
- `validateSquadSelection` rejects valid 25-man selections.

**Phase to address:**
Phase 1 (Schema Design). Squad size constants must be updated before the database schema encodes assumptions.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Store full state as JSON blob instead of normalized tables | Fast to implement, matches existing in-memory structure | Cannot query individual records (e.g., "top scorers across all saves") | v1.1 -- normalize only what needs querying |
| Skip input validation on save endpoint | Faster development | Corrupted saves if client sends malformed data | Never -- Zod is already a dependency, use it |
| Hardcode API port and DB path | Works immediately | Breaks when deploy environment differs | Never -- use environment variables from day one |
| Skip database migrations framework | No tooling to learn | Schema changes require manual SQL on the VPS | v1.1 with <5 tables -- add migrations before v1.2 |
| No API versioning | Simpler URLs | Breaking API changes break existing client | Acceptable -- single client, personal project |
| MemoryStore for sessions | No extra dependency | Sessions lost on server restart | Acceptable for v1.1 -- user re-enters password |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| randomuser.me | Calling API during game creation (critical path) | Pre-fetch into cache table; fallback to local `nameGen.ts` |
| randomuser.me | Not filtering by nationality | Use `?nat=gb,es,fr,de,br` to match existing nationality weights |
| randomuser.me | Assuming API always returns 200 | Wrap in try/catch, retry once with 2s backoff, then fallback |
| better-sqlite3 | Opening DB without WAL mode | First statement: `db.pragma('journal_mode = WAL')` |
| better-sqlite3 | String concatenation in SQL queries | Always use parameterized statements with `?` placeholders |
| express-session | Hardcoding session secret in source code | Use environment variable: `process.env.SESSION_SECRET` |
| Vite dev server | API calls hit wrong origin in development | Configure `vite.config.ts` server proxy: `'/api': 'http://localhost:3000'` |
| nginx | Serving project root instead of `dist/` only | Explicit `root /path/to/dist;` with no directory listing |
| pm2 | Process not surviving server reboot | Run `pm2 startup` and `pm2 save` after first successful start |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Individual INSERT per player (no transaction) | Save takes 500ms+ | Wrap in `db.transaction()` | Immediately with 500+ rows |
| Loading full state on every page navigation | Slow transitions between screens | Load once on login, cache in memory, save on explicit action | Unlikely at this scale but wasteful |
| Synchronous bcrypt on login | Login blocks event loop for ~100ms | Use async `bcrypt.compare()` | Multiple concurrent logins |
| No indexes on lookup columns | Query time grows with saves | Add index on `games(team_name)` | >50 saved games |
| Auto-saving on every user action | Constant write pressure | Save at matchday boundaries or explicit "save game" | Immediately noticeable as lag |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing passwords in plain text | Anyone with VPS/DB access reads all passwords | `bcrypt.hash(password, 12)` -- non-negotiable |
| No CORS configuration | Other sites make API calls to the game server | `cors({ origin: 'https://ft.psybob.uk' })` |
| SQLite file in web-accessible directory | Database downloadable via direct URL | Store `.db` outside web root; nginx serves only `dist/` |
| No session-based ownership check on save | Player A overwrites Player B's save | Verify session game_id matches save target on every write |
| Secrets in source code or deploy.yml | Credentials in git history | GitHub Secrets for deploy; `.env` on VPS (gitignored) |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading indicator during save/load | User thinks game is frozen | Show "Saving..." overlay; saves should be <200ms but always indicate |
| Silent save failure | User plays for hours, data lost | Show error toast on save failure; offer retry |
| Login screen blocks all access | Friction before fun | Allow "play without saving" using existing client-only flow |
| Losing in-progress match on refresh | Frustrating data loss | Save state at matchday boundaries; do not attempt mid-match saves (too complex for v1.1) |
| API errors shown as raw text | Confusing for the player | Map errors to friendly messages: "Could not connect. Playing offline." |
| Different player names on reload | randomuser.me returns different names | Cache names in DB and never re-fetch for existing players |

## "Looks Done But Isn't" Checklist

- [ ] **Save/Load:** `fatigueMap` (Map type) round-trips correctly through serialize/deserialize -- test with non-zero fatigue values
- [ ] **Save/Load:** Loading a corrupted/truncated JSON blob does not crash the client -- Zod validates loaded state, shows error message
- [ ] **Save/Load:** All 25 players per team survive save/load -- not truncated to 16
- [ ] **Auth:** Passwords are bcrypt hashes in the database -- query the DB and verify no plain text
- [ ] **Deploy:** `pm2 restart` is in the deploy script AND the process survives a VPS reboot (`pm2 save && pm2 startup`)
- [ ] **Deploy:** nginx routes `/api/*` to Express AND serves `dist/` for everything else -- test both paths
- [ ] **Deploy:** The `.db` file is NOT downloadable via browser -- attempt direct URL access, must return 404
- [ ] **Name cache:** Game creation works when randomuser.me is unreachable -- disable network adapter and test new game flow
- [ ] **CORS:** Production build makes API calls to correct origin -- not `localhost:3000`
- [ ] **Database:** WAL mode is active -- verify with `PRAGMA journal_mode` query
- [ ] **Vite proxy:** Dev mode API calls reach the Express server -- test save/load in `npm run dev`
- [ ] **Session:** Logging in, closing the browser tab, reopening -- session persists (or re-login works cleanly)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Lost fatigue data from Map serialization | LOW | Fix serializer; re-initialize all fatigue to 0 (acceptable mid-season) |
| Corrupted save file from malformed JSON | MEDIUM | Add Zod validation on load; if invalid, offer "start new season" not crash |
| Express process dies on VPS | LOW | pm2 auto-restarts; `pm2 startup` for reboot survival |
| randomuser.me goes down permanently | LOW | Fall back to `nameGen.ts`; cached names in DB still work for existing games |
| Plain text passwords discovered | MEDIUM | One-time migration: hash all passwords with bcrypt |
| Client/server state divergence | HIGH | Must pick one source of truth and rebuild saves; prevention far cheaper |
| nginx exposes .db file | HIGH | Move DB outside web root immediately; assume data compromised |
| Squad size mismatch (16 vs 25) | MEDIUM | Migration script to backfill missing players; update all hardcoded sizes |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Map serialization | Phase 1: Schema + Save/Load | Round-trip test: `deepEqual(deserialize(serialize(state)), state)` |
| Dual state ownership | Phase 1: API Design | Documented contract: "client is authority, server is storage" |
| Squad size hardcoding | Phase 1: Schema Design | Grep for hardcoded 16/5; all replaced with constants; 25-man squad test passes |
| WAL mode + transactions | Phase 1: Database Setup | `console.time` on save; completes in <200ms; `PRAGMA journal_mode` returns `wal` |
| Deploy complexity | Phase 2: Deployment | Full deploy cycle: push to main, verify API responds, verify static files load |
| Auth scope creep | Phase 2: Auth | Time-box to 4 hours; bcrypt hashing verified in DB |
| CORS + DB exposure | Phase 2: Deployment | Test from production domain; attempt to download `.db` file |
| randomuser.me dependency | Phase 3: Name Integration | Disable network, create new game -- must succeed with fallback names |
| Vite dev proxy | Phase 1: Project Setup | Save/load works in `npm run dev` mode |

## Sources

- [SQLite WAL mode documentation](https://sqlite.org/wal.html)
- [SQLite file locking and concurrency](https://sqlite.org/lockingv3.html)
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) -- synchronous design rationale and performance claims
- [randomuser.me API documentation](https://randomuser.me/documentation)
- [randomuser.me downtime -- GitHub Issue #42](https://github.com/RandomAPI/Randomuser.me-old-source/issues/42)
- [randomuser.me downtime -- GitHub Issue #66](https://github.com/RandomAPI/Randomuser.me-old-source/issues/66) -- 502 Bad Gateway, Feb 2020
- [Node.js built-in SQLite module documentation](https://nodejs.org/api/sqlite.html)
- [better-sqlite3 concurrency discussion](https://github.com/TryGhost/node-sqlite3/issues/1761) -- unsafe with multiple async scopes
- [Poor Express authentication patterns](https://lirantal.com/blog/poor-express-authentication-patterns-nodejs)
- [Uptrends State of API Reliability 2025](https://www.uptrends.com/state-of-api-reliability-2025) -- API uptime fell from 99.66% to 99.46% industry-wide
- Existing codebase analysis: `src/season/season.ts` (Map usage, squad size), `src/season/nameGen.ts` (fallback names), `.github/workflows/deploy.yml` (static deploy)

---
*Pitfalls research for: Fergie Time v1.1 Data Layer*
*Researched: 2026-03-06*

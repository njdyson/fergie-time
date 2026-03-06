# Project Research Summary

**Project:** Fergie Time v1.1 Data Layer
**Domain:** Backend persistence layer for existing browser-based football management game
**Researched:** 2026-03-06
**Confidence:** HIGH

## Executive Summary

Fergie Time is a browser-based football management game with a working match engine, tactical system, and management shell (Phases 1-3 complete). The v1.1 milestone adds a persistence layer so game state survives browser refreshes. The recommended approach is the thinnest possible backend: Express 5 serving a REST API over SQLite via better-sqlite3, with the browser remaining the sole authority on game logic. The server is a "filing cabinet" -- it accepts serialized state blobs and hands them back. No game logic runs server-side.

The stack is deliberately minimal: Express 5, better-sqlite3, express-session, helmet, compression, and tsx for dev. No ORM, no WebSockets, no Redis, no Passport.js. The entire database has 4 tables, the most complex query is a single SELECT, and the game has one concurrent user. Every technology decision is calibrated to this reality. The existing frontend stack (TypeScript 5.9, Vite 7.3, Vitest 3.2, Zod 3.24) is unchanged.

The primary risks are: (1) SeasonState serialization -- the `fatigueMap` uses a JavaScript Map which silently serializes to `{}`, causing silent data loss; (2) deployment complexity -- the project jumps from static file hosting to running a live Node process, requiring process management and reverse proxying; and (3) randomuser.me dependency on the critical path of game creation. All three have clear mitigations: round-trip serialization tests, systemd service configuration planned upfront, and a name cache with fallback to the existing procedural generator.

## Key Findings

### Recommended Stack

The existing frontend stack stays untouched. New dependencies are server-only and deliberately few.

**Core technologies:**
- **Express 5.2** (HTTP server) -- v5 is the npm default since March 2025, native promise support eliminates async error handling boilerplate
- **better-sqlite3 12.6** (database) -- synchronous API matches the single-process, single-user model; fastest Node SQLite driver; zero external services
- **express-session 1.19** (auth) -- simple cookie-based sessions; no JWT complexity for a same-origin single-player game
- **tsx 4.21** (dev/runtime) -- runs TypeScript server without a compile step; sub-second restarts in dev

**Explicitly not needed:** ORM (4 tables), WebSockets (no real-time), Redis (one user), Passport.js (two auth endpoints), CORS middleware (same-origin), dotenv (Node 20+ `--env-file`), migration framework (`CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version`).

### Expected Features

**Must have (table stakes for v1.1):**
- SQLite database with 4 tables (games, saves, name_cache, player_stats)
- Express API server with ~6 REST endpoints + Vite dev proxy
- SeasonState serialize/deserialize handling Map-to-Object conversion
- Login screen (team name + password) gating save game access
- Auto-save after each matchday (zero-friction persistence)
- 25-man squads (expanded from 16; independent frontend change)
- randomuser.me name cache with procedural fallback
- Per-match player stats extraction and season aggregation

**Should have (v1.1.x polish):**
- Quick-sim goalscorer attribution (expose GameEventLog from engine)
- League-wide stat leaderboards (top scorer, most assists)
- Match history browser on fixtures screen
- Nationality field on PlayerState with flag display
- Player form indicator (rolling 5-match average)

**Defer (v1.2+):**
- Export/import save as JSON (cross-device)
- Player of the month/season awards
- Historical season records and career stats tables

### Architecture Approach

The simulation stays client-side (22 agents at 30Hz with Canvas rendering cannot move server-side without a complete rewrite). The backend is a pure persistence layer: Express receives JSON blobs via POST, stores them in SQLite, returns them via GET. The client owns all game logic -- the server validates only auth and payload shape. State is stored as a single JSON blob per save (50-80KB), not normalized into relational tables, because there is one save per user and no cross-save queries needed. Player stats get their own table because they benefit from aggregation queries.

**Major components:**
1. **Frontend game** (existing, modified) -- simulation, rendering, UI; adds login screen + save/load wiring + API client
2. **Express server** (new, `server/`) -- REST endpoints, session auth, Zod request validation
3. **SQLite database** (new, `data/games.db`) -- 4 tables; auto-created on first run; WAL mode
4. **Serialization layer** (new, in `season.ts`) -- `serializeSeason()`/`deserializeSeason()` handling Map-to-Object conversion
5. **Name cache service** (new) -- proxies randomuser.me, caches in SQLite, fallback to `nameGen.ts`

### Critical Pitfalls

1. **Map serialization data loss** -- `JSON.stringify()` silently converts `fatigueMap` to `{}`. Must convert Map to Record before serializing and write a mandatory round-trip test before any other persistence work begins.
2. **Deployment complexity jump** -- going from static files to a live Node process requires systemd, nginx reverse proxy, port management, and crash recovery. Plan the deployment model in Phase 1, execute manually via SSH before automating.
3. **randomuser.me as boot blocker** -- free API with no SLA and documented outages. Never call it on the critical path. Pre-cache names in SQLite, keep `nameGen.ts` as hard fallback.
4. **Squad size magic numbers** -- hardcoded `16`, `5` (bench), and `slice(11)` patterns scattered through codebase. Must grep and replace with named constants before persistence encodes the wrong assumptions.
5. **Auth scope creep** -- the instinct to build production-grade auth for a single-player personal project. Time-box to 4 hours. Cookie sessions, bcrypt hashing, no email, no OAuth.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation -- Serialization + Database + Express Skeleton

**Rationale:** Serialization is the riskiest piece (silent data loss from Map) and has zero dependencies. The database schema and Express skeleton are prerequisites for everything else. Building and testing these first de-risks the entire milestone.
**Delivers:** Proven serialize/deserialize with round-trip tests; Express server with health check; SQLite schema created on startup with WAL mode; separate `tsconfig.server.json`; Vite dev proxy configured.
**Addresses:** SQLite database, Express API server, SeasonState serialization (from FEATURES.md)
**Avoids:** Map serialization data loss (Pitfall 1), WAL mode omission (Pitfall 5), Vite proxy misconfiguration

### Phase 2: Auth + Save/Load + Login Screen

**Rationale:** With the server running and serialization proven, auth and save/load are the core persistence flow. Login screen gates access to the hub. This phase delivers the primary user-facing value of the milestone.
**Delivers:** Register/login endpoints with bcrypt + cookie sessions; save/load endpoints accepting JSON blobs; login screen UI; auto-save after matchday; manual save button in hub.
**Addresses:** Simple login, game save/load, auto-save (from FEATURES.md)
**Avoids:** Auth scope creep (Pitfall 6), dual state ownership (Pitfall 2)

### Phase 3: 25-Man Squads

**Rationale:** Independent of the backend -- purely frontend. Can be built in parallel with or after persistence. Placing it here avoids encoding 16-player assumptions into save files created in Phase 2.
**Delivers:** Expanded ROLES array (16 to 25), updated squad selection validation, updated AI team simulation, updated squad screen UI layout.
**Addresses:** 25-man squads (from FEATURES.md)
**Avoids:** Squad size magic numbers (Pitfall 7)

### Phase 4: Name Cache + randomuser.me Integration

**Rationale:** Depends on the server and database from Phase 1. Lower priority than core save/load. The existing `nameGen.ts` works as a fallback, so this is an enhancement not a blocker.
**Delivers:** `/api/names/batch` endpoint; SQLite name_cache table; batch fetch from randomuser.me with nationality filtering; fallback to procedural generator.
**Addresses:** Realistic names via randomuser.me (from FEATURES.md)
**Avoids:** randomuser.me as boot blocker (Pitfall 4)

### Phase 5: Player Stats Persistence

**Rationale:** Depends on save/load working (Phase 2) and requires a post-match hook that does not yet exist. The `GameEventLog.getPlayerStats()` output must be captured and persisted after each match.
**Delivers:** Per-match stat extraction hook; player_stats table population; season stats aggregation; stats display on squad screen.
**Addresses:** Season player stats persisted in DB (from FEATURES.md)
**Avoids:** N/A -- standard CRUD pattern

### Phase 6: Deployment

**Rationale:** Deploy after all features work locally. The deployment model (systemd, nginx reverse proxy, SQLite file location) should be planned in Phase 1 but executed here to avoid deploying broken features.
**Delivers:** Updated deploy.yml; nginx `/api` proxy; systemd service for Express; SQLite backup cron; verified end-to-end on VPS.
**Addresses:** Production deployment (from ARCHITECTURE.md)
**Avoids:** Static-to-process deployment gap (Pitfall 3)

### Phase Ordering Rationale

- **Serialization first** because it is the single highest-risk item with the cheapest fix. A round-trip test takes an hour; discovering Map data loss after building the entire save/load pipeline wastes days.
- **Auth + save/load before squads** because save files created during testing will encode squad size assumptions. Getting persistence working with the current 16-player squads first, then expanding to 25, ensures the serialization layer handles both.
- **25-man squads is independent** and can be done in parallel with any phase. Placing it at Phase 3 is a suggestion, not a hard dependency. However, it MUST be done before deployment so production saves use the correct squad size.
- **Name cache after save/load** because the existing `nameGen.ts` works fine. Names are cosmetic; persistence is the milestone's reason for existing.
- **Stats last** because they require the most integration (post-match hook, engine changes for quick-sim attribution) and are additive to a working save/load system.
- **Deployment last** because deploying broken features to the VPS is worse than not deploying at all. Local dev with Vite proxy is sufficient for all development.

### Research Flags

**Phases likely needing deeper research during planning:**
- **Phase 2 (Auth + Save/Load):** Resolve JWT vs cookie sessions contradiction across research files (recommendation: use express-session with cookies). Determine exact save payload size with 25-man squads.
- **Phase 6 (Deployment):** Verify VPS has build tools for better-sqlite3 native addon (`python3 make g++`). Confirm nginx config for reverse proxy alongside existing static serving.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Foundation):** Express + better-sqlite3 + Vite proxy is thoroughly documented. No unknowns.
- **Phase 3 (25-Man Squads):** Pure frontend refactor with known touchpoints. Grep for magic numbers, replace with constants.
- **Phase 4 (Name Cache):** randomuser.me API is well-documented, fetch-and-cache is a standard pattern.
- **Phase 5 (Player Stats):** Standard CRUD with aggregation queries. `GameEventLog` already produces the data.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages verified on npm with current versions. Express 5 is the npm default. better-sqlite3 is the standard Node SQLite driver. No exotic dependencies. |
| Features | HIGH | Features derived directly from PROJECT.md milestone definition and codebase analysis. Specific files and line numbers identified for each change. |
| Architecture | HIGH | Express + SQLite + JSON blob storage is a well-established pattern. Architecture is intentionally simple -- no novel decisions. |
| Pitfalls | HIGH | Pitfalls are codebase-specific (Map serialization, hardcoded squad sizes) with concrete file references and line numbers. Not generic warnings. |

**Overall confidence:** HIGH

### Gaps to Address

- **JWT vs sessions contradiction:** STACK.md recommends express-session (cookies), ARCHITECTURE.md proposes JWT with jsonwebtoken. Resolution: use express-session with cookie-based sessions. JWT adds unnecessary complexity for a same-origin single-player game. Sessions are simpler and do not require token management on the client.
- **pm2 vs systemd contradiction:** STACK.md recommends systemd, ARCHITECTURE.md recommends pm2. Resolution: use systemd. The VPS already runs systemd, pm2 is an extra dependency, and a single Express process does not need pm2's cluster/monitoring features.
- **bcrypt vs SHA-256 contradiction:** STACK.md says SHA-256 with salt (no dependency), PITFALLS.md and ARCHITECTURE.md say bcrypt. Resolution: use bcrypt (async). It is the standard for password hashing and the `bcrypt` package is tiny. SHA-256 is technically sufficient but bcrypt is the right habit.
- **Save payload size with 25-man squads:** Estimated at 50-80KB but not measured. With 25 players x 20 teams x ~15 fields each, actual size may be larger. Measure during Phase 1 serialization work.
- **Quick-sim performance with GameEventLog exposure:** Exposing the log from quick-sim adds ~10% overhead (FEATURES.md estimate). Not measured. Defer measurement to Phase 5 when stats are implemented.

## Sources

### Primary (HIGH confidence)
- Express npm registry -- v5.2.1 confirmed as latest
- better-sqlite3 npm/GitHub -- v12.6.2, synchronous API design
- randomuser.me documentation -- API v1.4, nationality filtering, seed support, 5000 results max
- Codebase analysis -- `season.ts`, `teamGen.ts`, `nameGen.ts`, `gameLog.ts`, `quickSim.ts`, `main.ts`, `engine.ts`, `deploy.yml`, `vite.config.ts`
- PROJECT.md -- milestone definition and explicit out-of-scope items

### Secondary (MEDIUM confidence)
- better-sqlite3-session-store npm -- evaluated and rejected (low adoption)
- randomuser.me GitHub issues #42, #66 -- documented outages (502 errors)
- Uptrends State of API Reliability 2025 -- API uptime trends

### Tertiary (LOW confidence)
- Save payload size estimate (50-80KB) -- not measured, based on field count extrapolation

---
*Research completed: 2026-03-06*
*Ready for roadmap: yes*

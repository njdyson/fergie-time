# Architecture Patterns

**Domain:** Backend integration for existing browser-based football management game
**Researched:** 2026-03-06
**Confidence:** HIGH -- standard Express+SQLite patterns applied to well-understood existing codebase

---

## Current Architecture (Before v1.1)

```
[Browser]
  main.ts (monolithic ~1200 lines)
    - Creates SeasonState in module-level `let` variable
    - Runs SimulationEngine in browser at 30Hz
    - Renders via CanvasRenderer at 60fps
    - UI screens: Hub, Squad, Fixtures, Table
    - Season state LOST on page refresh
    - Tactics saved in localStorage (survives refresh)
    - Tuning settings saved in localStorage (survives refresh)

[VPS: 185.230.218.116]
  nginx serves static files from /var/www/vhosts/psybob.uk/ft.psybob.uk/dist
  GitHub Actions: SSH -> git pull -> npm run build
  No backend process running
```

**The core problem:** `SeasonState` lives in a module-level variable. Refreshing the browser destroys the season -- 38 matchdays of progress gone. The simulation engine, rendering, and all game logic stay client-side. The backend exists solely to persist state across sessions and authenticate save slots.

---

## Recommended Architecture (v1.1)

```
[Browser - Vite Dev / Static Build]
  main.ts
    |-- Still creates SeasonState in memory during play
    |-- Still runs SimulationEngine in browser
    |-- NEW: Login screen gates access to hub
    |-- NEW: "Save Game" / "Load Game" buttons in hub
    |-- NEW: api/client.ts handles all HTTP calls
    |
  src/api/
    client.ts       -- fetch wrapper (login, register, save, load, fetchNames)
  src/season/
    season.ts       -- NEW: serializeSeason() / deserializeSeason() functions

[VPS: 185.230.218.116]
  nginx
    |-- Serves /dist as static files (unchanged)
    |-- NEW: reverse proxy /api/* -> localhost:3001
    |
  NEW: Express server (port 3001)
    |-- POST /api/auth/register
    |-- POST /api/auth/login
    |-- POST /api/games/save
    |-- GET  /api/games/load
    |-- GET  /api/names/batch
    |
  NEW: SQLite database
    |-- ./data/games.db (auto-created on first run)
    |-- Managed by better-sqlite3 (synchronous API)
    |
  NEW: pm2 daemon manager
    |-- Runs Express as background process
    |-- Auto-restarts on crash
```

### Why This Shape

The simulation MUST stay in the browser. It runs 22 autonomous agents at 30Hz with real-time Canvas rendering -- moving it server-side would require WebSocket streaming and eliminate the direct Canvas interaction. The backend is a "filing cabinet": it receives serialized game state blobs and hands them back. This is the thinnest possible backend that solves the persistence problem.

---

## Component Boundaries

| Component | Responsibility | Communicates With | New/Modified |
|-----------|---------------|-------------------|-------------|
| **Frontend game** (existing) | Simulation, rendering, UI | API client | Modified (login + save/load UI) |
| **API client** (`src/api/client.ts`) | HTTP calls, auth token storage | Express API | **New** |
| **Serialization** (`src/season/season.ts`) | Convert SeasonState to/from JSON-safe format | Frontend game | **Modified** |
| **Express server** (`server/`) | REST endpoints, auth, validation | SQLite, randomuser.me | **New** |
| **SQLite database** (`data/games.db`) | Persistent storage | Express only | **New** |
| **nginx** (existing) | Static files + reverse proxy | Browser, Express | **Modified** (add `/api` proxy) |
| **pm2** | Process management for Express | Express | **New** |

---

## New Files to Create

```
server/
  index.ts              # Express app, middleware, listen on 3001
  db.ts                 # SQLite init, schema migration, connection singleton
  routes/
    auth.ts             # register + login endpoints
    games.ts            # save + load endpoints
    names.ts            # randomuser.me cache proxy
  middleware/
    auth.ts             # JWT verification middleware

src/api/
  client.ts             # Typed fetch wrapper for all API calls

src/ui/screens/
  loginScreen.ts        # Login/register UI (new screen)
```

## Existing Files to Modify

| File | Change | Impact |
|------|--------|--------|
| `src/season/season.ts` | Add `serializeSeason()` / `deserializeSeason()` | Small -- handle Map<->Object conversion for fatigueMap |
| `src/main.ts` | Add login flow at startup, save/load button wiring, auth state | Medium -- ~60 new lines, no structural changes |
| `vite.config.ts` | Add `server.proxy` for `/api` -> `localhost:3001` | 3 lines |
| `package.json` | Add server deps + scripts | Small |
| `.github/workflows/deploy.yml` | Add `pm2 restart` after build | Small |
| `index.html` | Add login screen container div | Small |

---

## Data Flow

### Registration Flow

```
User enters team name + password
  -> POST /api/auth/register { teamName, password }
  -> Express: hash password (bcrypt), INSERT into users table
  -> Return { token: JWT }
  -> Frontend: store token in localStorage, proceed to createSeason()
```

### Login + Load Flow

```
User enters team name + password
  -> POST /api/auth/login { teamName, password }
  -> Express: verify bcrypt hash, generate JWT, check for saved game
  -> Return { token, hasSave: true/false }
  -> If hasSave: GET /api/games/load (with Bearer token)
    -> Express: SELECT season_data FROM saves WHERE user_id = ?
    -> Return { seasonData: SerializedSeasonState, playerStats: [...] }
    -> Frontend: deserializeSeason(data) -> SeasonState
    -> Set module-level seasonState, show hub screen
  -> If !hasSave: proceed to createSeason(), show hub screen
```

### Save Flow

```
User clicks "Save Game" in hub
  -> serializeSeason(seasonState) -> JSON-safe object
  -> POST /api/games/save { seasonData, playerStats }
    (with Bearer token)
  -> Express: validate token, UPSERT into saves table
  -> Return { success: true }
  -> Frontend: show "Game Saved" toast
```

### Auto-Save (Recommended)

Trigger save automatically after each matchday completes (after `finalizeMatchday()` returns). This prevents data loss without requiring the user to remember to save. Keep the manual "Save Game" button as well.

### Name Fetch Flow

```
Season creation needs 19 teams x 25 players = 475 names
  -> GET /api/names/batch?count=500&nat=gb
  -> Express: check name_cache table
    -> If enough cached names: return from cache
    -> If not: fetch from randomuser.me, cache results, return
  -> Frontend: use names for player generation
```

---

## SeasonState Serialization

The `SeasonState` interface uses `Map<string, number>` for `fatigueMap`. JavaScript Maps do not survive `JSON.stringify()`. This is the single serialization challenge.

**Solution: Explicit conversion at the boundary.**

```typescript
// In season.ts

export interface SerializedSeasonState {
  readonly seasonNumber: number;
  readonly playerTeamId: string;
  teams: SeasonTeam[];
  fixtures: Fixture[];
  table: TeamRecord[];
  currentMatchday: number;
  fatigueMap: Record<string, number>;  // Object, not Map
  readonly seed: string;
}

export function serializeSeason(state: SeasonState): SerializedSeasonState {
  return {
    ...state,
    fatigueMap: Object.fromEntries(state.fatigueMap),
  };
}

export function deserializeSeason(data: SerializedSeasonState): SeasonState {
  return {
    ...data,
    fatigueMap: new Map(Object.entries(data.fatigueMap)),
  };
}
```

**Critical: Write round-trip tests.** Create a season, serialize it, deserialize it, verify every field matches. The fatigueMap conversion is the obvious risk, but also verify that `readonly` fields, nested arrays (fixtures, teams), and the table array survive intact. Zod validation on the deserialized shape adds a safety net.

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_name TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS saves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  season_data TEXT NOT NULL,          -- Full SeasonState as JSON blob
  saved_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id)                     -- One save per user
);

CREATE TABLE IF NOT EXISTS name_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nationality TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS player_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  season_number INTEGER NOT NULL,
  appearances INTEGER DEFAULT 0,
  goals INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  UNIQUE(save_id, player_id, season_number)
);
```

### Why JSON Blob for SeasonState

The alternative -- normalizing teams, fixtures, and table records into relational tables -- would mean 5+ tables, complex JOINs for load, and multi-table transactions for save. For a single-player game with one save slot per user, this is pure overhead. The entire SeasonState is roughly 50-80KB of JSON (20 teams x 25 players + 380 fixtures + 20 table rows + fatigue entries). SQLite handles this trivially.

Player stats get their own table because they accumulate across seasons and benefit from queries (career totals, season leaderboards).

---

## API Design

### Endpoints

| Method | Path | Auth | Request Body | Response |
|--------|------|------|-------------|----------|
| POST | `/api/auth/register` | No | `{ teamName: string, password: string }` | `{ token: string }` |
| POST | `/api/auth/login` | No | `{ teamName: string, password: string }` | `{ token: string, hasSave: boolean }` |
| POST | `/api/games/save` | JWT | `{ seasonData: SerializedSeasonState, playerStats?: PlayerStatRow[] }` | `{ success: true }` |
| GET | `/api/games/load` | JWT | -- | `{ seasonData: SerializedSeasonState, playerStats: PlayerStatRow[] }` |
| GET | `/api/names/batch` | No | Query: `?count=50&nat=gb` | `{ names: Array<{first: string, last: string}> }` |

### Auth: JWT

Use `jsonwebtoken`. Token payload: `{ userId: number, teamName: string }`. Expiry: 30 days. Stored in `localStorage` on the client. No refresh tokens -- if expired, user logs in again.

**Why JWT over sessions:** No server-side session store. Express can restart without losing sessions. For a personal single-player game, this is the right simplicity level.

### Validation

Use `zod` (already in the project's dependencies) for request body validation on the server. The game state blob needs only shallow validation (is it valid JSON? does it have the expected top-level keys?). Deep validation of the SeasonState structure happens in `deserializeSeason()` on the client.

---

## Patterns to Follow

### Pattern 1: Vite Dev Proxy

During development, Vite runs on port 5173 and Express on port 3001. Configure Vite to proxy `/api` so the frontend uses relative URLs that work identically in dev and production.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: { target: 'es2022' },
});
```

In production, nginx handles the same `/api` routing. Zero code changes between environments.

### Pattern 2: Separate TypeScript Configs

The server runs in Node (no DOM, needs `node:` built-ins). The frontend runs in the browser (DOM types, bundler resolution). They need separate configs.

```
tsconfig.json              # Frontend (existing -- DOM, noEmit, bundler resolution)
server/tsconfig.json       # Server (NodeNext, node types, emit or use tsx)
```

**Use `tsx` to run the server** in both development and production. The server is trivially small (5 route handlers). The JIT overhead of tsx is negligible. This avoids maintaining a server build step entirely.

### Pattern 3: better-sqlite3

Use `better-sqlite3` because:
- **Synchronous API** -- no callbacks/promises for simple queries, matches the project's style
- **Fastest Node SQLite binding** -- native C++ addon
- **WAL mode** -- enables concurrent reads (though this game is single-user, it's free)

Do NOT use `sqlite3` (callback-based, slower), `sql.js` (WASM, meant for browser), or Prisma/Drizzle (ORM overhead for 4 tables is absurd).

### Pattern 4: Thin API Client

Create `src/api/client.ts` as pure async functions. No classes, no state management, no caching. Just fetch wrappers that return typed results.

```typescript
// src/api/client.ts
const BASE = '/api';

let authToken: string | null = localStorage.getItem('fergie-token');

export function setToken(token: string): void {
  authToken = token;
  localStorage.setItem('fergie-token', token);
}

export function clearToken(): void {
  authToken = null;
  localStorage.removeItem('fergie-token');
}

export function hasToken(): boolean {
  return authToken !== null;
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API error ${res.status}`);
  }
  return res.json();
}

export function login(teamName: string, password: string) {
  return apiFetch<{ token: string; hasSave: boolean }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ teamName, password }),
  });
}

export function register(teamName: string, password: string) {
  return apiFetch<{ token: string }>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ teamName, password }),
  });
}

export function saveGame(seasonData: SerializedSeasonState) {
  return apiFetch<{ success: boolean }>('/games/save', {
    method: 'POST',
    body: JSON.stringify({ seasonData }),
  });
}

export function loadGame() {
  return apiFetch<{ seasonData: SerializedSeasonState }>('/games/load');
}
```

### Pattern 5: Database Migration on Startup

Run `CREATE TABLE IF NOT EXISTS` statements when the server starts. No migration framework needed for 4 tables. If the schema needs to change later, add versioned migration files.

```typescript
// server/db.ts
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = path.join(process.cwd(), 'data', 'games.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Performance settings
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema init
db.exec(`
  CREATE TABLE IF NOT EXISTS users ( ... );
  CREATE TABLE IF NOT EXISTS saves ( ... );
  CREATE TABLE IF NOT EXISTS name_cache ( ... );
  CREATE TABLE IF NOT EXISTS player_stats ( ... );
`);

export default db;
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Moving Simulation Server-Side

**What:** Running the match engine on Express and streaming results to the client.
**Why bad:** The entire game is built around real-time Canvas rendering of a simulation running at 30Hz in the browser. Moving it server-side would require WebSocket streaming, a complete rewrite of the rendering pipeline, and eliminate the direct Canvas interaction. The match engine handles 22 agents evaluating utility functions every tick -- this works well in the browser.
**Instead:** Keep simulation client-side. The server is only a persistence layer.

### Anti-Pattern 2: Normalizing Game State into Relational Tables

**What:** Separate tables for teams, players, fixtures, table_records with JOINs to reconstruct SeasonState.
**Why bad:** The game has one save slot per user. The entire state is ~50-80KB JSON. Five-table JOINs and multi-table transactions add complexity for zero benefit. If you need to query individual player data, that is what the separate `player_stats` table is for.
**Instead:** One `saves` row per user with a `season_data TEXT` column.

### Anti-Pattern 3: Overengineered Auth

**What:** OAuth providers, email verification, password reset flows, session stores with Redis.
**Why bad:** This is a personal single-player game. Auth exists to associate a save file with a name+password pair. Nothing more.
**Instead:** Simple JWT + bcrypt. No email, no OAuth, no password reset. If a user forgets their password, reset it at the database level.

### Anti-Pattern 4: Shared Monorepo Tooling

**What:** Turborepo, Nx, or Lerna to share types between frontend and server.
**Why bad:** You are sharing approximately 3 type definitions (SerializedSeasonState, request schemas, response shapes). Monorepo tooling adds CI complexity, workspace config, and hoisted dependency headaches for a solo project.
**Instead:** Duplicate the small number of shared types. Or create a `shared/` directory and manually include it in both tsconfigs.

### Anti-Pattern 5: ORM for 4 Tables

**What:** Prisma, Drizzle, or TypeORM for the database layer.
**Why bad:** The entire database has 4 tables. The most complex query is `SELECT season_data FROM saves WHERE user_id = ?`. An ORM adds schema generation, migration tooling, client generation, and dependency weight for queries that are one-liners in raw SQL.
**Instead:** `better-sqlite3` with raw SQL. Wrap queries in typed functions in `db.ts`.

---

## Deployment Changes

### nginx Addition

Add to the existing server block for `ft.psybob.uk`:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Updated deploy.yml

```yaml
script: |
  cd /var/www/vhosts/psybob.uk/ft.psybob.uk
  git pull
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  npm install
  npm run build
  npx pm2 restart fergie-api 2>/dev/null || npx pm2 start server/index.ts --name fergie-api --interpreter $(which npx) --interpreter-args tsx
```

### pm2 Ecosystem File (Recommended)

```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'fergie-api',
    script: 'server/index.ts',
    interpreter: 'npx',
    interpreter_args: 'tsx',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: 'generate-a-real-secret-here',
    },
  }],
};
```

### SQLite Backup

Add a daily cron on the VPS:

```bash
0 3 * * * cp /var/www/vhosts/psybob.uk/ft.psybob.uk/data/games.db /var/www/vhosts/psybob.uk/ft.psybob.uk/data/backups/games-$(date +\%Y\%m\%d).db
```

---

## Suggested Build Order

Order minimizes risk and provides testable checkpoints. Each step can be deployed and verified before starting the next.

### Step 1: SeasonState Serialization + Tests

Add `serializeSeason()` / `deserializeSeason()` to `season.ts`. Write round-trip tests verifying Map<->Object conversion, nested arrays, all fields. This is the riskiest piece -- if serialization loses data, everything downstream breaks.

**Deliverable:** Proven serialization with passing tests.
**Risk:** LOW but must be verified. The only non-trivial conversion is `Map<string, number>` -> `Record<string, number>`.

### Step 2: Express Skeleton + Database + Health Check

Create `server/` directory with Express app, better-sqlite3 connection, schema creation, and `GET /api/health` endpoint. Run locally with `tsx`.

**Deliverable:** Express starts, creates SQLite file, responds to health check.

### Step 3: Auth Endpoints

Add register and login with bcrypt + JWT. Test with curl. No frontend changes.

**Deliverable:** Can create account and receive JWT via API.

### Step 4: Save/Load Endpoints

Add save and load endpoints accepting JWT auth. Store/retrieve JSON blobs.

**Deliverable:** Can POST serialized SeasonState and GET it back via API.

### Step 5: Frontend Integration

Add API client module. Add login screen. Wire save/load into hub screen. Add Vite dev proxy. Add auto-save after matchday completion.

**Deliverable:** Full save/load flow working in browser during development.

### Step 6: Deploy to VPS

Update deploy.yml. Configure nginx reverse proxy. Set up pm2. Verify end-to-end on production VPS.

**Deliverable:** Game persistence working on ft.psybob.uk.

### Step 7: Name Cache

Add `/api/names/batch` endpoint that proxies randomuser.me and caches results in SQLite. Modify team generation to use cached names instead of the procedural name generator.

**Deliverable:** Realistic player names from randomuser.me.

### Step 8: Player Stats Table

Add player_stats recording after each match. Add stats display to squad screen. Stats accumulate across seasons within a save.

**Deliverable:** Career stats visible in squad screen.

---

## Sources

- Codebase analysis: `src/main.ts`, `src/season/season.ts`, `src/ui/tacticStore.ts`, `vite.config.ts`, `package.json`, `.github/workflows/deploy.yml`, `tsconfig.json`
- Deployment target: `deploy.yml` shows VPS at 185.230.218.116, path `/var/www/vhosts/psybob.uk/ft.psybob.uk`, nginx serving static files
- Architecture decisions driven by existing constraints: single VPS, solo developer, static frontend, browser-based simulation engine, existing localStorage patterns for tactics/tuning
- Confidence: HIGH -- Express+SQLite+nginx reverse proxy is a standard, well-documented pattern. The only project-specific risk is SeasonState serialization fidelity (Map conversion), which is mitigated by tests in Step 1.

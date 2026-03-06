# Stack Research: v1.1 Data Layer Additions

**Domain:** Backend data layer for existing browser-based game
**Researched:** 2026-03-06
**Confidence:** HIGH

## Scope

This research covers ONLY the new dependencies needed for the v1.1 Data Layer milestone. The existing frontend stack (TypeScript 5.9, Vite 7.3, Vitest 3.2, Zod 3.24, seedrandom 3.0) is validated and unchanged.

## Existing Stack (Do Not Change)

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | ~5.9.3 | Language |
| Vite | ^7.3.1 | Frontend bundler + dev server |
| Vitest | ^3.2.3 | Testing |
| Zod | ^3.24.2 | Schema validation (reuse for API request/response validation) |
| seedrandom | ^3.0.5 | Deterministic RNG |

---

## New Dependencies

### Core Server

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Express | ^5.2.1 | HTTP server + API routes | v5 is now the npm default (March 2025). Native promise support in middleware -- rejected promises are caught by the router as errors, eliminating the old `express-async-errors` hack. Mature, minimal surface area. Perfect thin API layer over SQLite. |
| better-sqlite3 | ^12.6.2 | SQLite driver | Synchronous API is dramatically simpler than async alternatives -- no callback/promise ceremony for what is fundamentally a single-process, single-user game server. Fastest Node SQLite driver. Single `.db` file on VPS, zero external services. |
| @types/better-sqlite3 | ^7.6.14 | TypeScript types | better-sqlite3 ships no built-in types. |
| express-session | ^1.19.0 | Session middleware | Standard Express session management. Simple cookie-based sessions are all a single-player game needs -- no JWT complexity, no token refresh logic. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| helmet | ^8.1.0 | Security headers | Always -- one line to set Content-Security-Policy, X-Frame-Options, etc. No config needed. |
| compression | ^1.8.0 | Gzip responses | Always -- match engine state and squad data payloads can be large JSON blobs. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| tsx | ^4.21.0 | Run TypeScript server without compile step | `tsx watch server/index.ts` for dev with auto-restart. Uses esbuild internally -- sub-second restarts. Replaces the old ts-node + nodemon combo entirely. |
| @types/express | ^5.0.0 | Express TypeScript types | Required for Express 5 type coverage. |
| @types/express-session | ^1.18.0 | Session types | TypeScript types for express-session. |
| @types/compression | ^1.7.5 | Compression types | TypeScript types for compression middleware. |

---

## What Does NOT Need a Dependency

| Capability | Why No Package |
|------------|----------------|
| HTTP client for randomuser.me | Node 18+ has global `fetch()`. Native fetch handles simple GET requests. |
| Password hashing | `crypto.createHash('sha256')` is built into Node. This is game-save protection for a personal project, not banking auth. SHA-256 with a per-game salt is sufficient. |
| Session store | Write a ~40-line custom store using better-sqlite3 implementing `get/set/destroy/touch`. Existing packages (`better-sqlite3-session-store`, `connect-sqlite3`) have low download counts and uncertain compatibility with better-sqlite3 v12. Rolling your own is trivial and fully under your control. |
| CORS middleware | In production, Express serves both API and static files from the same origin -- no CORS needed. In dev, Vite's proxy handles it. |
| dotenv | Node 20+ supports `--env-file .env` natively. But for a personal project, hardcoding the port in the server file is fine. |
| Migration library | ~5 tables. Use `CREATE TABLE IF NOT EXISTS` in a schema init function. Track schema version with SQLite's `PRAGMA user_version`. |
| Process manager (PM2) | One Node process. Use a systemd service file -- already available on the VPS. |

---

## TypeScript Configuration for Server

The existing `tsconfig.json` targets the browser (includes `DOM` libs, uses `bundler` moduleResolution, sets `noEmit`). The server needs a separate config for IDE type-checking.

**Create `tsconfig.server.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "esModuleInterop": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["server"]
}
```

tsx handles actual execution -- this config is for IDE type-checking and `tsc --noEmit` validation only.

---

## Project Structure Addition

```
fergie-time/
  server/                  <-- NEW: all backend code lives here
    index.ts               <-- Express app entry, static file serving
    db.ts                  <-- SQLite connection + schema init (CREATE TABLE IF NOT EXISTS)
    routes/
      auth.ts              <-- POST /api/auth/create, POST /api/auth/login
      game.ts              <-- POST /api/game/save, GET /api/game/load
      players.ts           <-- GET /api/players/names (triggers cache fill if needed)
    services/
      nameCache.ts         <-- Fetch from randomuser.me, write to SQLite cache
      sessionStore.ts      <-- Custom express-session store (~40 lines)
  src/                     <-- EXISTING: frontend code (unchanged)
  data/                    <-- NEW: runtime data (gitignored)
    fergie-time.db         <-- Created at first startup
  tsconfig.server.json     <-- NEW: server-specific TS config
```

Add to `.gitignore`:
```
data/
*.db
```

---

## Vite Dev Proxy Configuration

During development, Vite proxies `/api` calls to the Express dev server. No CORS needed.

```typescript
// vite.config.ts -- add server.proxy
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

---

## Production Serving Strategy

Express serves everything in production. No nginx reverse proxy needed for a single-site personal project.

```typescript
// server/index.ts -- production static serving
import express from 'express';
import path from 'path';

const app = express();

// API routes first
app.use('/api/auth', authRouter);
app.use('/api/game', gameRouter);
app.use('/api/players', playersRouter);

// Serve Vite build output
app.use(express.static(path.join(import.meta.dirname, '../dist')));

// SPA fallback -- all non-API routes serve index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(import.meta.dirname, '../dist/index.html'));
});

app.listen(3001);
```

---

## randomuser.me Integration Details

**API endpoint:** `https://randomuser.me/api/1.4/`
**Auth:** None required (no API key).
**Rate limit:** Not documented. Treat as generous but don't abuse.
**Max per request:** 5,000 results.

**Fetch strategy:** Bulk-fetch at game creation time, cache in SQLite, never hit the API during gameplay.

```
GET https://randomuser.me/api/1.4/?results=100&nat=gb&inc=name,nat&noinfo
```

Relevant nationalities for a football game: GB, IE, FR, DE, ES, NL, DK, NO, FI, BR, MX, TR, RS.

**Caching approach:**
1. On game creation, fetch 500+ names across relevant nationalities (5 requests of 100, varied `nat` params).
2. Store in a `player_names` table: `id, first_name, last_name, nationality, used (boolean)`.
3. When generating a player, draw an unused name matching the desired nationality, mark as used.
4. If cache runs low for a nationality, fetch another batch in background.
5. The `seed` parameter enables reproducible results for tests.

**Fallback:** If randomuser.me is down during game creation, fall back to the existing procedural name generator (already in codebase). Names are cosmetic, not gameplay-critical.

---

## Session / Auth Strategy

This is a single-player personal project. "Auth" is game-save identification, not security.

**Flow:**
1. Landing page: "Create New Game" or "Continue Game"
2. Create: Pick team name + set password. Server creates game record, sets session cookie.
3. Continue: Enter team name + password. Server verifies, sets session cookie.
4. Session cookie identifies which game save to load for all subsequent API calls.

**Implementation:**
- express-session with a custom SQLite-backed store (see `server/services/sessionStore.ts`).
- Password stored as `SHA-256(password + game_id)` using Node's built-in `crypto` module.
- No registration flow, no email, no OAuth, no password reset. If you forget your password, start a new game.

---

## Installation

```bash
# Core server dependencies
npm install express better-sqlite3 express-session helmet compression

# Type definitions (dev only)
npm install -D tsx @types/express @types/better-sqlite3 @types/express-session @types/compression
```

## Package.json Script Additions

```json
{
  "scripts": {
    "dev": "vite",
    "dev:server": "tsx watch server/index.ts",
    "build": "tsc && vite build",
    "start": "NODE_ENV=production tsx server/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

For development: run `npm run dev:server` and `npm run dev` in two terminals. The Vite proxy connects them. Solo dev, two terminal tabs is simpler than a `concurrently` dependency.

For production: `npm run build && npm run start` -- Express serves the built static files and the API from one process.

---

## Deployment Changes

Current deploy workflow (`deploy.yml`) does `git pull && npm run build`. It needs to become:

1. `git pull`
2. `npm ci` (install production deps -- Express, better-sqlite3, etc.)
3. `npm run build` (Vite builds the frontend)
4. `systemctl restart fergie-time` (restart the Express server)

**better-sqlite3 note:** It's a native addon. The VPS needs build tools installed: `apt install python3 make g++`. This is a one-time setup. After that, `npm ci` handles compilation automatically.

**SQLite file location:** Store at `/var/www/vhosts/psybob.uk/ft.psybob.uk/data/fergie-time.db`. This directory is gitignored, so `git pull` never touches it. The database persists across deployments.

**systemd service:**
```ini
[Unit]
Description=Fergie Time Game Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/vhosts/psybob.uk/ft.psybob.uk
ExecStart=/root/.nvm/versions/node/v22/bin/npx tsx server/index.ts
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

If other sites share the VPS, nginx reverse-proxies to port 3001. If this is the only site, Express can listen on port 80 directly.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Express 5 | Fastify | Fastify is marginally faster but Express has broader middleware ecosystem. Performance difference is irrelevant for a single-user game server. Project already decided on Express. |
| Express 5 | Hono | Excellent for edge/Cloudflare Workers but adds unnecessary abstraction for a VPS deployment. |
| better-sqlite3 (raw SQL) | Drizzle ORM | ORM adds abstraction over ~5 tables. Raw SQL with prepared statements is clearer and faster. Zod already handles runtime validation. |
| better-sqlite3 | PocketBase | External service, separate process, its own auth system. More complexity than a direct SQLite driver for this use case. |
| better-sqlite3 | libsql / Turso | Cloud-hosted SQLite. No benefit for a single-VPS deployment. Adds network latency to what should be a local file read. |
| express-session (cookies) | JWT tokens | JWTs solve stateless auth across multiple services. This is one server, one user. Cookie sessions are simpler. |
| Custom session store | better-sqlite3-session-store npm | Low download count, uncertain compatibility with better-sqlite3 v12. The store interface is 4 methods. |
| tsx | Node --experimental-strip-types | Node's native TS stripping is still experimental, doesn't support all TS features (enums, decorators). tsx is stable and proven. |
| Native fetch | axios | Node 18+ includes global fetch. Zero reason to add a dependency for GET requests. |
| SHA-256 | bcrypt | bcrypt is correct for real auth. This is game-save protection. SHA-256 with salt requires zero additional dependencies. |

---

## What NOT to Add

| Avoid | Why | Do Instead |
|-------|-----|------------|
| Prisma / TypeORM / Drizzle ORM | Massive overkill for 5 tables. Adds build steps, generated types, migration tooling. | Raw SQL with better-sqlite3 prepared statements. Zod for validation. |
| Socket.IO / WebSockets | No real-time requirements. Game state is request/response. | Standard REST endpoints. |
| Redis | Session/cache store for a single-user game is absurd. | SQLite stores sessions directly. |
| Passport.js | Auth framework for "team name + password" is extreme over-engineering. | Two endpoints, ~30 lines of code total. |
| PM2 | Process manager for one Node process. | systemd service file. |
| concurrently / npm-run-all | Package to run two dev commands together. | Two terminal tabs. |
| knex / umzug migrations | Migration framework for ~5 tables with one developer. | `CREATE TABLE IF NOT EXISTS` + `PRAGMA user_version`. |
| cors middleware | Same-origin in production (Express serves everything). Vite proxy in dev. | No CORS needed at all. |

---

## Version Compatibility

| Package | Requires | Notes |
|---------|----------|-------|
| Express ^5.2.1 | Node 18+ | v5 dropped support for Node <18 |
| better-sqlite3 ^12.6.2 | Node 18+, build tools (python3, make, g++) | Native addon, compiled on install |
| tsx ^4.21.0 | Node 18+ | Based on esbuild |
| express-session ^1.19.0 | Express 4.x or 5.x | Compatible with both |
| Existing Vite ^7.3.1 | Node 18+ | Already in use |

The VPS deployment workflow already uses nvm -- ensure Node 22 LTS is installed. All packages are compatible.

---

## Sources

- [Express npm](https://www.npmjs.com/package/express) -- v5.2.1 confirmed as latest (HIGH confidence)
- [Express 5.1.0 now default on npm](https://expressjs.com/2025/03/31/v5-1-latest-release.html) -- v5 transition details (HIGH confidence)
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) -- v12.6.2 confirmed (HIGH confidence)
- [better-sqlite3 GitHub](https://github.com/JoshuaWise/better-sqlite3) -- synchronous API design (HIGH confidence)
- [randomuser.me documentation](https://randomuser.me/documentation) -- API v1.4, 21 nationalities, seed support, up to 5000 results per request (HIGH confidence)
- [tsx npm](https://www.npmjs.com/package/tsx) -- v4.21.0, watch mode (HIGH confidence)
- [Vite backend integration](https://vite.dev/guide/backend-integration) -- proxy configuration (HIGH confidence)
- [express-session npm](https://www.npmjs.com/package/express-session) -- v1.19.0 (HIGH confidence)
- [better-sqlite3-session-store npm](https://www.npmjs.com/package/better-sqlite3-session-store) -- evaluated and rejected due to low adoption; custom store recommended (MEDIUM confidence)

---
*Stack research for: Fergie Time v1.1 Data Layer*
*Researched: 2026-03-06*

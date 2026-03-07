# Phase 5: Server Foundation - Research

**Researched:** 2026-03-06
**Domain:** Express server, SQLite persistence, JSON serialization, Vite dev proxy
**Confidence:** HIGH

## Summary

Phase 5 establishes the server-side foundation for the Fergie Time data layer. The work has three distinct concerns: (1) an Express API server with a health-check endpoint, (2) a SQLite database via better-sqlite3 with auto-creating schema and WAL mode, and (3) proven round-trip serialization of `SeasonState` -- specifically handling the `fatigueMap` which is a `Map<string, number>` that `JSON.stringify` silently drops.

The project already uses Vite 7.x, TypeScript 5.9, and Vitest 3.x. The server will be a separate process (not bundled by Vite) that runs alongside the Vite dev server, with Vite proxying `/api/*` requests to Express during development.

**Primary recommendation:** Use Express 5.x with better-sqlite3 12.x. Keep the server as a plain TypeScript file run with `tsx` during development. Serialize Maps as arrays-of-entries with a tagged wrapper for safe round-tripping. Store game state as a JSON blob in SQLite with a version column.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SERV-01 | Express API server with SQLite via better-sqlite3 | Express 5.x + better-sqlite3 12.x stack; see Standard Stack and Architecture Patterns |
| SERV-02 | Vite dev proxy routes /api/* to Express during development | Vite server.proxy config; see Architecture Patterns |
| SERV-04 | CORS and session management configured | cookie-session for same-origin cookie sessions; CORS not needed in dev (same-origin via proxy); see Standard Stack |
| PERS-03 | SeasonState serialization handles Map types with round-trip tests | Tagged Map serialization pattern; see Code Examples |
| PERS-04 | Save format includes version field for future migration | Version field in serialization envelope; see Architecture Patterns |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| express | ^5.1.0 | HTTP API server | Stable since Oct 2024, now default on npm, async error handling built-in |
| better-sqlite3 | ^12.6.2 | SQLite database access | Synchronous API (simpler for single-user game), fastest Node SQLite driver |
| tsx | ^4.x | Run TypeScript server without build step | Zero-config TS execution for dev, works with ESM |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cookie-session | ^2.1.0 | Cookie-based sessions | Phase 6 will need sessions; install now so SERV-04 is addressed |
| @types/better-sqlite3 | ^7.6.13 | TypeScript definitions for better-sqlite3 | Dev dependency, required for type safety |
| @types/express | ^5.x | TypeScript definitions for Express | Dev dependency |
| @types/cookie-session | ^2.x | TypeScript definitions for cookie-session | Dev dependency |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| better-sqlite3 | sql.js (Emscripten) | No native addon to compile, but slower and no WAL mode |
| Express 5 | Fastify | Fastify is faster but Express is more familiar and the project is single-user -- perf irrelevant |
| tsx | ts-node | tsx is faster startup, zero config, better ESM support |
| cookie-session | express-session + store | express-session needs a store backend; cookie-session is self-contained for small payloads |

**Installation:**
```bash
npm install express better-sqlite3 cookie-session
npm install -D @types/better-sqlite3 @types/express @types/cookie-session tsx
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  index.ts          # Express app setup, middleware, listen
  db.ts             # Database singleton, schema init, WAL pragma
  routes/
    health.ts       # GET /api/health
  serialize.ts      # SeasonState JSON encode/decode with Map handling
```

The server lives at the project root level (`server/`), NOT inside `src/`. This keeps it separate from the Vite-bundled client code. The `src/` directory continues to hold client-only code.

### Pattern 1: Vite Dev Proxy
**What:** Vite forwards `/api/*` requests to Express during development
**When to use:** Always in dev mode
**Example:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: { target: 'es2022' },
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

No `rewrite` needed -- Express routes will include the `/api` prefix (e.g., `app.get('/api/health', ...)`). This means the same paths work in both dev (proxied) and production (nginx reverse proxy).

### Pattern 2: Database Singleton with Auto-Schema
**What:** A single `getDb()` function that opens the DB, enables WAL, and creates tables if missing
**When to use:** Server startup
**Example:**
```typescript
// server/db.ts
import Database from 'better-sqlite3';
import path from 'path';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = path.join(process.cwd(), 'data', 'fergie-time.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS saves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_name TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      game_state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return db;
}
```

Note: The `data/` directory should be git-ignored. The schema anticipates Phase 6 (auth) with `team_name` and `password_hash` columns, but Phase 5 only needs to prove the DB auto-creates.

### Pattern 3: Tagged Map Serialization
**What:** Wrap Map instances in a tagged object so the reviver knows to reconstruct them
**When to use:** Serializing SeasonState for storage
**Example:**
```typescript
// server/serialize.ts
const MAP_TAG = '__MAP__';

interface SerializedMap {
  [MAP_TAG]: true;
  entries: [string, number][];
}

export function serializeState(state: SeasonState & { version: number }): string {
  return JSON.stringify(state, (_key, value) => {
    if (value instanceof Map) {
      return { [MAP_TAG]: true, entries: Array.from(value.entries()) } as SerializedMap;
    }
    return value;
  });
}

export function deserializeState(json: string): SeasonState & { version: number } {
  return JSON.parse(json, (_key, value) => {
    if (value && typeof value === 'object' && value[MAP_TAG] === true) {
      return new Map(value.entries);
    }
    return value;
  });
}
```

The tagged approach (`__MAP__: true`) is safer than checking "is it an array of arrays?" because it avoids false positives on regular nested arrays (e.g., fixture data).

### Pattern 4: Save Envelope with Version
**What:** Wrap the game state in an envelope that includes metadata
**When to use:** Every save operation
**Example:**
```typescript
interface SaveEnvelope {
  version: number;        // Schema version for future migration
  savedAt: string;        // ISO timestamp
  state: SeasonState;     // The actual game state
}
```

The `version` field starts at `1`. Future migrations can check this and transform old saves. The version lives in the envelope, not inside SeasonState itself, keeping game logic clean.

### Pattern 5: Separate tsconfig for Server
**What:** The server needs different TS settings than the client
**When to use:** Server code that runs in Node, not the browser
**Example:**
```json
// server/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"],
    "erasableSyntaxOnly": true
  },
  "include": ["."]
}
```

The client tsconfig has `"types": ["vite/client"]` and `"include": ["src"]`. The server needs `"types": ["node"]` instead and must not include DOM types.

### Anti-Patterns to Avoid
- **Bundling server with Vite:** The server is a Node process, not a browser bundle. Do NOT import it into the Vite build graph.
- **Using `verbatimModuleSyntax` for server code importing CJS:** better-sqlite3 is CJS. With `verbatimModuleSyntax`, you'd need `import Database = require('better-sqlite3')`. Instead, omit that flag in the server tsconfig or use a default import with tsx which handles interop.
- **Storing Map directly in JSON:** `JSON.stringify(new Map(...))` produces `{}`. This is the #1 serialization bug this phase must prevent.
- **Running Express on port 5173:** That is Vite's default port. Use a separate port like 3001 for Express.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQLite binding | Custom FFI/WASM wrapper | better-sqlite3 | Native binding with full WAL, transaction, and prepared statement support |
| Session management | Custom cookie signing | cookie-session | Handles signing, encoding, expiry; proven secure |
| TypeScript execution | Custom build pipeline for server | tsx | Zero-config, handles ESM/CJS interop, fast startup |
| Schema migration | Ad-hoc ALTER TABLE scripts | Version field + migration functions | Simple enough for this project; full migration libs (knex) are overkill |

**Key insight:** The server is a "filing cabinet" (per project decision). It stores and retrieves JSON blobs. Keep it minimal -- no ORM, no query builder, no complex middleware stack.

## Common Pitfalls

### Pitfall 1: Map Serialization Silent Failure
**What goes wrong:** `JSON.stringify(seasonState)` silently converts `fatigueMap` to `{}`, losing all fatigue data
**Why it happens:** Maps are not part of the JSON spec. `JSON.stringify` treats them as plain objects with no enumerable properties.
**How to avoid:** Use tagged replacer/reviver pattern (see Code Examples). Write a round-trip test that asserts `fatigueMap.size > 0` after deserialization.
**Warning signs:** Fatigue values all reset to 0 after loading a save.

### Pitfall 2: better-sqlite3 Native Build Failures
**What goes wrong:** `npm install` fails because better-sqlite3 requires native compilation (node-gyp, python3, C++ compiler)
**Why it happens:** better-sqlite3 is a native addon. Windows needs Visual Studio Build Tools; Linux needs build-essential.
**How to avoid:** Already flagged in STATE.md as a watch item. For Windows dev, `npm install --global windows-build-tools` or ensure VS Build Tools are installed. On the VPS (Phase 8), ensure `python3`, `make`, `g++` are available.
**Warning signs:** `node-gyp rebuild` errors during install.

### Pitfall 3: Vite Proxy Not Forwarding
**What goes wrong:** API requests return 404 or the Vite HTML page instead of JSON
**Why it happens:** Proxy config typo, Express not running, or wrong port number
**How to avoid:** Start Express server FIRST, then Vite. Test `/api/health` directly against Express (curl localhost:3001/api/health) before testing through the proxy.
**Warning signs:** Network tab shows HTML response for API calls.

### Pitfall 4: WAL Mode Not Persisting
**What goes wrong:** WAL mode must be set per-connection, not per-database-file
**Why it happens:** SQLite applies journal_mode per connection. If you open a new connection and forget to set WAL, it reverts.
**How to avoid:** Set `db.pragma('journal_mode = WAL')` in the `getDb()` function, which runs on every connection open.
**Warning signs:** Performance degradation under concurrent reads (Phase 6+).

### Pitfall 5: Port Conflicts in Dev
**What goes wrong:** Express and Vite try to use the same port
**Why it happens:** Default ports collide or env vars not set
**How to avoid:** Hardcode Express to 3001, Vite stays on 5173 (its default). Document both in the dev script.
**Warning signs:** EADDRINUSE errors on startup.

## Code Examples

### Express 5 Server Setup
```typescript
// server/index.ts
import express from 'express';
import { getDb } from './db.ts';

const app = express();
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize DB on startup (creates schema if needed)
getDb();

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
```

### Round-Trip Serialization Test
```typescript
// server/serialize.test.ts
import { describe, it, expect } from 'vitest';
import { serializeState, deserializeState } from './serialize.ts';

describe('SeasonState round-trip serialization', () => {
  it('preserves Map types through JSON encode/decode', () => {
    const fatigueMap = new Map<string, number>([
      ['player-1', 0.42],
      ['player-2', 0.78],
    ]);

    const state = {
      version: 1,
      seasonNumber: 1,
      playerTeamId: 'player-team',
      teams: [],
      fixtures: [],
      table: [],
      currentMatchday: 5,
      fatigueMap,
      seed: 'test-seed',
    };

    const json = serializeState(state);
    const restored = deserializeState(json);

    expect(restored.fatigueMap).toBeInstanceOf(Map);
    expect(restored.fatigueMap.size).toBe(2);
    expect(restored.fatigueMap.get('player-1')).toBeCloseTo(0.42);
    expect(restored.fatigueMap.get('player-2')).toBeCloseTo(0.78);
    expect(restored.version).toBe(1);
  });

  it('handles full SeasonState with all fields', () => {
    // Use createSeason() to build a real state, serialize, deserialize, compare
    // This catches any new Map fields added in the future
  });
});
```

### Dev Script Setup
```json
// package.json additions
{
  "scripts": {
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "dev": "npm run dev:server & npm run dev:client"
  }
}
```

Note: On Windows, the `&` background operator won't work in npm scripts. Use `concurrently` or just run two terminal tabs. A cross-platform `dev` script can use:
```json
"dev": "concurrently \"npm:dev:server\" \"npm:dev:client\""
```
This requires `npm install -D concurrently`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Express 4.x | Express 5.x (5.1+ is default on npm) | March 2025 | Async error handling, no more `app.del()`, path matching changes |
| node-sqlite3 (async) | better-sqlite3 (sync) | Mature since 2019 | Simpler API, faster for sequential workloads, ideal for single-user |
| ts-node | tsx | 2023+ | Faster startup, better ESM support, zero config |
| Manual JSON replacer/reviver | superjson or devalue | 2023+ | Libraries exist but add dependencies; for one Map field, manual is simpler |

**Deprecated/outdated:**
- Express 4.x: Still works but 5.x is now the npm default; use 5.x for new projects
- `app.del()`: Removed in Express 5, use `app.delete()`
- String-pattern routes: Express 5 changed path matching; use explicit regex or simple strings

## Open Questions

1. **Shared types between client and server**
   - What we know: `SeasonState`, `PlayerState`, `Fixture`, etc. are defined in `src/`. The server needs these types for serialization.
   - What's unclear: Whether to import from `src/` directly or duplicate/extract to a shared location.
   - Recommendation: Import directly from `src/` for now. The types are pure interfaces with no DOM dependencies. Create a barrel `src/types.ts` if needed. Refactor to a `shared/` directory only if it causes build issues.

2. **Dev script cross-platform compatibility**
   - What we know: Project runs on Windows 11. Bash `&` works in git bash but not cmd.
   - What's unclear: Whether the dev uses git bash or cmd for npm scripts.
   - Recommendation: Use `concurrently` for the combined dev script. It works on all platforms.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | Implicit (vitest reads vite.config.ts) |
| Quick run command | `npx vitest run server/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SERV-01 | Express server starts and responds to health check | integration | `npx vitest run server/health.test.ts -x` | No -- Wave 0 |
| SERV-02 | Vite proxy forwards /api/* to Express | manual | Start both servers, curl through Vite port | N/A -- manual |
| SERV-04 | CORS and session middleware configured | unit | `npx vitest run server/middleware.test.ts -x` | No -- Wave 0 |
| PERS-03 | Map types survive round-trip serialization | unit | `npx vitest run server/serialize.test.ts -x` | No -- Wave 0 |
| PERS-04 | Save format includes version field | unit | `npx vitest run server/serialize.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run server/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/serialize.test.ts` -- covers PERS-03, PERS-04
- [ ] `server/health.test.ts` -- covers SERV-01 (supertest or direct fetch)
- [ ] Vitest config may need extending to include `server/` directory (currently `include` in tsconfig only covers `src`)

## Sources

### Primary (HIGH confidence)
- [npm: better-sqlite3](https://www.npmjs.com/package/better-sqlite3) - version 12.6.2, WAL mode setup
- [npm: @types/better-sqlite3](https://www.npmjs.com/package/@types/better-sqlite3) - version 7.6.13
- [Vite Server Options](https://vite.dev/config/server-options) - proxy configuration
- [Express 5.1.0 release](https://expressjs.com/2025/03/31/v5-1-latest-release.html) - Express 5 is now the default on npm
- [MDN JSON.stringify](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify) - replacer function docs

### Secondary (MEDIUM confidence)
- [GeeksforGeeks Vite Proxy](https://www.geeksforgeeks.org/reactjs/how-to-configure-proxy-in-vite/) - proxy configuration patterns
- [DEV better-sqlite3 guide](https://dev.to/lovestaco/understanding-better-sqlite3-the-fastest-sqlite-library-for-nodejs-4n8) - WAL mode benefits

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries are mature, well-documented, and explicitly chosen in project decisions
- Architecture: HIGH - Patterns are simple and well-established; server is a minimal filing cabinet per project decision
- Pitfalls: HIGH - Map serialization bug is well-documented; native build issues are flagged in STATE.md
- Serialization: HIGH - replacer/reviver pattern is part of the JSON spec (MDN-verified)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable stack, unlikely to change)

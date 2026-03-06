# Phase 6: Auth + Persistence - Research

**Researched:** 2026-03-06
**Domain:** Authentication, password hashing, game state persistence, login UI, auto-save
**Confidence:** HIGH

## Summary

Phase 6 wires authentication and persistence into the existing Express + SQLite foundation from Phase 5. The database schema already has a `saves` table with `team_name`, `password_hash`, and `game_state` columns. The serialization layer (`server/serialize.ts`) already handles `SeasonState` with tagged Map support. The cookie-session middleware is already configured. This phase needs: (1) auth routes for register/login, (2) save/load routes, (3) a login screen on the client that gates the hub, and (4) auto-save after each matchday.

The architecture is explicitly "server as filing cabinet" -- the client remains authoritative, the server only stores and retrieves JSON blobs. OAuth/social login is explicitly out of scope (see REQUIREMENTS.md Out of Scope). Passwords are hashed with bcrypt. Sessions use cookie-session (already installed and configured).

**Primary recommendation:** Use `bcryptjs` (pure JS, zero native deps) for password hashing. Add three route files: `auth.ts` (register + login), `games.ts` (save + load). Build a login screen in vanilla DOM (consistent with existing UI pattern). Hook auto-save into `finalizeMatchday` in `main.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-01 | User can create a new game with team name + password | POST /api/auth/register route + client login screen with "New Game" form |
| AUTH-02 | User can continue an existing game by entering team name + password | POST /api/auth/login route + client login screen with "Continue" form |
| AUTH-03 | Login screen shown on app load with "New Game" / "Continue" options | New LoginScreen class, shown before hub; gates all navigation |
| AUTH-04 | Passwords hashed with bcrypt, never stored in plain text | bcryptjs hash on register, compare on login; 10 salt rounds |
| PERS-01 | Game state saves to SQLite after each matchday automatically | POST /api/games/save called after finalizeMatchday; auto-save hook in main.ts |
| PERS-02 | Game state loads from DB on login, restoring full season position | GET /api/games/load called after successful login; deserializeState reconstructs SeasonState |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bcryptjs | ^2.4.3 | Password hashing | Pure JS -- no native compilation needed (unlike bcrypt). Same API. Sufficient for single-player game. Already well-established. |
| express | ^5.2.1 | HTTP API server | Already installed from Phase 5 |
| better-sqlite3 | ^12.6.2 | SQLite database | Already installed from Phase 5 |
| cookie-session | ^2.1.1 | Cookie-based sessions | Already installed and configured from Phase 5 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/bcryptjs | ^2.4.6 | TypeScript definitions | Dev dependency for type safety |
| zod | ^3.24.2 | Request body validation | Already installed; use for auth route input validation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| bcryptjs | bcrypt (native) | Faster but requires native compilation (python3, make, g++). Overkill for single-user game with no concurrent load. |
| bcryptjs | argon2 | Technically superior (memory-hard), but also native. bcrypt is standard and sufficient here. |
| cookie-session | JWT | Explicitly rejected in project decisions -- "Cookie sessions over JWT, same-origin single-player game" |

**Installation:**
```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  index.ts          # Express app setup (EXISTING -- add new routers)
  db.ts             # Database singleton (EXISTING -- no changes needed)
  serialize.ts      # SeasonState JSON encode/decode (EXISTING)
  routes/
    health.ts       # GET /api/health (EXISTING)
    auth.ts         # NEW: POST /api/auth/register, POST /api/auth/login
    games.ts        # NEW: POST /api/games/save, GET /api/games/load
src/
  api/
    client.ts       # NEW: fetch wrapper for all API calls
  ui/
    screens/
      loginScreen.ts  # NEW: Login/register screen
  main.ts           # MODIFY: add login gate, auto-save hook
```

### Pattern 1: Auth Routes
**What:** Two endpoints -- register creates a save slot with hashed password, login verifies credentials and sets session
**When to use:** All auth operations

```typescript
// server/routes/auth.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { z } from 'zod';

const AuthBody = z.object({
  teamName: z.string().min(1).max(50),
  password: z.string().min(4).max(100),
});

export const authRouter = Router();

// Register (New Game)
authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = AuthBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { teamName, password } = parsed.data;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM saves WHERE team_name = ?').get(teamName);
  if (existing) return res.status(409).json({ error: 'Team name already taken' });

  const hash = await bcrypt.hash(password, 10);
  const result = db.prepare(
    'INSERT INTO saves (team_name, password_hash, game_state, version) VALUES (?, ?, ?, ?)'
  ).run(teamName, hash, '{}', 1);

  req.session!.saveId = result.lastInsertRowid;
  req.session!.teamName = teamName;
  res.json({ success: true, teamName });
});

// Login (Continue)
authRouter.post('/api/auth/login', async (req, res) => {
  const parsed = AuthBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

  const { teamName, password } = parsed.data;
  const db = getDb();

  const row = db.prepare('SELECT id, password_hash FROM saves WHERE team_name = ?').get(teamName) as
    { id: number; password_hash: string } | undefined;
  if (!row) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  req.session!.saveId = row.id;
  req.session!.teamName = teamName;
  res.json({ success: true, teamName });
});
```

### Pattern 2: Save/Load Routes
**What:** Save stores serialized SeasonState in the saves table; Load retrieves it
**When to use:** Auto-save after matchday, load on login

```typescript
// server/routes/games.ts
import { Router } from 'express';
import { getDb } from '../db.js';

export const gamesRouter = Router();

// Save game state
gamesRouter.post('/api/games/save', (req, res) => {
  const saveId = req.session?.saveId;
  if (!saveId) return res.status(401).json({ error: 'Not authenticated' });

  const { gameState, version } = req.body;
  if (!gameState) return res.status(400).json({ error: 'Missing gameState' });

  const db = getDb();
  db.prepare(
    `UPDATE saves SET game_state = ?, version = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(gameState, version ?? 1, saveId);

  res.json({ success: true });
});

// Load game state
gamesRouter.get('/api/games/load', (req, res) => {
  const saveId = req.session?.saveId;
  if (!saveId) return res.status(401).json({ error: 'Not authenticated' });

  const db = getDb();
  const row = db.prepare('SELECT game_state, version FROM saves WHERE id = ?').get(saveId) as
    { game_state: string; version: number } | undefined;

  if (!row || row.game_state === '{}') {
    return res.json({ hasState: false });
  }
  res.json({ hasState: true, gameState: row.game_state, version: row.version });
});
```

### Pattern 3: Client API Module
**What:** A thin fetch wrapper centralizing all server communication
**When to use:** All client-server calls

```typescript
// src/api/client.ts
export async function register(teamName: string, password: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName, password }),
  });
  return res.json();
}

export async function login(teamName: string, password: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamName, password }),
  });
  return res.json();
}

export async function saveGame(gameState: string, version: number): Promise<void> {
  await fetch('/api/games/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameState, version }),
  });
}

export async function loadGame(): Promise<{ hasState: boolean; gameState?: string; version?: number }> {
  const res = await fetch('/api/games/load');
  return res.json();
}
```

### Pattern 4: Login Screen (Vanilla DOM)
**What:** A login screen matching the existing UI style, shown before the hub
**When to use:** App load, before any navigation is possible

The existing UI uses vanilla DOM manipulation with inline styles (no framework, no CSS classes beyond a few base ones). The login screen must follow this same pattern:
- Dark background (#111 or #0f172a)
- Amber/gold accent (#f59e0b, #fbbf24) for buttons
- Slate text colors (#e2e8f0, #94a3b8)
- Segoe UI font family
- Manual DOM creation with `document.createElement`

The screen has two modes toggled by buttons: "New Game" (shows team name + password + create) and "Continue" (shows team name + password + login).

### Pattern 5: Auto-Save Hook
**What:** After `finalizeMatchday` completes, serialize and POST the state
**When to use:** Every matchday completion, including new season start

The save point is in `main.ts` at line ~1273 where `finalizeMatchday` is called. After updating `seasonState`, call `saveGame(serializeState(seasonState), 1)`. This is fire-and-forget -- don't block the UI on save completion, but log errors.

```typescript
// In main.ts after finalizeMatchday:
seasonState = finalizeMatchday(seasonState);
// Auto-save (fire-and-forget)
import { serializeState } from '../server/serialize.ts';
import { saveGame } from './api/client.ts';
saveGame(serializeState(seasonState), 1).catch(err => console.error('Auto-save failed:', err));
```

Note: `serializeState` returns the full JSON string (with SaveEnvelope). The server stores this string directly in the `game_state` column.

### Pattern 6: Session-Gated Navigation
**What:** On app load, check if session exists via a lightweight endpoint, show login if not
**When to use:** Every page load

```typescript
// On app load in main.ts:
// 1. Try GET /api/games/load
// 2. If 401 -> show login screen
// 3. If 200 with hasState:true -> deserialize and resume
// 4. If 200 with hasState:false -> create fresh season (new game was registered but not yet played)
```

### Anti-Patterns to Avoid
- **Don't store session data in the game state blob:** Session info (saveId) belongs in the cookie, not in SeasonState
- **Don't validate passwords client-side:** All password comparison happens server-side with bcrypt
- **Don't block UI on save:** Auto-save is fire-and-forget; the user should not see a loading spinner after each matchday
- **Don't create a SPA router:** The app uses a simple `showScreen()` function with display toggling; add the login screen to this same pattern
- **Don't import server modules in client code:** `serialize.ts` lives in `server/` but needs to be importable from client. Use the existing import path pattern (Vite resolves it). Alternatively, move the serialize functions to a shared location or duplicate the client-side serialization.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom hash function | bcryptjs | Timing attacks, salt generation, cost factor tuning -- all handled |
| Session management | Custom token system | cookie-session (already installed) | Cookie signing, expiry, HMAC -- all handled |
| Input validation | Manual if/else chains | zod (already installed) | Consistent error messages, type inference, trim/sanitize |

**Key insight:** The auth layer for this game is simple (team name + password = save slot). Don't over-engineer it. No email verification, no password reset, no OAuth. Just hash, compare, set cookie.

## Common Pitfalls

### Pitfall 1: Serialize Import Path
**What goes wrong:** Client code tries to import from `server/serialize.ts` but Vite may not resolve it because the server directory is outside `src/`.
**Why it happens:** Vite bundles from the project root but `server/` has its own `tsconfig.json`.
**How to avoid:** Either (a) move `serializeState`/`deserializeState` to a shared module like `src/shared/serialize.ts`, or (b) keep it in `server/` and verify Vite resolves the import. Option (a) is cleaner. The server can then also import from `src/shared/`.
**Warning signs:** Build errors mentioning module resolution.

### Pitfall 2: Cookie-Session Type Augmentation
**What goes wrong:** TypeScript complains that `req.session.saveId` doesn't exist on the session type.
**Why it happens:** cookie-session types use `CookieSessionInterfaces.CookieSessionObject` which needs module augmentation.
**How to avoid:** Add a declaration file:
```typescript
// server/types.d.ts
import 'cookie-session';
declare module 'cookie-session' {
  interface CookieSessionObject {
    saveId?: number;
    teamName?: string;
  }
}
```
**Warning signs:** TS2339 errors on session properties.

### Pitfall 3: bcryptjs is Async
**What goes wrong:** Using `bcrypt.hashSync()` blocks the event loop. Or forgetting to await `bcrypt.hash()`.
**Why it happens:** bcryptjs offers both sync and async APIs.
**How to avoid:** Always use the async API (`hash`, `compare`) with `await`. Express 5 supports async route handlers natively.
**Warning signs:** Unhandled promise rejections, or slow responses during hashing.

### Pitfall 4: Save Payload Size
**What goes wrong:** Game state grows beyond cookie-session or JSON body limits.
**Why it happens:** 20 teams x 16 players with full attribute objects can be 50-80KB.
**How to avoid:** Express is already configured with `{ limit: '1mb' }` on `express.json()`. This is sufficient. The state is stored in SQLite, NOT in the cookie. The cookie only holds `saveId` and `teamName` (tiny).
**Warning signs:** 413 Payload Too Large errors.

### Pitfall 5: Race Between Auto-Save and Navigation
**What goes wrong:** User clicks "Continue" to hub before auto-save completes; navigates away.
**Why it happens:** Auto-save is async fire-and-forget.
**How to avoid:** This is acceptable for this project. The save happens immediately after `finalizeMatchday` before the user clicks "Continue" on the vidi preter screen. The gap is milliseconds. If save fails, worst case is replaying one matchday.
**Warning signs:** None expected -- this is an acceptable risk for a personal project.

### Pitfall 6: Fresh Season on New Game
**What goes wrong:** Register creates an empty save slot, but the client needs to create a fresh SeasonState with the user's chosen team name.
**Why it happens:** The register endpoint doesn't know about SeasonState; it just creates a save slot.
**How to avoid:** After successful register, the client creates a fresh `SeasonState` via `createSeason()` using the team name from the response, then immediately auto-saves it. The register response should include the team name so the client knows what to use.
**Warning signs:** Loading a "new game" shows no state.

## Code Examples

### Session Type Declaration
```typescript
// server/types.d.ts
import 'cookie-session';

declare module 'cookie-session' {
  interface CookieSessionObject {
    saveId?: number;
    teamName?: string;
  }
}
```

### Auth Middleware Helper
```typescript
// server/routes/games.ts -- reusable guard
function requireAuth(req: express.Request, res: express.Response): number | null {
  const saveId = req.session?.saveId;
  if (!saveId) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return saveId as number;
}
```

### Client-Side Login Screen Structure
```typescript
// src/ui/screens/loginScreen.ts
export class LoginScreen {
  private el: HTMLElement;

  constructor(container: HTMLElement) {
    this.el = container;
  }

  show(onAuth: (teamName: string, isNewGame: boolean, gameState?: string) => void): void {
    this.el.innerHTML = '';
    this.el.style.display = 'flex';
    // Build two-panel UI: "New Game" and "Continue"
    // Each has: team name input, password input, submit button
    // On submit: call register() or login() from api/client.ts
    // On success: call onAuth callback which triggers main.ts to show hub
  }

  hide(): void {
    this.el.style.display = 'none';
  }
}
```

### Auto-Save Integration Point
```typescript
// In main.ts, after line ~1273 where finalizeMatchday is called:
seasonState = finalizeMatchday(seasonState);

// Auto-save to server
import { serializeState } from './shared/serialize.ts';  // or server/serialize.ts
import { saveGame } from './api/client.ts';
const json = serializeState(seasonState);
saveGame(json, 1).catch(err => console.error('Auto-save failed:', err));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| bcrypt (native) | bcryptjs (pure JS) | Established | No native compilation needed; same API surface |
| express-session + store | cookie-session | Project decision | No server-side session store needed for tiny session data |
| JWT auth | Cookie sessions | Project decision | Simpler for same-origin single-player game |
| Manual save button | Auto-save on matchday | Phase 6 design | No user action needed; state persists transparently |

**Current in this project:**
- Express 5.2.1 (stable, async route handlers built-in)
- better-sqlite3 12.x (synchronous API, WAL mode)
- cookie-session 2.1.1 (already configured with dev key)
- Vite 7.3.1 dev proxy (already proxying /api/*)

## Open Questions

1. **Session key for production**
   - What we know: Currently uses hardcoded `'fergie-time-dev-key'` (noted as acceptable in Phase 5, "env var in Phase 6")
   - What's unclear: Whether to use `process.env.SESSION_SECRET` or a generated key
   - Recommendation: Use `process.env.SESSION_SECRET` with fallback to dev key when `NODE_ENV !== 'production'`

2. **Shared serialize module location**
   - What we know: `server/serialize.ts` imports from `src/season/season.ts` (cross-boundary). Client needs to call `serializeState`.
   - What's unclear: Whether Vite resolves `server/serialize.ts` imports cleanly in client code
   - Recommendation: Test the import path first. If Vite resolves it, leave it. If not, create `src/shared/serialize.ts` that re-exports from server.

3. **Also save on new season start**
   - What we know: `startNewSeason` in main.ts creates a new SeasonState
   - What's unclear: Whether this counts as a "matchday completion" for auto-save
   - Recommendation: Yes, auto-save after `startNewSeason` as well -- this is a significant state change.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.x |
| Config file | vitest implicit via vite.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | Register creates save with hashed password | unit | `npx vitest run server/routes/auth.test.ts -t "register"` | No - Wave 0 |
| AUTH-02 | Login verifies credentials and sets session | unit | `npx vitest run server/routes/auth.test.ts -t "login"` | No - Wave 0 |
| AUTH-03 | Login screen shown on load | manual-only | Visual inspection | N/A |
| AUTH-04 | Passwords hashed with bcrypt | unit | `npx vitest run server/routes/auth.test.ts -t "hash"` | No - Wave 0 |
| PERS-01 | Auto-save after matchday | integration | `npx vitest run server/routes/games.test.ts -t "save"` | No - Wave 0 |
| PERS-02 | Load restores season position | integration | `npx vitest run server/routes/games.test.ts -t "load"` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before verification

### Wave 0 Gaps
- [ ] `server/routes/auth.test.ts` -- covers AUTH-01, AUTH-02, AUTH-04
- [ ] `server/routes/games.test.ts` -- covers PERS-01, PERS-02
- [ ] `server/types.d.ts` -- session type augmentation (not a test, but prerequisite)

## Sources

### Primary (HIGH confidence)
- Project codebase: `server/index.ts`, `server/db.ts`, `server/serialize.ts` -- existing Phase 5 foundation
- `.planning/research/ARCHITECTURE.md` -- architectural decisions and API design
- `.planning/REQUIREMENTS.md` -- requirement definitions and out-of-scope items
- `.planning/STATE.md` -- project decisions (cookie sessions, server-as-filing-cabinet)

### Secondary (MEDIUM confidence)
- [bcryptjs npm](https://www.npmjs.com/package/bcryptjs) -- pure JS bcrypt implementation
- [Express 5 docs](https://expressjs.com/) -- async route handler support
- [cookie-session npm](https://www.npmjs.com/package/cookie-session) -- session middleware API

### Tertiary (LOW confidence)
- None -- all findings verified against codebase and official package documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries either already installed or well-established (bcryptjs)
- Architecture: HIGH -- extends existing patterns from Phase 5 with minimal new concepts
- Pitfalls: HIGH -- based on direct codebase analysis (import paths, type augmentation, payload size)

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable domain, no fast-moving dependencies)

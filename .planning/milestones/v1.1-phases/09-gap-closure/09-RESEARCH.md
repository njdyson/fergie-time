# Phase 9: Gap Closure - Research

**Researched:** 2026-03-07
**Domain:** TypeScript wiring (integration) + systemd/nginx deployment configuration
**Confidence:** HIGH

## Summary

Phase 9 closes the two remaining gaps from the v1.1 milestone audit: (1) shirt number persistence (SQD2-03) and (2) VPS deployment config files in the repository (SERV-03), plus one degraded-but-not-broken integration path (stale stats on the Hub kickoff route, affecting STAT-01).

All three fixes are small and surgical. The infrastructure for SQD2-03 is fully built — `getUpdatedPlayers()` and `onShirtNumberChange()` exist in `squadScreen.ts` and are functional; what is missing is the two lines in `main.ts` that wire them into `seasonState`. The stats degradation is a single missing argument on one `update()` call. The deployment gap requires creating two config files (`fergie-time.service` and `nginx.conf`) and adding them to the repository.

No new libraries, no schema changes, no new UI. This is a pure integration and configuration phase.

**Primary recommendation:** Wire the three main.ts integration gaps first (they touch the same file and can be batched into one task), then create the deployment config files as a second task.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SQD2-03 | Squad numbers editable per player (shirt numbers) — persistent across save/load | `getUpdatedPlayers()` and `onShirtNumberChange()` exist and are correct; only `main.ts` wiring missing. Two lines of code: call `onShirtNumberChange` callback, write result back to `SeasonTeam.squad` array. |
| SERV-03 | VPS deployment with systemd service + nginx reverse proxy | No config files in repository. Standard patterns for Node.js/Express + nginx documented below. Server listens on port 3001, serves static `dist/` in production. |
</phase_requirements>

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| TypeScript | ~5.9.3 (project) | main.ts wiring — no new deps | Already in use throughout |
| systemd | distro-bundled | Process supervisor for Node.js on Linux VPS | De-facto standard for service management on Ubuntu/Debian |
| nginx | distro-bundled | Reverse proxy (port 80/443 → 3001), static headers, TLS termination | De-facto standard; Express's static serving is fine but nginx handles HTTP concerns better |

### No New Installations Needed

All three gaps are resolved with existing project code (TypeScript), OS tooling (systemd), and nginx. No `npm install` required.

## Architecture Patterns

### Pattern 1: Shirt Number Callback Wiring (SQD2-03)

**What:** `SquadScreen.onShirtNumberChange(cb)` fires `cb(updatedPlayers: PlayerState[])` every time a player's shirt number is changed. The callback receives the full updated players array. The caller is responsible for writing those players back into `seasonState`.

**When to use:** Immediately after `squadScreenViewInner.onSelectionChange(...)` is registered — same location in `main.ts` (lines 278–282), same pattern.

**Exact existing pattern (reference — `onSelectionChange` wiring):**
```typescript
// src/main.ts lines 278–282
squadScreenViewInner.onSelectionChange(() => {
  if (typeof seasonState !== 'undefined' && seasonState) {
    seasonState.squadSelectionMap = squadScreenViewInner.getSelectionMap();
  }
});
```

**New wiring to add (after the onSelectionChange block):**
```typescript
// Persist shirt number edits into season state
squadScreenViewInner.onShirtNumberChange((updatedPlayers: PlayerState[]) => {
  if (typeof seasonState !== 'undefined' && seasonState) {
    const playerTeam = seasonState.teams.find(t => t.isPlayerTeam);
    if (playerTeam) {
      playerTeam.squad = updatedPlayers;
    }
  }
});
```

**Why `playerTeam.squad = updatedPlayers` works:** `SeasonTeam.squad` is declared as `squad: PlayerState[]` (not `readonly`). `SeasonState.teams` is declared as `teams: SeasonTeam[]` (not `readonly`). The array replacement is safe and idiomatic. The `getUpdatedPlayers()` method returns a new array with `{ ...p, shirtNumber: num }` spreads applied — PlayerState fields are readonly but the spread creates a new object with the new value, which is correct TypeScript.

**Persistence chain:** `onShirtNumberChange` → `playerTeam.squad` updated → next `finalizeMatchday` / `saveGame()` call serializes the updated squad with the new shirt numbers → on load, `PlayerState.shirtNumber` is restored — round-trip complete. No serialize.ts changes needed: shirt numbers are primitive numbers on plain objects, handled by JSON.stringify automatically.

### Pattern 2: Hub Kickoff Stats Fix (STAT-01 degraded path)

**What:** `main.ts` line 1517 calls `squadScreenViewInner.update()` with 3 arguments, omitting the `playerSeasonStats` 4th argument. The `update()` method signature is:

```typescript
// src/ui/screens/squadScreen.ts line 177
update(
  players: PlayerState[],
  fatigueMap: Map<string, number>,
  savedSelection?: Map<string, SquadSlot>,
  playerSeasonStats?: Map<string, PlayerSeasonStats>  // ← never passed from Hub path
): void
```

When the Hub kickoff path runs, `this.playerSeasonStats` in SquadScreen retains whatever value it had from the last `update()` call (if any). If the user kicks off from Hub without ever visiting the Squad tab in this session, `playerSeasonStats` will be an empty `Map` (class field default), causing G/A/App columns to show `-` for all players.

**Fix — one-line change at line 1517:**
```typescript
// Before:
squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap, seasonState.squadSelectionMap);
// After:
squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap, seasonState.squadSelectionMap, seasonState.playerSeasonStats);
```

**Note:** The Hub kickoff only calls `update()` to reset the squad screen's internal state before `startMatchFromSquad()` reads `getSelection()`. The G/A/App columns aren't visible at this moment. However, if the user then navigates to Squad after kicking off, the stale state would display. Fixing it here is correct and costs nothing.

### Pattern 3: Systemd Unit File (SERV-03)

**What:** A systemd `.service` file in the repository under `deploy/` that operators copy to `/etc/systemd/system/` on the VPS.

**Standard unit file pattern for Node.js/Express on Ubuntu:**

```ini
# deploy/fergie-time.service
[Unit]
Description=Fergie Time Football Manager
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/fergie-time
ExecStart=/usr/bin/node --import tsx server/index.ts
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

**Notes:**
- `User=www-data` is conventional for web apps. The actual user depends on VPS setup — document this in comments.
- `WorkingDirectory` must match the deployment path on the VPS.
- `ExecStart` uses `node --import tsx` — matches the existing `npm start` script (`"start": "node --import tsx server/index.ts"`).
- `Restart=on-failure` handles crashes without manual intervention.
- `NODE_ENV=production` signals Express and other middleware to enable production mode.

**Session secret:** The current `server/index.ts` uses a hard-coded dev key `'fergie-time-dev-key'`. The unit file should document `SESSION_SECRET` as an environment variable override. The audit flagged this as a future concern (Phase 6 RESEARCH.md, not a blocker). The service file should include it as a commented example — actual secret goes in a separate env file not committed to the repo.

**Operator commands (document in comments or adjacent README):**
```bash
sudo cp deploy/fergie-time.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable fergie-time
sudo systemctl start fergie-time
```

### Pattern 4: Nginx Config (SERV-03)

**What:** An nginx server block config file that reverse-proxies `/api/*` to Express on port 3001 and serves the static `dist/` directory for everything else (or proxies all traffic and lets Express serve static files).

**Two valid approaches:**
1. **Nginx serves static, proxies /api only** — slightly more efficient for static assets
2. **Nginx proxies everything to Express** — simpler config; Express already serves `dist/` in production

Given the project's "server is a filing cabinet" simplicity and that Express already does `app.use(express.static(distPath))`, approach 2 is simpler and correct.

**Standard nginx config:**

```nginx
# deploy/nginx.conf
server {
    listen 80;
    server_name _;  # Replace with actual domain

    # Proxy all traffic to Express
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Cookie session support
        proxy_set_header Cookie $http_cookie;
        proxy_pass_header Set-Cookie;
    }
}
```

**Notes:**
- `server_name _;` is a catch-all. Operators should replace with their actual domain or IP.
- `proxy_http_version 1.1` prevents connection re-use issues with Express 5.
- Cookie headers must be forwarded — `cookie-session` requires `Cookie` in and `Set-Cookie` out.
- TLS: if the VPS uses Let's Encrypt/certbot, certbot will modify this file automatically. No need to pre-configure TLS — document that certbot should be run after deployment.

**Operator commands:**
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/fergie-time
sudo ln -s /etc/nginx/sites-available/fergie-time /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**File location in repo:** `deploy/nginx.conf` (alongside `deploy/fergie-time.service`).

### Recommended Project Structure Addition

```
deploy/
├── fergie-time.service   # systemd unit file (copy to /etc/systemd/system/)
└── nginx.conf            # nginx server block (copy to /etc/nginx/sites-available/)
```

A `deploy/README.md` or header comments inside each file explaining operator steps is sufficient documentation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Process supervision | Custom shell wrapper with while-loop restart | systemd service with `Restart=on-failure` | systemd handles SIGTERM, log capture via journald, boot persistence, status/health |
| Reverse proxy | Express serving everything directly on port 80 | nginx with `proxy_pass` | nginx handles TLS, access logs, request buffering, header management cleanly |
| Shirt number persistence | Custom serialization change | Write updated players back to `SeasonTeam.squad` | existing `serializeState` handles it — shirt numbers are plain numbers on PlayerState objects |

## Common Pitfalls

### Pitfall 1: Mutating a Readonly Spread Incorrectly
**What goes wrong:** `PlayerState` fields are `readonly` — `p.shirtNumber = n` is a TypeScript error.
**Why it happens:** TypeScript structural typing confuses newcomers.
**How to avoid:** Always use spread: `{ ...p, shirtNumber: n }`. The existing `getUpdatedPlayers()` already does this correctly — no change needed there.
**Warning signs:** TS2540 error "Cannot assign to 'shirtNumber' because it is a read-only property."

### Pitfall 2: Shirt Numbers Lost on `startNewSeason`
**What goes wrong:** If `startNewSeason` recreates player objects without carrying `shirtNumber`, edits are lost at season rollover.
**Why it happens:** `startNewSeason` might spread players without preserving all optional fields.
**How to avoid:** Check `startNewSeason` in `season.ts` — if it uses `playerTeam.squad` directly (passed as a parameter from main.ts at line 154: `startNewSeason(seasonState, playerTeam.squad)`), then shirt numbers are already on the squad objects and will persist. This should be verified during implementation.
**Warning signs:** Shirt numbers reset to original values after a new season starts.

### Pitfall 3: Nginx Cookie Session Breakage
**What goes wrong:** User logs in but session doesn't persist; every request appears unauthenticated.
**Why it happens:** If `proxy_set_header Host` or `proxy_pass_header Set-Cookie` is missing, `cookie-session` can't set or read its cookie correctly.
**How to avoid:** Include all four header directives in the nginx config (`Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`) plus `proxy_pass_header Set-Cookie`.
**Warning signs:** Login appears to succeed but HUB screen immediately bounces back to login on next page load.

### Pitfall 4: `onShirtNumberChange` Fires Before `seasonState` Is Initialized
**What goes wrong:** The callback fires during the initial `setPlayers()` call in `update()`, before `boot()` completes.
**Why it happens:** `squadScreen.ts` fires callbacks in `startShirtNumberEdit` only when a user actively picks a number — not during `setPlayers()`. This is safe.
**How to avoid:** The guard `if (typeof seasonState !== 'undefined' && seasonState)` (matching the `onSelectionChange` pattern) is sufficient.
**Warning signs:** Uncaught TypeError: Cannot read properties of undefined (reading 'teams').

### Pitfall 5: Systemd Service File Working Directory Mismatch
**What goes wrong:** `node --import tsx server/index.ts` fails because relative paths (e.g., `dist/`) don't resolve correctly.
**Why it happens:** systemd sets `WorkingDirectory` but operators may deploy to a different path than documented.
**How to avoid:** Use absolute paths in `ExecStart` or document the expected deployment path clearly. `WorkingDirectory=/var/www/fergie-time` is the idiomatic location.
**Warning signs:** `Error: ENOENT: no such file or directory, open '.../dist/index.html'`.

## Code Examples

Verified patterns from source inspection:

### SQD2-03: Complete Wiring Block (main.ts, after line 282)
```typescript
// Persist shirt number edits into season state (SQD2-03)
squadScreenViewInner.onShirtNumberChange((updatedPlayers: PlayerState[]) => {
  if (typeof seasonState !== 'undefined' && seasonState) {
    const playerTeam = seasonState.teams.find(t => t.isPlayerTeam);
    if (playerTeam) {
      playerTeam.squad = updatedPlayers;
    }
  }
});
```

### STAT-01: Hub Kickoff Fix (main.ts, line 1517)
```typescript
// Before (missing 4th arg — stale stats on Hub kickoff path):
squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap, seasonState.squadSelectionMap);

// After (pass playerSeasonStats so G/A/App columns are fresh):
squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap, seasonState.squadSelectionMap, seasonState.playerSeasonStats);
```

### getUpdatedPlayers() — Already Correct, No Change Needed
```typescript
// src/ui/screens/squadScreen.ts lines 209–217
getUpdatedPlayers(): PlayerState[] {
  return this.players.map(p => {
    const num = this.shirtNumbers.get(p.id);
    if (num != null && num !== p.shirtNumber) {
      return { ...p, shirtNumber: num };  // ← spread preserves readonly contract
    }
    return p;
  });
}
```

### startShirtNumberEdit callback — Already Fires Correctly
```typescript
// src/ui/screens/squadScreen.ts lines 408–419
btn.addEventListener('click', (e) => {
  e.stopPropagation();
  this.shirtNumbers.set(playerId, n);
  const idx = this.players.findIndex(p => p.id === playerId);
  if (idx >= 0) {
    this.players[idx] = { ...this.players[idx]!, shirtNumber: n };
  }
  for (const cb of this.shirtNumberChangeCallbacks) {
    cb(this.getUpdatedPlayers());  // ← fires callback with updated array
  }
  popup.remove();
  this.render();
});
```

## Key File Locations

| File | Role | Change |
|------|------|--------|
| `src/main.ts` line ~282 | Wire `onShirtNumberChange` callback | ADD ~5 lines |
| `src/main.ts` line 1517 | Fix Hub kickoff missing `playerSeasonStats` arg | CHANGE 1 line |
| `deploy/fergie-time.service` | systemd unit file | CREATE |
| `deploy/nginx.conf` | nginx reverse proxy config | CREATE |

## Open Questions

1. **Session secret in production**
   - What we know: `server/index.ts` uses hard-coded `'fergie-time-dev-key'`; Phase 6 RESEARCH flagged this as "dev key acceptable now, env var in Phase 8" — but it wasn't done.
   - What's unclear: Whether to add `SESSION_SECRET` env var support to `server/index.ts` as part of this phase, or just document it in the systemd unit file comments.
   - Recommendation: Add `process.env.SESSION_SECRET ?? 'fergie-time-dev-key'` to `server/index.ts` and document `SESSION_SECRET=` in the unit file. Minimal change, closes a real security concern before deployment.

2. **`startNewSeason` shirt number carry-through**
   - What we know: `startNewSeason(seasonState, playerTeam.squad)` passes the squad array — shirt numbers are on `PlayerState` objects which are passed through.
   - What's unclear: Whether `startNewSeason` recreates players or passes them directly.
   - Recommendation: Verify in `season.ts` during implementation. If players are passed through unmodified, no additional work needed.

3. **Shirt number picker range (1–40 vs 1–99)**
   - What we know: Audit flagged this as cosmetic tech debt — the picker shows 1–40 but plan specified 1–99.
   - What's unclear: Whether to fix this in Phase 9 (in scope as part of SQD2-03 gap closure) or defer.
   - Recommendation: Fix it as part of Phase 9 — one-line change (`for (let n = 1; n <= 99; n++)`), directly in `startShirtNumberEdit`, completes the stated requirement cleanly. Change grid columns from 8 to 10 (`grid-template-columns: repeat(10, 1fr)`).

## Sources

### Primary (HIGH confidence)
- `C:/dev/src/ui/screens/squadScreen.ts` — Full source inspection: `onShirtNumberChange`, `getUpdatedPlayers`, `startShirtNumberEdit`, `update()` signature all verified
- `C:/dev/src/main.ts` lines 265–282, 1460–1519 — Full source inspection: `onSelectionChange` wiring pattern, Hub kickoff `update()` call with missing arg, `startMatchFromSquad` squad mutation pattern verified
- `C:/dev/src/simulation/types.ts` lines 298–318 — `PlayerState.shirtNumber?: number` readonly field confirmed
- `C:/dev/src/season/season.ts` lines 22–58 — `SeasonTeam.squad: PlayerState[]` (mutable) confirmed; `SeasonState` interface confirmed
- `C:/dev/.planning/v1.1-MILESTONE-AUDIT.md` — Gap evidence and exact issue descriptions
- `C:/dev/server/index.ts` — Server listens on port 3001, serves `dist/` as static, uses `cookie-session`
- `C:/dev/package.json` — `"start": "node --import tsx server/index.ts"` confirmed as production start command

### Secondary (MEDIUM confidence)
- systemd unit file structure — Standard Ubuntu/Debian pattern; widely documented, consistent across sources
- nginx `proxy_pass` reverse proxy pattern for Node.js — Standard configuration pattern, verified against multiple sources

## Metadata

**Confidence breakdown:**
- SQD2-03 wiring: HIGH — source code fully read, exact lines identified, pattern modeled on existing `onSelectionChange` wiring
- STAT-01 fix: HIGH — single missing argument identified at exact line number
- SERV-03 systemd: HIGH — standard pattern, matches `npm start` command in package.json
- SERV-03 nginx: HIGH — standard reverse proxy pattern for Node.js Express
- Session secret question: MEDIUM — enhancement, not gap-blocking

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable codebase, no fast-moving dependencies)

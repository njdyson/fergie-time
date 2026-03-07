---
phase: 09-gap-closure
plan: 02
subsystem: infra
tags: [systemd, nginx, deployment, vps, reverse-proxy]

# Dependency graph
requires:
  - phase: 05-server-foundation
    provides: Express server on port 3001 with SESSION_SECRET env var
  - phase: 09-gap-closure-01
    provides: SESSION_SECRET documented in .env.example
provides:
  - deploy/fergie-time.service — systemd unit file running Express via tsx
  - deploy/nginx.conf — nginx reverse proxy to port 3001 with cookie session support
affects: [deployment, ops, vps-setup]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Proxy-all nginx pattern — Express serves static files; nginx proxies all traffic to it
    - SESSION_SECRET commented out in unit file — operator uncomments with real value

key-files:
  created:
    - deploy/fergie-time.service
    - deploy/nginx.conf
  modified: []

key-decisions:
  - "Proxy-all nginx approach (not split static/API) — Express already serves dist/ in production, simpler single-location config"
  - "Cookie/Set-Cookie headers explicitly forwarded via proxy_set_header and proxy_pass_header — required for cookie-session middleware"
  - "SESSION_SECRET commented out in unit file — operator uncomments and sets real value, prevents accidental default"
  - "User www-data as conventional default with comment telling operator to adjust"

patterns-established:
  - "Deploy directory for VPS config files tracked in repository alongside application code"

requirements-completed: [SERV-03]

# Metrics
duration: 2min
completed: 2026-03-07
---

# Phase 9 Plan 02: Deployment Config Summary

**systemd service unit and nginx reverse proxy config for VPS deployment, with operator installation instructions and cookie-session header forwarding**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-07T08:46:59Z
- **Completed:** 2026-03-07T08:49:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Created `deploy/fergie-time.service` — systemd unit running `node --import tsx server/index.ts` as `www-data` user, auto-restart on failure, with SESSION_SECRET placeholder for operator to fill
- Created `deploy/nginx.conf` — nginx server block proxying all traffic to 127.0.0.1:3001, forwarding Cookie and Set-Cookie headers for cookie-session compatibility
- Both files include full operator installation instructions as header comments (copy command, symlink, nginx -t, reload)
- SERV-03 gap closed — deployment config is now tracked in repository and reproducible from source

## Task Commits

Each task was committed atomically:

1. **Task 1: Create systemd unit file and nginx config** - `983a6e8` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `deploy/fergie-time.service` - systemd service definition for Node.js Express server, runs as www-data on port 3001
- `deploy/nginx.conf` - nginx reverse proxy server block, proxies to port 3001 with cookie session header support

## Decisions Made
- Proxy-all nginx approach (not split static/API) — Express already serves `dist/` in production, so a single `location /` block is simpler and correct
- Cookie/Set-Cookie headers explicitly forwarded — required for `cookie-session` middleware to function through the proxy
- SESSION_SECRET commented out in unit file — operator must uncomment and set a real value; prevents accidental use of empty/default secret
- `User=www-data` as conventional default with comment instructing operator to adjust to their VPS user

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - deployment config files are static and require no external service configuration. Operator instructions are embedded in the files themselves as comments.

## Next Phase Readiness
- SERV-03 requirement satisfied — deployment config tracked in repository
- Phase 9 gap-closure plans complete (01: env var documentation, 02: deployment config files)
- All audit gaps from v1.1 milestone review now addressed

## Self-Check: PASSED

- deploy/fergie-time.service: FOUND
- deploy/nginx.conf: FOUND
- 09-02-SUMMARY.md: FOUND
- commit 983a6e8: FOUND

---
*Phase: 09-gap-closure*
*Completed: 2026-03-07*

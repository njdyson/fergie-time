---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Data Layer
status: unknown
last_updated: "2026-03-07T07:38:46.047Z"
progress:
  total_phases: 7
  completed_phases: 6
  total_plans: 29
  completed_plans: 27
---

---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Data Layer
status: executing
stopped_at: Completed 07-02-PLAN.md
last_updated: "2026-03-07T06:55:00Z"
last_activity: 2026-03-07 — Plan 07-02 complete (Squad UI, name wiring, editable shirt numbers)
progress:
  total_phases: 8
  completed_phases: 5
  total_plans: 26
  completed_plans: 25
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-06)

**Core value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events
**Current focus:** Milestone v1.1 — Data Layer (Phase 7: Squads & Names)

## Current Position

Phase: 8 of 8 (Stats + Deployment) — in progress
Plan: 2 of 3 complete
Status: Executing
Last activity: 2026-03-07 — Plan 08-02 complete (stats capture hook, StatsScreen, squad inline stats, top scorers)

Progress: [███████████████] ~67% of phase 8

## Performance Metrics

**Velocity:**
- Total plans completed: 20
- Average duration: ~5.8 min
- Total execution time: ~115 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Engine Core | 10 | ~64 min | ~6.4 min |
| 2. Tactical Layer | 2 | ~21 min | ~10.5 min |
| 3. Management Shell | 6 | ~26 min | ~4.3 min |
| 5. Server Foundation | 2 | ~4 min | ~2.0 min |

**Recent Trend:**
- Last 5 plans: 01-06 (7 min), 01-07 (3 min), 01-08 (8 min), 01-09 (7 min), 01-10 (20 min incl. checkpoint)
- Trend: consistent ~3-8 min per plan; plan 10 longer due to human-verify checkpoint

*Updated after each plan completion*
| Phase 05 P02 | 2min | 2 tasks | 6 files |
| Phase 05 P03 | 3min | 2 tasks | 3 files |
| Phase 06 P01 | 4min | 2 tasks | 7 files |
| Phase 07 P01 | 5min | 2 tasks | 8 files |
| Phase 07 P02 | pre-committed | 1 task | 3 files |
| Phase 06-auth-persistence P02 | 10 | 2 tasks | 4 files |
| Phase 08-stats-deployment P01 | 206 | 4 tasks | 5 files |
| Phase 08-stats-deployment P02 | 304 | 2 tasks | 5 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 5-02]: Default imports for CJS modules via tsx interop -- no verbatimModuleSyntax in server tsconfig
- [Phase 5-02]: Dev key for cookie-session acceptable now, env var in Phase 6
- [Phase 5-01]: MAP_TAG sentinel pattern for Map serialization -- __MAP__ key with entries array
- [Phase 5-01]: SaveEnvelope wraps state with version and savedAt at top level
- [Roadmap v1.1]: Serialization first — Map data loss is #1 risk, round-trip test before any persistence work
- [Roadmap v1.1]: 25-man squads grouped with name cache — both are "richer data" work, independent of core persistence
- [Roadmap v1.1]: Stats + deployment last — deploy working features, not broken ones; stats need post-match hook
- [Roadmap v1.1]: Server is a filing cabinet — client stays authoritative, server stores/retrieves JSON blobs
- [Roadmap v1.1]: Cookie sessions over JWT — same-origin single-player game, no token management needed
- [Phase 05]: concurrently for cross-platform dual-server dev script
- [Phase 06]: bcryptjs (pure JS) over native bcrypt for cross-platform builds
- [Phase 06]: Per-file test name prefixes for DB isolation in shared SQLite
- [Phase 07]: ROLES_25 bench adjusted from plan listing to match stated 5 CB total
- [Phase 07]: getNames remainder allocation to last nationality for exact count
- [Phase 07-02]: Player team uses createAITeam('mid') so fetched names reach all player-team players
- [Phase 07-02]: names.slice(0,25) for player team, names.slice(25) to createSeason for 19 AI teams
- [Phase 07-02]: Shirt numbers maintained as Map<string,number> on SquadScreen instance until getUpdatedPlayers() called
- [Phase 06-02]: Boot function checks session first (silent restore), falls back to login screen
- [Phase 06-02]: Continue tab shows list of saved games via /api/games/list rather than plain text input
- [Phase 08-stats-deployment]: minutesPlayed fixed at 90 for all players (no sub tracking yet)
- [Phase 08-stats-deployment]: playerSeasonStats non-optional on SeasonState, always empty Map on season start
- [Phase 08-02]: Guard simResult.playerStats with empty Map fallback for test mock compatibility
- [Phase 08-02]: Stats merge at full-time before vidiprinter ensures capture even on early browser close

### Pending Todos

None yet.

### Blockers/Concerns

- [Phase 2 - PRIORITY]: Player oscillation / jitter — utility AI action scores flip each tick causing players to run back and forth
- [Phase 5 - WATCH]: Save payload size with 25-man squads not yet measured — estimated 50-80KB, may be larger
- [Phase 5 - WATCH]: VPS must have build tools for better-sqlite3 native addon (python3, make, g++)

## Session Continuity

Last session: 2026-03-07T07:45:26Z
Stopped at: Completed 08-02-PLAN.md
Resume file: None

# Roadmap: Fergie Time

## Overview

Four phases derived directly from the dependency chain in the match engine: physics must work before agents have meaning, agents must produce emergent football before tactics have effect, tactics must have effect before management screens have value, and management continuity must exist before player development across seasons means anything. The engine is built first and proven watchable before a single management screen is built. Each phase delivers one complete, independently verifiable capability.

## Milestones

- **v1.0 Match Engine** - Phases 1-4 (Phases 1, 3 shipped; Phase 2 in progress; Phase 4 deferred)
- **v1.1 Data Layer** - Phases 5-8 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v1.0 Match Engine (Phases 1-4)</summary>

- [x] **Phase 1: Engine Core** - A watchable match with emergent goals, realistic player movement, and observable possession changes
- [ ] **Phase 2: Tactical Layer** - Formation drag-and-drop and role assignments that visibly and measurably change team behavior
- [x] **Phase 3: Management Shell** - A full playable season with squad management, fixtures, league table, and a champion declared (completed 2026-03-06)
- [ ] **Phase 4: Development Systems** - Training, youth graduates, retirements, and procedural portraits that make seasons 2+ meaningfully different

</details>

### v1.1 Data Layer

- [x] **Phase 5: Server Foundation** - Express + SQLite running with proven serialization, dev proxy configured, ready to receive game state (completed 2026-03-06)
- [ ] **Phase 6: Auth + Persistence** - User can create a game, log in, play matches, and return later to find their season exactly where they left it
- [ ] **Phase 7: Squads + Names** - 25-man squads with realistic nationality-weighted names replace the 16-player placeholder rosters
- [ ] **Phase 8: Stats + Deployment** - Per-player season stats tracked and displayed, entire application deployed to VPS

## Phase Details

<details>
<summary>v1.0 Match Engine (Phases 1-4)</summary>

### Phase 1: Engine Core
**Goal**: A single watchable match produces emergent football — goals, mistakes, possession changes, and realistic player movement arising from physics and agent decisions, never from scripted events
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05, ENG-06, ENG-07, ENG-08, ENG-09, ENG-10, ENG-11, ENG-12, ENG-13, ENG-14, ENG-15
**Success Criteria** (what must be TRUE):
  1. Watching a full 90-minute match, goals and shots arise visibly from agent decisions — no moment looks scripted or inevitable from the start
  2. Players move with distinct physical character: a fast winger visibly covers ground differently than a slow centre-back, and tired players noticeably slow and err in the second half
  3. A player with high directness and risk_appetite makes different decisions in the same situation than a player with low values — the personality vector is observable in behavior
  4. The match runs at 30+ ticks/sec with 22 agents evaluating utility scores every tick, with no stutter visible on the Canvas renderer
  5. A debug overlay shows per-agent decision scores on click — the match is not a black box
**Plans**: 10 plans
  - [x] 01-01-PLAN.md — Project scaffolding, core types, Vec2, math utilities
  - [x] 01-02-PLAN.md — 2.5D ball physics (TDD)
  - [x] 01-03-PLAN.md — Steering behaviors (TDD)
  - [x] 01-04-PLAN.md — Match state machine and goal detection (TDD)
  - [x] 01-05-PLAN.md — Simulation engine, game loop, and Canvas renderer
  - [x] 01-06-PLAN.md — Utility AI agent system with personality weights (TDD)
  - [x] 01-07-PLAN.md — Fatigue system with personality erosion (TDD)
  - [x] 01-08-PLAN.md — Contact resolution and spatial grid (TDD)
  - [x] 01-09-PLAN.md — Match statistics, decision log, and debug overlay
  - [x] 01-10-PLAN.md — Full integration: watchable match with human verification

### Phase 2: Tactical Layer
**Goal**: Formation and role decisions by the manager mechanically alter how the team plays — changing shape produces a measurably different spatial footprint, not a cosmetic label
**Depends on**: Phase 1
**Requirements**: TAC-01, TAC-02, TAC-03, TAC-04, TAC-05
**Success Criteria** (what must be TRUE):
  1. Dragging players into a 4-5-1 on the tactics board produces a visibly different team shape on the pitch compared to a 4-3-3 — average player positions differ, not just icons on a diagram
  2. A compact low block genuinely reduces space for a possession-heavy opponent — the tactical counter-system produces statistically distinguishable outcomes over 10+ matches
  3. A halftime formation change takes effect at kickoff of the second half
  4. Substituting a player mid-match replaces the agent on the pitch with the bench player's attributes and personality
**Plans**: 3 plans
Plans:
- [ ] 02-01-PLAN.md -- Formation templates, role auto-assignment, duty weight modifiers
- [ ] 02-02-PLAN.md -- Tactics board UI with drag-and-drop and formation presets
- [ ] 02-03-PLAN.md -- Halftime flow, substitutions, and human verification

### Phase 3: Management Shell
**Goal**: A full playable season gives the match engine narrative stakes — the manager picks squads, plays fixtures, watches the table move, and a champion is declared
**Depends on**: Phase 2
**Requirements**: SQD-01, SQD-02, SQD-03, SQD-04, SQD-05, SQD-06
**Success Criteria** (what must be TRUE):
  1. The squad screen shows all players with attributes, personality traits, position, age, and fitness — the manager can read a player's character from the screen before selecting them
  2. The manager selects a starting 11 and bench before each match, and the selected squad is what takes the pitch
  3. A full 20-team round-robin fixture list generates at season start; the manager can see upcoming fixtures and results
  4. The league table updates after every result and correctly reflects points, goal difference, and position for all 20 teams
  5. At season end, a champion is declared and the squad carries forward into a new season with reset fixtures
**Plans**: 6 plans
Plans:
- [x] 03-01-PLAN.md -- Season data module: nameGen, teamGen, fixtures, leagueTable (TDD) + PlayerState age/height
- [x] 03-02-PLAN.md -- Season state machine: validateSquadSelection, advanceMatchday, champion, new season (TDD)
- [x] 03-03-PLAN.md -- AI quick-sim runner + Hub, Squad, Fixtures, Table screen classes
- [x] 03-04-PLAN.md -- Screen routing: index.html containers, nav tabs, main.ts state machine, fullTimeOverlay Continue
- [x] 03-05-PLAN.md -- Season loop wiring: squad selection into MatchConfig, fatigue capture, AI batch sim, lifecycle
- [x] 03-06-PLAN.md -- Human verification: all 6 success criteria confirmed end-to-end

### Phase 4: Development Systems
**Goal**: Training drills, youth graduates, retirements, and procedural portraits make each squad distinct — after multiple seasons, the team reflects the manager's choices
**Depends on**: Phase 3
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, DEV-06
**Success Criteria** (what must be TRUE):
  1. Assigning a player to an attacking drill for a season produces measurable shifts in their directness and risk_appetite — personality drift is visible on the squad screen
  2. Watching an observable training session mini-sim shows players behaving in ways shaped by the drill — the training is not a hidden stat increment
  3. At season start, youth graduates arrive with distinct procedurally generated personalities that create genuine variety (not regression to average)
  4. Each player has a procedural pixel-art portrait that visually reflects their trait data — two players with different archetypes look different
**Plans**: TBD

</details>

### Phase 5: Server Foundation
**Goal**: Express server and SQLite database running with proven round-trip serialization of game state, Vite dev proxy configured, ready to accept save/load requests
**Depends on**: Phase 3 (working season state to serialize)
**Requirements**: SERV-01, SERV-02, SERV-04, PERS-03, PERS-04
**Success Criteria** (what must be TRUE):
  1. Express server starts, responds to a health-check endpoint, and Vite proxies /api/* requests to it during development
  2. SQLite database auto-creates its schema on first run with WAL mode enabled
  3. A round-trip serialization test proves SeasonState survives JSON encode/decode with zero data loss — specifically, Map types (fatigueMap) serialize and deserialize correctly
  4. Save payload includes a version field that can be read back after deserialization
**Plans**: 3 plans
Plans:
- [ ] 05-01-PLAN.md -- SeasonState round-trip serialization with tagged Map handling (TDD)
- [ ] 05-02-PLAN.md -- Express server, SQLite database, health endpoint, session middleware
- [ ] 05-03-PLAN.md -- Vite dev proxy, combined dev script, human verification

### Phase 6: Auth + Persistence
**Goal**: User can create a new game, log in, play matches, close the browser, return later, and resume their season exactly where they left it
**Depends on**: Phase 5
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04, PERS-01, PERS-02
**Success Criteria** (what must be TRUE):
  1. On app load, a login screen appears with "New Game" and "Continue" options — the hub is not accessible without authentication
  2. User can create a new game by entering a team name and password, which starts a fresh season
  3. User can close the browser after playing matches, reopen it, enter team name and password, and find the season at the exact matchday they left
  4. Passwords are hashed — inspecting the database directly shows no plain-text passwords
  5. Game state saves automatically after each matchday completes, with no manual save button required
**Plans**: TBD

### Phase 7: Squads + Names
**Goal**: All teams field 25-man squads with realistic nationality-weighted names, replacing the 16-player placeholder rosters with Premier League-scale depth
**Depends on**: Phase 5 (name cache needs DB), Phase 6 (save format must handle 25 players)
**Requirements**: SQD2-01, SQD2-02, SQD2-03, SQD2-04, NAME-01, NAME-02, NAME-03
**Success Criteria** (what must be TRUE):
  1. Every team in the league has 25 players visible on the squad screen, with appropriate positional distribution for a full Premier League squad
  2. Matchday squad selection allows picking 11 starters + 7 subs from the 25-man roster, and bench shows 7 substitutes
  3. Player names look realistic and nationality-appropriate — not procedurally obvious like the current generator
  4. If randomuser.me is unreachable during game creation, the game still creates successfully with fallback names from the generic name pool
  5. Players have editable shirt numbers visible on the squad screen
**Plans**: TBD

### Phase 8: Stats + Deployment
**Goal**: Per-player season statistics are tracked across all matches and displayed in the UI, and the complete application is deployed and playable on the VPS
**Depends on**: Phase 6 (stats persist to DB), Phase 7 (25-man squads generate stats)
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04, STAT-05, SERV-03
**Success Criteria** (what must be TRUE):
  1. After playing several matches, the squad screen shows per-player season stats (goals, assists, appearances at minimum) that accurately reflect match results
  2. Quick-simulated matches attribute goalscorers — the top scorer table reflects goals from both watched and simulated matches
  3. A league-wide top scorers view shows the leading goalscorers across all 20 teams
  4. The application is accessible on the VPS via nginx reverse proxy, with the Express server running as a systemd service that survives reboots
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Engine Core | v1.0 | 10/10 | Complete | 2026-03-03 |
| 2. Tactical Layer | v1.0 | 2/3 | In Progress | - |
| 3. Management Shell | v1.0 | 6/6 | Complete | 2026-03-06 |
| 4. Development Systems | v1.0 | 0/TBD | Deferred | - |
| 5. Server Foundation | 3/3 | Complete   | 2026-03-06 | - |
| 6. Auth + Persistence | v1.1 | 0/TBD | Not started | - |
| 7. Squads + Names | v1.1 | 0/TBD | Not started | - |
| 8. Stats + Deployment | v1.1 | 0/TBD | Not started | - |

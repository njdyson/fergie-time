# Requirements: Fergie Time

**Defined:** 2026-03-02
**Core Value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events.

## v1.0 Requirements (Complete)

### Match Engine

- [x] **ENG-01**: Ball moves in 2.5D (X/Y ground position + Z height via projectile motion)
- [x] **ENG-02**: Players move using steering behaviors (seek, arrive, avoid, separation) with physical attribute caps
- [x] **ENG-03**: Each player agent evaluates 7 actions per tick via utility AI and selects highest-scoring
- [x] **ENG-04**: Personality vector (directness, risk_appetite, composure, creativity, work_rate, aggression, anticipation, flair) weights every action score
- [x] **ENG-05**: Gaussian noise added to utility scores, scaled by (1 - composure), producing realistic decision variance
- [x] **ENG-06**: Fatigue attenuates physical attributes on a glycogen-depletion curve (gradual through 60min, steep final quarter)
- [x] **ENG-07**: Fatigue interpolates personality values toward conservative defaults (personality erosion)
- [x] **ENG-08**: Tackle success resolved by comparing physical/technical attributes with positional geometry modifiers
- [x] **ENG-09**: Shielding modeled as spatial exclusion zone scaled by strength
- [x] **ENG-10**: Aerial contests resolved by Z-intercept timing with contest window
- [x] **ENG-11**: Goals detected when ball crosses goal line below crossbar height
- [x] **ENG-12**: Match statistics accumulated from agent decisions (shots, possession, passes, tackles)
- [x] **ENG-13**: Match progresses through kickoff, first half, halftime, second half, full-time states
- [x] **ENG-14**: 2D top-down Canvas rendering with ball Z conveyed via sprite scaling and shadow offset
- [x] **ENG-15**: Simulation runs at 30+ ticks/sec, separated from 60fps rendering

### Tactical System

- [x] **TAC-01**: Formation defined by positional anchors that create pull targets for each player
- [x] **TAC-02**: Manager drags players into positions on a 2D pitch diagram to set formation
- [x] **TAC-03**: Role assignments (striker, CM, LB, etc.) modify agent utility weights
- [x] **TAC-04**: Manager can change formation and instructions at halftime
- [x] **TAC-05**: Manager can substitute players during a match (up to 3 subs from bench)

### Squad Management

- [x] **SQD-01**: Squad screen displays all players with attributes, position, age, and fitness
- [x] **SQD-02**: Manager selects starting 11 and bench before each match
- [x] **SQD-03**: Fixture list generated as round-robin schedule for 20-team league
- [x] **SQD-04**: League table tracks points, wins, draws, losses, goals for/against, goal difference
- [x] **SQD-05**: Season ends with champion declared and squad carried forward to next season
- [x] **SQD-06**: Player names procedurally generated

## v1.1 Requirements

Requirements for the Data Layer milestone.

### Persistence

- [ ] **PERS-01**: Game state saves to SQLite after each matchday automatically
- [ ] **PERS-02**: Game state loads from DB on login, restoring full season position
- [ ] **PERS-03**: SeasonState serialization handles Map types with round-trip tests
- [ ] **PERS-04**: Save format includes version field for future migration

### Authentication

- [ ] **AUTH-01**: User can create a new game with team name + password
- [ ] **AUTH-02**: User can continue an existing game by entering team name + password
- [ ] **AUTH-03**: Login screen shown on app load with "New Game" / "Continue" options
- [ ] **AUTH-04**: Passwords hashed with bcrypt, never stored in plain text

### Server

- [ ] **SERV-01**: Express API server with SQLite via better-sqlite3
- [ ] **SERV-02**: Vite dev proxy routes /api/* to Express during development
- [ ] **SERV-03**: VPS deployment with systemd service + nginx reverse proxy
- [ ] **SERV-04**: CORS and session management configured

### Squad Expansion

- [ ] **SQD2-01**: 25-man squads for all teams (up from 16)
- [ ] **SQD2-02**: 18-man matchday squad selection (11 starters + 7 subs from 25)
- [ ] **SQD2-03**: Squad numbers editable per player (shirt numbers)
- [ ] **SQD2-04**: Squad screen updated for 25 players with matchday selection UI

### Names

- [ ] **NAME-01**: Fetch realistic names from randomuser.me at game creation, cached in DB
- [ ] **NAME-02**: Nationality-weighted name fetching (matching existing weightings)
- [ ] **NAME-03**: Fallback to generic name pool (not position-based) if API unavailable

### Stats

- [ ] **STAT-01**: Per-player per-season stats tracked (goals, assists, appearances minimum)
- [ ] **STAT-02**: Extensible stats schema — easy to add pass completion, shot/goal ratio, tackles etc.
- [ ] **STAT-03**: Quick-sim exposes goalscorer data from GameEventLog
- [ ] **STAT-04**: Post-match stats hook captures player performance before screen transition
- [ ] **STAT-05**: League-wide stat views (top scorers at minimum)

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Player Development

- **DEV-01**: Training drills selected by manager gradually shift player attributes over time
- **DEV-02**: Training drills also shift personality vector weights (shape who the player IS)
- **DEV-03**: Observable training sessions run as mini-sims the manager can watch
- **DEV-04**: Youth graduates generated each season with procedural personalities and attributes
- **DEV-05**: Older players retire at season end based on age
- **DEV-06**: Procedural pixel art portraits generated from player trait combinations

### Transfer Market

- **TRN-01**: User can buy players from other teams
- **TRN-02**: User can sell players to other teams
- **TRN-03**: AI managers make transfer decisions
- **TRN-04**: Transfer fees based on player quality and age

### League Expansion

- **LEG-01**: Multiple divisions with promotion/relegation
- **LEG-02**: Cup competitions alongside league

### Advanced Features

- **ADV-01**: Injury system with recovery timelines
- **ADV-02**: Scouting system with hidden attributes
- **ADV-03**: Match replay from saved simulation state
- **ADV-04**: Morale/happiness subsystem

### Management UX

- **UX-01**: Inbox with news and game events
- **UX-02**: Coaching room — discuss with assistants/coaches/physio

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 3D rendering | 2D canvas is the rendering target; Z-axis conveyed via sprite scaling |
| Scripted match events / event tables | Directly contradicts the core value proposition (emergence) |
| Multiplayer / online leagues | Architecture complexity for personal project |
| Mobile UI | Desktop browser only; different interaction model |
| Press conferences / media | Narrative layer that adds no simulation depth |
| Board objectives / job security | Not aligned with personal project scope |
| International management | Multiplies fixture and squad complexity |
| Contract negotiations | Deferred with transfer market |
| AI image generation (API) | Pixel art procedural generation instead |
| OAuth / social login | Team name + password is sufficient |
| Server-side game logic | Client stays authoritative, server is persistence only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Complete |
| ENG-02 | Phase 1 | Complete |
| ENG-03 | Phase 1 | Complete |
| ENG-04 | Phase 1 | Complete |
| ENG-05 | Phase 1 | Complete |
| ENG-06 | Phase 1 | Complete |
| ENG-07 | Phase 1 | Complete |
| ENG-08 | Phase 1 | Complete |
| ENG-09 | Phase 1 | Complete |
| ENG-10 | Phase 1 | Complete |
| ENG-11 | Phase 1 | Complete |
| ENG-12 | Phase 1 | Complete |
| ENG-13 | Phase 1 | Complete |
| ENG-14 | Phase 1 | Complete |
| ENG-15 | Phase 1 | Complete |
| TAC-01 | Phase 2 | Complete |
| TAC-02 | Phase 2 | Complete |
| TAC-03 | Phase 2 | Complete |
| TAC-04 | Phase 2 | Complete |
| TAC-05 | Phase 2 | Complete |
| SQD-01 | Phase 3 | Complete |
| SQD-02 | Phase 3 | Complete |
| SQD-03 | Phase 3 | Complete |
| SQD-04 | Phase 3 | Complete |
| SQD-05 | Phase 3 | Complete |
| SQD-06 | Phase 3 | Complete |
| PERS-03 | Phase 5 | Pending |
| PERS-04 | Phase 5 | Pending |
| SERV-01 | Phase 5 | Pending |
| SERV-02 | Phase 5 | Pending |
| SERV-04 | Phase 5 | Pending |
| AUTH-01 | Phase 6 | Pending |
| AUTH-02 | Phase 6 | Pending |
| AUTH-03 | Phase 6 | Pending |
| AUTH-04 | Phase 6 | Pending |
| PERS-01 | Phase 6 | Pending |
| PERS-02 | Phase 6 | Pending |
| SQD2-01 | Phase 7 | Pending |
| SQD2-02 | Phase 7 | Pending |
| SQD2-03 | Phase 7 | Pending |
| SQD2-04 | Phase 7 | Pending |
| NAME-01 | Phase 7 | Pending |
| NAME-02 | Phase 7 | Pending |
| NAME-03 | Phase 7 | Pending |
| STAT-01 | Phase 8 | Pending |
| STAT-02 | Phase 8 | Pending |
| STAT-03 | Phase 8 | Pending |
| STAT-04 | Phase 8 | Pending |
| STAT-05 | Phase 8 | Pending |
| SERV-03 | Phase 8 | Pending |

**Coverage:**
- v1.0 requirements: 26 total (26 complete)
- v1.1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-06 after v1.1 roadmap creation*

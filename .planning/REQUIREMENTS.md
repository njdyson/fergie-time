# Requirements: Fergie Time

**Defined:** 2026-03-02
**Core Value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Match Engine

- [ ] **ENG-01**: Ball moves in 2.5D (X/Y ground position + Z height via projectile motion)
- [x] **ENG-02**: Players move using steering behaviors (seek, arrive, avoid, separation) with physical attribute caps
- [x] **ENG-03**: Each player agent evaluates 7 actions per tick via utility AI and selects highest-scoring
- [x] **ENG-04**: Personality vector (directness, risk_appetite, composure, creativity, work_rate, aggression, anticipation, flair) weights every action score
- [x] **ENG-05**: Gaussian noise added to utility scores, scaled by (1 - composure), producing realistic decision variance
- [x] **ENG-06**: Fatigue attenuates physical attributes on a glycogen-depletion curve (gradual through 60min, steep final quarter)
- [x] **ENG-07**: Fatigue interpolates personality values toward conservative defaults (personality erosion)
- [ ] **ENG-08**: Tackle success resolved by comparing physical/technical attributes with positional geometry modifiers
- [ ] **ENG-09**: Shielding modeled as spatial exclusion zone scaled by strength
- [ ] **ENG-10**: Aerial contests resolved by Z-intercept timing with contest window
- [x] **ENG-11**: Goals detected when ball crosses goal line below crossbar height
- [ ] **ENG-12**: Match statistics accumulated from agent decisions (shots, possession, passes, tackles)
- [x] **ENG-13**: Match progresses through kickoff, first half, halftime, second half, full-time states
- [x] **ENG-14**: 2D top-down Canvas rendering with ball Z conveyed via sprite scaling and shadow offset
- [x] **ENG-15**: Simulation runs at 30+ ticks/sec, separated from 60fps rendering

### Tactical System

- [ ] **TAC-01**: Formation defined by positional anchors that create pull targets for each player
- [ ] **TAC-02**: Manager drags players into positions on a 2D pitch diagram to set formation
- [ ] **TAC-03**: Role assignments (striker, CM, LB, etc.) modify agent utility weights
- [ ] **TAC-04**: Manager can change formation and instructions at halftime
- [ ] **TAC-05**: Manager can substitute players during a match (up to 3 subs from bench)

### Squad Management

- [ ] **SQD-01**: Squad screen displays all players with attributes, personality traits, position, age, and fitness
- [ ] **SQD-02**: Manager selects starting 11 and bench (5-7 subs) before each match
- [ ] **SQD-03**: Fixture list generated as round-robin schedule for 20-team league
- [ ] **SQD-04**: League table tracks points, wins, draws, losses, goals for/against, goal difference
- [ ] **SQD-05**: Season ends with champion declared and squad carried forward to next season
- [ ] **SQD-06**: Player names procedurally generated

### Player Development

- [ ] **DEV-01**: Training drills selected by manager gradually shift player attributes over time
- [ ] **DEV-02**: Training drills also shift personality vector weights (shape who the player IS)
- [ ] **DEV-03**: Observable training sessions run as mini-sims the manager can watch
- [ ] **DEV-04**: Youth graduates generated each season with procedural personalities and attributes
- [ ] **DEV-05**: Older players retire at season end based on age
- [ ] **DEV-06**: Procedural pixel art portraits generated from player trait combinations

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

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

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 1 | Pending |
| ENG-02 | Phase 1 | Complete |
| ENG-03 | Phase 1 | Complete |
| ENG-04 | Phase 1 | Complete |
| ENG-05 | Phase 1 | Complete |
| ENG-06 | Phase 1 | Complete |
| ENG-07 | Phase 1 | Complete |
| ENG-08 | Phase 1 | Pending |
| ENG-09 | Phase 1 | Pending |
| ENG-10 | Phase 1 | Pending |
| ENG-11 | Phase 1 | Complete (01-04) |
| ENG-12 | Phase 1 | Pending |
| ENG-13 | Phase 1 | Complete (01-04) |
| ENG-14 | Phase 1 | Complete |
| ENG-15 | Phase 1 | Complete (01-01) |
| TAC-01 | Phase 2 | Pending |
| TAC-02 | Phase 2 | Pending |
| TAC-03 | Phase 2 | Pending |
| TAC-04 | Phase 2 | Pending |
| TAC-05 | Phase 2 | Pending |
| SQD-01 | Phase 3 | Pending |
| SQD-02 | Phase 3 | Pending |
| SQD-03 | Phase 3 | Pending |
| SQD-04 | Phase 3 | Pending |
| SQD-05 | Phase 3 | Pending |
| SQD-06 | Phase 3 | Pending |
| DEV-01 | Phase 4 | Pending |
| DEV-02 | Phase 4 | Pending |
| DEV-03 | Phase 4 | Pending |
| DEV-04 | Phase 4 | Pending |
| DEV-05 | Phase 4 | Pending |
| DEV-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-02*
*Last updated: 2026-03-03 after 01-01 completion — ENG-15 marked complete*

# Roadmap: Fergie Time

## Overview

Four phases derived directly from the dependency chain in the match engine: physics must work before agents have meaning, agents must produce emergent football before tactics have effect, tactics must have effect before management screens have value, and management continuity must exist before player development across seasons means anything. The engine is built first and proven watchable before a single management screen is built. Each phase delivers one complete, independently verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Engine Core** - A watchable match with emergent goals, realistic player movement, and observable possession changes
- [ ] **Phase 2: Tactical Layer** - Formation drag-and-drop and role assignments that visibly and measurably change team behavior
- [ ] **Phase 3: Management Shell** - A full playable season with squad management, fixtures, league table, and a champion declared
- [ ] **Phase 4: Development Systems** - Training, youth graduates, retirements, and procedural portraits that make seasons 2+ meaningfully different

## Phase Details

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
**Plans**: TBD

### Phase 2: Tactical Layer
**Goal**: Formation and role decisions by the manager mechanically alter how the team plays — changing shape produces a measurably different spatial footprint, not a cosmetic label
**Depends on**: Phase 1
**Requirements**: TAC-01, TAC-02, TAC-03, TAC-04, TAC-05
**Success Criteria** (what must be TRUE):
  1. Dragging players into a 4-5-1 on the tactics board produces a visibly different team shape on the pitch compared to a 4-3-3 — average player positions differ, not just icons on a diagram
  2. A compact low block genuinely reduces space for a possession-heavy opponent — the tactical counter-system produces statistically distinguishable outcomes over 10+ matches
  3. A halftime formation change takes effect at kickoff of the second half
  4. Substituting a player mid-match replaces the agent on the pitch with the bench player's attributes and personality
**Plans**: TBD

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
**Plans**: TBD

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Engine Core | 0/TBD | Not started | - |
| 2. Tactical Layer | 0/TBD | Not started | - |
| 3. Management Shell | 0/TBD | Not started | - |
| 4. Development Systems | 0/TBD | Not started | - |

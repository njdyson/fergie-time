# Roadmap: Fergie Time

## Overview

Four phases derived directly from the dependency chain in the match engine: physics must work before agents have meaning, agents must produce emergent football before tactics have effect, tactics must have effect before management screens have value, and management continuity must exist before player development across seasons means anything. The engine is built first and proven watchable before a single management screen is built. Each phase delivers one complete, independently verifiable capability.

## Milestones

- ✅ **v1.0 Match Engine** — Phases 1-4 (Phases 1, 3 shipped; Phase 2 partial; Phase 4 deferred)
- ✅ **v1.1 Data Layer** — Phases 5-9 (shipped 2026-03-07)
- 🚧 **v1.2 Player Development** — Phases 10-13 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.0 Match Engine (Phases 1-4)</summary>

- [x] **Phase 1: Engine Core** — A watchable match with emergent goals, realistic player movement, and observable possession changes (completed 2026-03-03)
- [ ] **Phase 2: Tactical Layer** — Formation drag-and-drop and role assignments that visibly and measurably change team behavior (2/3 plans complete, partial)
- [x] **Phase 3: Management Shell** — A full playable season with squad management, fixtures, league table, and a champion declared (completed 2026-03-06)
- [ ] **Phase 4: Development Systems** — Training, youth graduates, retirements, and procedural portraits that make seasons 2+ meaningfully different (deferred)

</details>

<details>
<summary>✅ v1.1 Data Layer (Phases 5-9) — SHIPPED 2026-03-07</summary>

- [x] **Phase 5: Server Foundation** — Express + SQLite running with proven serialization, dev proxy configured (completed 2026-03-06)
- [x] **Phase 6: Auth + Persistence** — Login, save/load, auto-save after each matchday (completed 2026-03-07)
- [x] **Phase 7: Squads + Names** — 25-man squads with realistic nationality-weighted names (completed 2026-03-07)
- [x] **Phase 8: Stats + Deployment** — Per-player season stats, player profile, VPS deployment (completed 2026-03-07)
- [x] **Phase 9: Gap Closure** — Shirt number persistence, Hub stats fix, deployment config (completed 2026-03-07)

</details>

### 🚧 v1.2 Player Development (In Progress)

**Milestone Goal:** Add visual identity to players via pixel art portraits, then build a training system with drill scheduling and an observation-only sandbox.

- [x] **Phase 10: Portraits** — Every player has a deterministic, nationality-influenced pixel art portrait on their profile screen (completed 2026-03-07)
- [ ] **Phase 11: Training Logic** — Player attributes improve after drill sessions based on drill type, age, and personality — verified headlessly before any UI
- [ ] **Phase 12: Training Scheduler** — The hub shows training days until the next match; manager assigns drill or rest and sees stat deltas on player profiles
- [ ] **Phase 13: Sandbox** — Manager can access a free-to-use training ground sandbox, configure custom scenarios, and observe the real engine running without affecting season state

## Phase Details

<details>
<summary>v1.0 Match Engine (Phases 1-4)</summary>

### Phase 1: Engine Core
**Goal**: A single watchable match produces emergent football — goals, mistakes, possession changes, and realistic player movement arising from physics and agent decisions, never from scripted events
**Depends on**: Nothing (first phase)
**Requirements**: ENG-01 through ENG-15
**Plans**: 10/10 complete

### Phase 2: Tactical Layer
**Goal**: Formation and role decisions by the manager mechanically alter how the team plays — changing shape produces a measurably different spatial footprint, not a cosmetic label
**Depends on**: Phase 1
**Requirements**: TAC-01 through TAC-05
**Plans**: 2/3 complete (partial — halftime/subs plan remaining)

### Phase 3: Management Shell
**Goal**: A full playable season gives the match engine narrative stakes — the manager picks squads, plays fixtures, watches the table move, and a champion is declared
**Depends on**: Phase 2
**Requirements**: SQD-01 through SQD-06
**Plans**: 6/6 complete

### Phase 4: Development Systems
**Goal**: Training drills, youth graduates, retirements, and procedural portraits make each squad distinct — after multiple seasons, the team reflects the manager's choices
**Depends on**: Phase 3
**Requirements**: DEV-01 through DEV-06
**Status**: Deferred

</details>

<details>
<summary>v1.1 Data Layer (Phases 5-9) — see milestones/v1.1-ROADMAP.md for full details</summary>

### Phase 5: Server Foundation (3/3 plans)
### Phase 6: Auth + Persistence (2/2 plans)
### Phase 7: Squads + Names (2/2 plans)
### Phase 8: Stats + Deployment (3/3 plans)
### Phase 9: Gap Closure (2/2 plans)

</details>

### Phase 10: Portraits
**Goal**: Every player has a unique, deterministic pixel art portrait on their profile screen, seeded from their player ID and reflecting their nationality
**Depends on**: Phase 9
**Requirements**: PORT-01, PORT-02, PORT-03
**Success Criteria** (what must be TRUE):
  1. User can see a pixel art portrait on every player's profile screen — no player is portrait-less
  2. Closing and reopening the game shows the same portrait for each player (deterministic across sessions)
  3. Players from different nationalities have visibly different skin tones and hair colour palettes
  4. Portrait generation never slows down navigating to a player profile (session-level cache)
**Plans**: TBD

### Phase 11: Training Logic
**Goal**: Player attributes improve after drill sessions in a way that is economically sound, age-gated, and personality-driven — proven by headless simulation before any UI is built
**Depends on**: Phase 10
**Requirements**: TRAIN-04, TRAIN-06
**Success Criteria** (what must be TRUE):
  1. Applying a drill to a squad of players produces a new PlayerState[] with measurably higher relevant attributes (pure function, testable without UI)
  2. A young high-potential player gains more from the same drill than an older lower-potential player
  3. A headless 5-season simulation confirms no attribute exceeds ~0.95 for a player starting below 0.70 — economy is sound
  4. Attribute growth has no hidden ceiling — a player can keep improving at any age, but the rate naturally decays as age increases
  5. The "training" personality trait is present on all players and visibly affects per-session gain magnitude
**Plans**: TBD

### Phase 12: Training Scheduler
**Goal**: The manager can see and assign training days between matches from the hub, pick squad-wide drill types, and observe attribute improvements on player profiles afterward
**Depends on**: Phase 11
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-05
**Success Criteria** (what must be TRUE):
  1. User can see a training scheduler on the hub showing how many days remain until the next match
  2. User can mark each pre-match day as a drill or rest with a single click
  3. User can select a squad-wide drill type from a menu of 6-8 labelled categories, each showing which attributes it targets
  4. After a training block completes, the player profile screen shows the attribute deltas gained (e.g., "+0.02 Pace") from that block
**Plans**: TBD

### Phase 13: Sandbox
**Goal**: The manager can launch the training ground sandbox from the hub at any time, configure a custom scenario, watch the real match engine run it, and return to the hub knowing nothing in their season was affected
**Depends on**: Phase 12
**Requirements**: SAND-01, SAND-02, SAND-03, SAND-04, SAND-05
**Success Criteria** (what must be TRUE):
  1. User can access the training ground sandbox from the game hub without starting a league match
  2. User can pick two teams, set their formations, and launch the scenario before the engine starts
  3. Sandbox runs the real match engine on the canvas with speed controls (play, fast-forward)
  4. After the sandbox match ends, the user's league table, squad attributes, and season state are identical to before — no changes are written
  5. User can load a named preset scenario (e.g., "High Press vs Low Block") that pre-configures both teams without manual setup
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Engine Core | v1.0 | 10/10 | Complete | 2026-03-03 |
| 2. Tactical Layer | v1.0 | 2/3 | Partial | - |
| 3. Management Shell | v1.0 | 6/6 | Complete | 2026-03-06 |
| 4. Development Systems | v1.0 | 0/TBD | Deferred | - |
| 5. Server Foundation | v1.1 | 3/3 | Complete | 2026-03-06 |
| 6. Auth + Persistence | v1.1 | 2/2 | Complete | 2026-03-07 |
| 7. Squads + Names | v1.1 | 2/2 | Complete | 2026-03-07 |
| 8. Stats + Deployment | v1.1 | 3/3 | Complete | 2026-03-07 |
| 9. Gap Closure | v1.1 | 2/2 | Complete | 2026-03-07 |
| 10. Portraits | 2/2 | Complete   | 2026-03-07 | - |
| 11. Training Logic | v1.2 | 0/TBD | Not started | - |
| 12. Training Scheduler | v1.2 | 0/TBD | Not started | - |
| 13. Sandbox | v1.2 | 0/TBD | Not started | - |

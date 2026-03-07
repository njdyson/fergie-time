# Roadmap: Fergie Time

## Overview

Four phases derived directly from the dependency chain in the match engine: physics must work before agents have meaning, agents must produce emergent football before tactics have effect, tactics must have effect before management screens have value, and management continuity must exist before player development across seasons means anything. The engine is built first and proven watchable before a single management screen is built. Each phase delivers one complete, independently verifiable capability.

## Milestones

- ✅ **v1.0 Match Engine** — Phases 1-4 (Phases 1, 3 shipped; Phase 2 partial; Phase 4 deferred)
- ✅ **v1.1 Data Layer** — Phases 5-9 (shipped 2026-03-07)

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

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

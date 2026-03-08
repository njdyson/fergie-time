# Roadmap: Fergie Time

## Overview

Four phases derived directly from the dependency chain in the match engine: physics must work before agents have meaning, agents must produce emergent football before tactics have effect, tactics must have effect before management screens have value, and management continuity must exist before player development across seasons means anything. The engine is built first and proven watchable before a single management screen is built. Each phase delivers one complete, independently verifiable capability.

## Milestones

- ✅ **v1.0 Match Engine** — Phases 1-4 (Phases 1, 3 shipped; Phase 2 partial; Phase 4 deferred)
- ✅ **v1.1 Data Layer** — Phases 5-9 (shipped 2026-03-07)
- ✅ **v1.2 Player Development** — Phases 10-12 (shipped 2026-03-07)
- 🚧 **v1.3 Day Cycle** — Phases 13-15 (in progress)

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

<details>
<summary>✅ v1.2 Player Development (Phases 10-12) — SHIPPED 2026-03-07</summary>

- [x] **Phase 10: Portraits** — Every player has a deterministic, nationality-influenced pixel art portrait on their profile screen (completed 2026-03-07)
- [x] **Phase 11: Training Logic** — Player attributes improve after drill sessions based on drill type, age, and personality — verified headlessly before any UI (completed 2026-03-07)
- [x] **Phase 12: Training Scheduler** — The hub shows training days until the next match; manager assigns drill or rest and sees stat deltas on player profiles (completed 2026-03-07)

</details>

### 🚧 v1.3 Day Cycle (In Progress)

**Milestone Goal:** Replace the 3-slot training scheduler with a sequential day-by-day hub loop, improve transfer flow with delayed responses and daily summaries, and polish training and player display.

- [x] **Phase 13: Hub Day Loop** — A day-by-day schedule replaces the 3-slot trainer; Continue advances one day, Kick Off launches when match day arrives (completed 2026-03-08)
- [ ] **Phase 14: Training Polish** — Training gains section removed; recently improved stats highlighted on squad and player pages; daily coaching report email generated after each training day
- [ ] **Phase 15: Transfer Overhaul** — Transfer responses arrive the next day; rival activity consolidates into one daily email; bid tracking with status filter; player overall rating on squad and profile

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

<details>
<summary>v1.2 Player Development (Phases 10-12) — see milestones/v1.2-ROADMAP.md for full details</summary>

### Phase 10: Portraits (2/2 plans)
### Phase 11: Training Logic (1/1 plan)
### Phase 12: Training Scheduler (2/2 plans)

</details>

### Phase 13: Hub Day Loop
**Goal**: The hub presents the week as a sequential day-by-day schedule; pressing Continue advances exactly one day (processing training and any pending transfers); the button becomes Kick Off when the current day reaches match day
**Depends on**: Phase 12
**Requirements**: HUB-01, HUB-02, HUB-03, HUB-04
**Success Criteria** (what must be TRUE):
  1. The hub displays every day from the current day through match day as a visible schedule list
  2. The current day is visually distinguished from past and future days in the schedule
  3. Pressing Continue advances the day counter by exactly one and applies that day's training
  4. On match day the Continue button is replaced by Kick Off
**Plans**: TBD

### Phase 14: Training Polish
**Goal**: The training display is clean and informative — the old gains section is gone, recently improved stats are highlighted directly on squad and player pages, and a daily coaching report email lands after each training day
**Depends on**: Phase 13
**Requirements**: TDISP-01, TDISP-02, COACH-01
**Success Criteria** (what must be TRUE):
  1. The player profile page no longer shows a "Player Training Gains" section
  2. Attributes that improved since the last match are visually highlighted on the squad screen and player profile
  3. After each training day, an email appears in the inbox summarizing the drill type, squad participation, and standout improvers
**Plans**: TBD

### Phase 15: Transfer Overhaul
**Goal**: Transfer interactions feel deliberate — bids sit pending until next Continue press, rival activity arrives as a single daily digest, the transfers page shows bid status at a glance, and every player displays a clear overall rating
**Depends on**: Phase 13
**Requirements**: XFER-01, XFER-02, XFER-03, RATE-01
**Success Criteria** (what must be TRUE):
  1. Submitting a transfer bid shows it as pending; the response (accept or reject) arrives only after the next Continue press
  2. Rival transfer activity from each day is consolidated into a single summary email rather than one notification per transfer
  3. The transfers page has a status filter showing pending, accepted, and rejected bids
  4. Each player's overall rating is visible as a single number on the squad screen and on their profile page
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1. Engine Core | v1.0 | 10/10 | Complete | 2026-03-03 |
| 2. Tactical Layer | v1.0 | 2/3 | Partial | - |
| 3. Management Shell | v1.0 | 6/6 | Complete | 2026-03-06 |
| 4. Development Systems | v1.0 | 0/0 | Deferred | - |
| 5. Server Foundation | v1.1 | 3/3 | Complete | 2026-03-06 |
| 6. Auth + Persistence | v1.1 | 2/2 | Complete | 2026-03-07 |
| 7. Squads + Names | v1.1 | 2/2 | Complete | 2026-03-07 |
| 8. Stats + Deployment | v1.1 | 3/3 | Complete | 2026-03-07 |
| 9. Gap Closure | v1.1 | 2/2 | Complete | 2026-03-07 |
| 10. Portraits | v1.2 | 2/2 | Complete | 2026-03-07 |
| 11. Training Logic | v1.2 | 1/1 | Complete | 2026-03-07 |
| 12. Training Scheduler | v1.2 | 2/2 | Complete | 2026-03-07 |
| 13. Hub Day Loop | 2/2 | Complete   | 2026-03-08 | - |
| 14. Training Polish | v1.3 | 0/? | Not started | - |
| 15. Transfer Overhaul | v1.3 | 0/? | Not started | - |

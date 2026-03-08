# Requirements: Fergie Time

**Defined:** 2026-03-07
**Core Value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events

## v1.3 Requirements

Requirements for v1.3 Day Cycle milestone. Each maps to roadmap phases.

### Hub / Day Loop

- [ ] **HUB-01**: Hub shows a sequential day-by-day schedule from current day through match day
- [ ] **HUB-02**: Current day is visually highlighted in the schedule
- [x] **HUB-03**: "Continue" button processes one day (applies training, processes transfers, generates emails)
- [ ] **HUB-04**: Button changes to "Kick Off" when current day reaches match day

### Training Display

- [ ] **TDISP-01**: Player profile no longer shows the "Player Training Gains" section
- [ ] **TDISP-02**: Squad and player pages highlight recently changed attributes (visual indicator for stats that increased since last match)

### Coaching Reports

- [ ] **COACH-01**: Daily coaching report email sent after training day summarizing drill type, squad participation, and standout improvers

### Transfers

- [ ] **XFER-01**: Rival transfer activity consolidated into a single daily summary email instead of per-transfer notifications
- [ ] **XFER-02**: Transfer bid acceptance/rejection arrives the following day (processed on next Continue press) instead of instantly
- [ ] **XFER-03**: Transfers page shows bid tracking with status filter (pending, accepted, rejected)

### Player Rating

- [ ] **RATE-01**: Player overall rating calculated from attributes and displayed on squad screen and player profile

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Sandbox

- **SAND-01**: Training ground sandbox — set up custom scenarios, watch engine run them, no stat changes

### Player Development

- **PDEV-01**: Personality vector nudges from training (slight, bounded shifts over time)

### Season Lifecycle

- **LIFE-01**: Season cycle with youth graduates and retirements
- **LIFE-02**: Injury system with recovery timelines

### Set Pieces

- **SET-01**: Set piece choreography — design routines in training, execute via matches

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multiple divisions / promotion-relegation | Single league, designed for future expansion |
| 3D graphics | 2D canvas is the rendering target |
| Multiplayer / online | Single-player personal project |
| Mobile | Web desktop-first |
| Per-player drill assignment | Squad-level training first, granularity later |
| International management | Multiplies fixture and squad complexity |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HUB-01 | Phase 13 | Pending |
| HUB-02 | Phase 13 | Pending |
| HUB-03 | Phase 13 | Complete |
| HUB-04 | Phase 13 | Pending |
| TDISP-01 | Phase 14 | Pending |
| TDISP-02 | Phase 14 | Pending |
| COACH-01 | Phase 14 | Pending |
| XFER-01 | Phase 15 | Pending |
| XFER-02 | Phase 15 | Pending |
| XFER-03 | Phase 15 | Pending |
| RATE-01 | Phase 15 | Pending |

**Coverage:**
- v1.3 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation*

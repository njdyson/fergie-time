---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Player Development
status: unknown
last_updated: "2026-03-07T22:52:57.077Z"
progress:
  total_phases: 6
  completed_phases: 6
  total_plans: 24
  completed_plans: 24
---

---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Player Development
status: unknown
last_updated: "2026-03-07T21:40:00.417Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 22
  completed_plans: 22
---

---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Player Development
status: unknown
last_updated: "2026-03-07T21:07:00.272Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 21
  completed_plans: 21
---

---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Player Development
status: unknown
last_updated: "2026-03-07T20:46:35.550Z"
progress:
  total_phases: 4
  completed_phases: 4
  total_plans: 21
  completed_plans: 21
---

---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Player Development
status: active
last_updated: "2026-03-07T20:44:00Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 1
  percent: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-07)

**Core value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events
**Current focus:** Phase 12 — Training Scheduler

## Current Position

Phase: 12 of 13 — Training Scheduler
Plan: 2 of 2 complete
Status: Phase 12 complete
Last activity: 2026-03-07 — Training scheduler UI complete (Plan 02 complete, hub card + profile deltas + kickoff integration)

Progress: [████░░░░░░] 22% (v1.2)

## Performance Metrics

**Velocity:**
- Total plans completed: 5 (v1.2)
- Average duration: 9 min
- Total execution time: 44 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 10-portraits | 2/2 | 23 min | 12 min |
| 11-training-logic | 1/3 | 3 min | 3 min |
| 12-training-scheduler | 2/2 | 18 min | 9 min |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table for full history.

Recent decisions affecting v1.2:
- No hidden potential ceiling — growth driven by age curve + "training" personality trait (no potential float cap)
- Training scheduler on hub page only, showing days until next match (not in season calendar)
- Each training day is squad-wide drill or rest — no per-player assignment
- Portraits only on player profile screen, not squad screen (PORT-F01 deferred)
- Sandbox is free-to-use anytime, observation only, with scenario presets
- [10-01] Use 20x24 logical pixel grid scaled 6x5 to 120x120 canvas for clean integer portrait scaling
- [10-01] RNG namespaced with 'portrait-' prefix to prevent cross-system seed collisions
- [10-01] Fixed RNG call order (skin, hairStyle, hairCol, eyeCol, facialHair) is append-only contract — inserting earlier calls changes all portraits
- [10-01] getPalette() uses ternary guard not && short-circuit to ensure undefined nationality returns FALLBACK_PALETTE
- [Phase 10-portraits]: Deleted drawAvatar, getInitials, and shiftColor entirely after portrait swap — no dead code left in playerProfileScreen.ts
- [10-02] Portrait centred via ctx.translate(0, 13) inside save/restore — face content midpoint (rows 2-16, ~47px) aligned to canvas circle centre (60px)
- [10-02] Hair gap fix: SHORT_CROP front row-3 extended to col 13, MEDIUM_PART front rows 2-3 right edge extended one pixel — closes top-right head outline gap
- [11-01] BASE_DELTA = 0.004 — tuned via headless 5-season sim (570 sessions), weak-tier squad stays below 0.95
- [11-01] work_rate used as training proxy — formula: 0.6 + work_rate * 0.8, range [0.6, 1.4]; no new trait needed
- [11-01] undefined player age defaults to 25 (safe midpoint, deterministic, avoids NaN)
- [11-01] Age factor curve: ≤20→1.0, piecewise linear to 36+→0.15; no hard floor on growth (TRAIN-06 satisfied)
- [12-01] TRAINING_DAYS_PER_MATCHDAY = 3 locked — changing requires re-running headless 5-season sim and re-tuning BASE_DELTA
- [12-01] TrainingDeltas typed as Map (not plain object) for correct serialization via existing serialize.ts Map reviver/replacer
- [12-01] Schedule entries sorted by numeric key in applyTrainingBlock for deterministic processing order
- [12-01] DRILL_LABELS is single source of truth for display labels — both hub scheduler and profile delta panel import from training.ts
- [12-02] Training scheduler card only renders when a next fixture exists — no card shown when season is complete
- [12-02] Training applied exactly once in onKickoff handler before startMatchFromSquad() — not on render or revisit
- [12-02] Schedule reset to {} after kickoff — clean state for next training block
- [12-02] Delta display threshold 0.0005 to filter floating-point noise; gains may appear as 0 after single block at BASE_DELTA=0.004

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2 - DEFERRED]: Player oscillation / jitter — utility AI action scores flip each tick. Sandbox (Phase 13) will make this highly visible. Research suggests raising TUNING.hysteresisBonus from 0.36 to 0.45-0.50 — attempt in Phase 13 context.
- [Phase 11 - RESOLVED]: Training economy verified headlessly — 570 sessions (5 seasons), weak-tier squad, no attribute exceeded 0.95. BASE_DELTA=0.004 is the calibrated value.
- [Phase 11 - WATCH]: Existing saves have no `potential` field on players — need derivation fallback (e.g. derive from attribute average + age factor if field absent).
- [Phase 13 - WATCH]: Sandbox roster aliasing risk — must deep-clone squad via JSON.parse(JSON.stringify()) before passing to sandbox engine to prevent stat leak into real season.

## Session Continuity

Last session: 2026-03-07
Stopped at: Completed 12-02-PLAN.md — Training scheduler UI (hub card, profile deltas, kickoff integration). Phase 12 complete.
Resume file: None

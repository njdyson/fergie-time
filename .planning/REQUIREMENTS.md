# Requirements: Fergie Time

**Defined:** 2026-03-07
**Core Value:** The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events

## v1.2 Requirements

Requirements for milestone v1.2 Player Development. Each maps to roadmap phases.

### Portraits

- [x] **PORT-01**: User can see a unique pixel art portrait for each player on the player profile screen
- [x] **PORT-02**: Portraits are deterministic — same player always generates the same face across sessions
- [x] **PORT-03**: Portraits reflect player nationality via skin tone and hair colour

### Training

- [ ] **TRAIN-01**: User can see a training scheduler on the hub showing days until the next match
- [x] **TRAIN-02**: User can assign each day before the next match as either a drill or rest
- [x] **TRAIN-03**: User can select a squad-wide drill type for each training day from a menu of 6-8 drill categories
- [x] **TRAIN-04**: Player attributes improve after training based on drill type, age, and a "training" personality trait
- [x] **TRAIN-05**: User can see stat improvement deltas on the player profile after training
- [x] **TRAIN-06**: Improvement rate is uncapped — no hidden potential ceiling — but naturally slows with age and varies by personality

### Sandbox

- [ ] **SAND-01**: User can access the training ground sandbox from the game hub
- [ ] **SAND-02**: User can configure a scenario by picking teams and setting formations
- [ ] **SAND-03**: Sandbox runs the real match engine on the canvas with speed controls
- [ ] **SAND-04**: Sandbox is observation-only — no stats, results, or season state are affected
- [ ] **SAND-05**: User can load named scenario presets (e.g., "High Press vs Low Block")

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### Training Enhancements

- **TRAIN-F01**: Personality vector nudges from training drill type (slight, bounded shifts over time)
- **TRAIN-F02**: Drill intensity toggle (light/standard/hard) with injury risk tradeoff
- **TRAIN-F03**: Training history log per player showing last N drill assignments
- **TRAIN-F04**: Per-player drill assignment instead of squad-wide

### Portrait Enhancements

- **PORT-F01**: Portraits on squad screen alongside player names
- **PORT-F02**: Portrait reflects physical attributes (strength → broader face, pace → leaner)

### Sandbox Enhancements

- **SAND-F01**: Sandbox recording/replay (save engine tick log for playback)

### Other

- **OTHER-F01**: Set piece choreography — design routines in training, execute via special action in matches
- **OTHER-F02**: Season cycle with youth graduates and retirements
- **OTHER-F03**: Injury system with recovery timelines

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Multiple divisions / promotion-relegation | Single league, designed for future expansion |
| 3D graphics | 2D canvas is the rendering target |
| Multiplayer / online | Single-player personal project |
| Mobile | Web desktop-first |
| AI image generation for portraits | Pixel art procedural generation instead |
| Commercial features | Personal project, no accounts/payments/analytics |
| Press conferences / media | Narrative layer, no simulation depth |
| International management | Multiplies fixture and squad complexity |
| Per-player drill assignment | Squad-level training first, granularity later if needed |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PORT-01 | Phase 10 | Complete |
| PORT-02 | Phase 10 | Complete |
| PORT-03 | Phase 10 | Complete |
| TRAIN-04 | Phase 11 | Complete |
| TRAIN-06 | Phase 11 | Complete |
| TRAIN-01 | Phase 12 | Pending |
| TRAIN-02 | Phase 12 | Complete |
| TRAIN-03 | Phase 12 | Complete |
| TRAIN-05 | Phase 12 | Complete |
| SAND-01 | Phase 13 | Pending |
| SAND-02 | Phase 13 | Pending |
| SAND-03 | Phase 13 | Pending |
| SAND-04 | Phase 13 | Pending |
| SAND-05 | Phase 13 | Pending |

**Coverage:**
- v1.2 requirements: 14 total
- Mapped to phases: 14
- Unmapped: 0

---
*Requirements defined: 2026-03-07*
*Last updated: 2026-03-07 after roadmap creation (v1.2 phases 10-13)*

# Fergie Time

## What This Is

A browser-based football management game built around a genuine emergent simulation engine. 22 autonomous player agents run identical decision code weighted by individual personality vectors — no scripted outcomes, no event tables. Tactics are real mechanical levers that create genuine spatial advantages. The manager sets up formations by dragging players, chooses training drills, and watches emergent football play out on a 2D canvas.

## Core Value

The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 2.5D physics layer (2D ground + Z-axis height for aerials, headers, crosses)
- [ ] Steering-behavior player movement with physical attribute caps
- [ ] Utility AI agent system — all 22 players run identical evaluation code
- [ ] Personality vector system — floats that weight every action score per player
- [ ] Gaussian noise scaled by composure for decision variance
- [ ] Fatigue system with personality erosion (tired players get cautious, error-prone)
- [ ] Tactical system — formation anchors, role assignments, per-player instructions
- [ ] Drag-and-drop tactics board for formation setup
- [ ] Contact/challenge resolution (tackles, shielding, aerial contests)
- [ ] 2D top-down pitch rendering on HTML5 Canvas
- [ ] Procedurally generated pixel art player portraits
- [ ] Random player name generation
- [ ] Training system — drills that shift attributes and personality weights over time
- [ ] Observable training sessions (mini-sims to watch player behavior)
- [ ] Squad screen showing player attributes, personality, fitness
- [ ] Fixtures and league table (single 20-team league)
- [ ] Season cycle with youth graduates and retirements

### Out of Scope

- Transfer market — deferred, adds complexity before engine is proven
- Multiple divisions / promotion-relegation — single league v1, designed for future expansion
- 3D graphics — 2D canvas is the rendering target
- Multiplayer / online — single-player personal project
- Mobile — web desktop-first
- AI image generation for portraits — pixel art procedural generation instead
- Commercial features (accounts, payments, analytics)

## Context

This is a personal passion project inspired by Championship Manager's depth but replacing lookup tables with a genuine physics-based emergent simulation. The design brief (`match-engine-design-brief.docx`) contains detailed technical specifications for the engine including:

- **Physics:** 2.5D ball (X/Y ground + Z height via projectile motion), steering behaviors for movement, physical attribute caps with fatigue curves mirroring real glycogen depletion
- **Agent AI:** Utility AI architecture — each tick, every agent evaluates ~7 actions (pass, dribble, shoot, hold/shield, move to position, press, make run) and selects the highest-scoring one. Personality weights flow through every score calculation.
- **Personality vector:** Floats including directness, risk_appetite, composure, creativity, work_rate, aggression, anticipation, flair. These are who the player IS, separate from what they CAN do (physical/technical attributes).
- **Scoring example:** `score = success_probability + forward_progress × directness − (1 − success_probability) × (1 − risk_appetite) − pressure × (1 − composure)`
- **Emergent archetypes:** A "maverick" and a "metronome" are not different agent classes — they're different points in parameter space. Archetypes fall out of the personality vector naturally.
- **Tactical diversity:** No single tactic should dominate. A compact low block genuinely neutralises tiki-taka by reducing space. Direct play genuinely bypasses a high press.

The match engine is the foundation — everything else (management screens, seasons, training) layers on top of a proven engine.

**v1 success = "I can watch a full match with emergent behavior and say 'that felt like football.'"**

## Constraints

- **Tech stack**: TypeScript + HTML5 Canvas, browser-based
- **Rendering**: 2D top-down, no 3D — ball height conveyed via sprite scaling and shadow offset
- **Performance**: 22 agents evaluating utility functions every tick must run smoothly in browser (target 30+ ticks/sec simulation, 60fps render)
- **Simulation architecture**: Separate simulation from rendering from day one — engine runs headlessly, Canvas is a visualizer
- **Solo developer**: Personal project, one person building

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Canvas over Godot | Browser-based distribution, zero-install, 22 agents feasible in JS at 30 ticks/sec | — Pending |
| Utility AI over behavior trees | Every player runs identical code with personality weights — cleaner, more emergent, data-driven tuning | — Pending |
| Separate simulation from rendering | Enables headless match simulation, future AI training runs, engine replacement flexibility | — Pending |
| Single league, no transfers for v1 | Focus on engine quality before management complexity | — Pending |
| Pixel art procedural portraits | Can generate from trait combinations, fits the aesthetic, no external API dependency | — Pending |
| Drag formation over preset templates | More expressive tactical control, aligns with "tactics as real mechanical levers" philosophy | — Pending |

---
*Last updated: 2026-03-02 after initialization*

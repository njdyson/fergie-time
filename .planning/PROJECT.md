# Fergie Time

## What This Is

A browser-based football management game built around a genuine emergent simulation engine. 22 autonomous player agents run identical decision code weighted by individual personality vectors — no scripted outcomes, no event tables. Tactics are real mechanical levers that create genuine spatial advantages. The manager sets up formations by dragging players, chooses training drills, and watches emergent football play out on a 2D canvas.

## Core Value

The match engine must produce emergent behavior that feels like real football — goals, mistakes, tactical dominance and individual brilliance all arising from physics, agent decisions and personality vectors, never from scripted events.

## Requirements

### Validated

- ✓ 2.5D physics layer (2D ground + Z-axis height for aerials, headers, crosses) — v1.0 Phase 1
- ✓ Steering-behavior player movement with physical attribute caps — v1.0 Phase 1
- ✓ Utility AI agent system — all 22 players run identical evaluation code — v1.0 Phase 1
- ✓ Personality vector system — floats that weight every action score per player — v1.0 Phase 1
- ✓ Gaussian noise scaled by composure for decision variance — v1.0 Phase 1
- ✓ Fatigue system with personality erosion — v1.0 Phase 1
- ✓ Tactical system — formation anchors, role assignments, per-player instructions — v1.0 Phase 2
- ✓ Drag-and-drop tactics board for formation setup — v1.0 Phase 2
- ✓ Contact/challenge resolution (tackles, shielding, aerial contests) — v1.0 Phase 1
- ✓ 2D top-down pitch rendering on HTML5 Canvas — v1.0 Phase 1
- ✓ Squad screen showing player attributes, fitness — v1.0 Phase 3
- ✓ Fixtures and league table (single 20-team league) — v1.0 Phase 3
- ✓ Procedural player name generation — v1.0 Phase 3

### Active

- [ ] SQLite database layer with Express API server on VPS
- [ ] Game persistence — save/load season state across browser sessions
- [ ] Simple login — team name + password, create new game / continue existing
- [ ] Realistic player names via randomuser.me API, cached in DB
- [ ] 25-man squads (up from 16, matching Premier League rules)
- [ ] Season player stats persisted in DB (goals, assists, appearances, etc.)
- [ ] Procedurally generated pixel art player portraits
- [ ] Training system — drills that shift attributes and personality weights over time
- [ ] Observable training sessions (mini-sims to watch player behavior)
- [ ] Season cycle with youth graduates and retirements

### Out of Scope

- Transfer market — deferred, adds complexity before engine is proven
- Multiple divisions / promotion-relegation — single league v1, designed for future expansion
- 3D graphics — 2D canvas is the rendering target
- Multiplayer / online — single-player personal project
- Mobile — web desktop-first
- AI image generation for portraits — pixel art procedural generation instead
- Commercial features (accounts, payments, analytics)

## Current Milestone: v1.1 Data Layer

**Goal:** Add persistent backend so game state survives sessions, with realistic names and expanded squads.

**Target features:**
- SQLite + Express API server deployed on existing VPS
- Game save/load with simple team name + password login
- Realistic player names from randomuser.me, cached in DB
- 25-man squads matching Premier League rules
- Season player stats (goals, assists, appearances) persisted per game

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
| SQLite + Express over Supabase/PocketBase | Simple single-file DB, deploy on existing VPS, no external services | — Pending |
| randomuser.me for player names | Free, no API key, nationality-based, well-established | — Pending |
| 25-man squads over 16 | Matches PL rules, enables rotation/depth decisions | — Pending |

---
*Last updated: 2026-03-06 after v1.1 milestone start*

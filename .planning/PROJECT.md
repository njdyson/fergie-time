# Fergie Time

## What This Is

A browser-based football management game built around a genuine emergent simulation engine. 22 autonomous player agents run identical decision code weighted by individual personality vectors — no scripted outcomes, no event tables. Tactics are real mechanical levers that create genuine spatial advantages. The manager picks a squad from a 25-man roster, sets formations by dragging players, and watches emergent football play out on a 2D canvas. Each player has a unique procedurally generated pixel art portrait. Between matches, the manager schedules training drills that improve player attributes based on drill type, age, and personality. Game state persists to a SQLite backend — log in, play matches, close the browser, come back later.

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
- ✓ SQLite database layer with Express API server on VPS — v1.1 Phase 5
- ✓ Game persistence — save/load season state across browser sessions — v1.1 Phase 6
- ✓ Simple login — team name + password, create new game / continue existing — v1.1 Phase 6
- ✓ Realistic player names via randomuser.me API, cached in DB — v1.1 Phase 7
- ✓ 25-man squads (up from 16, matching Premier League rules) — v1.1 Phase 7
- ✓ Season player stats persisted in DB (goals, assists, appearances) — v1.1 Phase 8
- ✓ VPS deployment with systemd + nginx — v1.1 Phase 9
- ✓ Transfer market — buy/sell players between teams — v1.1
- ✓ Procedurally generated pixel art player portraits (nationality-influenced, deterministic) — v1.2
- ✓ Drill scheduling — training days between matches, squad-wide daily drill, improvement based on drill type × age × personality — v1.2
- ✓ Training attribute deltas visible on player profiles — v1.2

## Current Milestone: v1.3 Day Cycle

**Goal:** Replace the 3-slot training scheduler with a sequential day-by-day hub loop, improve transfer flow with delayed responses and daily summaries, and polish training/player display.

**Target features:**
- Day-by-day hub schedule with Continue/Kick Off progression
- Daily coaching report email summarizing training results
- Daily rival transfer summary email (replacing per-transfer spam)
- Delayed transfer acceptance/rejection (next-day responses)
- Bid tracking on transfers page (status filter for pending/accepted/rejected)
- Stat change highlighting on squad/player pages (replacing training gains section)
- Player overall rating on squad and profile screens

### Active

- [ ] Day-by-day hub schedule replacing 3-slot training scheduler
- [ ] Continue button processes one day, Kick Off on match day
- [ ] Remove player training gains section from profile
- [ ] Highlight recent stat changes on squad/player pages
- [ ] Daily coaching report email
- [ ] Daily rival transfer summary email (consolidate individual notifications)
- [ ] Delayed transfer responses (next day on Continue press)
- [ ] Bid tracking UI on transfers page
- [ ] Player overall rating on squad screen and player profile

### Future

- [ ] Training ground sandbox — set up custom scenarios, watch engine run them, no stat changes
- [ ] Personality vector nudges from training (slight, bounded shifts over time)
- [ ] Season cycle with youth graduates and retirements
- [ ] Injury system with recovery timelines
- [ ] Set piece choreography — design routines in training, execute via matches

### Out of Scope

- Multiple divisions / promotion-relegation — single league, designed for future expansion
- 3D graphics — 2D canvas is the rendering target
- Multiplayer / online — single-player personal project
- Mobile — web desktop-first
- AI image generation for portraits — pixel art procedural generation instead
- Commercial features (accounts, payments, analytics)
- Press conferences / media — narrative layer, no simulation depth
- Set piece choreography — deferred to future milestone, design and scope separately
- Per-player drill assignment — squad-level training first, granularity later if needed
- International management — multiplies fixture and squad complexity

## Context

This is a personal passion project inspired by Championship Manager's depth but replacing lookup tables with a genuine physics-based emergent simulation. The design brief (`match-engine-design-brief.docx`) contains detailed technical specifications for the engine including:

- **Physics:** 2.5D ball (X/Y ground + Z height via projectile motion), steering behaviors for movement, physical attribute caps with fatigue curves mirroring real glycogen depletion
- **Agent AI:** Utility AI architecture — each tick, every agent evaluates ~7 actions (pass, dribble, shoot, hold/shield, move to position, press, make run) and selects the highest-scoring one. Personality weights flow through every score calculation.
- **Personality vector:** Floats including directness, risk_appetite, composure, creativity, work_rate, aggression, anticipation, flair. These are who the player IS, separate from what they CAN do (physical/technical attributes).
- **Scoring example:** `score = success_probability + forward_progress × directness − (1 − success_probability) × (1 − risk_appetite) − pressure × (1 − composure)`
- **Emergent archetypes:** A "maverick" and a "metronome" are not different agent classes — they're different points in parameter space. Archetypes fall out of the personality vector naturally.
- **Tactical diversity:** No single tactic should dominate. A compact low block genuinely neutralises tiki-taka by reducing space. Direct play genuinely bypasses a high press.

The match engine is the foundation — everything else (management screens, seasons, training) layers on top of a proven engine.

**Current state:** v1.0 engine + v1.1 data layer + v1.2 player development shipped. 28,270 lines TypeScript across 12 completed phases. Express + SQLite backend deployed on VPS. Full playable season loop with persistent save/load, realistic names, 25-man squads, per-player stats, pixel art portraits, and training drill scheduling.

**Known issues:**
- Player oscillation/jitter in utility AI (action scores flip each tick) — present since Phase 2, cosmetic but noticeable
- Phase 2 (Tactical Layer) and Phase 4 (Development Systems) from v1.0 are incomplete/deferred
- Training gains display rounding — single-session gains (~0.002) round to 0; visible after 2-3 training blocks
- 5 of 10 nationality palettes unused — teamGen only generates GB/ES/FR/DE/BR players

## Constraints

- **Tech stack**: TypeScript + HTML5 Canvas (client) + Express + SQLite (server), browser-based
- **Rendering**: 2D top-down, no 3D — ball height conveyed via sprite scaling and shadow offset
- **Performance**: 22 agents evaluating utility functions every tick must run smoothly in browser (target 30+ ticks/sec simulation, 60fps render)
- **Simulation architecture**: Separate simulation from rendering from day one — engine runs headlessly, Canvas is a visualizer
- **Deployment**: Single VPS with systemd + nginx reverse proxy
- **Solo developer**: Personal project, one person building

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + Canvas over Godot | Browser-based distribution, zero-install, 22 agents feasible in JS at 30 ticks/sec | ✓ Good — 30+ ticks/sec achieved, canvas rendering smooth |
| Utility AI over behavior trees | Every player runs identical code with personality weights — cleaner, more emergent, data-driven tuning | ⚠️ Revisit — works well but causes oscillation/jitter |
| Separate simulation from rendering | Enables headless match simulation, future AI training runs, engine replacement flexibility | ✓ Good — enabled quick-sim for AI matches |
| Single league, no transfers for v1 | Focus on engine quality before management complexity | ✓ Good — engine proven before management layers |
| Pixel art procedural portraits | Can generate from trait combinations, fits the aesthetic, no external API dependency | ✓ Good — 20x24 grid scaled 6x5, deterministic from player ID |
| Drag formation over preset templates | More expressive tactical control, aligns with "tactics as real mechanical levers" philosophy | ✓ Good — natural interaction model |
| SQLite + Express over Supabase/PocketBase | Simple single-file DB, deploy on existing VPS, no external services | ✓ Good — zero external dependencies, simple deployment |
| randomuser.me for player names | Free, no API key, nationality-based, well-established | ✓ Good — realistic names with graceful fallback |
| 25-man squads over 16 | Matches PL rules, enables rotation/depth decisions | ✓ Good — adds squad management depth |
| Cookie sessions over JWT | Same-origin single-player game, no token management needed | ✓ Good — simple, works well |
| bcryptjs (pure JS) over native bcrypt | Cross-platform builds without native addon compilation | ✓ Good — no build tool requirements on VPS |
| MAP_TAG sentinel for Map serialization | __MAP__ key with entries array survives JSON round-trip | ✓ Good — solved #1 data persistence risk |
| work_rate as training personality proxy | Reuse existing personality trait instead of adding new field | ✓ Good — formula 0.6 + work_rate * 0.8, range [0.6, 1.4] |
| BASE_DELTA = 0.004 for training gains | Tuned via headless 5-season sim (570 sessions), weak-tier stays below 0.95 | ✓ Good — economy verified, uncapped growth with natural decay |
| Squad-wide drills, not per-player | Simpler UX, per-player deferred to future milestone | ✓ Good — sufficient depth for v1.2 |
| 3 training days per matchday | Matches ~3 days between PL fixtures, locked to economy tuning | ✓ Good — changing requires re-tuning BASE_DELTA |

---
*Last updated: 2026-03-07 after v1.3 milestone start*

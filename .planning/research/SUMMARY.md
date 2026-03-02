# Project Research Summary

**Project:** Fergie Time — Browser-Based Emergent Football Simulation
**Domain:** Browser game — football management/simulation with autonomous AI agents
**Researched:** 2026-03-02
**Confidence:** MEDIUM (training data only; no live web verification)

## Executive Summary

Fergie Time is a browser-based football management game whose core differentiator is genuine emergent match behavior — goals arise from autonomous agent decisions, not scripted event tables. Research confirms this is technically achievable in a browser with TypeScript and HTML5 Canvas, but the implementation order is unforgiving: the match engine must be proven functional before any management layer has value. Experts in this domain (Football Manager's 2D engine, RoboCup research, game AI literature) are unanimous that the engine-first, management-second build order is correct, and every game in the genre that inverted this order shipped a broken simulation with polished menus.

The recommended stack is intentionally minimal: Vite + TypeScript for tooling, raw HTML5 Canvas 2D for rendering, custom physics and steering behaviors (no library), custom utility AI with a consideration architecture, and Preact for management UI. The key insight across every category is the same — libraries designed for general problems (Phaser, Matter.js, ECS frameworks) fight this specific simulation's requirements. At 23 total entities (22 players + ball), there is no scale justification for framework overhead. The value of the project lives in the agent behavior and personality vector system, not in any technology choice.

The top risk is not technical failure but calibration failure: utility AI systems that are logically correct in isolation produce degenerate match behavior in context — the entire team passing sideways forever, or all 22 players clustering around the ball. These pathologies are invisible to unit tests and only surface when watching a full match. Prevention requires building observability tooling (score range auditing, per-agent decision logging, statistical match invariant tests) alongside the simulation, not as an afterthought. The architecture must enforce strict simulation/renderer separation from the first line of code — retrofit is painful and blocks headless simulation.

---

## Key Findings

### Recommended Stack

The stack is radically dependency-light by design. Custom implementations outperform libraries in every category because the domain is narrow and specific. TypeScript 5.x, Vite 5.x, and Vitest form the tooling baseline. The simulation layer is entirely custom: Craig Reynolds steering behaviors (~40 lines per behavior), custom utility AI (~200 lines of scoring functions), and custom 2D physics for the ball (Newtonian projectile with X/Y/Z). Preact + Preact Signals handles management screen UI at 3KB vs React's 45KB.

**Core technologies:**
- **TypeScript 5.x + Vite 5.x**: Primary language and build tooling — fastest DX for browser TS, native ESM, required by project constraints
- **HTML5 Canvas 2D API**: Match rendering — sufficient for 22 sprites + ball at 60fps; PixiJS (WebGL) is the known escape hatch if this proves wrong
- **Custom utility AI**: Per-agent action scoring — personality vectors thread through every score calculation; no library adapts cleanly to this
- **Custom steering behaviors (Reynolds model)**: Player movement — `seek`, `arrive`, `pursuit`, `separation`, `wander` are all 40-line implementations from canonical 1999 paper
- **Custom ball physics (2.5D)**: Ball trajectory with Z-axis — libraries like Matter.js and Rapier solve rigid-body constraints that don't exist in this simulation
- **Preact + Preact Signals**: Management UI — fine-grained reactivity matches game state update patterns; 15x smaller than React
- **Vitest + @vitest/coverage-v8**: Testing — critical for headless simulation testing and physics determinism
- **seedrandom 3.x**: Seeded PRNG — reproducible match replays and procedural portrait generation
- **zod 3.x**: Runtime validation — safe parsing of season save/load data

**Do not use:** Phaser 3 (owns the game loop, fights sim/render separation), any ECS library (23 entities need zero cache optimization), Matter.js/Rapier for player movement (steering agents resist rigid-body constraints), React (15x bundle size for same capability).

### Expected Features

The feature dependency chain is strict: physics must work before steering behaviors are useful, steering behaviors must work before utility AI has meaning, utility AI must work before tactics have effect, and tactics must have effect before the management layer has value. Every layer below must be proven before the layer above is built.

**Must have (table stakes — Phase 1-3):**
- Emergent match play with visible events (goals, shots, possession changes) — the core product promise
- Tactical formations that mechanically differentiate team behavior (4-3-3 vs 4-5-1 must produce measurably different spatial footprints)
- Squad management with attributes, fatigue, and match-day selection
- League structure: fixture list, table, season boundary with champion
- Player attributes (physical + technical) that create genuine quality differentials

**Should have (differentiators — Phase 1-4):**
- Personality vectors creating emergent archetypes (maverick vs. metronome from the same code)
- 2.5D physics with Z-axis aerial play (crosses, headers emerge naturally)
- Fatigue-driven behavioral drift (tired players become cautious mid-match)
- Observable agent decision-making (debug overlay for why that pass happened)
- Training drills that shift personality vectors — genuinely novel vs. any commercial product
- Procedural player name and pixel-art portrait generation from trait data

**Defer to v2+:**
- Transfer market (separate economic simulation problem)
- Multiple divisions and promotion/relegation (scheduling complexity multiplier)
- Injury system (complex subsystem; fatigue covers performance degradation)
- Scouting/fog-of-war attributes
- Morale subsystem (composure covers much of this)
- Contract negotiations, press conferences, board objectives
- Match replay from different camera angles (valuable but post-engine-proof)

**Explicitly not building (ever, or indefinitely):**
- Scripted match events or event tables — directly contradicts the core value proposition
- Multiplayer, mobile UI, 3D rendering

### Architecture Approach

The system follows strict layered architecture with unidirectional data flow: Simulation Engine writes immutable snapshots, Canvas Renderer reads them, Manager Interface issues commands. No layer reaches upward. The critical non-negotiable is the fixed-timestep accumulator pattern (Gaffer on Games canonical reference): simulation runs at 30Hz fixed ticks, rendering runs at 60fps via `requestAnimationFrame` with state interpolation using alpha between the two most recent snapshots. This enables deterministic simulation, headless match running, and visual smoothness independent of frame rate.

**Major components:**
1. **Game Loop Coordinator** — fixed-timestep accumulator, owns the clock, dispatches `simulate(dt)` and `render(alpha)` calls; holds no game state
2. **Simulation Engine (pure TS, no DOM)** — contains Physics World, Agent System (utility AI), Tactical System (context provider), and Match State; produces `SimSnapshot` per tick
3. **Canvas Renderer** — reads only `SimSnapshot` objects, interpolates between prev/curr, draws to canvas; contains zero game logic
4. **Manager Interface (Preact)** — squad screen, tactics board, training, league table; issues typed commands to simulation via command queue
5. **Persistent State (localStorage/IndexedDB)** — club, squad, season progress; mutated only by season events, training, and user actions

The agent architecture inside the engine separates concerns cleanly: Tactical System runs first each tick and provides context (formation anchors, phase of play, role instructions) that the Agent System reads. Agents produce `ActionIntent` objects, not state mutations. Physics integrates all intents simultaneously to produce the next snapshot. This prevents order-dependent agent evaluation.

### Critical Pitfalls

1. **Utility score degeneracy (one action always wins)** — a single action dominates across all game states because formulas are calibrated in isolation but compete on different numerical ranges. Prevention: build a score range audit tool before the first playable match; no action should dominate > 40% of all ticks across all agents. Detection: shot counts < 2 or > 30 per match; agents all doing the same animation.

2. **Ball clustering (all 22 players swarm the ball)** — formation and roles become visually meaningless because ball-proximity utility scores outweigh positional anchor pull. Prevention: treat formation anchor distance as a multiplicative penalty (not additive) on ball-approaching actions; implement role-gated action availability masks so wingers cannot "press opposition midfielder" from their own half. Detection: average distance between teammates collapses to < 15m; changing formation produces no visible spatial difference.

3. **Emergent behavior in a debugging black box** — when something weird happens (striker stands still for 20 seconds), there is no structured way to understand why without observability tooling. Prevention: build per-agent decision logging (ring buffer of top 3 scored actions per tick) alongside the agent system; implement a click-to-inspect "why did X do that?" tool. This is Phase 1 work, not a later addition.

4. **Physics that feels perceptually wrong** — ball tunneling at high velocity (ball passes through players), Z-axis collisions at wrong heights (headers when ball is at ground level), and untuned friction curves (ball slides forever). Prevention: use continuous collision detection (sweep ball trajectory per tick); authoritative shadow position for aerial collision checks; validate by eye test (diagonal pass across 2/3 pitch should slow and stop naturally in ~3 seconds) before attaching any AI.

5. **Tactical instructions with no mechanical effect** — formation changes and role instructions exist as data but produce no measurable spatial difference in match output. Prevention: define a quantitative spatial test for every tactical instruction before building the UI for it; run 100-match head-to-head (high press 4-3-3 vs. low block 4-5-1) and assert statistically distinguishable outcomes. This must be validated in Phase 2 before the management layer is built.

---

## Implications for Roadmap

All four research files converge on the same phase structure. The architecture's build order (ARCHITECTURE.md section 14-step dependency sequence) maps directly onto the feature dependency chain from FEATURES.md, and the pitfalls concentrate in specific phases. This is not arbitrary — it reflects genuine dependency structure.

### Phase 1: Engine Core

**Rationale:** The entire product's value lives in the simulation. No management screen, no season structure, no tactical UI has any meaning until a match produces genuine emergent behavior. Research is unanimous that this is the highest-risk phase and must come first. The match engine is also the most technically uncertain component.

**Delivers:** A single watchable match with emergent goals, realistic player movement, and observable possession changes. Success gate: "I watched a full match and it felt like football."

**Addresses (from FEATURES.md):**
- 2.5D physics (ball trajectory with Z-axis)
- Steering behavior movement for all 22 players
- Utility AI with 7 core actions
- Personality vectors influencing every score
- Fatigue + personality erosion within a match
- Canvas rendering (top-down 2D view)
- Basic contact resolution (tackles, challenges)
- Goal detection and scoreline display
- Match statistics (shots, possession)
- Halftime/full-time state machine

**Must avoid (from PITFALLS.md):**
- Utility score degeneracy: build score range audit tool in this phase
- Ball clustering: implement anchor-distance multiplicative penalty in this phase
- Observability black box: build per-agent decision logging in this phase
- Physics tunneling: use CCD for ball-player interactions
- Variable timestep: implement fixed-timestep accumulator from day one
- GC pressure: pre-allocate score arrays at startup; profile at full 22-agent count as exit criterion

**Stack required:** TypeScript + Vite, Canvas 2D, custom physics, custom steering behaviors, custom utility AI, Vitest, seedrandom

**Research flag:** This phase likely needs a focused research pass on utility AI consideration calibration — specifically the response curves that normalize score ranges to comparable scales. The pitfall literature is clear but the specific calibration for football simulation is not well-documented.

---

### Phase 2: Tactical Layer

**Rationale:** Once the engine produces believable matches, the tactical system transforms it from a passive simulation into a game. Formation anchors are already partially present in Phase 1 (agents need positional targets), but this phase makes them user-controllable and validates that they produce measurable spatial differences.

**Delivers:** Formation drag-and-drop that visibly changes team shape; role assignments that change individual agent behavior; halftime adjustments and substitutions. Success gate: "Changing formation visibly changes how the team plays."

**Addresses (from FEATURES.md):**
- Formation anchors as positional pull targets
- Drag-and-drop tactics board (project's distinctive UI)
- Role assignments modifying agent behavior
- Per-player personality-aware instructions
- Halftime tactical adjustments
- Substitutions (bench management + in-game swap logic)
- Tactical counter-system (low block actually reduces space for tiki-taka)

**Must avoid (from PITFALLS.md):**
- Tactical instructions with no mechanical effect: run quantitative spatial fingerprint tests for every tactic before building UI
- Contact resolution asymmetries: include anchor-distance penalty on challenge utility; foul probability as cost term
- Pitfall 2 compounds here if not addressed in Phase 1

**Stack addition:** Preact for tactics board UI; Preact Signals for reactive formation state

**Research flag:** The drag-and-drop formation board interaction model is well-specified in the project brief. Standard patterns apply. Skip dedicated research phase.

---

### Phase 3: Management Shell

**Rationale:** With a proven engine and meaningful tactics, the management layer provides context and continuity. Squad selection, fixture lists, and league tables give the match engine narrative stakes.

**Delivers:** A full playable season with squad management, fixtures, league table, and a champion declared at season end. Success gate: "I can play a full season and care who wins the league."

**Addresses (from FEATURES.md):**
- Squad screen with attributes, personality, fitness display
- Procedural player name generation (bundled nationality name datasets)
- Match-day squad selection (starting 11 + bench)
- Fixture list (round-robin schedule generation)
- League table (points, GD, position)
- AI manager heuristics for 19 opposition teams (simple heuristics only, not FM-level)
- Season boundary (champion declared, squad carry-forward)

**Must avoid (from PITFALLS.md):**
- League singleton that precludes expansion: wrap in a `League` class from the start, even with one instance
- Personality vector convergence: design personality anchor bounds before implementing training deltas (even though training is Phase 4)
- AI managers over-engineered: stub with simple heuristics; this is not a feature, it's infrastructure

**Stack addition:** localStorage/IndexedDB for persistent state; zod for save/load validation

**Research flag:** AI manager heuristic design is under-specified and needs a focused research pass. How do 19 AI managers make formation and substitution decisions without becoming an FM-scale problem? This is a scoping and design question, not a technology question.

---

### Phase 4: Development Systems

**Rationale:** Once seasons have continuity, the player development layer adds the long-term dimension that distinguishes a management game from a match simulator. Training, youth graduates, and procedural portraits are the features that make seasons 2 and 3 meaningfully different from season 1.

**Delivers:** A squad with distinct character after multiple seasons of development; youth graduates with fresh procedural personalities; pixel-art portraits tied to player trait data. Success gate: "My squad has a distinct character after 3 seasons."

**Addresses (from FEATURES.md):**
- Training drills that shift personality vectors and attributes
- Observable training sessions (mini-sims that show how training shapes behavior)
- Youth graduates with procedurally generated personalities (wild variance, not regression to mean)
- Retirements
- Pixel-art procedural portrait generation from personality/trait data
- Observable personality drift over a career
- Season-to-season continuity

**Must avoid (from PITFALLS.md):**
- Personality vector convergence over seasons: enforce personality anchors (±0.3 of base personality); fatigue erosion must be temporary, not cumulative
- Portrait generation accumulating technical debt: model portraits as a trait-to-layer mapping system, not hardcoded pixel coordinates; generate 100 and audit before squad screen integration

**Research flag:** Pixel-art procedural portrait generation has no standard library or well-documented approach. This phase needs dedicated research before implementation. The layer-based trait mapping system is the right architectural concept but the specifics of palette selection, layer compositing, and anti-collision for visual features need research.

---

### Phase Ordering Rationale

- **Physics before steering before AI before tactics:** Each layer's outputs are inputs to the next. There is no shortcut.
- **Engine before management:** The management layer has zero value if the match engine is broken. Every project that has tried to build both in parallel has shipped broken matches with polished menus.
- **Tactics before league:** Meaningful tactical decisions require a working tactical system. A league structure around a match that plays identically regardless of formation is a worse product than a single match that responds to tactical input.
- **Development systems last:** Player development requires multiple seasons to observe, which requires a working league structure, which requires working tactics, which requires a working engine.
- **Observability in Phase 1:** Debug tooling is not a Phase 4 "nice to have." Emergent behavior is only debuggable with purpose-built observability, and attempting to tune utility AI without score range visualization is known to produce weeks of trial-and-error.

### Research Flags

**Phases likely needing `/gsd:research-phase` during planning:**
- **Phase 1 (utility AI calibration):** Response curve design for consideration normalization is poorly documented for football simulations specifically. Requires focused research on input curve design patterns.
- **Phase 3 (AI manager heuristics):** Under-specified in all reference material. Needs scoping research to bound the problem and find minimal viable heuristic patterns.
- **Phase 4 (procedural portraits):** No standard approach. Canvas-based procedural pixel art generation from data is a domain-specific problem needing dedicated research.

**Phases with standard patterns (skip research):**
- **Phase 1 (game loop, physics, renderer):** Fixed-timestep accumulator, CCD, Canvas 2D rendering are canonical with high-quality documentation.
- **Phase 2 (tactics board UI):** Drag-and-drop formation is a standard interaction model; Preact + Signals handles it cleanly.
- **Phase 3 (season structure, league table):** Round-robin scheduling and table calculation are trivial algorithmic problems.
- **Phase 4 (training delta system):** Personality anchors and bounded attribute deltas are straightforward once personality vector structure is established.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core recommendations (custom physics, Canvas 2D, Preact, Vite) are robust from first principles and well-established patterns. Web verification unavailable but architectural reasoning is sound. |
| Features | MEDIUM | Table-stakes features are clear from FM/CM genre precedent. Differentiator features are well-specified in the project brief. Anti-feature list is opinionated but well-justified. |
| Architecture | HIGH | Fixed-timestep accumulator, sim/render separation, utility AI consideration architecture, and immutable snapshots are canonical patterns with extensive documentation. |
| Pitfalls | HIGH | Utility score degeneracy, ball clustering, and physics tunneling are well-documented in game AI literature and RoboCup research. Calibration thresholds are estimates requiring validation against actual match output. |

**Overall confidence:** MEDIUM-HIGH

The architectural recommendations are high confidence. The calibration specifics (what goal-per-match distribution is "correct," what score range percentage triggers degeneracy warnings) are informed estimates. They are appropriate starting points but require empirical tuning against actual match output.

### Gaps to Address

- **Utility AI calibration thresholds:** The specific numerical targets (goals per match: mean 2.5, action domination cap: 40%) are literature-informed estimates, not empirically derived for this specific simulation. Treat as initial targets and adjust based on first-playable-match feedback. Add score range logging from day one to generate actual data.
- **Preact vs. vanilla signals for management UI:** The recommendation is Preact + Preact Signals, but the project is early enough that deferring this choice until management screens are actually being built is valid. Vanilla TS reactive stores are ~30 lines and remove a dependency. Revisit when Phase 3 begins.
- **Web Worker timing for simulation:** Whether the simulation needs to move to a Web Worker depends on main-thread performance at 22 agents. Profile in Phase 1 before deciding. The architecture supports it (pure TS, no DOM), but adding worker complexity may not be necessary.
- **Pixel-art portrait generation approach:** No validated approach from research. Requires dedicated investigation before Phase 4 begins.
- **AI manager heuristic complexity bounds:** Research does not establish how simple "simple heuristics" can be while still making league results feel realistic. This is a Phase 3 planning question.

---

## Sources

### Primary (HIGH confidence)
- `.planning/PROJECT.md` — project design brief, match engine specification, personality vector design, architectural constraints
- Craig Reynolds, "Steering Behaviors for Autonomous Characters" (1999) — canonical steering behavior implementations
- Glenn Fiedler, "Fix Your Timestep!" (2004/Gaffer on Games) — fixed-timestep accumulator architecture
- Dave Mark / Mike Lewis, GDC Utility AI presentations (2010+) — consideration architecture, score degeneracy patterns

### Secondary (MEDIUM confidence)
- Football Manager series (Sports Interactive, 2003-2025) — 2D match engine concepts, statistics model, feature precedent
- Championship Manager series (Eidos, 1992-2007) — attribute vocabulary, squad building patterns
- RoboCup research literature — ball clustering pathology documentation in multi-agent football simulations
- Erin Catto, Box2D documentation — continuous collision detection and physics tunneling
- V8 allocation documentation / Chrome DevTools team — browser JS GC pressure patterns

### Tertiary (LOW confidence / training data inference)
- Hattrick, New Star Manager, Sociable Soccer — browser delivery patterns, season structure precedent
- bitecs, miniplex, yuka ecosystem knowledge — ECS and game AI library evaluation (version numbers should be verified on npm before use)

---
*Research completed: 2026-03-02*
*Ready for roadmap: yes*

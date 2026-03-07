# Project Research Summary

**Project:** Fergie Time v1.2 Player Development
**Domain:** Browser-based football management game — pixel art portrait generation, drill scheduling, training ground sandbox
**Researched:** 2026-03-07
**Confidence:** HIGH

## Executive Summary

Fergie Time v1.2 adds three interconnected features to an established TypeScript + Canvas + SQLite browser game: procedurally generated pixel art player portraits, a squad-level drill scheduling system, and an observation-only training ground sandbox. The game already has a solid foundation — a working match engine, season loop, transfer market, and persistence layer — so v1.2 is purely additive. No existing code requires architectural change, and only two new npm packages are needed (`@dicebear/core`, `@dicebear/pixel-art`). The backend requires zero changes; all new state serializes into the existing game_state JSON blob.

The recommended approach is to build the three features in strict dependency order: portraits first (self-contained, no dependencies, immediate visual impact), then the training logic core as pure functions (testable without UI), then the training screen UI on top of proven logic, and finally the sandbox (self-contained mode switch on the existing engine). Each step is independently testable. The architecture is explicit: portraits live in a UI layer and are invisible to the simulation engine; training mutations happen at season-boundary level and feed the engine as updated PlayerState at kickoff; the sandbox is a single boolean flag in main.ts that redirects the post-match callback.

The key risks are economy balance (training gains must be modelled across a full season before any numbers are written — a young player should gain ~0.00056 per attribute per session at peak development, not 0.003), sandbox data isolation (deep-clone player rosters before passing to the sandbox engine or real season state mutates silently), and portrait determinism (use the existing `createRng(playerId)` factory — never `Math.random()`). All three risks are preventable by following the patterns identified in research. Recovery after late discovery is expensive in all three cases.

## Key Findings

### Recommended Stack

The existing stack is complete and validated. Only two new client-side dependencies are required. DiceBear (`@dicebear/core` v9.4.0, `@dicebear/pixel-art` v9.2.4) handles the full portrait pipeline: seed string → configurable pixel art SVG with 8 skin tones, 11 hair colours, configurable eyes, mouth, beard, and clothing. SVG is rendered to Canvas via the native browser `Blob URL + new Image() + drawImage()` pattern — no additional libraries needed. All other features (drill scheduling, sandbox, personality nudges) are implemented in pure TypeScript using existing infrastructure.

**Core technologies:**
- `@dicebear/core` ^9.4.0 — avatar engine (seed → SVG); deterministic, TypeScript-native, ESM, Vite 7 compatible
- `@dicebear/pixel-art` ^9.2.4 — pixel art avatar style; 8 skin tones, 11 hair colours, fully configurable
- `seedrandom` ^3.0.5 (existing) — via `createRng(seed)` factory in `src/simulation/math/random.ts`; mandatory for all new procedural generation; never use `Math.random()` in portrait or training code
- `better-sqlite3` ^12.6.2 (existing) — all new state serializes into the existing `game_state` JSON blob; no schema changes

**Explicitly not needed:** `@dicebear/converter` (SVG-to-PNG — drawImage handles SVG natively), `sharp` (server-side image processing — portraits are client-only), `canvas` npm (Node Canvas polyfill — portraits never generate server-side), `date-fns`/`dayjs` (game calendar is an integer index, not real dates), `rxjs` (existing event array on SimSnapshot is sufficient).

See: `.planning/research/STACK.md`

### Expected Features

The milestone has three pillars, each with clear MVP scope. Portrait generation and drill scheduling are independent and can be built in any order relative to each other. The sandbox depends on engine reachability from a new screen but does not depend on portraits or training being complete.

**Must have (table stakes) — v1.2 core:**
- Pixel art portrait on squad screen and player profile — players feel anonymous without visual identity
- Portrait deterministic across sessions — a different face on each load is a broken experience
- Nationality-mapped skin/hair palette — visual diversity tied to existing player data
- Training calendar integrated into season loop (~3 drill days per match week)
- ~6-8 squad-wide drill types with clear attribute-to-gain mapping on each drill card
- Stat improvement delta shown on player profile after training block
- `player.potential` field on all players (generated at creation, range 40-99) — required for growth formula
- Training ground sandbox accessible from hub; runs real engine; observation-only (no season writes)

**Should have (v1.2.x — add once core is stable):**
- Personality vector nudges from drill type — small bounded float shifts per session; ties training to the game's core architecture
- Drill intensity toggle (light/standard/hard) with injury risk on hard — tactical tension
- Training history log per player — narrative of development
- Sandbox scenario presets (3-5 named configs: "High Press vs Low Block", "Counter-attack from deep", etc.)

**Defer (v2+):**
- Per-player drill assignment — explicitly deferred in PROJECT.md; UI and logic burden without proven value at squad-level scale
- Youth graduate visual cohort markers
- AI-generated portraits — explicitly excluded in PROJECT.md
- Sandbox recording/replay

See: `.planning/research/FEATURES.md`

### Architecture Approach

All three v1.2 features integrate as purely additive layers over the existing architecture. The simulation engine, game loop, renderer, and backend are unchanged. Four new files are created (`portraitGen.ts`, `training.ts`, `trainingScreen.ts`, `sandboxScreen.ts`) and six existing files receive small targeted edits (~15-60 lines each). `SeasonState` gains one new field (`trainingState: TrainingState`). `PlayerState` gains one optional field (`portraitSeed?: string`). The backend gains no new endpoints and no schema changes.

**Major components:**
1. `src/ui/portrait/portraitGen.ts` — deterministic pixel art generator; session cache via `Map<playerId, ImageBitmap>`; reads only stable player fields (id, nationality, shirtNumber); never reads attributes or personality
2. `src/season/training.ts` — pure functions: `applyDrill()`, `nudgePersonality()`, `resetTrainingWeek()`; no I/O; fully unit-testable without UI; produces new PlayerState[] via spread, never mutates in-place
3. `src/ui/screens/trainingScreen.ts` — drill picker UI; day counter; wires training.ts output back to SeasonState via main.ts callback
4. `src/ui/screens/sandboxScreen.ts` — team/formation config UI; triggers existing engine with `isSandboxMode = true`; no season state writes on FULL_TIME; displays explicit "no changes made" confirmation on exit
5. `main.ts` (modified) — adds `isSandboxMode` boolean, sandbox FULL_TIME handler, new screen routing; ~60 additional lines total

**Key patterns to follow:**
- PlayerState rebuilt via spread on training gain application (never mutated in-place) — consistent with existing codebase pattern
- Portrait seed derived from stable fields only; portrait generation never reads live attributes or personality
- Sandbox is a post-match callback switch, not a parallel engine or renderer
- All new state is plain JSON with no Maps — serializes trivially into existing blob without serialize.ts changes
- Training days are gated by matchdays (up to 3 clicks between matchdays), not a separate calendar system

See: `.planning/research/ARCHITECTURE.md`

### Critical Pitfalls

1. **Non-deterministic portrait generation** — using `Math.random()` instead of `createRng(player.id)` produces different faces across sessions; use the existing `createRng()` factory from `src/simulation/math/random.ts`; use ordered arrays (not `Object.keys()`) for feature option tables; verify with `canvas.toDataURL()` comparison across two sessions before Phase 2 begins.

2. **Training economy collapse from over-tuned gain rates** — model the full season before writing any constants: 38 matchdays × 3 training days = ~90 sessions/season; a player peaking over 3 seasons should gain ~0.00056 per attribute per session at maximum; cap per-session gain at 0.003 even for prodigy-tier talent; run a headless 5-season simulation to verify no attribute exceeds 0.95 before building any training UI.

3. **Sandbox roster aliasing (stat leak into real season)** — passing live `SeasonState` players by reference to the sandbox engine allows fatigue and stat mutations to silently modify the real squad; always deep-clone via `JSON.parse(JSON.stringify(squad))` before constructing the sandbox MatchConfig; TypeScript `readonly` is compile-time only and does not prevent runtime mutation.

4. **Personality vector drift out of bounds** — small per-session nudges accumulate undetected across seasons; a composure of 1.03 breaks utility AI calculations in ways that look like simulation bugs, not training bugs; clamp every trait to `[0, 1]` at point of application using the existing `clamp()` utility from `teamGen.ts`; cap total drift per trait per season at 0.10.

5. **Concurrent simulation loops in sandbox mode** — if sandbox launches its own `requestAnimationFrame` loop alongside an active match loop, match framerate degrades; sandbox is a mode that replaces match mode, not a parallel screen; enforce mutual exclusion via the `isSandboxMode` flag; the sandbox canvas replaces (not supplements) the main canvas in the DOM.

See: `.planning/research/PITFALLS.md`

## Implications for Roadmap

The build order is determined by dependency analysis. Portraits have no dependencies on other v1.2 work. Training logic must precede training UI. The sandbox depends only on engine reachability from a new screen — it does not depend on portraits or training being complete, but benefits from both being stable and should come last so the known oscillation issue (which the sandbox makes highly visible) can be addressed in context.

### Phase 1: Portrait Generator

**Rationale:** Self-contained with no dependencies on other v1.2 work. Delivers immediate visible value. Establishes the determinism and caching patterns that subsequent phases follow. Architectural decisions made here (optional `portraitSeed` field, session-only cache, no attribute coupling) prevent save-format migrations in later phases.

**Delivers:** Pixel art portraits on squad screen and player profile; deterministic across sessions; nationality-mapped skin/hair palettes; session-level ImageBitmap cache; DiceBear integration via `@dicebear/core` + `@dicebear/pixel-art`.

**Addresses:** All portrait table-stakes features from FEATURES.md (display, persistence, nationality mapping).

**Avoids:** Non-deterministic portrait pitfall (verify with `toDataURL()` round-trip test before closing phase); portrait-stored-in-DB anti-pattern (regenerate from seed at render time, never persist pixel data).

**Research flag:** Standard patterns — DiceBear documentation is thorough and SVG-to-Canvas rendering is well-documented on MDN. No per-phase research needed.

### Phase 2: Training Logic Core (no UI)

**Rationale:** Pure functions with no UI — easy to unit-test and balance before building any screens. The balance constants (gain rate, age decay, potential ceiling, decline curve) must be verified against a headless multi-season simulation before any UI provides player feedback. Getting the economy wrong here is the highest-impact mistake in the milestone. Discovering balance issues after the training screen is built and integrated means reworking the UI's feedback values too.

**Delivers:** `training.ts` with `DrillType` definitions, `applyDrill()`, `nudgePersonality()`, `resetTrainingWeek()`; `player.potential` field on all players (with fallback for existing saves); `trainingState` added to `SeasonState`; `finalizeMatchday()` extended to reset training week; `createSeason()` extended to initialize `trainingState`; headless 5-season balance validation confirming no attribute exceeds ~0.95 for a player starting below 0.70.

**Addresses:** Drill taxonomy design; player potential field requirement; season loop integration; age regression (decline) modelled alongside gain in the same balance pass.

**Avoids:** Training economy collapse (Pitfall 3) — balance verified before UI; age regression absent (Pitfall 4) — decline designed in the same pass; personality drift (Pitfall 7) — clamping enforced at point of nudge application.

**Research flag:** Standard patterns for pure function design and game balance modelling. The gain formula constants need a project-specific headless validation test — this is calibration work, not research.

### Phase 3: Training Screen UI

**Rationale:** Depends on Phase 2 training logic being proven correct and balanced. Building UI before the underlying model is calibrated leads to shipping wrong numbers or rebuilding the UI when numbers change. Phase 3 is pure wiring of proved logic to the interface.

**Delivers:** `trainingScreen.ts` with drill picker (each drill card shows affected attributes and approximate gain), day counter (X of 3 training days used), confirmation flow; hub navigation showing training day count and "Training" button between matchdays; stat delta shown on player profile post-training block.

**Addresses:** Training screen table-stakes feature; stat improvement visibility requirement; hub integration; UX requirement that drill cards list affected attributes.

**Avoids:** Drill-choice UI with no attribute visibility (UX pitfall — players assign wrong drills when attribute impact is invisible).

**Research flag:** Standard UI patterns following the established screen architecture in the codebase (same pattern as `squadScreen.ts`, `playerProfileScreen.ts`, etc.). No per-phase research needed.

### Phase 4: Training Ground Sandbox

**Rationale:** Self-contained relative to training and portraits. Comes last because: (a) portraits and training being stable means the sandbox can display portraits in team views without risk, (b) the known oscillation issue (TUNING.hysteresisBonus = 0.36) becomes highly visible in the sandbox since managers watch short clips where the first ticks dominate perception, and addressing it here with a 30-tick warmup is the right fix point, (c) sandbox isolation invariants are cleanest to verify when the other features are complete and not changing.

**Delivers:** `sandboxScreen.ts` with team/formation picker; `isSandboxMode` flag in main.ts; sandbox FULL_TIME handler (show results overlay, no season state writes); 30-tick headless warmup before visible simulation starts; explicit "Sandbox complete — no changes to your squad" toast on return to hub.

**Addresses:** Sandbox table-stakes features (accessible from hub, runs real engine, observation-only); sandbox scenario preset differentiator (3-5 named presets) if time allows.

**Avoids:** Concurrent simulation loops (Pitfall 5) — mutual exclusion enforced via mode flag; sandbox stat leak (Pitfall 6) — deep-clone roster before constructing sandbox MatchConfig; oscillation visible in sandbox (Pitfall 8) — 30-tick warmup before first rendered frame.

**Research flag:** Oscillation fix (`TUNING.hysteresisBonus` increase from 0.36 to 0.45-0.50) should be tested in this phase against existing headless agent tests. Not a blocker for sandbox delivery, but worth attempting since the sandbox makes the issue front-and-centre and the fix is low-risk (single constant in `tuning.ts`).

### Phase Ordering Rationale

- Portrait first because it has zero dependencies, delivers immediate visible polish, and its determinism invariant (verified early) is foundational for the entire codebase going forward.
- Training logic before training UI because balance must be verified headlessly; UI built on unproven numbers causes rework and ships incorrect player feedback.
- Training UI third because it is pure wiring on proved logic — straightforward and low risk after the model is stable.
- Sandbox last because it reuses 100% of the existing engine and renderer; its two concerns (mode isolation and data isolation) are cleanest to implement after the other features are stable.
- No phase requires architectural change to the simulation engine, game loop, renderer, or backend — all phases are additive.

### Research Flags

Phases with standard patterns (skip per-phase research):
- **Phase 1 (Portraits):** DiceBear documentation is comprehensive; SVG-to-Canvas rendering is MDN-documented; DiceBear v9 is current and TypeScript-native.
- **Phase 2 (Training Logic):** Pure function and game balance modelling are well-understood. The balance verification is a headless test, not a research question.
- **Phase 3 (Training UI):** Follows established screen patterns already in the codebase. No novel UI components needed.

Phases that may benefit from focused investigation:
- **Phase 4 (Sandbox):** Oscillation fix — if `hysteresisBonus` increase is attempted, run against existing agent tests before committing. All relevant variables are in `src/simulation/tuning.ts` and the existing test suite can validate the change. Low external research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | DiceBear packages confirmed from npm with version and compatibility verified; existing stack confirmed from package.json and source; all integration patterns code-validated against the codebase |
| Features | MEDIUM | Table stakes and anti-features are well-reasoned from PROJECT.md scope and codebase analysis; drill taxonomy design is sound but gain constants require in-game calibration; competitor analysis (FM, pixel art FM games) is partial |
| Architecture | HIGH | Based on direct source code analysis of all files that will be touched; integration points identified from actual type definitions and function signatures; no architectural guesswork |
| Pitfalls | HIGH | Derived from codebase-specific analysis (real code patterns, existing utility functions, known oscillation issue documented in PROJECT.md) combined with established browser game patterns |

**Overall confidence:** HIGH

### Gaps to Address

- **Drill gain constants need playtesting calibration:** The formula structure is architecturally correct; the numeric constants (base rate, age decay slope, potential multiplier) need iteration against a headless multi-season simulation. Phase 2 completion criterion: formula correct AND balance verified headlessly. A Node script running 5 seasons and printing attribute histograms is the right validation tool.

- **Player potential field migration for existing saves:** Saves created before v1.2 will not have `potential` on existing players. A fallback is needed (e.g., derive potential from current attribute average + age factor if field is absent). Address at the start of Phase 2 — makes it optional with a derivation fallback.

- **Nationality palette completeness:** The research provides a starter set of nationality-to-skin-tone mappings (~6 nationalities). The full game has more nationalities. The default fallback (mid-range palette) is safe for launch; extend the mapping incrementally in Phase 1 based on nationalities present in `teamGen.ts`.

- **Canvas renderer parametric (confirm before Phase 4):** Architecture research flags that if the existing renderer targets a hardcoded DOM element ID, the sandbox will need it parametric to mount on its own canvas. Confirm before starting Phase 4 by checking `src/renderer/canvas.ts` — likely a one-line change if needed.

## Sources

### Primary (HIGH confidence)
- `src/simulation/math/random.ts` — `createRng()` factory confirmed as canonical RNG factory
- `src/simulation/types.ts` — PlayerState, PlayerAttributes, PersonalityVector type definitions (readonly fields confirmed)
- `src/season/season.ts` — SeasonState shape, finalizeMatchday pattern
- `src/simulation/tuning.ts` — TUNING.hysteresisBonus = 0.36, noiseScale = 0.06
- `src/simulation/ai/agent.ts` — hysteresis implementation
- `src/season/teamGen.ts` — player generation, clamp() usage, nationality handling
- `src/season/quickSim.ts` — headless engine usage pattern (sandbox model)
- `package.json` — full existing dependency list confirmed
- `@dicebear/core` npm v9.4.0 — TypeScript-native, deterministic, browser + Node 18+ confirmed
- `@dicebear/pixel-art` npm v9.2.4 — 8 skin tones, 11 hair colours confirmed
- MDN `drawImage()` — SVG via Blob URL is a supported image source
- MDN `image-rendering: pixelated` — Canvas upscaling technique for pixel art

### Secondary (MEDIUM confidence)
- Football Manager 2024 training guide (fmscout.com) — drill categories, frequency patterns, intensity model
- paperdoll (fralonra) GitHub — layer/slot architecture for pixel art composition
- Runtime procedural character generation article (dev.to) — seed-based determinism, 64-bit seed space
- Football Manager player development stages by age (fm-base.co.uk) — age-progression reference for balance calibration
- Football Manager 11 reasons players won't develop (passion4fm.com) — game economy pitfall patterns

### Tertiary (LOW confidence)
- Pixel Manager Football (pixelmanagerfootball.com) — confirms paper doll approach for portrait variety; no implementation detail
- MFL player development whitepaper — potential-based growth with age factor design pattern reference

---
*Research completed: 2026-03-07*
*Ready for roadmap: yes*

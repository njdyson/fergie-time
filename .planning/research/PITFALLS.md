# Pitfalls Research

**Domain:** Adding pixel art portraits, drill scheduling, and training sandbox to an agent-based football management game
**Project:** Fergie Time v1.2 Player Development
**Researched:** 2026-03-07
**Confidence:** HIGH (codebase-specific analysis + established patterns from existing implementation)

---

## Critical Pitfalls

Mistakes that cause rewrites, broken saves, or performance regressions that require major refactoring.

---

### Pitfall 1: Non-Deterministic Portrait Generation — Same Player Gets Different Faces

**What goes wrong:**
The portrait generator draws from multiple sources of randomness (Math.random(), Date.now(), unordered object iteration) instead of a seeded PRNG derived from the player ID. The player sees a different face every time they open the squad screen. With 500 players across 20 teams, faces are inconsistent between sessions and after save/load. Portraits stored in SQLite as seeds become useless because they no longer reproduce the same image.

**Why it happens:**
`Math.random()` is the default in browser JS. Developers reach for it instinctively. The problem is silent — generation succeeds, a portrait is drawn, it looks plausible. The non-determinism only surfaces across sessions when the player notices their striker has changed ethnicity since the last match.

Portrait generators also often use arrays of layer options that are iterated with `Object.keys()` or property enumeration — these are not guaranteed insertion-order in all engines, meaning the same numeric seed produces different feature selections when the layer option arrays are reordered during development.

**How to avoid:**
- Use `createRng(playerId)` from the existing `src/simulation/math/random.ts` — this already wraps seedrandom and is proven deterministic.
- Seed formula: `createRng(player.id)`. The player ID is a stable `teamId-player-index` string. Never use `player.name` as the seed — names can change (name cache updates, randomuser.me returns different data).
- Never call `Math.random()` inside the portrait generator. Pass the seeded RNG as a parameter.
- Use ordered arrays, not object property enumeration, for feature option tables. Array index is stable; property enumeration order is not guaranteed to match source code order across engines.
- Round-trip test: generate portrait for player `team1-player-0`, save state, load state, generate again — pixel buffers must be identical.

**Warning signs:**
- Portrait looks different after browser refresh without a game-state change.
- "Why does my striker look different today?" as a player observation.
- Portrait generation function imports or calls anything from `Math.random` globally.
- Layer option tables use `Object.keys(featureConfig)` or `Object.entries()` for iteration order.

**Phase to address:**
Phase 1 (Portrait Generator). Determinism must be verified in the first working portrait, not discovered later when saves break.

---

### Pitfall 2: Portrait Seed Stored as Player Field — Breaks When Player Object Evolves

**What goes wrong:**
A `portraitSeed` field is added to `PlayerState` and stored to SQLite. When attributes or personality change (training progression does this), the player object changes, but the portrait seed is expected to stay constant. If the generation function derives any visual features from live attributes (e.g., "high strength → thicker neck") rather than the fixed seed, portraits morph as the player develops. Alternatively, if `portraitSeed` is forgotten during player object construction in `createAITeam()`, new players get undefined seeds and fall back to Math.random().

**Why it happens:**
The temptation to make portraits "reflect" current attributes is strong — it feels like the portrait should update as the player develops. But this couples two systems that should be independent: visual identity (fixed, seeded from ID) and physical development (mutable). Mixing them means portrait redraws on every training tick.

**How to avoid:**
- The portrait is derived only from: `player.id` (stable) + `player.nationality` (stable) + a small set of fixed cosmetic traits (hair colour, skin tone, face shape) that are generated once and never change.
- Do NOT derive any portrait feature from `attributes` or `personality` — those change via training. If you want "big striker" to look strong, encode it in the fixed cosmetic traits at generation time, not by reading `attributes.strength` at render time.
- If you need `portraitSeed` at all in `PlayerState`, make it optional and fall back to `createRng(player.id)` — this means portrait generation works correctly even for players created before the field was added, with zero migration cost.
- Add `portraitSeed?: string` to `PlayerState` in `src/simulation/types.ts`, mark it optional. Existing save files continue to work because `PlayerState.portraitSeed` is absent → falls back to ID-derived seed.

**Warning signs:**
- Portrait generator function signature takes `attributes: PlayerAttributes` as a parameter.
- Player's face changes when training improves a stat.
- Existing AI team players (created before the field was added) have undefined portraits on load.

**Phase to address:**
Phase 1 (Portrait Generator). Interface decisions made in Phase 1 prevent save-format migrations in Phase 2.

---

### Pitfall 3: Training Stat Gain Too Fast — The Economy Collapses in Season 1

**What goes wrong:**
With even conservative-seeming numbers, a young player on a focused drill can exceed the attribute cap in one season. Example: player age 19, talent multiplier 1.0, drilling passing 3 days/week for 30 weeks = 90 training sessions. If each session adds `0.003` to passing, that's `+0.27` in a single season — pushing a 0.55-passing player to 0.82, or a strong player through the 1.0 cap. After two seasons every young player is maxed. Transfer market collapses, no reason to buy anyone. The game loses strategic depth permanently.

**Why it happens:**
Developers test with one player over a few in-game weeks and the gain feels too slow. They increase the rate. They never simulate a full season or the 3-season arc. The problem only surfaces when the game is played long-term.

**How to avoid:**
- Model the full season before writing any gain numbers. 38 matchdays, ~3 training days between matches = ~90 training sessions/season. A player peaking after 3 full seasons (ages 20→23) should gain ~0.15 per attribute. Per-session gain = 0.15 / (3 × 90) ≈ **0.00056 per session** at peak development rate.
- Apply a hard cap: no attribute above 1.0. No session gain above 0.003 (even for exceptional talent — this is the ceiling for a prodigy).
- Age multiplier curve: peak gain at 18-22 (1.0×), sharp decline after 27, near-zero after 32. Peak gain ≠ fast gain — peak means the curve peaks there, not that numbers are large.
- Test by simulating 5 full seasons programmatically before any UI work. Log the attribute distribution of the squad at season end.

**Warning signs:**
- A young player's attribute rises by more than 0.05 in a single season during playtesting.
- Transfer market players become obsolete faster than they can be bought.
- "All my players are 90+ after two seasons" in early playtests.
- The gain per session looks reasonable in isolation but was never multiplied out across a full season.

**Phase to address:**
Phase 2 (Drill Scheduling). Balance numbers must be modelled before implementation, not after. Build a spreadsheet or a headless simulation test that runs 5 seasons and outputs attribute histograms.

---

### Pitfall 4: Age Regression Not Modelled — Veterans Never Decline

**What goes wrong:**
The training system improves attributes but never decreases them for aging players. A 34-year-old who was trained well at 24 retains peak-era attributes indefinitely. There is no incentive to buy or develop young players to replace veterans. The season cycle with youth graduates becomes pointless because veterans never need replacing.

**Why it happens:**
Regression is the complement of progression, but it's easy to build only the positive half. Age regression requires defining a second curve (when decline starts, how steep) and applying it even when the manager does nothing — which feels punishing when first encountered.

**How to avoid:**
- Model decline as a passive force applied at season boundary (not per training session — that's too granular).
- Curve: no decline before 29. Mild from 29-32 (pace, acceleration affected first — physical attrs). Moderate from 32-35. Sharp 35+. Technical and mental attributes decline later and slower than physical.
- Decline is capped at `−0.04` per attribute per season maximum, regardless of age — prevents 35-year-olds from instantly becoming useless.
- Apply the decline calculation in the same season-boundary function as training gains to keep them in one place. Never apply decline per training session.
- Physical attributes (`pace`, `acceleration`, `stamina`) decline first and fastest. Mental (`positioning`, `vision`, `concentration`) decline last. This matches real football patterns and makes experienced players strategically valuable in later years.

**Warning signs:**
- After 5 in-game seasons, no player in the squad has declined from their peak attributes.
- All 35-year-old players have the same or higher attributes than when they were 28.
- Youth graduates have no strategic incentive over veterans.

**Phase to address:**
Phase 2 (Drill Scheduling / Season Boundary). Decline is part of the same balance model as gain — they must be designed together.

---

### Pitfall 5: Sandbox Mode Runs a Third Concurrent Simulation Loop — Match Performance Degrades

**What goes wrong:**
The main game already runs one simulation loop (the match engine, 30 ticks/sec, 22 agents). The sandbox adds a second full SimulationEngine instance running simultaneously. If the sandbox runs its own `requestAnimationFrame` loop alongside the match loop, and the player has a match running while opening the sandbox, two engines both tick every frame. The match engine drops below 30 ticks/sec. At 22 agents × 10 actions × multiple consideration functions per action per tick, the CPU budget is already tight.

The deeper problem: the sandbox and the main gameLoop both call `requestAnimationFrame`, and if they aren't carefully gated, both loops continue even when they should be dormant.

**Why it happens:**
The sandbox is described in PROJECT.md as "training ground sandbox — free-to-use, custom scenarios on the engine, observation only." The natural instinct is to create a new `SimulationEngine` instance and wire it to a new Canvas with its own rAF loop. This works in isolation. It fails when both loops are alive simultaneously due to a state management oversight (navigating to the sandbox without stopping the match, or the match continuing in background state).

**How to avoid:**
- The sandbox is a mode, not a screen you navigate to alongside an active match. Enforce mutual exclusion: entering sandbox mode stops any running match loop; leaving sandbox resumes or discards match state.
- The sandbox must reuse `SimulationEngine` — it already runs headlessly (see `quickSim.ts`). Instantiate a new `SimulationEngine` with a custom `MatchConfig` and drive it with the same fixed-timestep loop from `src/loop/gameLoop.ts`. Do not create a new rAF loop.
- The sandbox canvas can be a separate `<canvas>` element but must share the same rendering frame budget. Use a single rAF callback that either ticks the match engine OR the sandbox engine — never both concurrently.
- "Observation only" means no stat mutations. Implement this by not calling the training progression functions after sandbox matches complete. The engine itself is unmodified — only the consumer code differs.

**Warning signs:**
- Match framerate drops when sandbox screen is open.
- Two separate `requestAnimationFrame` callbacks active simultaneously (visible in Chrome DevTools Performance tab).
- `SimulationEngine` constructor called more than once in the same game session without the previous instance being stopped.
- `setInterval` or `setTimeout` loops persisting after sandbox screen is closed.

**Phase to address:**
Phase 3 (Training Sandbox). The loop lifecycle must be explicitly designed — which mode owns the game loop at any given time.

---

### Pitfall 6: Sandbox Stat Changes Leak Into Real Season State

**What goes wrong:**
The sandbox is supposed to be "observation only — no stat changes." But if the sandbox shares references to the real `PlayerState` objects from `SeasonState`, any mutations during the sandbox simulation (fatigue accumulation, potential personality nudges from the training system) modify the real season state. The manager plays a "practice match" and the squad arrives at their next league fixture already fatigued.

**Why it happens:**
JavaScript passes objects by reference. If you do `sandboxEngine = new SimulationEngine({ homeRoster: season.playerTeam.players, ... })`, the engine's internal mutations to `position`, `velocity`, and `fatigue` fields are happening on the same objects that live in `SeasonState`. This is a classic aliasing bug that is invisible until someone plays a sandbox match and checks their squad's fitness before the next fixture.

Note: `PlayerState` is typed `readonly` in `src/simulation/types.ts` but readonly in TypeScript is compile-time only — it does not prevent runtime mutation. The engine uses immutable snapshot pattern for `SimSnapshot` but the internal mutable state is separate.

**How to avoid:**
- Deep-clone the player roster before passing it to the sandbox engine: `JSON.parse(JSON.stringify(season.playerTeam.players))` is sufficient and cheap for 25 players.
- Do NOT pass the live `SeasonState` players to the sandbox engine. Always pass a clone. The clone is discarded when the sandbox session ends.
- Add an assertion in the sandbox setup function: `sandboxPlayers !== season.playerTeam.players` — this catches the aliasing bug at the call site.
- The sandbox `MatchConfig` must use cloned rosters for both home and away.

**Warning signs:**
- Squad fitness decreases after a sandbox session without playing a real match.
- Players who were injured in the sandbox appear injured in the squad screen.
- Stats (pass count, appearance count) increment after a sandbox match.

**Phase to address:**
Phase 3 (Training Sandbox). The isolation invariant must be enforced at the data layer before any sandbox UI is built.

---

### Pitfall 7: Personality Vector Nudges Drift Out of Bounds Without Clamping

**What goes wrong:**
Training nudges the personality vector as described in PROJECT.md ("personality vector nudges from training — slight, bounded shifts over time"). If the nudge accumulates over many seasons without hard clamping to `[0, 1]`, values drift outside the personality range. A composure of `1.03` causes all composure-dependent calculations to produce results above the expected ceiling. The utility AI begins selecting actions it was never tuned for. The simulation breaks in ways that are extremely hard to trace back to personality drift.

**Why it happens:**
Personality nudges are small (0.001–0.003 per training session). Developers add a clamp after initially forgetting it because the values look fine in unit testing. Without a full-season simulation test, the drift accumulates undetected. By season 3 values are out of range and producing subtle AI behaviour changes that look like bugs in the action scoring, not in the personality values.

**How to avoid:**
- Clamp every personality trait to `[0, 1]` at the moment the nudge is applied — not as a post-processing step. The nudge function signature should be: `nudgePersonality(p: PersonalityVector, trait: keyof PersonalityVector, delta: number): PersonalityVector` and the return value enforces clamping before returning.
- The personality bounds are enforced in `generatePersonality()` in `teamGen.ts` (see lines 72-83 with `clamp()` calls) — the nudge function must use the same `clamp()` utility.
- Bound the total shift per trait per season, not just per session. A trait should not move more than `0.10` in any single season regardless of training intensity.
- Write a test: apply maximum nudge in one direction every session for 5 seasons — verify all traits remain in `[0, 1]`.

**Warning signs:**
- Any personality trait value outside `[0, 1]` in serialised save data.
- Unusual agent behaviour emerging in season 3-4 that wasn't present in season 1.
- Utility AI scores behaving unexpectedly in matches where affected players are fielded.
- Gaussian noise calculations producing NaN (composure nudged to a value that breaks the noise formula).

**Phase to address:**
Phase 2 (Drill Scheduling). Nudge bounds must be established when nudge values are first defined — not as a later fix.

---

### Pitfall 8: Oscillation Worsens in Sandbox Due to Hysteresis Bypass

**What goes wrong:**
PROJECT.md documents a known oscillation/jitter issue in the utility AI (action scores flip each tick). The hysteresis bonus (`TUNING.hysteresisBonus = 0.36`) partially mitigates this by giving the previously chosen action a sticky bonus. In the sandbox, developers may reset the engine's internal state between custom scenarios without carrying over each agent's `previousAction` tracking. Every new sandbox scenario starts with all agents having `previousAction = undefined`, which means the hysteresis bonus never applies for the first several ticks of each scenario. Oscillation is much more visible in the sandbox than in a real match, making it look like the sandbox has introduced a new bug when it hasn't.

**Why it happens:**
The sandbox re-instantiates the engine for each custom scenario (different formations, custom player configs). The `SimulationEngine` constructor starts with fresh agent state including no `previousAction`. In a real match this resolves within a few ticks as hysteresis kicks in. But when managers watch short sandbox clips (5-10 second scenarios to test a tactic), the first few ticks of visible jitter dominate their perception.

The deeper issue: the existing oscillation is cosmetic but noticeable (documented in PROJECT.md). The sandbox makes it impossible to defer fixing because it's on-screen and front-and-centre.

**How to avoid:**
- Warm up the sandbox engine: run 30 ticks silently before starting the observable simulation. This gives hysteresis time to stabilise each agent before the manager sees any output.
- Document the known oscillation issue prominently in the sandbox UI ("Agents settle into positions within the first few seconds of each scenario"). Set manager expectations rather than trying to hide it.
- Use the sandbox as an opportunity to finally fix the oscillation: the root cause is scores on adjacent actions being within the hysteresis window simultaneously. Consider increasing `TUNING.hysteresisBonus` from `0.36` to `0.45-0.50` as a first fix attempt, testable headlessly against the existing agent tests.
- Do NOT attempt to fix oscillation by adding cooldown timers to the engine — that would change simulation semantics for real matches too. Any fix must go through TUNING parameters.

**Warning signs:**
- Players visibly jittering at the start of every sandbox scenario.
- Managers reporting the sandbox is "broken" when it actually reflects pre-existing oscillation.
- Temptation to add scenario-specific hacks (`if (isSandbox) suppressJitter()`) that create a fork between sandbox and match engine behaviour.

**Phase to address:**
Phase 3 (Training Sandbox). Plan for the warmup period in sandbox design. Consider addressing oscillation fix as part of the sandbox phase since it becomes highly visible.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Derive portrait from live attributes instead of seed | "Portraits feel alive" | Portrait redraws on every training update; portrait changes on save/load; hard to cache | Never — visual identity must be stable |
| Store portrait as a PNG/data URL in SQLite | No re-generation needed on load | 500 players × ~2KB per portrait = 1MB minimum in DB; save files balloon | Never — always regenerate from seed at render time |
| Per-session stat gain without season model | Quick to implement | Game economy collapses in first season; requires save migration to rebalance | Never — model the full season first |
| Single training rate for all ages | Simpler code | No strategic depth; young players train identically to 35-year-olds | Never for ages, but a flat rate per attribute is fine for MVP |
| Personality nudges applied to `PlayerState` in-place | Simpler mutation path | Easy to forget clamping; harder to test; violates the readonly contract on PlayerState | Acceptable MVP if clamping is enforced at point of call |
| Sandbox reuses the same `SimulationEngine` instance without reset | Less code | Previous match state bleeds into sandbox scenarios; corrupted positions/ball state | Never — always instantiate fresh engine for sandbox |
| Skip the 30-tick warmup in sandbox | Faster scenario start | Oscillation is immediately visible and looks like a sandbox bug | Acceptable for internal testing; required fix before any user-facing release |
| Training gains stored as floating-point deltas accumulated over time | Precise long-term tracking | Floating point drift after 100+ seasons; attribute value is `0.7999999998` not `0.8` | Acceptable — clamp to 2dp on serialization and display |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Portrait generator + existing RNG | Using `Math.random()` instead of `createRng()` | Always pass `createRng(player.id)` to portrait generator — never import Math.random directly |
| Portrait generator + PlayerState | Adding `portraitSeed` as required field | Make it `optional` — fall back to `createRng(player.id)` to preserve backward compatibility with existing saves |
| Sandbox + SimulationEngine | Passing live `SeasonState` players by reference | Deep-clone the roster with `JSON.parse(JSON.stringify(...))` before constructing sandbox MatchConfig |
| Sandbox + game loop | Creating a second `requestAnimationFrame` loop | Reuse the existing game loop infrastructure from `src/loop/gameLoop.ts`; sandbox mode replaces match mode, not runs beside it |
| Training gains + SQLite | Storing training progress as separate table rows per session | Store cumulative attribute deltas in the existing player save blob; only persist what changed at season boundary |
| Drill scheduler + existing season flow | Inserting training days as fake fixtures in the fixtures array | Keep training as a separate data structure from fixtures; mixing them breaks the fixture-count assertions and display logic |
| Personality nudges + agent.ts | Nudging personality inside the simulation tick | Nudges belong in the training resolution phase (post-match, post-training), never inside the simulation tick itself |
| Age regression + transfer market | Applying decline to all 500 players on every save | Apply decline only at season boundary, not per-session; for AI teams apply lazily when a match is about to start |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering portraits on every squad screen repaint | Squad screen stutters when scrolling 25 players | Cache rendered portraits as `ImageBitmap` or `OffscreenCanvas` per player; regenerate only if player ID changes | Immediately visible with 25 players |
| Redrawing portrait canvas on every animation frame | GPU overload, battery drain | Portrait is a static image; render once to `OffscreenCanvas`, blit to screen canvas as a texture | Immediately on any device |
| Running sandbox engine at full 30-tick speed during warmup | Extra CPU during scenario load | Warmup runs headlessly (no render), exits as soon as 30 ticks complete | Only an issue if warmup is rendered |
| Training progress recalculated for all 500 players per tick | CPU spike during training day resolution | Training resolution runs once per training day event, not per tick; 500 players × simple arithmetic is ~1ms, acceptable at once-per-day frequency | Not an issue at per-day; critical issue if accidentally per-tick |
| Portrait generation triggered on every `PlayerState` reference | Cascading redraws through squad/profile screens | Portrait generation reads only `player.id` and `player.nationality` — neither changes after player creation; one-time generation is safe | Any screen that re-renders on state change |
| Both sandbox canvas and main canvas active simultaneously | Double GPU buffer allocation, double draw calls | Sandbox canvas replaces main canvas in DOM; do not keep both canvases attached and rendering | Immediately visible on any device |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Portrait looks identical for players of different nationalities | Squad feels homogenous, no visual identity | Nationality must gate hair/skin/facial-feature probability distributions — Spanish player has different palette to Brazilian player even with the same seed |
| Training progress bar advances too slowly to see | Manager feels training has no effect | Show cumulative gain per attribute each week, not absolute values. "Passing: +0.03 this week" is informative; "Passing: 0.723" is not |
| Sandbox has no scenario presets | Manager abandons it as too complex to set up | Ship with 3-5 presets: "High press vs 4-5-1 low block", "Striker vs CBs 1v2", "Counter-attack from deep". Custom scenarios are secondary |
| Drill choice UI has no indication of which attributes are affected | Manager assigns wrong drills, doesn't understand why players improve in unintended areas | Each drill card must list affected attributes and the approximate gain rate at the current squad's average age |
| Age decline invisible until it's too late | Manager is blindsided when a 33-year-old collapses | Show an aging curve indicator on player profiles for players over 28. "Expected decline: pace −0.03/season from age 30" |
| No confirmation that sandbox results did not affect real squad | Manager unsure if their squad is fatigued after sandbox | Show explicit "Sandbox complete — no changes to your squad" toast when returning to hub |

---

## "Looks Done But Isn't" Checklist

- [ ] **Portrait determinism:** Generate portrait for the same player in two separate browser sessions — pixel output is identical. Verify using `canvas.toDataURL()` comparison.
- [ ] **Portrait backward compatibility:** Load a save file created before the portrait system existed — all players generate valid portraits without a migration step.
- [ ] **Training balance:** Run a headless 5-season simulation and verify no attribute in the player's squad exceeds 0.95 for any player starting below 0.70.
- [ ] **Age regression:** Verify that a player aged 33 at season start has lower pace at season end than at season start.
- [ ] **Personality bounds:** After 5 simulated seasons of training, verify all personality traits are in `[0, 1]` in the serialized save state.
- [ ] **Sandbox isolation:** Play a full sandbox match (11v11 to full time), return to hub, verify squad fatigue is unchanged from before the sandbox session.
- [ ] **No stat leak:** Verify player stats (goals, appearances) do not increment from sandbox matches — query the stats DB table before and after a sandbox session.
- [ ] **Sandbox loop cleanup:** Open sandbox, play scenario, close sandbox, verify no lingering `requestAnimationFrame` or `setInterval` callbacks in DevTools Performance panel.
- [ ] **Drill scheduling persists:** Save game during a training week, reload, verify the current drill selection and remaining training days are preserved — not reset to defaults.
- [ ] **Oscillation warmup:** Sandbox scenarios have 30-tick headless warmup before visible simulation starts — jitter is not visible in the first frame of any scenario.

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Non-deterministic portraits (detected early) | LOW | Remove `Math.random()` calls, replace with seeded RNG; portraits auto-correct next load |
| Non-deterministic portraits (detected after users save) | MEDIUM | Add migration: regenerate all portraits from `player.id` seed; warn users "portrait update on next load" |
| Training too fast (detected mid-season) | MEDIUM | Halve all gain constants; apply penalty to existing save: clamp all trained attributes to `baseline + 0.15 max` |
| Training too fast (detected after multiple seasons) | HIGH | Requires balance recalibration and save migration; attribute values above expected ceiling need to be gently walked back over future seasons |
| Sandbox fatigue leak (detected after one session) | LOW | Fix aliasing bug; no data loss since sandbox state was never intended to persist |
| Personality out of bounds (detected in season 2-3) | MEDIUM | One-time migration: clamp all personality values to `[0, 1]` in save file; add clamping at point of nudge going forward |
| Oscillation visible in sandbox | LOW | Implement 30-tick warmup — no engine changes required; addresses perception without changing simulation |
| Second rAF loop (performance regression) | LOW | Cancel stray `requestAnimationFrame` handles on sandbox exit; add lifecycle assertion that only one loop is active |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Non-deterministic portrait generation | Phase 1: Portrait Generator | `canvas.toDataURL()` comparison across two sessions for same player ID |
| Portrait seed in PlayerState (optional vs required) | Phase 1: Portrait Generator | Load pre-portrait save file — no crash, valid portrait generated |
| Training rate too fast | Phase 2: Drill Scheduling | 5-season headless simulation; attribute ceiling test |
| Age regression absent | Phase 2: Drill Scheduling / Season Boundary | 5-season test: 33-year-old player has lower pace at end than start |
| Personality drift out of bounds | Phase 2: Drill Scheduling | 5-season test: all traits in `[0, 1]`; max per-season delta ≤ 0.10 |
| Sandbox loop isolation | Phase 3: Training Sandbox | DevTools: only one rAF callback active; sandbox exit cleans up |
| Sandbox roster aliasing (stat leak) | Phase 3: Training Sandbox | Fatigue and stats unchanged after sandbox session |
| Oscillation visible in sandbox | Phase 3: Training Sandbox | 30-tick warmup implemented; first visible frame shows settled agents |

---

## Sources

- Codebase analysis: `src/simulation/ai/agent.ts` — hysteresis implementation, TUNING.hysteresisBonus
- Codebase analysis: `src/simulation/math/random.ts` — createRng / seedrandom implementation
- Codebase analysis: `src/season/teamGen.ts` — player generation, nationality handling, clamp() usage
- Codebase analysis: `src/simulation/types.ts` — PlayerState definition, readonly fields
- Codebase analysis: `src/season/quickSim.ts` — headless engine usage pattern
- Codebase analysis: `src/simulation/tuning.ts` — TUNING.hysteresisBonus = 0.36, noiseScale = 0.06
- `PROJECT.md` — known oscillation/jitter issue documented, sandbox "observation only" requirement, personality vector nudges requirement
- [Game AI Pro Chapter 9: An Introduction to Utility Theory](http://www.gameaipro.com/GameAIPro/GameAIPro_Chapter09_An_Introduction_to_Utility_Theory.pdf) — hysteresis and momentum bonus patterns
- [Football Manager player development stages by age](https://fm-base.co.uk/threads/player-development-stages-by-age.93326/) — age-progression reference for balance
- [Football Manager 11 reasons players won't develop](https://www.passion4fm.com/11-reasons-why-your-players-wont-develop-in-football-manager/) — game economy pitfalls
- [MDN Game Loop Anatomy](https://developer.mozilla.org/en-US/docs/Games/Anatomy) — requestAnimationFrame lifecycle
- [Optimizing HTML5 Canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) — OffscreenCanvas and caching patterns
- [Runtime Procedural Character Generation](https://dev.to/goals/runtime-procedural-character-generation-161d) — modular sprite assembly patterns

---
*Pitfalls research for: Fergie Time v1.2 Player Development (pixel art portraits, drill scheduling, training sandbox)*
*Researched: 2026-03-07*

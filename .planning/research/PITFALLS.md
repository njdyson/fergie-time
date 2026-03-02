# Domain Pitfalls

**Domain:** Browser-based emergent football simulation with utility AI agents
**Project:** Fergie Time
**Researched:** 2026-03-02
**Confidence:** HIGH (core pitfalls drawn from well-established game AI literature and browser JS performance fundamentals; verified against project design brief)

---

## Critical Pitfalls

Mistakes that cause rewrites or fundamental engine redesign.

---

### Pitfall 1: Utility Score Degeneracy — One Action Always Wins

**What goes wrong:**
A single utility action dominates all others across nearly all game states. The most common form in football simulations is "hold/shield" or "pass short" scoring higher than all alternatives in 90% of ticks, producing a simulation where all 22 agents endlessly pass sideways or the team in possession never takes a shot. The degenerate action becomes a local maximum that all agents fall into.

**Why it happens:**
Utility score formulas are calibrated in isolation. Developers tune `shoot` score on a clean-through, tune `pass` score with a nearby target, and tune `dribble` score against one defender. The formulas look correct independently. But when the full match context is active, one formula's range dominates. A `pass` formula returning 0.0–0.9 will almost never lose to a `shoot` formula returning 0.0–0.7. The ranges, not the logic, determine winner.

The Fergie Time scoring example is a warning sign in embryonic form:
```
score = success_probability + forward_progress × directness − (1 − success_probability) × (1 − risk_appetite) − pressure × (1 − composure)
```
`success_probability` appears twice (once raw, once inverted) and has range 0.0–1.0. It will dominate `forward_progress × directness` unless `directness` is calibrated to punch the same numerical range. Before first match is playable, this isn't visible. After first match, the pitch is a sideways-passing fest.

**Consequences:**
The game produces no goals. Or it produces constant shots from everywhere. Or defenders never press, they just hold. The simulation stops feeling like football. Because the problem is in score calibration rather than logic, it's invisible to unit tests and only surfaces when watching a full match.

**Prevention:**
1. Build a **score range audit tool** early — for every action, log the distribution of scores over a 90-minute simulation. Plot histograms. No single action should dominate > 40% of all ticks across all 22 agents.
2. Normalize all utility scores to the same reference range before summing terms. Use response curves (linear, logistic, exponential) rather than raw arithmetic — the curve shape is the calibration lever.
3. Add a **minimum-frequency floor** during development: if any action is selected < 5% of the time over a full match (per role group), flag it. It's either miscalibrated or genuinely useless and should be removed.
4. Test each formula's output range in isolation against realistic input distributions before integration.

**Detection (warning signs):**
- Watching a match and seeing the same animation repeat > 80% of the time
- Shot counts per match < 2 or > 30 in early testing
- Any agent attribute change (e.g., raising `directness` to 1.0) produces no visible match difference
- "Passing speed" visually looks like agents are waiting for each other

**Phase:** Address in Phase 1 (core engine). Build score range logging before the first playable match.

---

### Pitfall 2: Ball Clustering — All Agents Swarm the Ball

**What goes wrong:**
All outfield players gravitate to within a 20-30px radius of the ball regardless of their role or team shape. The match looks like an Under-8s Sunday league game: 20 players clumped in one area, 2 goalkeepers standing alone. Formation, roles, and tactical instructions become meaningless — the positional context effectively doesn't exist.

**Why it happens:**
In utility AI, "move to ball" or "support carrier" actions are assigned high scores because being near the ball is locally always useful — an agent near the ball can receive a pass, press, intercept, or shoot. Without a strong countervailing "maintain position" or "make run ahead" action, the myopic greedy utility maximizer collapses everyone toward the ball.

This is compounded by formation anchors: if agents only treat their anchor as a soft pull rather than a hard constraint, and ball-proximity scores are on the same numerical scale, ball-proximity wins every tick.

**Consequences:**
- Tactical formation is irrelevant — 4-4-2 and 4-3-3 produce identical clustering behavior
- Defensive shape collapses during opponent attacks, leaving space trivially
- Physics-level crowding causes collision resolution to fire constantly, degrading performance
- No natural space creation, no passing lanes — the entire tactical system is inert

**Prevention:**
1. Treat formation anchor distance as a **multiplicative penalty** on all ball-approaching actions, not an additive term. An agent 60m from their anchor should have ball-approach scores suppressed by 0.3×, not reduced by 0.3.
2. Implement **role-gated actions**: wingers cannot execute "press opposition midfielder" unless they're within their defensive third. Implement action availability masks, not just score penalties.
3. Add a **space value** heuristic: agents actively score "move to open space" based on distance from teammates and proximity to optimal position for current phase of play. This creates natural spreading without scripting positions.
4. Watch a 2-minute match segment specifically tracking XY positions of all 22 agents every 5 seconds. Visualize as a heat map. Expected pattern: distinct clusters by team and position, not one blob.

**Detection (warning signs):**
- The "average distance between players on same team" metric collapses to < 15m
- Changing formation (4-3-3 vs 4-5-1) produces no visible spatial difference on pitch
- Defensive midfielders are routinely the closest player to the opposition goal

**Phase:** Address in Phase 1 (agent movement) before tactical system is layered on. Clustering compounds every subsequent system built on top of it.

---

### Pitfall 3: Physics That Feels Wrong — Ball Behavior Disconnected from Expectation

**What goes wrong:**
The ball's physics are mathematically correct but perceptually wrong. Common manifestations in 2D football simulations:
- Ball slides endlessly on "passes" that should have rolled to a stop
- Ball bounces like a rubber ball on headers rather than dropping
- Aerial ball (Z-axis) height has no visible correspondence to ground shadow, so players "head" balls that appear to be at ground level
- Collision between ball and player triggers instantaneously, then ball teleports to new velocity — no "touch" feel
- Ball passes through players when simulation tick rate is too low (tunneling)

**Why it happens:**
2D canvas simulations typically implement Euler integration: `position += velocity * dt`. This works for slow objects. For a football traveling at 30 m/s, a 33ms tick (30fps sim) advances 1 meter per tick — easily passing through a player hitbox (typical diameter 1.5m radius) without registering a collision.

The Z-axis/2.5D implementation is particularly fragile: height is conveyed through shadow offset and sprite scale, but if these aren't tightly coupled to the physics Z value, players will intercept aerial balls at wrong moments or stand under balls that should be over their heads.

**Consequences:**
- Players attempt to tackle balls that are in the air and logically beyond their reach
- Long passes roll off the pitch edge without slowing — no friction curve tuned
- Headers happen at wrong times, breaking the football logic players expect
- Feels like a janky toy, not a football simulation

**Prevention:**
1. Use **continuous collision detection** (CCD) for ball-player interactions. After each integration step, sweep the ball's trajectory segment and check for intersection with player hitboxes. At 30 ticks/sec this adds ~22 line-segment checks per tick — negligible cost.
2. Implement **drag and friction curves** from real football physics: a rolling ball decelerates at ~1-2 m/s² on grass. A driven pass decelerates faster due to rolling resistance. These are three-line additions with massive perceptual impact.
3. For 2.5D: the **shadow position** must be the authoritative ground position for collision purposes, not the rendered sprite position. All agent "can I reach this ball" calculations use shadow XY and current Z-height separately. If `z > agent.jumpHeight`, the agent cannot intercept.
4. Validate physics by eye test: kick a ball diagonally across a 2/3-pitch pass. It should slow and stop naturally in ~3 seconds. Header height should produce a visible arc. Do this before attaching any AI.

**Detection (warning signs):**
- Ball stops instantly when it reaches the touchline instead of rolling off gradually
- Players "head" the ball in situations that look like ground-level play
- Changing the `friction` coefficient from 0.95 to 0.85 produces no visible change in gameplay feel
- Ball tunnels through agents at high velocity

**Phase:** Phase 1 (physics layer). Physics is the foundation — all agent behavior and collision resolution builds on it.

---

### Pitfall 4: Performance Death with 22 Agents — Frame Rate Collapse Mid-Match

**What goes wrong:**
The simulation runs at 60fps during initial development with a few agents. When all 22 agents are active with full utility evaluation, physics integration, and contact resolution, the frame rate collapses. Common causes in browser TypeScript simulations:

1. **GC pressure from object allocation per tick**: Each utility evaluation creates temporary score objects or arrays. At 30 ticks/sec × 22 agents × 7 actions, this is 4,620 small object allocations per second. V8's minor GC fires every few hundred ms, causing perceptible hitches.
2. **Spatial query O(n²)**: Each agent evaluates "nearest teammates," "nearest opponents," "distance to ball." If implemented as a naive loop over all 22 agents for each query, that's 22 × 22 = 484 distance calculations per tick, per query type. With 4 query types, 1,936 sqrt operations per tick.
3. **Canvas state thrashing**: Calling `ctx.save()`/`ctx.restore()` or switching `fillStyle` per-agent per-frame instead of batching by visual state causes GPU pipeline flushes.
4. **Simulation and rendering on same frame**: If `requestAnimationFrame` runs both the physics tick and the draw call, a slow physics tick delays rendering, causing jank.

**Why it happens:**
Developers write the clean version first ("it works, optimize later") then discover that "optimize later" requires architectural changes, not micro-optimizations. By Phase 3, refactoring the simulation loop is painful because everything depends on it.

**Consequences:**
- 10fps match simulation is unplayable
- GC hitches produce the sensation of "freezing" every 500ms
- Forced to reduce tick rate, which causes ball tunneling (see Pitfall 3) and makes AI decisions feel sluggish

**Prevention:**
1. **Separate simulation from rendering from day one** — the PROJECT.md already specifies this, but it must be structural. The sim tick is a pure function: `SimState → SimState`. Rendering reads state, never writes it. This enables future headless runs.
2. **Pre-allocate all score arrays at startup** and reuse them. A fixed `Float32Array[7]` per agent for action scores, reset each tick. Zero allocation in the hot path.
3. **Spatial grid** from the start, not after profiling. Divide the pitch into a grid (e.g., 12×8 cells). Agent lookup is O(1) for nearby agents. Update the grid each tick by inserting agents into cells — ~22 operations, not 484.
4. **Canvas batching**: Sort draw calls by sprite sheet region. Draw all player bodies in one batch, then all overlays, then ball, then UI. Minimize state changes.
5. **Profile at target agent count from the first playable match**: Run Chrome DevTools Performance panel with all 22 agents. Find the hottest function before building the tactical system on top.

**Detection (warning signs):**
- `performance.now()` delta between ticks starts exceeding 33ms (30fps budget)
- Chrome Task Manager shows JS heap growing steadily during a match (GC not keeping up)
- `console.time('sim-tick')` output climbs from 2ms at kickoff to 8ms at 30 minutes
- Frame rate drops specifically during high-contact moments (collision resolution O(n²))

**Phase:** Phase 1 architecture must establish the separated sim/render loop. Performance validation at full 22-agent count must be a Phase 1 exit criterion.

---

### Pitfall 5: Tactical Instructions That Don't Mechanically Differentiate

**What goes wrong:**
The tactical system (formation, role assignments, per-player instructions like "press high," "sit deep," "overlap") exists in the UI and in the data model but produces no measurable spatial or behavioral difference in the simulation. A 4-3-3 pressing high and a 4-5-1 low block produce identical average player positions and identical goal counts over 20 matches.

**Why it happens:**
Tactical instructions are implemented as labels or flags in agent data. The utility AI reads these flags to adjust scores: `if (tactic.pressHigh) pressScore += 0.1`. But 0.1 on a utility scale of 0.0–1.0 is swamped by other terms. The instruction exists but doesn't create a genuine mechanical difference in agent behavior.

The deeper issue: tactical differentiation requires spatial consequences. A "high press" must mean agents are literally in different positions, defending from higher up the pitch. If the utility AI treats formation anchors as loose suggestions (see Pitfall 2), spatial differentiation is impossible regardless of the tactical flag values.

**Consequences:**
- Every tactic plays identically; the manager has no meaningful agency
- "No single tactic should dominate" cannot be achieved — all tactics are equivalent
- The core design promise ("tactics as real mechanical levers") fails

**Prevention:**
1. For every tactical instruction, define a **measurable spatial test**: "High press should mean the defensive line's average Y position is > 55% of pitch length during opposition possession." Write this test before building the tactical instruction.
2. Tactical instructions must modify **utility function weights** significantly (0.3–0.5 adjustments), not add marginal bonuses. A "direct play" instruction should multiply `forward_progress` weight by 2.0, not add 0.05.
3. Implement a **"tactical fingerprint" report**: after a match, output average player positions per phase of play (in possession / out of possession), average pass length, territory coverage, and press intensity. Compare across tactics. If fingerprints are indistinguishable, the tactic has no mechanical effect.
4. Run **head-to-head tactical validation**: simulate 100 matches of high-press 4-3-3 vs. low-block 4-5-1. The expected outcomes (more goals vs. fewer goals conceded) should be statistically distinguishable. If they aren't, the tactics aren't real.

**Detection (warning signs):**
- Changing formation from 4-4-2 to 3-5-2 produces no change in pass network graph
- Setting "press intensity" to maximum vs. minimum produces < 5% difference in defensive line position
- A player assigned as "defensive midfielder" has the same action frequency distribution as one assigned "attacking midfielder"

**Phase:** Phase 2 (tactical system). Must be validated with quantitative spatial metrics before building the management UI on top.

---

## Moderate Pitfalls

Mistakes that cause significant rework but not full rewrites.

---

### Pitfall 6: Personality Vectors Losing Meaning Over Time — Attribute Erosion

**What goes wrong:**
The training system allows drills to shift personality weights. After a season of training, all players converge toward similar personality vectors. The "maverick" who started at `risk_appetite: 0.9` is now at `0.6` after a season of conservative drills. The "metronome" has drifted to `directness: 0.5`. All players become interchangeable. The emergent archetypes that are the game's core promise flatten out.

**Why it happens:**
Training deltas are additive without bounding logic that preserves identity. If any drill can shift any attribute in any direction, and managers optimize for winning (which typically means being more conservative), the game's training system selects for convergence. There's no mechanical reason for a manager to maintain a maverick's wildness.

**Consequences:**
- Squad depth loses meaning after Season 2
- The personality-vector system that distinguishes this game from lookup tables becomes invisible
- Player retention decisions ("keep the maverick or sell him?") lose texture

**Prevention:**
1. Implement **personality anchors**: each player has a `base_personality` vector set at generation. Training can move weights within ±0.3 of the anchor but cannot exceed it. The anchor represents who they fundamentally are.
2. Fatigue-driven erosion (already in the design: "tired players get cautious") should be **temporary and recoverable**, not cumulative. If fatigue erosion is permanent, rest becomes a mandatory maintenance task rather than a strategic decision.
3. Youth graduates should have **wild variance** in personality vectors, not regression-to-mean values. This ensures fresh archetypes enter the squad.

**Detection (warning signs):**
- After 3 seasons, standard deviation of `risk_appetite` across squad is < 0.1 (all converged)
- The "most direct passer" and "most cautious passer" have the same pass-length distribution in match replay

**Phase:** Phase 3 (training system). Design personality bounds before implementing training deltas.

---

### Pitfall 7: Emergent Behavior Debugging Is a Black Box

**What goes wrong:**
Something weird happens in a match — the striker stands still for 20 seconds, the goalkeeper walks into his own net, defenders all rush left simultaneously. The developer cannot determine why because there's no observability into agent decision-making. The only output is the visual behavior.

**Why it happens:**
Emergent systems are correct-by-design assumptions: "if I tune the scores right, the right behavior emerges." There are no invariants to assert against. A unit test can verify that the `shoot` score formula returns 0.8 for a given input, but cannot verify that an agent correctly decides to shoot vs. pass in a live match context.

**Consequences:**
- Tuning becomes trial-and-error without feedback loops
- Bugs that look like "weird behavior" are often mistuned utility weights — but which weight?
- Development velocity drops sharply after initial engine construction because every regression requires watching multiple full matches

**Prevention:**
1. **Per-agent decision logging**: Every tick, each agent logs its top 3 scored actions and their scores to a ring buffer (last 300 ticks). This is cheap (pre-allocated) and can be read out on agent click during debug mode.
2. **Match replay system with state scrubbing**: Store full sim state every 30 ticks (1 second at 30fps). Allow scrubbing backward to the moment before a weird event and inspecting each agent's score state.
3. **Action frequency dashboard**: A live overlay (toggle-able in debug mode) showing a bar chart of action selection frequency per agent over the last 60 seconds. Degenerate strategies appear immediately.
4. **"Why did X do that?" tool**: Click an agent, click a moment in the timeline, see the exact utility scores that produced that decision.

**Detection (warning signs):**
- Developers resort to `console.log` to understand individual agent decisions
- "I watched 5 matches and couldn't figure out why strikers don't shoot" — no structured observability

**Phase:** Phase 1. Observability tools must be built alongside the agent system, not bolted on later.

---

### Pitfall 8: Contact Resolution Creating Exploitable Asymmetries

**What goes wrong:**
The tackle and challenge system has an asymmetry: one resolution path (e.g., "aggressive challenge") almost always wins the ball regardless of the defender's `aggression` vs. attacker's `strength` comparison. All defenders quickly "learn" (via whoever is tuning them) to always use aggressive challenge, or the AI discovers it's the highest-utility action in any contest. Contact resolution degenerates to a single dominant strategy (see Pitfall 1, specialized to contact events).

A secondary issue: if tackle success is purely probabilistic (coin flip weighted by attributes), players will attempt tackles constantly because the expected value is positive. Overly frequent tackling breaks the spatial spacing system — defenders will leave their anchor position to chase tackle opportunities 30m away.

**Why it happens:**
Challenge resolution is tuned in isolation (what's the right tackle success rate?) without considering the tactical context (should defenders pursue tackles at the cost of positional integrity?). The utility score for "press/challenge" doesn't account for the defender's distance from their formation anchor.

**Consequences:**
- Defenders permanently out of position chasing tackles
- Simulation produces 30+ fouls per match (unrealistic) or 0 fouls (challenge always cleanly won)
- The attacker-vs-defender contest feels scripted rather than emergent

**Prevention:**
1. Apply the same **anchor-distance penalty** to challenge/tackle actions as to "move to ball" actions (see Pitfall 2). A central defender 35m from their anchor should almost never score "challenge" high enough to pursue.
2. Include **foul probability** as a cost term in the challenge utility score, scaled by `aggression` vs. opponent's `anticipation`. The agent genuinely weighs "worth the foul risk?"
3. Implement a **sequential resolution model** for contacts: initiation → contest → resolution, each step adding a physics impulse. This prevents teleport-on-tackle artifacts and allows the attacker to shield, dodge, or ride the challenge as separate agent actions.

**Phase:** Phase 2 (contact/challenge system).

---

### Pitfall 9: Canvas Rendering Falling Behind Simulation State

**What goes wrong:**
The simulation is decoupled from rendering, but rendering always reads the "latest" simulation state. When the simulation runs faster than render (e.g., headless match at 10× speed), or when a GC pause delays a render frame, players visually jump/teleport rather than showing smooth interpolated movement.

**Why it happens:**
A naive decoupled architecture reads current state for rendering. If three ticks happen between two render frames, the render sees only the final tick — the intermediate positions are lost. At 30 sim ticks / 60 render frames, this is normally fine (render is faster). But when sim runs faster or render drops frames, visual coherence breaks.

**Prevention:**
1. Store **previous tick state alongside current state**. The renderer interpolates between `previousState` and `currentState` using `alpha = (timeSinceLastTick / tickDuration)`. This is standard fixed-timestep game loop practice.
2. Cap simulation catchup to a maximum of 3 ticks per render frame. If the sim falls behind by 10 ticks, allow only 3 to catch up per frame — prevent the "spiral of death" where catchup attempts make things worse.
3. The `requestAnimationFrame` loop structure:
   ```typescript
   let accumulator = 0;
   const TICK_MS = 33.33; // 30fps sim
   function loop(timestamp: number) {
     accumulator += Math.min(deltaTime, 100); // cap at 100ms
     while (accumulator >= TICK_MS) {
       previousState = currentState;
       currentState = tick(currentState);
       accumulator -= TICK_MS;
     }
     const alpha = accumulator / TICK_MS;
     render(interpolate(previousState, currentState, alpha));
     requestAnimationFrame(loop);
   }
   ```

**Phase:** Phase 1 (architecture). Getting the game loop right from the start avoids later visual artifacts.

---

## Minor Pitfalls

---

### Pitfall 10: Gaussian Noise Destroying Composure Differentiation

**What goes wrong:**
Gaussian noise is added to utility scores to simulate decision variance, scaled by composure. But the noise sigma values are too large, making even high-composure players feel erratic, or too small, making low-composure players feel robotic. The composure personality attribute stops differentiating player behavior.

**Prevention:**
Define expected variance per composure quintile. A composure-1.0 player should have < 5% action selection variance across similar situations. A composure-0.2 player should have > 30% variance. Test this quantitatively before tuning other personality attributes.

**Phase:** Phase 1 (agent system).

---

### Pitfall 11: Procedural Portrait Generation Accumulating Technical Debt

**What goes wrong:**
Portrait generation is treated as a cosmetic feature and implemented with magic numbers, hardcoded pixel coordinates, and no system architecture. By the time 500+ players exist (20 teams × 25 players), the portrait system is a mess of special cases, some portraits clip hair onto face pixels, color combinations are ugly, and the system can't be extended.

**Prevention:**
Model portraits as a **trait-to-layer mapping system** early: each visual trait (hair, skin, kit number, expression) is a layer with defined blend rules. Treat it as a mini data system. Test generation of 100 portraits and audit for collision/clip artifacts before building the squad screen.

**Phase:** Phase 2 or 3 (player generation). Don't defer architecture until the last moment.

---

### Pitfall 12: Single-League Structure Accidentally Precluding Future Expansion

**What goes wrong:**
The league table, fixture generation, and season cycle are implemented as singletons. `currentLeague.fixtures`, `currentLeague.table`. When expansion to multiple divisions or cups is considered later, the data model requires a full rewrite because it assumed one league.

**Prevention:**
Wrap league logic in a `League` class/object from the start, even if only one instance exists. `new League(teams, config)`. The fixture generator and table calculator operate on the League instance, not a global. Adding a second league is then instantiating a second object.

**Phase:** Phase 3 (season/league system). One-line architectural decision with significant future leverage.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Physics layer | Ball tunneling at high velocity; Z-axis collision at wrong height | CCD for ball; authoritative shadow position for aerials |
| Agent utility system | Degeneracy (one action always wins); score range mismatch | Score range audit tool built alongside formulas |
| Agent movement | Ball clustering; formation anchors ignored | Multiplicative anchor penalty; action availability masks per role |
| Game loop architecture | Visual teleporting when sim/render decouple; GC pressure | Fixed-timestep loop with interpolation; pre-allocated score arrays |
| Contact/challenge | Exploit asymmetry; defenders abandoning position | Anchor-distance penalty on challenge utility; cost-inclusive foul probability |
| Tactical system | Instructions produce no measurable spatial difference | Quantitative spatial fingerprint tests per tactic before UI layer |
| Training system | Personality vector convergence over seasons | Personality anchors; temporary vs. permanent erosion design |
| Observability | Emergent bugs are undebuggable without tooling | Per-agent decision log ring buffer; click-to-inspect decision state |
| Performance | Frame rate collapse at 22 agents; GC hitches | Profile at full agent count in Phase 1; spatial grid; pre-allocated arrays |
| Portrait generation | Magic-number spaghetti; clip artifacts at scale | Layer-based trait mapping system; generate 100 and audit |
| Season/league data model | Singleton model precludes expansion | League class from the start |

---

## Testing Emergent Systems

This deserves its own section because emergent behavior resists conventional testing.

**The core problem:** Unit tests verify that `calculateShootScore(inputs) === 0.7`. They cannot verify that shooters shoot at the right moments in a live match. Emergent correctness is behavioral, not computable.

### Testing Approaches That Work

**1. Statistical behavioral tests (medium confidence)**
Run 100 simulated matches. Assert distributional invariants:
- Goals per match: mean 2.5, σ < 1.5 (not 0 goals, not 20)
- Shots per match: mean 12, σ < 5
- Pass completion rate: between 65% and 85%
- Possession change events per minute: > 2

These won't catch all bugs but will catch degenerate collapse immediately.

**2. Controlled scenario tests**
Set up a specific game state (agent positions, ball position, score state, fatigue) and run for 60 ticks. Assert behavioral expectation:
- "Given a striker 12m from goal with no defenders in path, expect `shoot` to be selected in > 80% of runs" (accounting for Gaussian noise)
- "Given a central defender 50m from their anchor, expect `challenge` to not be the top action"

These are deterministic-ish tests using fixed seeds for noise.

**3. Regression "golden match" tests**
After the engine feels correct, record a full match outcome (final score, key events, player stats) with a fixed random seed. Future changes that break this output require deliberate review. Catches accidental regressions.

**4. What doesn't work**
- Snapshot testing of exact agent positions (too brittle to noise)
- Expecting deterministic outcomes (noise is intentional)
- Testing individual actions in isolation (degeneracy is a system property)

**Phase:** Testing infrastructure for emergent behavior should be established by end of Phase 1.

---

## Sources

All findings are drawn from established game AI literature, browser JavaScript performance fundamentals, and analysis of the project design brief (`.planning/PROJECT.md`). The following areas are HIGH confidence based on well-documented game development practice:

- Utility AI score degeneracy: documented in the GDC Utility AI talks (Dave Mark / Mike Lewis, 2010 onwards) and replicated independently in every utility AI implementation
- Ball clustering in football sims: a well-known pathology in multi-agent football simulations, documented in RoboCup research literature
- 2D physics tunneling: standard continuous collision detection literature; O'Brien et al., Erin Catto's Box2D documentation
- Browser JS GC pressure: V8 allocation documentation, Chrome DevTools team posts on minor GC behavior
- Fixed-timestep game loop: Glenn Fiedler "Fix Your Timestep!" (2004, still canonical)
- Tactical differentiation failure: documented pattern in football simulation game post-mortems (Football Manager, Sensible Soccer engine retrospectives)

**Confidence note:** External web research tools were unavailable during this session. All pitfalls are grounded in well-established principles. Specific numerical thresholds (e.g., "< 40% action domination," "mean 2.5 goals") are informed estimates appropriate for initial calibration targets, not empirically derived — they should be tuned against actual match output.

# Phase 1: Engine Core - Research

**Researched:** 2026-03-02
**Domain:** Browser-based 2D football simulation — physics, steering behaviors, utility AI, Canvas rendering, game loop architecture
**Confidence:** HIGH (architecture patterns, stack choices); MEDIUM (utility AI calibration thresholds for football-specific tuning)

---

## Summary

Phase 1 delivers a single watchable 90-minute match producing emergent football from 22 autonomous agents. Every requirement in this phase (ENG-01 through ENG-15) is a building block in a strict dependency chain: physics must work before steering is useful, steering must work before utility AI has meaning, utility AI must work before personality vectors have observable effect. The architecture is already well-researched and decided — the build order, the sim/render separation pattern, the fixed-timestep accumulator, and the choice of custom implementations over libraries are all HIGH confidence, confirmed both in project research documents and current sources.

The one domain flagged as needing deeper research is utility AI calibration — specifically how to design response curves for the consideration system so that scores across 7 diverse actions (pass, dribble, shoot, hold/shield, move-to-position, press, make-run) remain on comparable numerical scales and no single action dominates. This research resolves that question: the canonical answer is the **compensation factor** pattern (from "Building a Better Centaur: AI at Massive Scale," GDC 2015) combined with input normalization to 0..1 via response curves, and a score range audit tool built alongside the agent system from day one. The specific numerical calibration targets (goals per match, action domination cap) must be treated as initial estimates and tuned against actual match output.

The toolchain has moved forward since the initial project research: Vite is now at 7.0 (released June 2025), Vitest is at 4.x, and the `vanilla-ts` Vite template remains the correct starting point. No architectural decisions change as a result — the stack choice is robust to version increments.

**Primary recommendation:** Build the 14-step dependency sequence from ARCHITECTURE.md in order (types → physics → match state → game loop → renderer → tactical system → agent system → steering → contact → personality → fatigue → manager interface). Do not skip the observability tooling (per-agent decision log, score range audit) — they are Phase 1 work, not later additions.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENG-01 | Ball moves in 2.5D (X/Y ground position + Z height via projectile motion) | Custom ball physics: Newtonian projectile with gravity (~9.8 m/s²), rolling friction (~1-2 m/s² deceleration), Z-axis height with bounce coefficient. Shadow position = authoritative ground X/Y for collision. ~100 lines. |
| ENG-02 | Players move using steering behaviors (seek, arrive, avoid, separation) with physical attribute caps | Craig Reynolds 1999 model: `steering = desired_velocity - current_velocity`. Per-behavior: seek, arrive (with slowing radius), pursuit (of moving target), separation (neighbor avoidance). Velocity capped by `pace × (1 - fatigue_penalty)`. |
| ENG-03 | Each player agent evaluates 7 actions per tick via utility AI and selects highest-scoring | Utility AI consideration architecture: each action has N considerations (response curves returning 0..1), scores combined via product with compensation factor. `selectAction` = argmax over 7 scored actions + Gaussian noise. |
| ENG-04 | Personality vector (directness, risk_appetite, composure, creativity, work_rate, aggression, anticipation, flair) weights every action score | Personality weight matrix: each trait has defined contribution to each action type (not a scalar global multiplier). `dotProduct(weights[actionId], personality)` applied as additive term after consideration product. |
| ENG-05 | Gaussian noise added to utility scores, scaled by (1 - composure), producing realistic decision variance | `noise = gaussianNoise(0, (1 - composure) × noiseScale)`. Box-Muller transform for Gaussian from uniform random. seedrandom for reproducibility. noiseScale ~0.05-0.15 to be tuned. |
| ENG-06 | Fatigue attenuates physical attributes on a glycogen-depletion curve (gradual through 60min, steep final quarter) | Fatigue curve: `fatigue(t) = gradualRate × min(t, 60) + steepRate × max(0, t - 60)`. Applied as multiplier to pace, strength, stamina in steering force computation and utility score success_probability terms. |
| ENG-07 | Fatigue interpolates personality values toward conservative defaults (personality erosion) | `effectivePersonality[trait] = lerp(base[trait], conservativeDefault[trait], fatigue)`. Conservative defaults: low directness, low risk_appetite, high composure. Must be temporary per-match, not cumulative. |
| ENG-08 | Tackle success resolved by comparing physical/technical attributes with positional geometry modifiers | Discrete event: `tackleSuccess = random() < f(defender.strength, attacker.dribbling, angle, distance)`. Anchor-distance multiplicative penalty on tackle utility score so defenders don't abandon position. |
| ENG-09 | Shielding modeled as spatial exclusion zone scaled by strength | Shielding radius = `baseRadius × player.strength`. Ball within zone: attacker maintains possession if shielding body between ball and defender. Implemented as position constraint + exclusion zone check. |
| ENG-10 | Aerial contests resolved by Z-intercept timing with contest window | Agent reaches aerial intercept if: `canReach(player, ball.groundPos) && ball.z <= player.jumpHeight` at predicted intercept time. Contest window = ±windowDt ticks. Winner by aerial attribute comparison. |
| ENG-11 | Goals detected when ball crosses goal line below crossbar height | Goal line X coordinate check: `ball.x <= goalX && ball.z < crossbarHeight && inGoalWidth(ball.y)`. Triggers MatchEvent.Goal, updates score in SimSnapshot. |
| ENG-12 | Match statistics accumulated from agent decisions (shots, possession, passes, tackles) | Accumulate in MatchStats object per tick from ActionIntent types. Possession = ball carrier teamId. Shots = ShootIntent dispatched. Pass = PassIntent resolved. |
| ENG-13 | Match progresses through kickoff, first half, halftime, second half, full-time states | MatchPhase state machine: KICKOFF → FIRST_HALF → HALFTIME → SECOND_HALF → FULL_TIME. Driven by sim tick counter. Kickoff restart logic on goal. |
| ENG-14 | 2D top-down Canvas rendering with ball Z conveyed via sprite scaling and shadow offset | Canvas 2D API. Ball sprite scale = `1 + (z / MAX_Z) × 0.5`. Shadow drawn at ground position (ball.x, ball.y) with alpha proportional to z. Players as colored circles with direction indicator. |
| ENG-15 | Simulation runs at 30+ ticks/sec, separated from 60fps rendering | Fixed-timestep accumulator: sim at 33.33ms fixed dt. requestAnimationFrame at 60fps. Renderer interpolates with alpha. Spiral-of-death guard: cap accumulator at 200ms. |

</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (latest stable) | Primary language | Project constraint; strict typing essential for agent/physics correctness |
| Vite | 7.x (released June 2025) | Dev server, bundler, HMR | Current stable; `vanilla-ts` template is the correct starting point |
| Vitest | 4.x (current stable) | Unit + headless simulation testing | Co-located with Vite config; critical for headless agent testing |
| HTML5 Canvas 2D API | Browser native | Match rendering | Sufficient for 23 entities at 60fps; no library overhead |
| Custom physics | — | Ball 2.5D, steering integration | Narrow requirements; library would fight velocity overrides every tick |
| Custom utility AI | — | Per-agent action scoring | Personality vectors thread through every calculation; no library fits |
| Custom steering behaviors | — | Player movement | Reynolds 1999 model; 40 lines per behavior; attribute capping is trivial |
| seedrandom | 3.x | Seeded PRNG | Reproducible matches; seeded noise for composure Gaussian |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/coverage-v8 | 4.x | Test coverage | From day one — physics and agent logic must have coverage |
| zod | 3.x | Runtime type validation | Parse match config and save data safely |
| Custom Vec2 class | — | 2D vector math | 10-line implementation; gl-matrix API is awkward for 2D game logic |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom physics | Matter.js 0.19 | Matter.js solves rigid-body constraints (hinges, stacking) not needed here; fights velocity overrides every tick |
| Custom physics | Rapier (WASM) | Accurate but 2-4MB WASM bundle; overkill for 23 entities; same fight with velocity overrides |
| Custom utility AI | Yuka 1.x | Adds abstractions; personality weight matrix doesn't fit library data model cleanly |
| Canvas 2D | PixiJS 8.x | WebGL overhead unjustified at 23 entities; reach for it only if Canvas proves inadequate at 500+ entities |
| Custom steering | Any steering library | No JS library integrates with attribute-capped velocities and fatigue cleanly |

**Installation:**
```bash
npm create vite@latest fergie-time -- --template vanilla-ts
cd fergie-time
npm install -D vitest @vitest/coverage-v8 typescript
npm install seedrandom zod
npm install -D @types/seedrandom
```

**Recommended `tsconfig.json` additions:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Enable `noUncheckedIndexedAccess` from day one — agent score array indexing must be bounds-checked or undefined-access bugs hide for weeks.

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── simulation/          # Pure TS, zero DOM imports — headless-capable
│   ├── types.ts         # SimSnapshot, PlayerState, BallState, ActionType, etc.
│   ├── physics/
│   │   ├── ball.ts      # 2.5D projectile integration, friction, bounce
│   │   ├── steering.ts  # Reynolds behaviors: seek, arrive, pursuit, separation
│   │   └── contact.ts   # Tackle, shield, aerial resolution
│   ├── ai/
│   │   ├── actions.ts   # 7 action definitions + consideration functions
│   │   ├── agent.ts     # selectAction(), evaluateAction(), compensation factor
│   │   └── personality.ts # PersonalityWeightMatrix, fatigue erosion
│   ├── tactical/
│   │   └── formation.ts # TacticalContext, formation anchor computation
│   ├── match/
│   │   ├── state.ts     # MatchState, SimSnapshot production, event log
│   │   └── phases.ts    # MatchPhase state machine
│   └── engine.ts        # SimulationEngine: tick(), applyCommand()
├── renderer/
│   ├── canvas.ts        # CanvasRenderer: draw(prev, curr, alpha)
│   ├── pitch.ts         # Pitch lines, goal posts
│   └── debug.ts         # Per-agent decision overlay (click-to-inspect)
├── loop/
│   └── gameLoop.ts      # Fixed-timestep accumulator, rAF wiring
└── main.ts              # Entry point — wires engine + renderer + loop
```

### Pattern 1: Fixed-Timestep Accumulator (Gaffer on Games)

**What:** Simulation runs at fixed 33.33ms dt (~30 ticks/sec). Real elapsed time accumulates; simulation steps consume it in fixed chunks. Renderer interpolates between last two sim states using leftover fraction (alpha).

**When to use:** Always — non-negotiable for deterministic, frame-rate-independent simulation. Without this, agents decide at inconsistent intervals and physics accumulates error differently at different frame rates.

**Source:** Glenn Fiedler, "Fix Your Timestep!" (gafferongames.com) — canonical, widely verified.

```typescript
// Source: Gaffer on Games "Fix Your Timestep!" pattern
const FIXED_DT = 1000 / 30; // 33.33ms
let accumulator = 0;
let previousTime = performance.now();
let prevSnapshot: SimSnapshot;
let currSnapshot: SimSnapshot;

function gameLoop(currentTime: number): void {
  const elapsed = currentTime - previousTime;
  previousTime = currentTime;
  // Spiral-of-death guard: cap at 200ms (handles tab backgrounding)
  accumulator += Math.min(elapsed, 200);

  while (accumulator >= FIXED_DT) {
    prevSnapshot = currSnapshot;
    currSnapshot = engine.tick(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT; // 0..1
  renderer.draw(prevSnapshot, currSnapshot, alpha);
  requestAnimationFrame(gameLoop);
}
```

### Pattern 2: Immutable SimSnapshot

**What:** Each tick produces a new `SimSnapshot` value object. Previous snapshot retained. Neither mutated after creation. Renderer always has a consistent view.

**When to use:** Always — enables render interpolation, headless simulation, future replay.

```typescript
interface SimSnapshot {
  readonly tick: number;
  readonly timestamp: number;
  readonly ball: BallState;
  readonly players: readonly PlayerState[];
  readonly matchPhase: MatchPhase;
  readonly score: readonly [number, number];
  readonly events: readonly MatchEvent[];
}
```

### Pattern 3: Utility AI with Consideration Architecture + Compensation Factor

**What:** Each action has N consideration functions returning 0..1. Scores combined via product. The compensation factor corrects for the mathematical property where multiplying N values in [0,1] drives the product toward zero as N grows.

**When to use:** All 22 player agents every tick — the core emergent AI mechanism.

**Source:** "Building a Better Centaur: AI at Massive Scale" (GDC 2015). Compensation factor formula confirmed by multiple secondary sources.

**Compensation factor formula:**
```
modificationFactor = 1.0 - (1.0 / considerationCount)
makeUpValue = (1.0 - productScore) * modificationFactor
finalScore = productScore + makeUpValue * productScore
```

This pulls the product back toward its "expected" range regardless of how many considerations are multiplied.

```typescript
// Source: GDC 2015 "Building a Better Centaur" + Game AI Pro 3 Chapter 13 pattern
type ConsiderationFn = (ctx: AgentContext) => number; // returns 0..1

interface Action {
  readonly id: ActionType;
  readonly considerations: readonly ConsiderationFn[];
}

function evaluateAction(
  action: Action,
  ctx: AgentContext,
  personality: PersonalityVector,
  weights: PersonalityWeightMatrix
): number {
  const scores = action.considerations.map(c => c(ctx));

  // Product of all considerations (any zero kills the action)
  let product = scores.reduce((acc, s) => acc * s, 1.0);

  // Compensation factor: corrects product-toward-zero as N grows
  const n = action.considerations.length;
  if (n > 1) {
    const modFactor = 1.0 - (1.0 / n);
    const makeUp = (1.0 - product) * modFactor;
    product = product + makeUp * product;
  }

  // Action-specific personality contribution (not scalar — action-specific)
  const personalityBonus = dotProduct(weights[action.id], personality);

  // Gaussian noise scaled by composure
  const noise = gaussianNoise(0, (1 - personality.composure) * NOISE_SCALE);

  return product + personalityBonus + noise;
}

function selectAction(
  actions: readonly Action[],
  ctx: AgentContext,
  personality: PersonalityVector,
  weights: PersonalityWeightMatrix
): ActionType {
  let bestId = actions[0]!.id;
  let bestScore = -Infinity;
  for (const action of actions) {
    const score = evaluateAction(action, ctx, personality, weights);
    if (score > bestScore) {
      bestScore = score;
      bestId = action.id;
    }
  }
  return bestId;
}
```

### Pattern 4: Response Curve Taxonomy for Consideration Functions

**What:** Each consideration input (distance, probability, fatigue) must be mapped to 0..1 via a response curve. The curve shape encodes the behavioral intent.

**When to use:** Every consideration function — raw distances, velocities, probabilities cannot be used directly.

**Source:** Mike Lewis, Game AI Pro 3 Chapter 13 "Choosing Effective Utility-Based Considerations"; Alastair Aitchison "At-a-glance functions for modelling utility-based game AI" (verified MEDIUM confidence).

| Curve Type | Formula | Football Use Case |
|-----------|---------|------------------|
| Linear | `y = m*x + c` | Success probability (already 0..1 — pass through) |
| Logistic (sigmoid) | `y = 1/(1+e^(-k*(x-midpoint)))` | Goal distance scoring — sharp falloff beyond 25m |
| Logarithmic | `y = log(1+x)/log(1+max)` | Support distance — diminishing returns far from ball |
| Exponential decay | `y = e^(-k*x)` | Defensive pressure — rapidly drops with defender distance |
| Step | `y = x > threshold ? 1 : 0` | Hard disqualifiers (can't shoot if goalkeeper has ball) |

**Key calibration rule:** All input values must be normalized into a defined [0..1] range before the curve function. A distance consideration must know its domain max (e.g., pitch diagonal ~105m) so `normalizedDist = dist / 105`.

```typescript
// Logistic/sigmoid curve — preferred for many football considerations
// Source: Alastaira.wordpress.com utility AI curves article
function sigmoid(x: number, steepness: number, midpoint: number): number {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

// Example: "shoot" action distance consideration
// Goal threat drops sharply beyond 25m, nearly zero at 40m
function distanceToGoalConsideration(ctx: AgentContext): number {
  const dist = ctx.distanceToOpponentGoal; // meters, 0..105
  const normalized = dist / 105;
  // Sigmoid centered at 0.24 (= ~25m / 105), steep dropoff
  return 1 - sigmoid(normalized, 20, 0.24);
}
```

### Pattern 5: Action-Specific Personality Weight Matrix

**What:** Personality traits have defined, action-specific contribution weights. A `directness: 0.9` player prefers forward passes and direct runs, not necessarily long shots.

**When to use:** All personality vector application — never a scalar global multiplier.

**Why:** A scalar multiplier cannot express that `flair` boosts dribbling but not hold/shield. The weight matrix is what creates genuine "maverick" vs "metronome" differentiation from the same agent code.

```typescript
// Source: .planning/PROJECT.md + architecture research
const PERSONALITY_WEIGHTS: PersonalityWeightMatrix = {
  'pass-forward':   { directness: 0.40, risk_appetite: 0.20, creativity: 0.10 },
  'pass-safe':      { directness: -0.30, composure: 0.30, work_rate: 0.10 },
  'dribble':        { flair: 0.50, risk_appetite: 0.30, directness: 0.20 },
  'shoot':          { risk_appetite: 0.40, directness: 0.20, composure: 0.10 },
  'hold-shield':    { composure: 0.40, work_rate: 0.20, risk_appetite: -0.30 },
  'move-to-pos':    { work_rate: 0.50, anticipation: 0.30 },
  'press':          { aggression: 0.50, work_rate: 0.30, anticipation: 0.20 },
  'make-run':       { directness: 0.40, risk_appetite: 0.30, flair: 0.20 },
};

function dotProduct(weights: Partial<PersonalityVector>, p: PersonalityVector): number {
  return Object.entries(weights).reduce(
    (sum, [key, w]) => sum + (w ?? 0) * (p[key as keyof PersonalityVector] ?? 0),
    0
  );
}
```

### Pattern 6: Steering Behaviors (Reynolds Model)

**What:** Player movement via force-based steering. Each tick: compute steering force from active behavior, integrate velocity, clamp to max speed, update position.

**Source:** Craig Reynolds, "Steering Behaviors for Autonomous Characters" (1999) — www.red3d.com/cwr/steer/ — HIGH confidence, decades-proven.

```typescript
// Source: Craig Reynolds 1999 steering model
function seek(position: Vec2, target: Vec2, maxSpeed: number): Vec2 {
  const desired = target.subtract(position).normalize().scale(maxSpeed);
  return desired; // caller subtracts current velocity to get steering force
}

function arrive(position: Vec2, target: Vec2, maxSpeed: number, slowingRadius: number): Vec2 {
  const toTarget = target.subtract(position);
  const dist = toTarget.length();
  if (dist < 0.01) return Vec2.zero();
  const speed = dist < slowingRadius ? maxSpeed * (dist / slowingRadius) : maxSpeed;
  return toTarget.normalize().scale(speed);
}

function separation(position: Vec2, neighbors: Vec2[], radius: number): Vec2 {
  let force = Vec2.zero();
  for (const n of neighbors) {
    const diff = position.subtract(n);
    const dist = diff.length();
    if (dist < radius && dist > 0) {
      force = force.add(diff.normalize().scale(1 / dist));
    }
  }
  return force;
}

function pursuit(position: Vec2, target: Vec2, targetVelocity: Vec2, maxSpeed: number): Vec2 {
  // Look-ahead proportional to distance
  const lookAhead = position.distanceTo(target) / maxSpeed;
  const futurePos = target.add(targetVelocity.scale(lookAhead));
  return seek(position, futurePos, maxSpeed);
}
```

### Pattern 7: 2.5D Ball Physics

**What:** Ball has X/Y ground position, Z height, and corresponding velocities (vx, vy, vz). Gravity pulls Z down each tick. Ground friction decelerates XY. Bounce on Z hitting ground.

```typescript
const GRAVITY = 9.8;      // m/s²
const GROUND_FRICTION = 0.985; // multiply XY velocity per tick (approx 1-2 m/s² decel)
const BOUNCE_COEFFICIENT = 0.55; // realistic grass/turf bounce

function integrateBall(ball: BallState, dt: number): BallState {
  const dtSec = dt / 1000;

  // Update Z (height)
  let vz = ball.vz - GRAVITY * dtSec;
  let z = ball.z + ball.vz * dtSec;

  if (z <= 0) {
    z = 0;
    vz = -vz * BOUNCE_COEFFICIENT; // bounce
    if (Math.abs(vz) < 0.1) vz = 0; // settle
  }

  // Update XY with friction (only when on ground)
  const frictionThisFrame = z === 0 ? GROUND_FRICTION : 1.0;
  const vx = ball.velocity.x * frictionThisFrame;
  const vy = ball.velocity.y * frictionThisFrame;

  return {
    ...ball,
    position: ball.position.add(new Vec2(vx, vy).scale(dtSec)),
    velocity: new Vec2(vx, vy),
    z,
    vz,
  };
}
```

**CCD for ball-player collision** — sweep ball trajectory each tick before integration:

```typescript
// Check if ball swept past player center during this tick
function continuousCollisionCheck(
  ballPos: Vec2, ballVel: Vec2, playerPos: Vec2, dt: number, playerRadius: number
): boolean {
  // Parametric: does ball path segment intersect player circle?
  const move = ballVel.scale(dt / 1000);
  const d = playerPos.subtract(ballPos);
  const a = move.dot(move);
  const b = 2 * d.dot(move);
  const c = d.dot(d) - playerRadius * playerRadius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return false;
  const t = (-b - Math.sqrt(discriminant)) / (2 * a);
  return t >= 0 && t <= 1;
}
```

### Pattern 8: Score Range Audit Tool (Built Alongside Agent System)

**What:** Every tick, log action scores for every agent. After a full match, report: which action dominated (% of ticks), score distribution per action.

**When to use:** Build this in Phase 1 before the first playable match. It is the primary calibration feedback mechanism.

**Why:** Utility score degeneracy is invisible to unit tests — only observable from watching match behavior or from score distribution data.

```typescript
interface AgentDecisionLog {
  tick: number;
  agentId: string;
  scores: Array<{ action: ActionType; score: number }>;
  selected: ActionType;
}

// Ring buffer: last 300 ticks per agent (10 seconds at 30fps)
const decisionLog: Map<string, AgentDecisionLog[]> = new Map();

// After full match: report action selection frequency per role group
function auditScoreRanges(log: AgentDecisionLog[]): ScoreAuditReport {
  const freq: Record<ActionType, number> = {} as any;
  for (const entry of log) {
    freq[entry.selected] = (freq[entry.selected] ?? 0) + 1;
  }
  const total = log.length;
  return Object.fromEntries(
    Object.entries(freq).map(([action, count]) => [action, count / total])
  );
  // RED FLAG: any action > 0.40 of ticks is degenerate
  // RED FLAG: any action < 0.05 of ticks (by role group) is miscalibrated or useless
}
```

### Anti-Patterns to Avoid

- **Variable timestep:** Passing real elapsed time to simulation. Agents evaluate at inconsistent intervals; physics is frame-rate dependent; replay is impossible.
- **Renderer reading simulation internals:** Any Canvas code that calls into the engine beyond reading `SimSnapshot`. Creates bidirectional coupling; blocks web worker migration.
- **Agent actions mutating world state directly:** Produces order-dependent behavior. All agents produce `ActionIntent` objects; a separate integration step applies them simultaneously.
- **Scalar personality application:** `score *= player.personality.overall_modifier`. Cannot express that a player with high `flair` dribbles differently but doesn't necessarily shoot more. Use the weight matrix.
- **Missing anchor-distance penalty on ball-approaching actions:** Without a multiplicative penalty based on distance from formation anchor, all players swarm the ball. The penalty must be multiplicative (not additive) so it suppresses ball-approach scores significantly for out-of-position agents.
- **Starting without observability tooling:** Building the agent system without the decision log ring buffer and click-to-inspect tool. When something weird happens, there is no structured way to understand why.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded random number generation | Custom LCG or Math.random() | seedrandom 3.x | Math.random() is not seedable; reproducible matches require a seeded PRNG. seedrandom is small, well-maintained, proven. |
| Runtime type validation for match config | Ad-hoc typeof checks | zod 3.x | Save/load data from localStorage can be malformed. zod parse failures are safe and descriptive. |
| Box-Muller Gaussian generator | — | 10-line implementation (no library needed) | Gaussian noise from two uniform samples. Simple, no dependency needed. |

**Key insight:** For this domain, "don't hand-roll" mostly means "don't import a general library when 50 lines of custom code fits better." The custom implementations (physics, steering, AI) are the right choice — not because libraries are bad, but because no library fits the narrow, specific requirements of this simulation.

---

## Common Pitfalls

### Pitfall 1: Utility Score Degeneracy (One Action Always Wins)

**What goes wrong:** A single action (typically `pass-safe` or `hold-shield`) dominates across all game states. The match produces no shots. All 22 agents pass sideways forever.

**Why it happens:** Score formulas are calibrated in isolation. The `pass` consideration product may range 0..0.9 while `shoot` consideration product ranges 0..0.5. The ranges, not the logic, determine the winner. The compensation factor helps but does not eliminate the need for range-comparable consideration functions.

**How to avoid:**
1. Build the score range audit tool before the first playable match — flag any action > 40% selection frequency
2. Normalize ALL raw inputs to [0..1] before response curves
3. Test each consideration function's output range against realistic input distributions before integration
4. Use hard disqualifiers (score 0) for physically impossible actions — they cost nothing and prevent noise from enabling invalid actions

**Warning signs:** Shot counts < 2 or > 30 per match; changing `directness` from 0.1 to 1.0 produces no visible match difference; agents always perform the same animation.

### Pitfall 2: Ball Clustering (All Players Swarm the Ball)

**What goes wrong:** All outfield players cluster within 20-30m of the ball regardless of formation. 4-3-3 and 4-5-1 look identical.

**How to avoid:**
1. Formation anchor distance penalty is **multiplicative**, not additive: `ballApproachScore *= anchorProximityFactor` where factor approaches 0 as distance from anchor grows
2. Action availability masks: `press` action consideration returns 0 immediately if agent is > X meters from their defensive zone
3. Build a spatial heat map early — if average teammate separation collapses below 15m, clustering is occurring

### Pitfall 3: Physics Perceptually Wrong

**What goes wrong:** Ball slides forever, headers at ground level, ball teleports through players.

**How to avoid:**
1. CCD for ball-player interactions (see Pattern 7 code above)
2. Shadow position is authoritative ground X/Y for all aerial collision checks — agent's `canInterceptAerial` check uses `ball.z <= agent.jumpHeight`
3. Validate by eye test before attaching any AI: kick ball diagonally across pitch, should decelerate and stop in ~3 seconds

### Pitfall 4: Performance Collapse at 22 Agents

**What goes wrong:** Frame rate collapses when all agents active. GC hitches every 500ms.

**How to avoid:**
1. Pre-allocate score arrays at startup: `const scoreBuffer = new Float32Array(7)` per agent, reset each tick. Zero object allocation in hot path.
2. Spatial grid from the start: divide pitch into ~12×8 cells. Agent neighbor lookup is O(1), not O(n²).
3. Profile at full 22-agent count in Phase 1 before building the tactical system on top.
4. Round all Canvas `drawImage` coordinates to integers (`Math.floor`) — avoids sub-pixel rendering overhead.

**Performance budget:** 22 agents × 7 actions × N considerations per tick. At 30 ticks/sec, this is 22×7×4 = 616 consideration evaluations/sec. Should complete in < 2ms. Total sim tick budget: 33ms. Render budget: 16ms (60fps). Both are achievable on main thread; Web Worker migration deferred until profiling indicates need.

### Pitfall 5: Emergent Behavior Debugging Black Box

**What goes wrong:** Striker stands still for 20 seconds. No structured way to understand why.

**How to avoid:**
1. Per-agent decision log ring buffer (last 300 ticks per agent) — built alongside agent system, not after
2. Click-to-inspect debug overlay on Canvas — click agent, see top 3 scored actions and their scores
3. Match statistics dashboard overlay (toggle-able) — shots, possession, action frequency bars

### Pitfall 6: Gaussian Noise Scale Miscalibration

**What goes wrong:** `noiseScale` too large → even high-composure players (0.9) behave erratically. Too small → low-composure players (0.2) feel robotic.

**How to avoid:** Calibrate `noiseScale` so composure-1.0 player has < 5% action selection variance in identical situations; composure-0.2 player has > 30% variance. Test quantitatively with fixed seeds before tuning other personality attributes.

---

## Code Examples

Verified patterns from official and high-confidence sources:

### Fixed-Timestep Game Loop (Gaffer on Games)

```typescript
// Source: Glenn Fiedler "Fix Your Timestep!" — gafferongames.com
const FIXED_DT_MS = 1000 / 30; // 33.33ms

function startGameLoop(engine: SimulationEngine, renderer: CanvasRenderer): void {
  let prevTime = performance.now();
  let accumulator = 0;
  let prevSnap = engine.getCurrentSnapshot();
  let currSnap = prevSnap;

  function loop(now: number): void {
    const elapsed = Math.min(now - prevTime, 200); // cap: spiral-of-death guard
    prevTime = now;
    accumulator += elapsed;

    while (accumulator >= FIXED_DT_MS) {
      prevSnap = currSnap;
      currSnap = engine.tick(FIXED_DT_MS);
      accumulator -= FIXED_DT_MS;
    }

    renderer.draw(prevSnap, currSnap, accumulator / FIXED_DT_MS);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}
```

### Minimal Vec2 Implementation

```typescript
// Source: .planning/research/STACK.md — custom recommendation
class Vec2 {
  constructor(public readonly x: number, public readonly y: number) {}
  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  subtract(v: Vec2): Vec2 { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize(): Vec2 {
    const l = this.length();
    return l > 0.001 ? this.scale(1 / l) : Vec2.zero();
  }
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  distanceTo(v: Vec2): number { return this.subtract(v).length(); }
  static zero(): Vec2 { return new Vec2(0, 0); }
}
```

### Ball Z-Height Rendering

```typescript
// Source: ENG-14 requirement + .planning/research/STACK.md pattern
function drawBall(ctx: CanvasRenderingContext2D, ball: BallState, toPx: (v: Vec2) => Vec2): void {
  const groundPx = toPx(ball.position);
  const heightFactor = ball.z / MAX_BALL_Z; // 0..1

  // Draw shadow at ground position, opacity scales with height
  ctx.globalAlpha = 0.4 * (1 - heightFactor * 0.7);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(groundPx.x, groundPx.y, BALL_RADIUS_PX * 1.2, BALL_RADIUS_PX * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw ball at ground position (top-down), scale with height
  const scale = 1 + heightFactor * 0.5;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(
    Math.floor(groundPx.x),
    Math.floor(groundPx.y),
    Math.floor(BALL_RADIUS_PX * scale),
    0, Math.PI * 2
  );
  ctx.fill();
}
```

### Gaussian Noise (Box-Muller Transform)

```typescript
// Source: Standard numerical methods — Box-Muller transform
function gaussianNoise(mean: number, stdDev: number, rng: () => number): number {
  // Box-Muller: two uniform samples → one Gaussian sample
  const u1 = Math.max(rng(), 1e-10); // avoid log(0)
  const u2 = rng();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z0 * stdDev;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vite 5.x as latest | Vite 7.0 (current stable) | June 2025 | Node 20.19+ required; drops Node 18. Browser target now `baseline-widely-available` (Chrome 107+). `vanilla-ts` template still correct. |
| Vitest 1.x | Vitest 4.x (current stable) | 2025 | Vitest 3+ required for Vite 6+. Vitest 4 is compatible with Vite 7. Inline workspace config available. No architecture impact. |
| Vite 6 as latest | Vite 7.0 | June 2025 | The initial project research was done when Vite 5 was current. Update install commands to use `@latest`. |

**Deprecated/outdated from initial project research:**
- Vite 5.x and Vitest 1.x version pins: Use `@latest` at install time to get Vite 7 / Vitest 4. The architectural patterns are unchanged; only version numbers differ.
- `npm create vite@latest` with `vanilla-ts` still correct — confirmed current.

---

## Open Questions

1. **Exact `noiseScale` value for composure Gaussian**
   - What we know: noise = `gaussianNoise(0, (1 - composure) * noiseScale)`. At composure=1.0, noise=0. At composure=0.2, noise = `0.8 * noiseScale`.
   - What's unclear: What `noiseScale` constant produces the desired behavioral variance (< 5% action variance for composure=1.0, > 30% for composure=0.2)?
   - Recommendation: Start with `noiseScale = 0.08`. Profile action selection variance with fixed seeds across composure quintiles. Adjust before moving to personality system.

2. **Formation anchor penalty curve shape**
   - What we know: The penalty must be multiplicative on ball-approaching actions. A defender 60m from anchor should be heavily penalized.
   - What's unclear: Should it be linear, exponential, or step-based? At what distance does penalty become effectively blocking?
   - Recommendation: Start with exponential decay: `anchorPenalty = e^(-k * distFromAnchor)` where `k` is tuned so penalty is 0.5 at 30m from anchor, 0.1 at 50m. Adjust based on spatial heat map review.

3. **7 action definitions and their consideration sets**
   - What we know: Actions are pass-forward, pass-safe, dribble, shoot, hold/shield, move-to-position, press, make-run (the requirements say 7 but 8 appear meaningful — consolidate pass or split press/intercept).
   - What's unclear: The exact set of considerations per action. How many considerations per action before compensation factor overhead creates calibration problems?
   - Recommendation: Start with 3-4 considerations per action maximum. More considerations = more calibration complexity. Add considerations only when existing ones fail to produce desired behavior.

4. **Fatigue curve constants**
   - What we know: Gradual depletion through 60 minutes, steeper in final quarter. Attenuates physical attributes and personality.
   - What's unclear: The exact rate constants. At what fatigue level does visible behavioral change occur?
   - Recommendation: Start with linear rates: `fatigue = min(tick, 1800) * 0.00015 + max(0, tick - 1800) * 0.0003` (in ticks at 30/sec, match = 5400 ticks). Tune until second-half slowdown is visually obvious in speed comparison.

5. **Contact resolution model for Phase 1**
   - What we know: Tackles (ENG-08), shielding (ENG-09), aerials (ENG-10) are all Phase 1 requirements.
   - What's unclear: How much foul detection logic is needed for Phase 1? Is referee simulation required or just possession-change logic?
   - Recommendation: Phase 1 needs possession change (tackle wins ball) and shielding exclusion zone. Fouls can be detected (flag MatchEvent.Foul) but complex referee simulation (free kicks, cards) can be simplified to restart logic only.

---

## Sources

### Primary (HIGH confidence)

- `.planning/research/SUMMARY.md` — project research synthesis; all four research files
- `.planning/research/STACK.md` — technology stack analysis
- `.planning/research/ARCHITECTURE.md` — architectural patterns, build order, data flow
- `.planning/research/PITFALLS.md` — calibration pitfalls, degeneracy documentation
- `.planning/PROJECT.md` — project design brief, constraints, requirements
- Craig Reynolds, "Steering Behaviors for Autonomous Characters" (1999) — www.red3d.com/cwr/steer/ — canonical steering behavior reference
- Glenn Fiedler, "Fix Your Timestep!" (gafferongames.com) — canonical fixed-timestep accumulator

### Secondary (MEDIUM confidence)

- "Building a Better Centaur: AI at Massive Scale" (GDC 2015, Dave Mark) — compensation factor formula. Verified via multiple secondary sources including utilityworlds.com documentation and mcguirev10.com article. Exact formula extracted from WebSearch cross-reference.
- Game AI Pro 3 Chapter 13, Mike Lewis "Choosing Effective Utility-Based Considerations" — response curve taxonomy (PDF could not be fetched directly; confirmed via WebSearch summary)
- Alastair Aitchison, "At-a-glance functions for modelling utility-based game AI" — curve types (linear, logistic, exponential, logarithmic, step) for utility AI — verified by WebFetch
- shaggydev.com "An introduction to Utility AI" — consideration multiplication, hard disqualifier pattern — verified by WebFetch
- vite.dev/blog/announcing-vite7 — Vite 7.0 confirmed released June 2025, Node 20.19+ required — verified by WebFetch
- vitest.dev/blog/vitest-3 — Vitest current stable is 4.x — verified by WebFetch

### Tertiary (LOW confidence / training data)

- RoboCup research literature — ball clustering pathology in multi-agent football simulations
- V8 allocation documentation — GC pressure patterns from object allocation per tick

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` — this section is skipped per instructions.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Vite 7 / Vitest 4 confirmed via official sources. Custom physics, steering, utility AI are project-established decisions with strong architectural rationale.
- Architecture: HIGH — Fixed-timestep accumulator, immutable snapshots, sim/render separation are canonical patterns from authoritative sources.
- Utility AI calibration: MEDIUM — Compensation factor formula confirmed. Response curve taxonomy confirmed. Specific numerical thresholds (noiseScale, anchorPenalty k-values, fatigue rates) are informed starting estimates requiring empirical tuning.
- Pitfalls: HIGH — Score degeneracy, ball clustering, physics tunneling are well-documented across multiple sources. Quantitative thresholds are estimates.

**Research date:** 2026-03-02
**Valid until:** 2026-04-02 (stable architectural domain; toolchain version check recommended before planning if > 30 days)

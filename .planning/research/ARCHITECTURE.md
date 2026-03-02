# Architecture Patterns

**Domain:** Browser-based 2D football simulation with autonomous AI agents
**Researched:** 2026-03-02
**Confidence:** HIGH (fixed timestep, ECS, simulation/render separation are canonical patterns); MEDIUM (utility AI agent loop specifics, tactical system structure — well-documented but application to football is extrapolated from general game AI literature)

---

## Recommended Architecture

The system decomposes into five distinct layers. Information flows strictly downward: Simulation writes state, Renderer reads it, UI reads it. No layer reaches upward.

```
┌─────────────────────────────────────────────────────────┐
│                    MANAGER INTERFACE                     │
│  Tactics Board | Squad Screen | Season | Training       │
└────────────────────────┬────────────────────────────────┘
                         │ Commands (formation, subs, roles)
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   GAME LOOP COORDINATOR                  │
│  Fixed-timestep accumulator — owns the clock            │
│  Dispatches: simulate(dt) | render(alpha) | ui events   │
└───────────┬─────────────────────────┬───────────────────┘
            │                         │
            ▼                         ▼
┌───────────────────────┐  ┌─────────────────────────────┐
│   SIMULATION ENGINE   │  │       CANVAS RENDERER        │
│  (headless, pure TS)  │  │  (reads SimState, no logic) │
│                       │  │                             │
│  ┌─────────────────┐  │  │  pitch, players, ball,      │
│  │  Physics World  │  │  │  shadows, UI overlays        │
│  │  ball, forces,  │  │  │                             │
│  │  collisions     │  │  │  Interpolates between       │
│  └────────┬────────┘  │  │  prev/curr state via alpha  │
│           │           │  └─────────────────────────────┘
│  ┌────────▼────────┐  │
│  │  Agent System   │  │
│  │  22× Utility AI │  │
│  │  evaluators     │  │
│  └────────┬────────┘  │
│           │           │
│  ┌────────▼────────┐  │
│  │ Tactical System │  │
│  │ formation anchors│ │
│  │ role assignments │ │
│  └────────┬────────┘  │
│           │           │
│  ┌────────▼────────┐  │
│  │   Match State   │  │
│  │  SimSnapshot[]  │  │
│  └───────────────--┘  │
└───────────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Inputs | Outputs | Must NOT |
|-----------|---------------|--------|---------|----------|
| **Game Loop** | Clock, frame pacing, accumulator | `performance.now()`, user events | `simulate(dt)` calls, `render(alpha)` calls | Hold game state |
| **Physics World** | Ball trajectory (2.5D), player position integration, collision detection | Agent move intentions, ball kick forces | Updated positions, contact events | Know about tactics or AI |
| **Agent System** | Per-player utility AI evaluation, action selection | World state snapshot, player personality/attributes, tactical context | Action intentions (move target, kick intent, tackle intent) | Move entities directly |
| **Tactical System** | Formation anchor computation, role context, team shape analysis | Formation config, current player positions | Per-player tactical context (anchor, role, nearby threats) | Evaluate individual decisions |
| **Match State** | Authoritative game state, event log | Physics/AI outputs | SimSnapshot (immutable read view), match events | Be mutated from outside engine |
| **Canvas Renderer** | Visual representation | Current + previous SimSnapshot, alpha | Drawn frame | Contain any game logic |
| **Manager Interface** | User input for squad/tactics/training | User gestures, clicks | Commands to simulation (formation changes, substitutions) | Read internal simulation state directly |

---

## Data Flow

### Per-Tick Simulation Flow (fixed ~30Hz)

```
1. ACCUMULATOR fires simulate(dt=33ms)
   │
   ▼
2. TACTICAL SYSTEM computes formation anchors
   - For each player: anchor = f(formation, role, ball position, phase of play)
   - Outputs: TacticalContext per player
   │
   ▼
3. AGENT SYSTEM evaluates each of 22 players
   - Build WorldPercept from SimSnapshot (nearby players, ball, space)
   - Score each action:
       score(action) = base_utility(action, percept)
                     × personality_weights
                     + gaussian_noise(σ=1-composure)
   - Select max-scoring action
   - Outputs: ActionIntent[] (one per player)
   │
   ▼
4. PHYSICS WORLD integrates intentions
   - Apply steering forces (arrive, pursue, evade, separation)
   - Clamp velocity by physical attributes × fatigue
   - Ball: projectile motion for Z, friction for XY, spin
   - Resolve contacts (tackles, shielding, aerial)
   - Outputs: Updated positions, ball state, contact events
   │
   ▼
5. MATCH STATE updates
   - Write new SimSnapshot (immutable)
   - Append match events (goal, foul, out of play)
   - Retain previous snapshot for render interpolation
   │
   ▼
6. RENDERER reads (next rAF, independent of tick rate)
   - Interpolate: display_pos = lerp(prev.pos, curr.pos, alpha)
   - Draw pitch, shadows, players, ball, overlays
```

### Render Flow (60fps via requestAnimationFrame)

```
rAF fires
  │
  ▼
Compute alpha = accumulatedTime / fixedDt  (0..1)
  │
  ▼
Renderer reads (prevSnapshot, currSnapshot, alpha)
  │
  ▼
For each entity: lerpPosition(prev, curr, alpha)
  │
  ▼
Canvas drawCalls: pitch → shadows → players → ball → UI overlays
```

### Command Flow (User → Simulation)

```
User drags player on tactics board
  │
  ▼
Manager Interface builds FormationCommand
  │
  ▼
Command Queue (simple array, consumed at tick start)
  │
  ▼
Tactical System applies updated formation anchors next tick
```

---

## Patterns to Follow

### Pattern 1: Fixed-Timestep Accumulator (Gaffer on Games)

**What:** Simulation runs at a fixed dt (e.g. 33ms = ~30Hz). Real time accumulates; simulation steps consume it in fixed chunks. Render interpolates between last two simulation states using the leftover fraction (alpha).

**When:** Always — this is non-negotiable for deterministic, frame-rate-independent simulation.

**Why:** Without fixed timestep, simulation behavior varies with frame rate. Agents make decisions at inconsistent intervals. Physics becomes unstable at high frame rates.

```typescript
// Game loop core
const FIXED_DT = 1000 / 30; // 33.33ms per tick
let accumulator = 0;
let previousTime = performance.now();
let prevSnapshot: SimSnapshot;
let currSnapshot: SimSnapshot;

function gameLoop(currentTime: number) {
  const elapsed = currentTime - previousTime;
  previousTime = currentTime;
  accumulator += Math.min(elapsed, 200); // spiral of death guard: cap at 200ms

  while (accumulator >= FIXED_DT) {
    prevSnapshot = currSnapshot;
    currSnapshot = simulationEngine.tick(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  const alpha = accumulator / FIXED_DT;
  renderer.draw(prevSnapshot, currSnapshot, alpha);

  requestAnimationFrame(gameLoop);
}
```

**Key rule:** Cap accumulated time at ~200ms. If the tab goes to background and returns, you do not want hundreds of simulation steps firing at once (spiral of death).

---

### Pattern 2: Immutable Simulation Snapshots

**What:** Each tick produces a new `SimSnapshot` value object. The previous snapshot is retained. Neither is mutated after creation.

**When:** Always — this is what enables render interpolation, replay, and headless simulation.

**Why:** Mutable shared state between sim and renderer leads to rendering half-updated state (tearing). Immutable snapshots mean the renderer always has a consistent view.

```typescript
interface SimSnapshot {
  readonly tick: number;
  readonly timestamp: number;
  readonly ball: BallState;
  readonly players: readonly PlayerState[];
  readonly matchPhase: MatchPhase;
  readonly score: [number, number];
  readonly events: readonly MatchEvent[]; // events since last tick
}

interface PlayerState {
  readonly id: PlayerId;
  readonly teamId: TeamId;
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly facingAngle: number;
  readonly hasBall: boolean;
  readonly fatigue: number;   // 0..1
  readonly lastAction: ActionType;
}
```

---

### Pattern 3: Utility AI with Consideration Architecture

**What:** Each agent has a fixed set of actions. Each action has a set of considerations (input curves). The action score is the weighted product/sum of consideration scores, multiplied by personality weights.

**When:** For all 22 player agents — this is the core emergent AI mechanism.

**Why:** Utility AI scales better than behavior trees for this use case. Adding a new action or consideration does not restructure a tree. Personality is a natural multiplicative weight. Emergent behavior arises from the interaction of scores.

```typescript
type ConsiderationFn = (context: AgentContext) => number; // 0..1

interface Action {
  id: ActionType;
  considerations: ConsiderationFn[];
  combine: 'product' | 'sum' | 'weighted-sum';
}

function evaluateAction(
  action: Action,
  context: AgentContext,
  personality: PersonalityVector
): number {
  const rawScores = action.considerations.map(c => c(context));

  let baseScore: number;
  if (action.combine === 'product') {
    // Product: any zero consideration kills the action
    baseScore = rawScores.reduce((acc, s) => acc * s, 1.0);
  } else {
    baseScore = rawScores.reduce((acc, s) => acc + s, 0) / rawScores.length;
  }

  // Apply personality weights (personality is WHO the player IS)
  const personalityMod = applyPersonalityWeights(action.id, personality);

  // Gaussian noise scaled by composure (tired/anxious players decide less clearly)
  const noise = gaussianNoise(0, (1 - personality.composure) * 0.1);

  return baseScore * personalityMod + noise;
}

function selectAction(
  actions: Action[],
  context: AgentContext,
  personality: PersonalityVector
): ActionType {
  const scores = actions.map(a => ({
    id: a.id,
    score: evaluateAction(a, context, personality)
  }));
  return scores.reduce((best, s) => s.score > best.score ? s : best).id;
}
```

**Critical implementation note:** The consideration functions must return values on comparable scales (0..1 normalized). Raw distances, velocities, etc. need input curves (linear ramps, S-curves) to map them to 0..1. This is where tuning lives.

---

### Pattern 4: Steering Behaviors for Movement

**What:** Player movement is handled by steering forces (arrive, pursue, evade, seek, separation) that combine into a net force, then integrate with Euler integration.

**When:** For all player movement — this replaces direct position assignment with physically plausible locomotion.

**Why:** Direct position teleporting breaks the emergent quality. Steering behaviors give natural acceleration, deceleration, collision avoidance, and group dynamics without scripting them.

```typescript
function computeSteeringForce(
  player: PlayerState,
  intent: MoveIntent,
  nearby: PlayerState[],
  attributes: PhysicalAttributes,
  fatigue: number
): Vec2 {
  const maxSpeed = attributes.pace * (1 - fatigue * 0.4); // fatigue slows players
  const maxForce = attributes.strength * 0.5;

  let steering = Vec2.zero();

  // Primary: arrive at tactical target with slow-down radius
  steering = steering.add(arrive(player.position, intent.target, maxSpeed));

  // Separation: avoid overlapping teammates
  steering = steering.add(separation(player.position, nearby, 2.0)); // 2m radius

  // Clamp to physical limits
  return steering.clamp(maxForce);
}
```

---

### Pattern 5: Tactical System as Context Provider

**What:** The tactical system does not make decisions — it provides context that informs agent decisions. It computes formation anchors, identifies the current phase of play (buildup, transition, defensive shape), and assigns role-specific context per player.

**When:** At the start of each tick, before agent evaluation.

**Why:** Separating tactical intelligence from individual decision-making is critical. The agent decides HOW to execute (which specific action to take). The tactical system provides WHAT is tactically appropriate (where to be, what your role demands). This separation lets you tune tactics without rewriting agents.

```typescript
interface TacticalContext {
  formationAnchor: Vec2;       // where this player should be positionally
  roleInstruction: RoleInstruction; // press high / sit deep / make runs / etc.
  phaseOfPlay: PhaseOfPlay;    // attacking / defensive / transition
  teamShape: TeamShape;        // compact / stretched / balanced
  nearestOpponent: PlayerState | null;
  ballZone: PitchZone;
}

function computeTacticalContext(
  player: PlayerState,
  formation: Formation,
  worldState: SimSnapshot,
  teamInstructions: TeamInstructions
): TacticalContext {
  const phase = detectPhaseOfPlay(worldState);
  const anchor = computeFormationAnchor(
    player.role,
    formation,
    worldState.ball.position,
    phase,
    teamInstructions
  );
  // ... role instruction from per-player settings
  return { formationAnchor: anchor, phaseOfPlay: phase, ... };
}
```

---

### Pattern 6: Separation of Simulation and Renderer

**What:** The simulation engine is a pure TypeScript module with no DOM or Canvas dependencies. The renderer is a separate module that reads `SimSnapshot` objects and draws to Canvas. They share only the snapshot interface.

**When:** From the first line of code — retrofit is painful.

**Why:** Enables headless simulation (run a full season without rendering), enables testing the engine in Node.js, enables swapping the renderer, enables future web worker execution of the simulation.

```typescript
// simulation/index.ts — no DOM imports, ever
export class SimulationEngine {
  tick(dt: number): SimSnapshot { ... }
  applyCommand(cmd: SimCommand): void { ... }
}

// renderer/CanvasRenderer.ts — all Canvas code lives here
export class CanvasRenderer {
  draw(prev: SimSnapshot, curr: SimSnapshot, alpha: number): void { ... }
}

// main.ts — wires them together
const engine = new SimulationEngine(matchConfig);
const renderer = new CanvasRenderer(canvas);
gameLoop(engine, renderer);
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Variable Timestep Simulation

**What:** Passing the actual elapsed frame time directly to the physics/AI update.

**Why bad:** At 30fps, `dt=33ms`. At 60fps, `dt=16ms`. Agents evaluate twice as often at 60fps, changing their behavior. Physics integration accumulates error differently. Simulation is non-deterministic and frame-rate dependent. Replay becomes impossible.

**Instead:** Fixed timestep accumulator. Render interpolation for smooth visuals at any frame rate.

---

### Anti-Pattern 2: Renderer Calling into Simulation Logic

**What:** Canvas draw code that computes positions, checks game rules, or queries agent state beyond what is in the snapshot.

**Why bad:** Creates bidirectional coupling. Renderer now has side effects on simulation. Moving to a web worker becomes impossible. Testing breaks.

**Instead:** Everything the renderer needs must be in `SimSnapshot`. If the renderer needs something, add it to the snapshot interface, not a call into the engine.

---

### Anti-Pattern 3: Agent Actions Mutating World State Directly

**What:** An agent's `decide()` function directly mutates player positions, ball state, or game score.

**Why bad:** Agent decisions run in sequence for 22 players. If agent #1 moves the ball, agent #2 evaluates with a ball position that is already half-resolved. Order dependency creates chaotic, order-sensitive behavior.

**Instead:** Agents produce `ActionIntent` objects. A separate integration step applies all intents to physics simultaneously, then produces the new snapshot.

---

### Anti-Pattern 4: God Object Match Manager

**What:** A single class that owns physics, AI, tactics, state, rendering, and UI event handling.

**Why bad:** Impossible to test individual components. Adding features requires understanding the whole system. No clear place to put new functionality.

**Instead:** Separate modules with explicit interfaces. The game loop coordinator is a thin wiring layer, not a logic container.

---

### Anti-Pattern 5: Scalar Personality Application

**What:** Applying personality as a single global multiplier to all action scores.

**Why bad:** A single multiplier cannot express that a player with high `directness` prefers forward passes but not necessarily long shots. Personality must be action-specific to create genuine archetypes.

**Instead:** A personality weight matrix — each personality trait has a defined contribution to each action type. This is what creates genuine "maverick" vs "metronome" differentiation from the same agent code.

```typescript
// BAD: scalar personality
score *= player.personality.overall_modifier;

// GOOD: action-specific personality weights
const weights: PersonalityWeightMatrix = {
  'pass-forward':  { directness: +0.4, risk_appetite: +0.2, creativity: +0.1 },
  'dribble':       { flair: +0.5, risk_appetite: +0.3, directness: +0.2 },
  'hold-position': { composure: +0.3, work_rate: -0.1, risk_appetite: -0.2 },
  // ...
};
score += dotProduct(weights[action.id], player.personality);
```

---

### Anti-Pattern 6: Synchronous Full-Team AI in One Frame

**What:** Running all 22 agents' full utility evaluation synchronously in a single rAF frame alongside rendering.

**Why bad:** On slow machines or complex situations, this can exceed 16ms, causing frame drops. Even if fast normally, it creates unpredictable frame timing.

**Instead:** The fixed-timestep pattern naturally decouples simulation from rendering. If simulation performance becomes a bottleneck (unlikely at 22 agents), move the simulation to a Web Worker with snapshot messages posted back via `postMessage`.

---

## Scalability Considerations

| Concern | At v1 (main thread) | If performance issues arise | Future |
|---------|--------------------|-----------------------------|--------|
| AI evaluation (22 agents × 30Hz) | Main thread fine (~2-5ms) | Move engine to Web Worker | Multiple matches parallel |
| Physics (22 bodies + ball) | Main thread fine | Optimize with spatial grid | No change needed |
| Rendering (Canvas 2D) | 60fps achievable | Canvas layers / dirty rects | OffscreenCanvas in worker |
| State history (replay) | Snapshot array, cap at N | Cap + compress | IndexedDB persistence |
| Match simulation (headless season) | Loop without rAF | Already headless if separated | Node.js server-side |

---

## Suggested Build Order (Dependency Sequence)

This order respects component dependencies and allows testing each layer before building on top of it.

```
1. Core Types & SimSnapshot interface
   → Defines the contract everything else adheres to
   → No dependencies

2. Physics World (ball + player position integration)
   → Can be tested with dummy inputs
   → Depends on: Core Types

3. Match State (snapshot production, event log)
   → Depends on: Core Types, Physics World

4. Game Loop (fixed-timestep accumulator)
   → Wire physics and state, no AI yet
   → Milestone: ball bounces around pitch realistically

5. Canvas Renderer (reads snapshots)
   → Depends on: Core Types, Game Loop
   → Milestone: can see the ball moving

6. Tactical System (formation anchors, phase detection)
   → Depends on: Core Types, Match State
   → No dependency on Agent System

7. Agent System (utility AI evaluator)
   → Depends on: Core Types, Tactical System, Physics World
   → Milestone: players move to positions and chase ball

8. Steering Behaviors (within Agent System or Physics)
   → Depends on: Physics World, Agent System
   → Milestone: natural-looking player movement

9. Contact Resolution (tackles, shielding, aerials)
   → Depends on: Physics World, Agent System
   → Milestone: possession changes realistically

10. Personality Vector System
    → Layered on top of Agent System
    → Milestone: same code, different player characters visible

11. Fatigue System
    → Layered on top of Physics + Personality
    → Milestone: behavior changes in second half

12. Manager Interface (tactics board, squad screen)
    → Depends on: Game Loop, Tactical System
    → Milestone: can set formation, watch changes take effect

13. Training System
    → Depends on: Manager Interface, Personality vectors
    → Milestone: attribute/personality drift from drills

14. Season/League System
    → Depends on: Match State, Training
    → Milestone: fixtures, results, table
```

**Key insight:** Steps 1-9 are the match engine. Steps 10-14 are the management game that wraps it. The PROJECT.md is correct that the engine must be proven first — it is also the most technically uncertain part.

---

## State Management Pattern

The system uses a layered state model:

```
┌──────────────────────────────────────────────────────────┐
│ PERSISTENT STATE (localStorage / IndexedDB)              │
│ Club, squad, attributes, personality, season progress    │
│ Mutated only by: season events, training, user actions   │
└───────────────────────────┬──────────────────────────────┘
                            │ loaded at match start
                            ▼
┌──────────────────────────────────────────────────────────┐
│ MATCH CONFIG (immutable for match duration)              │
│ Formation, team instructions, player starting attributes │
│ Mutated only by: half-time, substitutions               │
└───────────────────────────┬──────────────────────────────┘
                            │ input to simulation
                            ▼
┌──────────────────────────────────────────────────────────┐
│ SIMULATION STATE (SimSnapshot, produced each tick)       │
│ Positions, velocities, ball state, fatigue, match events │
│ NEVER mutated — each tick produces a new snapshot        │
└───────────────────────────┬──────────────────────────────┘
                            │ read by
                            ▼
┌──────────────────────────────────────────────────────────┐
│ RENDER STATE (ephemeral, not stored)                     │
│ Interpolated positions, animation frames, visual effects │
│ Computed per frame from prev/curr SimSnapshot + alpha    │
└──────────────────────────────────────────────────────────┘
```

Commands flow upward: renderer/UI sends commands to the simulation engine, never writes to state directly.

---

## Sources

- Gaffer on Games "Fix Your Timestep" — canonical fixed-timestep accumulator pattern (https://gafferongames.com/post/fix_your_timestep/) — HIGH confidence (well-established, widely implemented)
- "Utility AI in Games" — Dave Mark & Kevin Dill, GDC presentations on utility AI considerations architecture — HIGH confidence (standard pattern)
- Reynolds, Craig (1987) "Flocks, Herds, and Schools" — steering behaviors foundation — HIGH confidence
- Project design brief (match-engine-design-brief.docx) — project-specific AI scoring formula and personality vector specifications — HIGH confidence
- ECS vs plain objects debate: for 22 entities, plain TypeScript classes with composition outperform a full ECS framework in ergonomics — MEDIUM confidence (based on scale reasoning, not benchmarks)

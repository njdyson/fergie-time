# Technology Stack

**Project:** Fergie Time — Browser-Based Emergent Football Simulation
**Researched:** 2026-03-02
**Confidence:** MEDIUM (WebSearch/WebFetch unavailable; based on training data through Aug 2025 + project constraints)

---

## Recommended Stack

### Build & Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| TypeScript | 5.x (latest) | Primary language | Project constraint; strong typing for agent/physics systems is essential for correctness at this complexity level |
| Vite | 5.x | Dev server, bundler, HMR | Fastest DX for browser TypeScript in 2025; native ESM; ~10x faster than webpack for rebuild speed; built-in canvas/worker support |
| Vitest | 1.x | Unit + headless simulation testing | Co-located with Vite config; near-zero setup; critical for testing agent logic and physics determinism headlessly |

**Not:** webpack (slow), Parcel (less control), Rollup standalone (Vite wraps it better), esbuild standalone (no dev server).

---

### Physics Engine

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom lightweight physics** | — | Ball trajectory, 2.5D height simulation, collision resolution | **Recommended** — see rationale below |
| Matter.js | 0.19.x | 2D rigid body (fallback/prototype) | Mature, well-documented, zero-config, browser-native JS |
| Planck.js | 1.0.x | Box2D port for JS | More accurate than Matter.js, better suited for sports simulation |
| Rapier (rapier2d-compat) | 0.12.x | WASM-based physics | Most accurate; WASM bundle adds 2-4MB; overkill for this use case |

**Recommendation: Custom physics for the ball; no library.**

Rationale: This simulation's physics requirements are narrow and specific:
- Ball: Newtonian projectile (X/Y + Z arc), friction, bounce. ~100 lines.
- Players: Steering behaviors (seek, arrive, pursuit, evade) — not rigid body physics. Craig Reynolds steering model is the industry standard for this.
- Contact: Tackle/shield resolution is a discrete event system, not continuous collision detection.

Full physics engines (Matter.js, Rapier) solve rigid-body simulation with constraints — rotational dynamics, hinges, stacking. None of that is needed. Using Matter.js for football players would fight the library constantly (agents need velocity override every tick; physics engines resist this).

**Confidence:** HIGH — this is a well-established pattern in football sim development (see Championship Manager, FM engine design).

---

### Steering Behaviors (Player Movement)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom implementation** | — | Seek, arrive, pursuit, evade, separation, obstacle avoidance | No JS library worth using; Craig Reynolds' paper is 40 lines per behavior; custom gives attribute-capped velocities and fatigue integration |

**Not:** Any steering library (too abstract; don't integrate with personality vectors cleanly).

The canonical reference is Craig Reynolds' 1999 paper "Steering Behaviors for Autonomous Characters." Every behavior needed is well-documented:
- `seek(target)` — move toward target
- `arrive(target, slowingRadius)` — decelerate near target
- `pursuit(movingTarget)` — lead the target
- `separation(neighbors)` — avoid crowding teammates
- `wander()` — off-ball movement

All player velocities are capped by `pace * (1 - fatigue_curve)`. This is a trivial computation per-tick.

---

### Agent AI Architecture

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom utility AI** | — | Per-agent action scoring every tick | No library needed; utility AI is ~200 lines of scoring functions + a selector |
| yuka | 1.0.x | JS game AI library with utility AI support | Exists, but overkill; adds abstractions that obscure the personality vector system |

**Recommendation: Custom utility AI — do not use a library.**

Rationale: The personality vector system (directness, risk_appetite, composure, etc.) threads through EVERY score calculation. A library would require adapters around adapters. The core loop is:

```typescript
function selectAction(agent: Agent, worldState: WorldState): Action {
  const scores = ACTIONS.map(action => ({
    action,
    score: action.evaluate(agent, worldState) + gaussian(0, 1 - agent.composure) * NOISE_SCALE
  }));
  return maxBy(scores, s => s.score).action;
}
```

This is 20 lines. Libraries add no value here; they add surface area to maintain.

**Confidence:** HIGH — utility AI is fundamentally a scoring pattern, not a framework problem.

---

### Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Raw HTML5 Canvas 2D API** | — | Match rendering, pitch, players, ball | Project constraint; no overhead, full control, sufficient for 2D top-down at 60fps |
| PixiJS | 8.x | WebGL-accelerated 2D renderer | Appropriate IF Canvas 2D proves too slow (unlikely for 22 sprites) |

**Recommendation: Raw Canvas 2D API, with PixiJS as a known escape hatch.**

Rationale: 22 player sprites + 1 ball + pitch lines at 60fps is trivially achievable with the Canvas 2D API. PixiJS becomes relevant at 500+ sprites or when complex effects (particle systems, shaders) are needed. The overhead of PixiJS (WebGL context, scene graph, texture management) is not justified for this scale.

Rendering loop pattern to follow:
```typescript
function render(ctx: CanvasRenderingContext2D, state: SimulationState) {
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  drawPitch(ctx);
  drawBall(ctx, state.ball);        // scale sprite by Z height, offset shadow
  state.players.forEach(p => drawPlayer(ctx, p));
  drawUI(ctx, state);
}
```

Ball height rendering: scale the ball sprite by `1 + (z / MAX_Z) * 0.5` and draw a shadow at the ground position — the project already specifies this approach.

**Confidence:** HIGH — Canvas 2D at this scale is standard and well-benchmarked.

---

### Entity-Component System (ECS)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Structured plain objects (no ECS library)** | — | Player and ball state representation | **Recommended** — see rationale |
| bitecs | 0.3.x | High-performance ECS (ArrayBuffer-based) | Appropriate for thousands of entities; overkill for 23 entities |
| miniplex | 2.x | Lightweight TypeScript-first ECS | Better fit than bitecs; still adds abstraction overhead |

**Recommendation: No ECS library — use typed plain objects.**

Rationale: ECS libraries are designed for worlds with thousands of heterogeneous entities where cache-locality of component arrays matters. This simulation has exactly 23 entities (22 players + 1 ball), all of the same fundamental structure. The performance benefit of an ECS is zero. The cognitive overhead is real.

Recommended data model:

```typescript
interface Player {
  id: string;
  position: Vec2;
  velocity: Vec2;
  // Physical attributes
  pace: number;
  stamina: number;
  strength: number;
  // Technical attributes
  passing: number;
  shooting: number;
  dribbling: number;
  // Personality vector
  directness: number;
  risk_appetite: number;
  composure: number;
  creativity: number;
  work_rate: number;
  aggression: number;
  anticipation: number;
  flair: number;
  // Runtime state
  fatigue: number;
  role: Role;
  tacticalAnchor: Vec2;
}

interface Ball {
  position: Vec2;
  velocity: Vec2;
  z: number;        // height
  vz: number;       // vertical velocity
  carrier: string | null;
}
```

This is plain TypeScript. Zero dependencies. Fully typed. Directly debuggable.

**Confidence:** HIGH — over-engineering with ECS for 23 entities is a well-documented mistake in game dev.

---

### Simulation Architecture

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Dedicated simulation loop + requestAnimationFrame decoupling** | — | Separate sim ticks from render frames | Project requirement; enables headless simulation and future speed-up/replay |
| Web Workers | — | Offload simulation from main thread (optional, Phase 2+) | Keeps UI responsive; worth adding if main thread jank appears |

**Recommended architecture:**

```
SimulationEngine (pure functions, no DOM)
  ├── tick(state, dt): SimulationState  — deterministic state machine
  ├── Ball physics
  ├── Player steering
  ├── Utility AI evaluation
  └── Contact resolution

MatchRenderer (Canvas 2D, reads state only)
  └── render(ctx, state): void

GameLoop (coordinates the two)
  ├── Simulation: fixed 30Hz tick (33ms)
  └── Render: 60fps via requestAnimationFrame with interpolation
```

Fixed-step simulation with render interpolation is the standard pattern for deterministic game engines. The simulation state at t and t+1 is lerped for smooth rendering at 60fps even when sim runs at 30Hz.

**Confidence:** HIGH — this architecture is the textbook approach for deterministic simulations.

---

### State Management (Management Screens)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Vanilla TypeScript signals/reactive stores** | — | Squad, tactics, league table state outside match | No framework needed for a personal project; reactive stores are ~30 lines |
| Preact + Preact Signals | 10.x + 1.x | UI components for management screens | Lightweight (3KB), fast, React-compatible API, signals are perfect for game state |

**Recommendation: Preact + Preact Signals for management screens.**

Rationale: The match itself is Canvas-rendered. The management screens (squad view, tactics board, league table, training) are standard UI. Preact is 3KB vs React's 45KB, has a simpler mental model, and Preact Signals (fine-grained reactivity) are a natural fit for game state that changes frequently and partially. No need for Redux/Zustand — signals handle this cleanly.

**Not:** React (too heavy for a personal browser game), Vue (different paradigm, no benefit here), Svelte (build complexity without payoff at this scale).

---

### Procedural Generation

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom pixel art generator** | — | Player portraits from trait combinations | Project requirement: no external API |
| seedrandom | 3.x | Seeded PRNG for reproducible generation | Needed so the same player always generates the same portrait |

Player name generation: use a small bundled dataset of first/last names by nationality — no library needed. ~200 names per nationality × 10 nationalities = 2000-entry JSON file, loaded once.

---

### Supporting Utilities

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `gl-matrix` or custom `Vec2` | — | 2D vector math | Custom Vec2 is 50 lines and avoids any import overhead; use if you want `add`, `scale`, `normalize`, `dot`, `length` typed and tree-shakeable |
| `seedrandom` | 3.x | Seeded PRNG | Reproducible match replays, portrait generation |
| `zod` | 3.x | Runtime validation of save/load data | Parse season save files safely |
| `@vitest/coverage-v8` | 1.x | Test coverage | Use from day one for physics and agent logic |

**Vec2 recommendation: Write a minimal custom class.**

```typescript
class Vec2 {
  constructor(public x: number, public y: number) {}
  add(v: Vec2): Vec2 { return new Vec2(this.x + v.x, this.y + v.y); }
  scale(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }
  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize(): Vec2 { const l = this.length(); return l > 0 ? this.scale(1/l) : new Vec2(0, 0); }
  dot(v: Vec2): number { return this.x * v.x + this.y * v.y; }
  distanceTo(v: Vec2): number { return this.add(v.scale(-1)).length(); }
}
```

This is 10 lines. `gl-matrix` is optimized for WebGL matrix operations — the API is awkward for 2D game logic.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Physics engine | Custom | Matter.js | Over-engineered for steering-based agents; fights velocity overrides |
| Physics engine | Custom | Rapier (WASM) | 2-4MB WASM bundle; accurate rigid-body physics not needed |
| Physics engine | Custom | Planck.js | Box2D port; contact constraints irrelevant for steering agents |
| Rendering | Canvas 2D | PixiJS 8 | WebGL overhead unjustified for 23 entities; reach for this at 500+ entities |
| Rendering | Canvas 2D | Three.js | 3D library; project constraint is 2D |
| Rendering | Canvas 2D | Phaser 3 | Full game framework; ~1MB bundle; manages its own loop, camera, physics — fights simulation/render separation |
| AI | Custom | Yuka | Adds unnecessary abstraction over utility scoring; personality vectors don't fit library's data model |
| ECS | Plain objects | bitecs | Designed for 10K+ entities; 23 entities need no cache optimization |
| ECS | Plain objects | miniplex | Better fit than bitecs but still adds API surface for no benefit |
| UI | Preact | React | 15x larger bundle for same capability |
| UI | Preact | Svelte | Compilation step adds complexity; Svelte's reactivity is great but Preact Signals match it for this use case |
| Build | Vite | Webpack | 10-100x slower rebuild; no benefit |
| Build | Vite | Parcel | Less control over chunking; Vite is more ecosystem-standard |
| State | Preact Signals | Zustand | No benefit without React; Signals are native to Preact |
| State | Preact Signals | Redux | Massively over-engineered for a personal game project |

---

## Critical "Do Not Use" List

| Tool/Library | Reason |
|-------------|--------|
| **Phaser 3** | Monolithic game framework that owns the game loop, physics, and rendering. Directly conflicts with the project's core architectural requirement: separate simulation from rendering. Using Phaser means fighting it to run headless. |
| **Three.js** | 3D library. Project is 2D. |
| **Unity/WebGL export** | Not browser-native TypeScript. |
| **Box2D (direct)** | C++ port; Planck.js is the JS port and even that is overkill. |
| **Any game engine that owns the loop** | BabylonJS, PlayCanvas, Construct — all take over rendering architecture. Non-starters. |

---

## Installation

```bash
# Initialize project
npm create vite@latest fergie-time -- --template vanilla-ts
cd fergie-time

# Dev dependencies
npm install -D vitest @vitest/coverage-v8 typescript

# Runtime dependencies (minimal)
npm install preact @preact/signals seedrandom zod
npm install -D @types/seedrandom

# Type-check
npx tsc --noEmit
```

**Recommended `tsconfig.json` settings:**
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

Enable `noUncheckedIndexedAccess` from day one — array accesses in agent logic must be bounds-checked. Agent AI bugs from undefined array access are hard to debug mid-match.

---

## Confidence Assessment by Area

| Area | Confidence | Notes |
|------|------------|-------|
| Build tooling (Vite + Vitest) | HIGH | Vite is the clear standard for TS browser projects as of 2025 |
| Physics: custom over library | HIGH | Pattern well-established for steering-agent simulations |
| Steering behaviors: custom | HIGH | Reynolds model is decades-proven; no JS library improves on direct implementation |
| Utility AI: custom | HIGH | Scoring pattern, not a framework problem; verified by project design brief |
| Canvas 2D rendering | HIGH | Sufficient for 23 entities at 60fps; well-benchmarked |
| ECS: plain objects | HIGH | 23 entities need no cache optimization |
| Preact for management screens | MEDIUM | Good fit but project is early; could defer UI framework choice to when screens are built |
| Vec2: custom class | MEDIUM | Alternative is importing gl-matrix; both are valid |
| Web Workers for simulation | LOW | May not be needed; profile first before adding worker complexity |
| Pixel art procedural generator | LOW | No standard library; implementation approach needs Phase-specific research |

---

## Sources

- Project design brief (`.planning/PROJECT.md`) — match engine spec, personality vector design
- Craig Reynolds, "Steering Behaviors for Autonomous Characters" (1999) — canonical steering behavior reference
- Training data knowledge of ecosystem (cutoff: August 2025) — Vite 5, Vitest 1, Preact 10, PixiJS 8, Matter.js 0.19, bitecs 0.3, Rapier 0.12
- Note: WebSearch and WebFetch were unavailable during this research session. Version numbers should be verified against npm before use. Core architectural recommendations are high-confidence from first principles and are not version-dependent.

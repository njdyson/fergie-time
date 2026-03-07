# Stack Research: v1.2 Player Development Additions

**Domain:** Pixel art portrait generation, drill scheduling, training sandbox for existing browser-based football management game
**Researched:** 2026-03-07
**Confidence:** HIGH

## Scope

This research covers ONLY the new dependencies needed for the v1.2 Player Development milestone. The existing stack is validated and must not change.

## Existing Stack (Do Not Change)

| Technology | Version | Status |
|------------|---------|--------|
| TypeScript | ~5.9.3 | In use |
| Vite | ^7.3.1 | In use |
| Vitest | ^3.2.3 | In use |
| seedrandom | ^3.0.5 | In use — already drives all procedural generation |
| better-sqlite3 | ^12.6.2 | In use |
| Express | ^5.2.1 | In use |
| Zod | ^3.24.2 | In use |
| bcryptjs | ^3.0.3 | In use |

**Critical existing pattern:** `createRng(seed: string)` in `src/simulation/math/random.ts` wraps seedrandom and is the canonical RNG factory across the entire codebase. All new procedural generation must use this same factory.

---

## New Dependencies

### Pixel Art Portrait Generation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @dicebear/core | ^9.4.0 | DiceBear avatar engine — seed → SVG | Deterministic: same seed + options always produce identical output. TypeScript-native. Browser and Node 18+ compatible. Version 9 is current (published 2 days before research date). |
| @dicebear/pixel-art | ^9.2.4 | Pixel art avatar style for @dicebear/core | The specific style needed: 8 skin tone options, 11 hair colour options, eyes, mouth, beard, glasses, hats, clothing. All individually controllable. Generates crisp pixel art SVG avatars sized to spec. Published ~24 days before research date. |

**No other portrait library is needed.** DiceBear handles the full pipeline: seed string → configurable SVG. The SVG is rendered to the existing HTML5 Canvas via the standard `<img>` + `drawImage()` browser pattern — no additional canvas library required.

### What Needs No New Dependency

| Capability | Why No Package Needed |
|------------|-----------------------|
| Seeded RNG for portraits | `seedrandom` is already a dependency. The existing `createRng(seed)` factory in `src/simulation/math/random.ts` handles all deterministic generation. Pass `${playerId}-portrait` as seed. |
| SVG → Canvas rendering | Browser built-in: create a `Blob` from the SVG string, make an object URL, load into `new Image()`, call `ctx.drawImage()`. ~10 lines of code. |
| Drill scheduling (calendar + timer) | Pure TypeScript data model: match days, training days, drill choice. No external library adds value. Store as JSON blob in the existing SQLite `game_state` column. |
| Training stat improvement formula | Pure math: `delta = drill_rate × talent_coeff × age_decay × rng`. No library needed. |
| Training sandbox (custom scenarios) | Existing engine already separates simulation from rendering. Sandbox is a UI screen that calls the same engine entry point with a custom `PlayerState[]` snapshot. No new engine code needed beyond a reset function. |
| Personality vector nudges | In-memory: apply bounded delta to personality floats at end of each training week. Serialize with game state as already done for PlayerState. |

---

## Supporting Libraries

No additional supporting libraries are needed. The assessment below shows why each obvious candidate is unnecessary:

| Candidate | Assessment | Decision |
|-----------|------------|----------|
| @dicebear/converter | Converts SVG to PNG/JPEG. Only needed if portraits must be rasterized for storage or export. | SKIP — render SVG via drawImage() at display time, no pre-rasterization needed |
| sharp | Server-side image processing. | SKIP — all portrait rendering is client-side in the browser |
| canvas (npm) | Node.js Canvas API polyfill. | SKIP — portraits render in browser, never server-side |
| pixi.js / konva | Canvas 2D library for portrait composition. | SKIP — drawImage() is sufficient for a 32x32 or 64x64 portrait stamp |
| date-fns / dayjs | Calendar/date utilities for scheduling. | SKIP — the game calendar is a simple integer (match day index) not real dates |
| rxjs | Reactive streams for sim events in sandbox. | SKIP — existing event array on SimSnapshot is sufficient |

---

## Integration Architecture

### Portrait Generation

```
playerId + "-portrait" → createRng() → nationality-mapped options → DiceBear SVG → drawImage()
```

**Nationality to skin tone mapping** (implement in pure TypeScript, ~30 lines):

```typescript
// src/portraits/nationalityPalette.ts
const NATIONALITY_SKIN_TONES: Record<string, string[]> = {
  GB: ['c8a96e', 'b68655', 'a26d3d'],
  IE: ['f8d25c', 'e0a872', 'c8a96e'],
  FR: ['8d5524', 'b68655', 'c8a96e', 'f8d25c'],
  DE: ['f8d25c', 'e0a872', 'c8a96e'],
  ES: ['e0a872', 'c8a96e', 'b68655'],
  BR: ['8d5524', 'a26d3d', 'b68655', 'c8a96e'],
  // etc.
};

export function skinTonesForNationality(nat: string): string[] {
  return NATIONALITY_SKIN_TONES[nat] ?? ['c8a96e', 'b68655', 'a26d3d', '8d5524'];
}
```

Use `rng()` from `createRng(playerId + '-portrait')` to pick from the array. Same rng instance then selects hair, eye colour, clothing colour — all seeded off the player's ID so portrait is stable across sessions.

**Rendering SVG to Canvas:**

```typescript
// src/portraits/renderPortrait.ts
export async function renderPortrait(svg: string, ctx: CanvasRenderingContext2D, x: number, y: number, size: number): Promise<void> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => { ctx.drawImage(img, x, y, size, size); resolve(); };
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);
}
```

Cache the generated SVG string per player in memory (Map keyed by playerId) to avoid regenerating on every render frame. Portrait only needs to regenerate when player data changes.

### Drill Scheduling

**Data model** (pure TypeScript, added to existing GameState):

```typescript
interface TrainingState {
  currentWeek: number;               // weeks since season start
  drillDays: DrillDay[];             // ~3 per week
  playerProgression: Map<string, PlayerProgression>;
}

interface DrillDay {
  week: number;
  dayOfWeek: 1 | 2 | 3;             // fixed training days
  drill: DrillType;                  // squad-wide choice
  completed: boolean;
}

type DrillType = 'fitness' | 'passing' | 'shooting' | 'defending' | 'set_pieces' | 'rest';

interface PlayerProgression {
  playerId: string;
  weeklyDeltas: Partial<PlayerAttributes>; // accumulated this week, applied on match day
}
```

**Improvement formula:**

```typescript
function drillDelta(
  drill: DrillType,
  player: PlayerState,
  rng: () => number
): Partial<PlayerAttributes> {
  const AGE_DECAY = Math.max(0, 1 - (player.age! - 25) * 0.03); // peaks at 25, falls after
  const TALENT = (player.attributes.pace + player.attributes.vision) / 2; // proxy
  const BASE_RATE = 0.003; // max daily gain per relevant attribute (capped)
  // ... map drill type to target attributes, apply rate × talent × age_decay × rng(0.8, 1.2)
}
```

No scheduling library needed. The "calendar" is just: `matchDay % 7` determines whether it's a training day. Store the state in the existing SQLite `game_state` JSON blob — same serialization path as all other game state.

### Training Ground Sandbox

The existing engine already satisfies 95% of sandbox requirements:

- `SimSnapshot` is already immutable — sandbox just holds a custom initial snapshot
- `engine.tick(snapshot, intents)` already runs headlessly
- The existing `canvas.ts` renderer is already a visualizer of snapshots
- The existing `quickSim.ts` shows headless engine use

**Sandbox additions needed (TypeScript only, no new libraries):**

```typescript
// src/season/sandbox.ts
interface SandboxConfig {
  playerCount: number;       // 2..22
  homeTeamOverride?: Partial<PlayerState>[];
  awayTeamOverride?: Partial<PlayerState>[];
  scenario: 'free_play' | 'penalty_shootout' | 'set_piece';
}

function createSandboxSnapshot(config: SandboxConfig, rng: () => number): SimSnapshot {
  // Build custom PlayerState[] from config, return initial snapshot
}
```

A new UI screen (`src/ui/screens/sandboxScreen.ts`) wraps this. The game loop, renderer, and engine are unchanged.

---

## Installation

```bash
# New dependencies for v1.2 (client-side only)
npm install @dicebear/core @dicebear/pixel-art
```

That is the complete installation change. No server-side dependencies change. No dev dependencies change.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| DiceBear pixel-art style | Custom canvas pixel art renderer (hand-coded) | DiceBear gives 8 skin tones, 11 hair colours, 12 clothing colours with zero rendering code. Custom implementation would take weeks and produce worse results. DiceBear is MIT licensed, actively maintained, TypeScript-native. |
| DiceBear pixel-art style | pixel-sprite-generator (GitHub: zfedoran) | Abandoned project (last commit 2014). No npm package. Generates space-ship sprites, not human faces. |
| DiceBear pixel-art style | AI image generation APIs | Explicitly out of scope per PROJECT.md: "AI image generation for portraits — pixel art procedural generation instead". |
| drawImage() SVG rendering | @dicebear/converter (toPng) | Converter adds a dependency to do what the browser does natively. Only needed if saving portraits to disk — not needed here. |
| Integer calendar model | date-fns / dayjs | The game clock is weeks and match days, not real calendar dates. A date library adds indirection over what is fundamentally `weekIndex * 7 + dayOfWeek`. |
| JSON blob in game_state | Separate training tables in SQLite | The game state is already a single JSON blob per save. Adding tables creates a join/sync problem. Keep all mutable game state in one blob — it's the established pattern. |
| Existing engine (no change) | Modified engine for sandbox | The engine already runs headlessly. Sandbox is a UI concern, not an engine concern. Don't touch proven engine code. |

---

## What NOT to Add

| Avoid | Why | Do Instead |
|-------|-----|------------|
| @dicebear/converter | Converts SVG to PNG — unnecessary when drawImage() handles SVG in-browser | SVG blob URL + new Image() + drawImage() |
| sharp | Node.js image processing — portraits are browser-rendered, never server-processed | Nothing — no server-side image processing needed |
| canvas npm package | Node Canvas polyfill — portraits are never generated server-side | Nothing |
| Any animation library | Portraits are static images | Static SVG → canvas stamp |
| A game calendar library | Scheduling is integer arithmetic on week/day indices | Plain TypeScript arithmetic |
| Per-player drill scheduling library | PROJECT.md explicitly defers this: "Per-player drill assignment — squad-level training first" | Single squad-wide drill choice per day |
| React / Vue component layer | UI already uses plain TypeScript canvas + DOM | Continue with existing screen pattern (e.g. `squadScreen.ts`) |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| @dicebear/core ^9.4.0 | Node 18+, all modern browsers | TypeScript-native, ESM. Vite 7 builds it without config changes. |
| @dicebear/pixel-art ^9.2.4 | @dicebear/core ^9.x | Same major version required. Both are currently v9. |
| @dicebear/pixel-art ^9.2.4 | TypeScript ~5.9 | Ships its own types. No @types/ package needed. |
| seedrandom ^3.0.5 (existing) | @dicebear/core ^9.x | No conflict — used in separate code paths |

---

## Sources

- [@dicebear/core npm](https://www.npmjs.com/package/@dicebear/core) — v9.4.0 confirmed latest, TypeScript-native (HIGH confidence)
- [@dicebear/pixel-art npm](https://www.npmjs.com/package/@dicebear/pixel-art) — v9.2.4 confirmed latest (HIGH confidence)
- [@dicebear/collection npm](https://www.npmjs.com/package/@dicebear/collection) — v9.3.2, contains pixel-art style (HIGH confidence)
- [DiceBear JS Library docs](https://www.dicebear.com/how-to-use/js-library/) — seed behavior, browser compatibility, TypeScript support (HIGH confidence)
- [DiceBear pixel-art style docs](https://www.dicebear.com/styles/pixel-art/) — 8 skin tones, 11 hair colours, full option set confirmed (HIGH confidence)
- [DiceBear converter docs](https://www.dicebear.com/how-to-use/js-library/converter/) — SVG to PNG capability confirmed; evaluated and rejected in favor of native drawImage() (HIGH confidence)
- [MDN drawImage()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage) — SVG via Blob URL is a supported image source (HIGH confidence)
- [seedrandom npm](https://www.npmjs.com/package/seedrandom) — v3.0.5 confirmed, already in use in codebase (HIGH confidence)
- [src/simulation/math/random.ts](C:/dev/src/simulation/math/random.ts) — existing createRng() factory confirmed (HIGH confidence, direct code read)
- [src/simulation/types.ts](C:/dev/src/simulation/types.ts) — PlayerState.nationality?: string confirmed as existing field (HIGH confidence, direct code read)
- [package.json](C:/dev/package.json) — full existing dependency list confirmed (HIGH confidence, direct code read)

---
*Stack research for: Fergie Time v1.2 Player Development*
*Researched: 2026-03-07*

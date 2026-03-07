# Phase 10: Portraits - Research

**Researched:** 2026-03-07
**Domain:** Procedural pixel art portrait generation — Canvas 2D, seeded PRNG, nationality palettes
**Confidence:** HIGH

---

## Summary

Phase 10 replaces the existing shirt-and-initials avatar on the player profile screen with a unique, deterministic pixel art portrait. The project already has `seedrandom` (v3.0.5) installed and a `createRng(seed: string)` utility in `src/simulation/math/random.ts`, so the determinism requirement (PORT-02) has a natural implementation path: seed the RNG with `player.id`. No new libraries are needed.

The best approach for this project is **direct pixel-grid rendering onto the existing `<canvas id="player-avatar-canvas">` (120×120 px)** using an upscaled pixel grid (e.g., 20×24 logical pixels scaled up 5×). Each portrait is built by reading RNG values for a fixed sequence of visual decisions: face shape, skin tone palette (nationality-driven), hair style, hair colour, eye colour, and optional accessories. All drawing happens in a single `drawPortrait()` function that replaces the existing `drawAvatar()` function. A session-level `Map<string, ImageData>` cache prevents regeneration on repeat visits.

This approach requires zero external dependencies, integrates cleanly with the existing Canvas 2D codebase, and produces portraits that are visibly different from one another and visibly nationality-influenced — meeting all three PORT requirements.

**Primary recommendation:** Hand-draw a pixel art face template grid using direct `putImageData`/`fillRect` calls on an OffscreenCanvas or a hidden canvas, driven by a seeded RNG keyed to `player.id`. Cache the resulting `ImageData` per player ID at session scope.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PORT-01 | User can see a unique pixel art portrait for each player on the player profile screen | Direct Canvas 2D rendering replaces existing `drawAvatar()`; each player gets a deterministic face |
| PORT-02 | Portraits are deterministic — same player always generates the same face across sessions | `createRng(player.id)` from existing `src/simulation/math/random.ts` provides session-independent determinism |
| PORT-03 | Portraits reflect player nationality via skin tone and hair colour | Nationality code (`player.nationality`) selects a skin tone palette and hair colour range before the RNG draws traits |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| seedrandom | 3.0.5 (already installed) | Seeded PRNG for deterministic portrait generation | Already in the project; `createRng()` wrapper already written |
| Canvas 2D API | Browser built-in | Pixel-level drawing via `fillRect`, `putImageData` | Already used by the existing `drawAvatar()` function on the same canvas element |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | — | — | No external dependencies needed; everything can be done with Canvas 2D |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom pixel-grid renderer | WebGL / Three.js | Gross overkill for a 120×120 portrait; Canvas 2D is sufficient and already used |
| Custom pixel-grid renderer | p5.js | Additional dependency with no benefit; Canvas 2D has all needed primitives |
| Direct pixel rendering | Pre-drawn sprite sheet (PNG) + drawImage | Requires art assets; not self-contained; harder to vary skin tones without tint passes |
| Session-level Map cache | React state / store | Project uses no React; Map keyed by player ID is the correct lightweight approach |

**Installation:**
```bash
# No new packages needed — seedrandom is already installed
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── simulation/
│   └── math/
│       └── random.ts          # existing createRng() — no changes needed
├── ui/
│   ├── screens/
│   │   └── playerProfileScreen.ts   # existing — replace drawAvatar() with drawPortrait()
│   └── portrait/
│       ├── portraitGenerator.ts     # NEW: core pixel-art drawing logic
│       ├── portraitCache.ts         # NEW: session-level Map<playerId, ImageData> cache
│       └── palettes.ts              # NEW: nationality → skin/hair palette mappings
```

The portrait logic is cleanly separated into its own `ui/portrait/` subdirectory and imported by `playerProfileScreen.ts`. The screen itself needs only one change: replace the call to `drawAvatar()` with a call that goes through the cache and then calls the generator.

### Pattern 1: Seeded Deterministic Generation

**What:** The portrait generator receives `player.id` (a stable, session-independent string) as the PRNG seed. All visual decisions — head shape, skin tone choice, hair style index, hair colour, eye colour, facial hair flag — are drawn in a fixed sequence from this single seeded RNG. The same seed always produces the same call sequence, therefore the same portrait.

**When to use:** Always. Never use `Math.random()` in portrait code.

**Example:**
```typescript
// Source: src/simulation/math/random.ts (existing pattern)
import { createRng } from '../../simulation/math/random.ts';

export function generatePortrait(
  canvas: HTMLCanvasElement,
  player: PlayerState,
): void {
  const rng = createRng(`portrait-${player.id}`);
  const palette = getPalette(player.nationality);

  // Fixed decision sequence — order must never change
  const skinIdx    = Math.floor(rng() * palette.skin.length);
  const hairStyle  = Math.floor(rng() * HAIR_STYLES.length);
  const hairColIdx = Math.floor(rng() * palette.hair.length);
  const eyeColIdx  = Math.floor(rng() * EYE_COLOURS.length);
  const hasFacialHair = rng() > 0.65;

  drawPixelFace(canvas, {
    skinColour: palette.skin[skinIdx]!,
    hairStyle:  HAIR_STYLES[hairStyle]!,
    hairColour: palette.hair[hairColIdx]!,
    eyeColour:  EYE_COLOURS[eyeColIdx]!,
    hasFacialHair,
  });
}
```

**Seed namespacing:** Use `portrait-${player.id}` not bare `player.id`, so portrait generation never shares RNG state with other systems that also key on player ID.

### Pattern 2: Nationality Palette Mapping

**What:** A `palettes.ts` file maps the 10 nationality ISO codes already used in the project (`GB`, `ES`, `FR`, `DE`, `BR`, `IT`, `PT`, `NL`, `AR`, `NG`) to a `{ skin: string[], hair: string[] }` palette object. The palette constrains which colours the RNG can pick, producing statistically different skin tones and hair colours for different nationalities.

**When to use:** Before any drawing. `player.nationality` may be `undefined` — provide a fallback palette.

**Example:**
```typescript
// Source: derived from lospec.com skin palette research + project NAT_NAMES list
export interface NationalityPalette {
  skin: readonly string[]; // 2-4 hex colours, light→dark within the group
  hair: readonly string[]; // 3-5 hex colours typical for that region
}

export const NATIONALITY_PALETTES: Record<string, NationalityPalette> = {
  // Northern/Western Europe: fair to medium skin, blonde/brown/red/dark hair
  GB: { skin: ['#f5c9a0', '#e8b48a', '#d4956a'], hair: ['#c8a45e', '#8b5e3c', '#3d2b1f', '#cc4c1e'] },
  FR: { skin: ['#f5c9a0', '#e8b48a', '#d4956a', '#c07850'], hair: ['#3d2b1f', '#8b5e3c', '#c8a45e', '#1a1008'] },
  NL: { skin: ['#f5c9a0', '#e8b48a', '#d4956a'], hair: ['#c8a45e', '#d4aa60', '#8b5e3c', '#3d2b1f'] },
  DE: { skin: ['#f5c9a0', '#e8b48a', '#d4956a'], hair: ['#c8a45e', '#8b5e3c', '#3d2b1f', '#1a1008'] },
  // Southern Europe: medium to olive skin, dark hair dominant
  ES: { skin: ['#e8b48a', '#d4956a', '#c07850'], hair: ['#1a1008', '#3d2b1f', '#8b5e3c'] },
  IT: { skin: ['#e8b48a', '#d4956a', '#c07850'], hair: ['#1a1008', '#3d2b1f', '#8b5e3c'] },
  PT: { skin: ['#e8b48a', '#d4956a', '#c07850'], hair: ['#1a1008', '#3d2b1f', '#5c3a1e'] },
  // South America: medium to brown skin, very dark hair
  BR: { skin: ['#d4956a', '#c07850', '#a05c38', '#7a3c20'], hair: ['#1a1008', '#3d2b1f', '#0d0805'] },
  AR: { skin: ['#e8b48a', '#d4956a', '#c07850'], hair: ['#1a1008', '#3d2b1f', '#0d0805'] },
  // West Africa: deep brown to very dark skin, very dark hair
  NG: { skin: ['#7a3c20', '#5e2a10', '#3d1a08', '#2a1005'], hair: ['#0d0805', '#1a1008'] },
};

export const FALLBACK_PALETTE: NationalityPalette = {
  skin: ['#f5c9a0', '#d4956a', '#a05c38', '#5e2a10'],
  hair: ['#c8a45e', '#3d2b1f', '#1a1008'],
};

export function getPalette(nationality?: string): NationalityPalette {
  return (nationality && NATIONALITY_PALETTES[nationality]) ?? FALLBACK_PALETTE;
}
```

### Pattern 3: Pixel Grid Rendering

**What:** The 120×120 canvas is treated as a pixel grid at a lower logical resolution (e.g., 20 wide × 24 tall logical pixels, each scaled to 6×5 canvas pixels). Each logical pixel is a solid `fillRect`. No anti-aliasing is needed or wanted.

**When to use:** When drawing the face itself. Keep all coordinate arithmetic in logical (small) pixel units; multiply by scale factor only at draw time.

**Example:**
```typescript
// Portrait rendered as a 20×24 grid scaled to 120px canvas
const GRID_W = 20;
const GRID_H = 24;
const SCALE_X = 6; // 20 * 6 = 120
const SCALE_Y = 5; // 24 * 5 = 120

function setPixel(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  colour: string,
): void {
  ctx.fillStyle = colour;
  ctx.fillRect(gx * SCALE_X, gy * SCALE_Y, SCALE_X, SCALE_Y);
}
```

The face template defines which logical-pixel coordinates belong to: background, hair (back layer), skin, eyes, mouth, hair (front layer). Hair style variants are arrays of coordinate offsets or simple bitmask arrays.

### Pattern 4: Session-Level Cache

**What:** A module-level `Map<string, ImageData>` stores the rendered portrait data after first draw. On subsequent visits to a player's profile, the cached `ImageData` is stamped onto the canvas with `ctx.putImageData()` — no regeneration.

**When to use:** Always wrap `generatePortrait()` calls through the cache.

**Example:**
```typescript
// src/ui/portrait/portraitCache.ts
const cache = new Map<string, ImageData>();

export function getOrGeneratePortrait(
  canvas: HTMLCanvasElement,
  player: PlayerState,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cached = cache.get(player.id);
  if (cached) {
    ctx.putImageData(cached, 0, 0);
    return;
  }

  generatePortrait(canvas, player);
  cache.set(player.id, ctx.getImageData(0, 0, canvas.width, canvas.height));
}
```

The cache is cleared on page unload naturally (module state). No persistence needed — deterministic generation means a cleared cache is not a problem.

### Anti-Patterns to Avoid

- **Using `Math.random()` in portrait generation:** Destroys determinism. Always use `createRng(seed)`.
- **Sharing the RNG instance across calls:** If the generator is called with the same player more than once (e.g., in two branches), a shared mutable RNG would produce different results. Always construct a fresh `createRng` per portrait draw (cache prevents the cost).
- **Generating a new portrait on every `update()` call:** The profile screen calls `update()` every time a player is viewed. Without the session cache, portrait generation (even if fast) fires on every navigation.
- **Using `canvas.toDataURL()` for cache:** `getImageData` / `putImageData` is faster and avoids base64 overhead for a session cache.
- **Making portrait size dynamic:** The canvas is fixed at 120×120 in the existing HTML. Keep it fixed; dynamic resizing invalidates cached `ImageData`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Seeded RNG | Custom LCG or hash-based PRNG | `createRng()` (seedrandom wrapper, already in project) | seedrandom is tested, has excellent period length, already installed |
| Colour palette lookup | Nationality → skin tone formula | Static palette table in `palettes.ts` | Formula-based skin tones are fragile; a curated table produces better visual results |
| Portrait caching | LocalStorage persistence | Session-level `Map<string, ImageData>` | Deterministic generation means no persistence is needed; Map is zero-overhead |

**Key insight:** The hardest part of this phase is not the code — it is the pixel art design. The face template (which logical pixels = hair, skin, eyes, etc.) must be designed by hand once and encoded as a data structure. Getting that template to look good at 20×24 pixels is where most of the effort will go.

---

## Common Pitfalls

### Pitfall 1: RNG Seed Not Stable Across Sessions

**What goes wrong:** Portrait changes every time the player profile is opened.
**Why it happens:** Using a runtime value (timestamp, index, random ID) as the seed instead of the persistent player ID.
**How to avoid:** Seed with `portrait-${player.id}`. Verify `player.id` is always the same stable string (it is: set at creation time in `teamGen.ts` as `${teamId}-player-${index}`).
**Warning signs:** Manual test — close and reopen the profile for the same player; portrait changes.

### Pitfall 2: RNG Call Order Drift

**What goes wrong:** Adding a new visual feature (e.g., freckles) early in the generation sequence changes the meaning of all subsequent RNG calls, producing different portraits for all existing players.
**Why it happens:** Each `rng()` call consumes one value from the sequence; inserting a call shifts all later values.
**How to avoid:** Design the full decision sequence before writing any code. Document the call order in a comment block at the top of `portraitGenerator.ts`. Never insert calls before existing ones once shipped; only append at the end.
**Warning signs:** After adding a feature, portraits for players whose IDs are unchanged look different.

### Pitfall 3: Nationality `undefined` Breaks Palette Lookup

**What goes wrong:** `getPalette(player.nationality)` crashes or returns an empty palette.
**Why it happens:** `PlayerState.nationality` is an optional field (`readonly nationality?: string`). Some players may have undefined nationality (e.g., the player team's players if generated differently).
**How to avoid:** Always provide a fallback palette (see Pattern 2 above). Use `?? FALLBACK_PALETTE`.
**Warning signs:** Console errors on specific player profiles; portrait renders wrong colour.

### Pitfall 4: Canvas Context Lost After innerHTML Replace

**What goes wrong:** Portrait draw runs after HTML is set, but the canvas element retrieved from the DOM is a different instance.
**Why it happens:** `playerProfileScreen.ts` sets `this.container.innerHTML = html` which creates a new DOM tree. The `querySelector('#player-avatar-canvas')` immediately after works, but if there is any async operation in between, the element may have been replaced again.
**How to avoid:** Draw the portrait synchronously in the same call frame as the `innerHTML` assignment, exactly as the existing `drawAvatar()` is called. No promises or `setTimeout`.
**Warning signs:** Portrait occasionally fails to appear on fast navigation between players.

### Pitfall 5: Portrait Looks the Same for All Players

**What goes wrong:** Every player gets the same face despite different IDs.
**Why it happens:** The visual feature space is too small — too few hair styles, or palette has only one colour per nationality.
**How to avoid:** Aim for at least 4 hair styles, 2-4 skin tones per nationality group, 4+ hair colours per palette, 3-4 eye colour options. This yields hundreds of combinations before any colour variation.
**Warning signs:** Squad screen (if browsed) shows visually identical portraits.

---

## Code Examples

### Complete Integration Point in playerProfileScreen.ts

```typescript
// Replace existing drawAvatar() call (line ~372 in playerProfileScreen.ts)
// Source: pattern derived from existing canvas draw pattern in playerProfileScreen.ts

import { getOrGeneratePortrait } from '../portrait/portraitCache.ts';

// Inside render(), after innerHTML is set:
const avatarCanvas = this.container.querySelector('#player-avatar-canvas') as HTMLCanvasElement | null;
if (avatarCanvas) {
  getOrGeneratePortrait(avatarCanvas, player);
}
```

### Pixel Grid Face Template (Conceptual Data Structure)

```typescript
// src/ui/portrait/portraitGenerator.ts
// Face layer codes: B=background, S=skin, H=hair, E=eye, M=mouth, D=dark-skin-shadow
// Grid is 20 wide × 24 tall; Y increases downward

// Hair style as a set of pixel coordinates that are "hair-coloured"
// (back hair below face, front hair above/around)
const HAIR_STYLE_0: Array<[number, number]> = [
  // back hair / outline
  [6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],[13,3],
  [5,4],[14,4],[5,5],[14,5],[5,6],[14,6],
  // top hair
  [7,2],[8,2],[9,2],[10,2],[11,2],[12,2],
  [8,1],[9,1],[10,1],[11,1],
];

// Skin region: oval face area
const SKIN_PIXELS: Array<[number, number]> = [
  // row 4 (forehead)
  [7,4],[8,4],[9,4],[10,4],[11,4],[12,4],
  // rows 5–11 (face)
  [6,5],[7,5],[8,5],[9,5],[10,5],[11,5],[12,5],[13,5],
  // ... etc
];

// Eyes: fixed pixel positions within face region
const LEFT_EYE:  Array<[number, number]> = [[8,7],[9,7]];
const RIGHT_EYE: Array<[number, number]> = [[11,7],[12,7]];

// Mouth
const MOUTH: Array<[number, number]> = [[8,11],[9,11],[10,11],[11,11]];
```

### Portrait Generator Entry Point

```typescript
// src/ui/portrait/portraitGenerator.ts
import { createRng } from '../../simulation/math/random.ts';
import { getPalette } from './palettes.ts';
import type { PlayerState } from '../../simulation/types.ts';

const GRID_W = 20;
const GRID_H = 24;
const SCALE_X = 6;
const SCALE_Y = 5;
const BG_COLOUR = '#0f172a'; // matches project dark theme

export function generatePortrait(
  canvas: HTMLCanvasElement,
  player: PlayerState,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Seed RNG from stable player ID
  const rng = createRng(`portrait-${player.id}`);

  // 2. Select palette from nationality
  const palette = getPalette(player.nationality);

  // 3. Draw decisions — order is fixed and must never change
  const skinColour   = palette.skin[Math.floor(rng() * palette.skin.length)]!;
  const hairStyleIdx = Math.floor(rng() * HAIR_STYLES.length);
  const hairColour   = palette.hair[Math.floor(rng() * palette.hair.length)]!;
  const eyeColour    = EYE_COLOURS[Math.floor(rng() * EYE_COLOURS.length)]!;
  // Future features: append rng() calls here only

  // 4. Clear canvas
  ctx.fillStyle = BG_COLOUR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 5. Draw layers (back-to-front)
  drawLayer(ctx, HAIR_STYLES[hairStyleIdx]!.back, hairColour);
  drawLayer(ctx, SKIN_PIXELS, skinColour);
  drawLayer(ctx, HAIR_STYLES[hairStyleIdx]!.front, hairColour);
  drawLayer(ctx, LEFT_EYE, eyeColour);
  drawLayer(ctx, RIGHT_EYE, eyeColour);
  drawLayer(ctx, MOUTH, '#8b3a2a');
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  pixels: ReadonlyArray<[number, number]>,
  colour: string,
): void {
  ctx.fillStyle = colour;
  for (const [gx, gy] of pixels) {
    ctx.fillRect(gx * SCALE_X, gy * SCALE_Y, SCALE_X, SCALE_Y);
  }
}

const EYE_COLOURS = ['#3a6a9e', '#5e8b3a', '#8b6a3a', '#3a3a3a', '#6a3a3a'];
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Shirt + initials avatar (`drawAvatar()` in playerProfileScreen.ts) | Pixel art portrait | Phase 10 (this phase) | Players gain individual visual identity |
| No caching (avatar redrawn every profile render) | Session-level `ImageData` cache | Phase 10 (this phase) | Zero re-generation cost on repeat visits |

**Deprecated/outdated:**
- `drawAvatar(canvas, player, shirtColor)`: Replaced entirely by `getOrGeneratePortrait(canvas, player)`. The shirt color is no longer the canvas content; the canvas border still uses `shirtColor` for team identification.

---

## Open Questions

1. **How many hair style templates to design?**
   - What we know: The pixel art face template must be hand-designed before coding. Each hair style is an array of (x, y) coordinate pairs.
   - What's unclear: How many hair styles are sufficient to make portraits feel distinct? More styles = more variety, but each requires manual design work.
   - Recommendation: Start with 4-5 distinct styles (short crop, medium, long, shaved/very short, curly/afro-adjacent). This gives enough variety across a 25-player squad without two players likely looking the same.

2. **Should the face template be symmetric?**
   - What we know: Symmetric faces are faster to design (design half, mirror). They also look cleaner at 20×24 resolution.
   - What's unclear: Asymmetric faces add character but are harder to design and test at this resolution.
   - Recommendation: Use a bilaterally symmetric face template. The skin/hair palette variation creates sufficient per-player uniqueness.

3. **Canvas border vs. portrait background**
   - What we know: The existing avatar canvas uses `border: 3px solid ${shirtColor}` — team colour is shown as the canvas border. The portrait background is the canvas interior.
   - What's unclear: Should the portrait have a transparent background (showing the dark page colour) or an explicit background colour?
   - Recommendation: Fill the canvas background with `#0f172a` (the project's dark base colour) before drawing the portrait, matching the existing `drawAvatar()` behaviour.

4. **Should portraits be circular-clipped?**
   - What we know: The canvas element has `border-radius: 50%` applied via CSS, so the rendering is already circular in appearance.
   - What's unclear: Should the portrait art be designed to account for corner clipping?
   - Recommendation: Design the face centred in the grid so that corner pixels (which are clipped by CSS) are background colour. No special code needed.

---

## Sources

### Primary (HIGH confidence)

- `src/ui/screens/playerProfileScreen.ts` — existing avatar implementation; integration point fully understood
- `src/simulation/math/random.ts` — `createRng()` pattern confirmed; seedrandom already used
- `src/simulation/types.ts` — `PlayerState.nationality?: string` confirmed optional; `player.id` confirmed stable
- `src/season/teamGen.ts` — nationality codes confirmed: GB, ES, FR, DE, BR (+ IT, PT, NL, AR, NG from NAT_NAMES in profileScreen)
- `package.json` — seedrandom 3.0.5 confirmed installed; no Canvas library needed (browser built-in)

### Secondary (MEDIUM confidence)

- tamats.com pixelart face generator blog — layered compositing approach verified as industry pattern for pixel art portrait assembly; `drawImage` + canvas layering confirmed approach
- abagames.github.io — parts-based assembly confirmed as dominant approach over AI/GAN methods for deterministic, in-browser pixel art generation
- lospec.com/palette-list/tag/skin — skin tone palette categories confirmed; hex values not directly verified from this source

### Tertiary (LOW confidence)

- Hex colour values in the `NATIONALITY_PALETTES` example above — derived from general knowledge of pixel art skin tone conventions; should be reviewed visually during implementation and adjusted to taste
- Hair style coordinate arrays — illustrative only; actual coordinates must be designed during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — seedrandom already in project, Canvas 2D already used for this exact canvas element
- Architecture: HIGH — existing `drawAvatar()` pattern is a direct template; replacement is surgical
- Pitfalls: HIGH — RNG ordering and optional nationality field are concrete, verifiable risks
- Palette colours: LOW — hex values are illustrative starting points, not verified against a specific reference palette

**Research date:** 2026-03-07
**Valid until:** 2026-09-07 (stable domain; Canvas 2D and seedrandom API are very stable)

/**
 * Deterministic pixel art portrait generator.
 *
 * Renders a 120×120 portrait on a canvas using a 20×24 logical pixel grid
 * scaled to 6×5 canvas pixels per logical pixel. All visual decisions are
 * driven by a seeded RNG keyed to `player.id`, guaranteeing the same portrait
 * across sessions for the same player.
 *
 * RNG CALL ORDER — must never change after shipping:
 *   1. skinIdx       — index into palette.skin array
 *   2. hairStyleIdx  — index into HAIR_STYLES array
 *   3. hairColIdx    — index into palette.hair array
 *   4. eyeColIdx     — index into EYE_COLOURS array
 *   5. hasFacialHair — boolean (rng() > 0.65)
 *
 * To add new features, append additional rng() calls AFTER item 5 only.
 * Never insert calls before existing ones — it would change all existing portraits.
 */

import { createRng } from '../../simulation/math/random.ts';
import { getPalette } from './palettes.ts';
import type { PlayerState } from '../../simulation/types.ts';

const GRID_W = 20;
const GRID_H = 24;
const SCALE_X = 6; // 20 * 6 = 120
const SCALE_Y = 5; // 24 * 5 = 120
const BG_COLOUR = '#0f172a'; // project dark theme background

// ── Face template coordinates (logical pixels, 0-indexed) ───────────────────
// Grid is 20 wide × 24 tall, Y increases downward.
// Face is centred horizontally (columns 4-15) and vertically (rows 3-20).
// Corner pixels are clipped by CSS border-radius: 50% — keep them as background.

// Skin region: oval face shape
// Bilaterally symmetric: designed for cols 4-15, rows 4-18
const SKIN_PIXELS: ReadonlyArray<[number, number]> = [
  // Row 4: forehead top
  [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
  // Row 5: forehead
  [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5],
  // Row 6: upper face
  [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
  // Row 7: eye level (gaps for eyes)
  [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [14, 7],
  // Row 8: between eyes and nose
  [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  // Row 9: nose level
  [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [14, 9],
  // Row 10: below nose
  [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [12, 10], [13, 10], [14, 10],
  // Row 11: upper lip
  [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11],
  // Row 12: mouth level (gaps for mouth)
  [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12], [12, 12], [13, 12],
  // Row 13: chin upper
  [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13], [13, 13],
  // Row 14: chin
  [7, 14], [8, 14], [9, 14], [10, 14], [11, 14], [12, 14],
  // Row 15: chin tip
  [8, 15], [9, 15], [10, 15], [11, 15],
];

// Ears: 1-2 pixels each side at eye level (slightly darker than skin, drawn over skin)
const LEFT_EAR: ReadonlyArray<[number, number]> = [[4, 7], [4, 8]];
const RIGHT_EAR: ReadonlyArray<[number, number]> = [[15, 7], [15, 8]];

// Nose: subtle shadow below eye line
const NOSE: ReadonlyArray<[number, number]> = [[9, 10], [10, 10]];

// Eyes: fixed positions (will be overridden with eye colour)
const LEFT_EYE: ReadonlyArray<[number, number]> = [[7, 7], [8, 7]];
const RIGHT_EYE: ReadonlyArray<[number, number]> = [[11, 7], [12, 7]];

// Mouth: fixed position
const MOUTH: ReadonlyArray<[number, number]> = [[8, 12], [9, 12], [10, 12], [11, 12]];

// ── Hair styles ─────────────────────────────────────────────────────────────
// Each style has back (drawn behind skin) and front (drawn in front of skin) layers.
// Back layer: visible around the head perimeter and below chin line.
// Front layer: visible above forehead, falling over face sides.

interface HairStyle {
  readonly back: ReadonlyArray<[number, number]>;
  readonly front: ReadonlyArray<[number, number]>;
}

// Style 0: Short crop — close-cropped, minimal overhang
const HAIR_SHORT_CROP: HairStyle = {
  back: [
    // sides and back
    [5, 4], [5, 5], [5, 6],
    [14, 4], [14, 5], [14, 6],
    // above neckline
    [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
  ],
  front: [
    // top of head, tight crop
    [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
    [8, 2], [9, 2], [10, 2], [11, 2],
  ],
};

// Style 1: Medium side part — slightly longer, parted to one side
const HAIR_MEDIUM_PART: HairStyle = {
  back: [
    [5, 4], [5, 5], [5, 6],
    [14, 4], [14, 5], [14, 6],
    [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
  ],
  front: [
    // slightly wider top
    [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3],
    [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2],
    [8, 1], [9, 1], [10, 1],
    // side part draping left
    [6, 4], [6, 5],
  ],
};

// Style 2: Long — extends below head, visible at sides
const HAIR_LONG: HairStyle = {
  back: [
    // long back flowing down
    [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10],
    [14, 4], [14, 5], [14, 6], [14, 7], [14, 8], [14, 9], [14, 10],
    [4, 5], [4, 6], [4, 7], [4, 8], [4, 9],
    [15, 5], [15, 6], [15, 7], [15, 8], [15, 9],
    [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
    [6, 17], [7, 17], [8, 17], [9, 17], [10, 17], [11, 17], [12, 17], [13, 17],
  ],
  front: [
    [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
    [7, 2], [8, 2], [9, 2], [10, 2], [11, 2],
    [8, 1], [9, 1], [10, 1], [11, 1],
  ],
};

// Style 3: Shaved/buzz — very minimal, almost no hair
const HAIR_SHAVED: HairStyle = {
  back: [
    [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
  ],
  front: [
    // just a stubble shadow at top
    [8, 3], [9, 3], [10, 3], [11, 3],
    [7, 3], [12, 3],
  ],
};

// Style 4: Curly/textured — wide, voluminous hair
const HAIR_CURLY: HairStyle = {
  back: [
    [4, 4], [4, 5], [4, 6], [4, 7],
    [15, 4], [15, 5], [15, 6], [15, 7],
    [5, 3], [5, 4], [5, 5],
    [14, 3], [14, 4], [14, 5],
    [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
  ],
  front: [
    // wide bushy top
    [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],
    [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
    [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
    // sides puffed out
    [5, 3], [5, 4], [5, 5],
    [14, 3], [14, 4], [14, 5],
    // alternating texture pattern for curly look
    [6, 3], [13, 3],
  ],
};

const HAIR_STYLES: ReadonlyArray<HairStyle> = [
  HAIR_SHORT_CROP,  // 0
  HAIR_MEDIUM_PART, // 1
  HAIR_LONG,        // 2
  HAIR_SHAVED,      // 3
  HAIR_CURLY,       // 4
];

// Facial hair: moustache/stubble pixels (drawn over lower face skin)
const FACIAL_HAIR: ReadonlyArray<[number, number]> = [
  [8, 11], [9, 11], [10, 11], [11, 11],   // moustache row
  [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13], // chin stubble
];

// Eye colour options
const EYE_COLOURS: ReadonlyArray<string> = [
  '#3a6a9e', // blue
  '#5e8b3a', // green
  '#8b6a3a', // brown
  '#3a3a3a', // dark brown / near black
  '#6a4a2a', // hazel
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function setPixel(ctx: CanvasRenderingContext2D, gx: number, gy: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(gx * SCALE_X, gy * SCALE_Y, SCALE_X, SCALE_Y);
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

/** Darken a hex colour by a fixed amount (0–255). */
function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Renders a deterministic pixel art portrait onto the given canvas.
 *
 * The canvas must be 120×120 pixels. The portrait is keyed to `player.id`
 * and `player.nationality`. The same player always produces the same portrait.
 */
export function generatePortrait(canvas: HTMLCanvasElement, player: PlayerState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // 1. Seed RNG with namespaced player ID for session-independent determinism
  const rng = createRng(`portrait-${player.id}`);

  // 2. Select nationality palette
  const palette = getPalette(player.nationality);

  // 3. Fixed decision sequence — order must never change after shipping
  const skinColour   = palette.skin[Math.floor(rng() * palette.skin.length)]!;   // call 1
  const hairStyleIdx = Math.floor(rng() * HAIR_STYLES.length);                    // call 2
  const hairColour   = palette.hair[Math.floor(rng() * palette.hair.length)]!;   // call 3
  const eyeColour    = EYE_COLOURS[Math.floor(rng() * EYE_COLOURS.length)]!;     // call 4
  const hasFacialHair = rng() > 0.65;                                             // call 5
  // Future features: append rng() calls here only

  const hairStyle = HAIR_STYLES[hairStyleIdx]!;
  const earColour = darken(skinColour, 20);
  const noseColour = darken(skinColour, 30);
  const facialHairColour = darken(hairColour, 10);

  // 4. Clear canvas with background colour
  ctx.fillStyle = BG_COLOUR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Centre the portrait within the circular avatar area.
  // The 20×24 logical grid draws face content mostly in cols 4-15 and rows 2-16.
  // That maps to canvas x 24-96 (centred at 60) and y 10-85 (centred at ~47).
  // The canvas circle centre is at (60, 60), so we translate down by 13px to align.
  ctx.save();
  ctx.translate(0, 13);

  // 5. Draw layers back-to-front
  // Layer 1: Hair back (behind face — neckline, sides visible around head)
  drawLayer(ctx, hairStyle.back, hairColour);

  // Layer 2: Skin — oval face shape
  drawLayer(ctx, SKIN_PIXELS, skinColour);

  // Layer 3: Ears (over skin, slightly darker)
  drawLayer(ctx, LEFT_EAR, earColour);
  drawLayer(ctx, RIGHT_EAR, earColour);

  // Layer 4: Nose shadow (subtle, 2 pixels)
  drawLayer(ctx, NOSE, noseColour);

  // Layer 5: Eyes
  drawLayer(ctx, LEFT_EYE, eyeColour);
  drawLayer(ctx, RIGHT_EYE, eyeColour);

  // Layer 6: Mouth
  drawLayer(ctx, MOUTH, '#8b3a2a');

  // Layer 7: Facial hair (optional)
  if (hasFacialHair) {
    drawLayer(ctx, FACIAL_HAIR, facialHairColour);
  }

  // Layer 8: Hair front (over face — top of head, falls around forehead)
  drawLayer(ctx, hairStyle.front, hairColour);

  ctx.restore();

  // Suppress unused-variable warnings for GRID_W, GRID_H (kept for documentation)
  void (GRID_W + GRID_H);
}

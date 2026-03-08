/**
 * Pixel art portrait generator.
 *
 * Uses a coarse 20x24 source template, expands it to a denser 2x logical grid,
 * then adds higher-detail face layers so portraits read better in larger avatar
 * circles without changing the overall retro style.
 */

import type { PlayerState } from '../../simulation/types.ts';
import { getPalette } from './palettes.ts';
import { EYE_COLOURS, readPaletteColour, resolvePortraitSpec } from './portraitSpec.ts';

const SOURCE_GRID_W = 20;
const SOURCE_GRID_H = 24;
const DETAIL_SCALE = 2;
const GRID_W = SOURCE_GRID_W * DETAIL_SCALE;
const GRID_H = SOURCE_GRID_H * DETAIL_SCALE;
const BG_COLOUR = '#0f172a';
const ACTIVE_RENDERER: 'soft' | 'legacy' = 'legacy';

type Pixel = readonly [number, number];

interface HairStyle {
  readonly back: readonly Pixel[];
  readonly front: readonly Pixel[];
  readonly highlight: readonly Pixel[];
}

interface SilhouetteVariant {
  readonly skinAdd: readonly Pixel[];
  readonly skinRemove: readonly Pixel[];
  readonly neckAdd: readonly Pixel[];
  readonly neckRemove: readonly Pixel[];
  readonly earLeftAdd: readonly Pixel[];
  readonly earLeftRemove: readonly Pixel[];
  readonly earRightAdd: readonly Pixel[];
  readonly earRightRemove: readonly Pixel[];
  readonly foreheadHighlightAdd: readonly Pixel[];
  readonly cheekShadeAdd: readonly Pixel[];
  readonly chinShadeAdd: readonly Pixel[];
}

interface HairVolumeVariant {
  readonly backAdd: readonly Pixel[];
  readonly backRemove: readonly Pixel[];
  readonly frontAdd: readonly Pixel[];
  readonly frontRemove: readonly Pixel[];
  readonly highlightAdd: readonly Pixel[];
}

interface RenderMetrics {
  scale: number;
  offsetX: number;
  offsetY: number;
}

const SKIN_PIXELS: readonly Pixel[] = [
  [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4],
  [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5],
  [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6],
  [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [11, 7], [12, 7], [13, 7], [14, 7],
  [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [5, 9], [6, 9], [7, 9], [8, 9], [9, 9], [10, 9], [11, 9], [12, 9], [13, 9], [14, 9],
  [5, 10], [6, 10], [7, 10], [8, 10], [9, 10], [10, 10], [11, 10], [12, 10], [13, 10], [14, 10],
  [6, 11], [7, 11], [8, 11], [9, 11], [10, 11], [11, 11], [12, 11], [13, 11],
  [6, 12], [7, 12], [8, 12], [9, 12], [10, 12], [11, 12], [12, 12], [13, 12],
  [6, 13], [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13], [13, 13],
  [7, 14], [8, 14], [9, 14], [10, 14], [11, 14], [12, 14],
  [8, 15], [9, 15], [10, 15], [11, 15],
];

const LEFT_EAR: readonly Pixel[] = [[4, 7], [4, 8]];
const RIGHT_EAR: readonly Pixel[] = [[15, 7], [15, 8]];
const NOSE: readonly Pixel[] = [[9, 10], [10, 10]];
const LEFT_EYE: readonly Pixel[] = [[7, 7], [8, 7]];
const RIGHT_EYE: readonly Pixel[] = [[11, 7], [12, 7]];
const MOUTH: readonly Pixel[] = [[8, 12], [9, 12], [10, 12], [11, 12]];
const FACIAL_HAIR: readonly Pixel[] = [
  [8, 11], [9, 11], [10, 11], [11, 11],
  [7, 13], [8, 13], [9, 13], [10, 13], [11, 13], [12, 13],
];

const HAIR_STYLES_SRC: readonly Array<{ back: readonly Pixel[]; front: readonly Pixel[]; highlight: readonly Pixel[] }> = [
  {
    back: [
      [5, 4], [5, 5], [5, 6],
      [14, 4], [14, 5], [14, 6],
      [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
    ],
    front: [
      [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3],
      [8, 2], [9, 2], [10, 2], [11, 2],
    ],
    highlight: [[8, 2], [9, 2], [10, 2]],
  },
  {
    back: [
      [5, 4], [5, 5], [5, 6],
      [14, 4], [14, 5], [14, 6],
      [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
    ],
    front: [
      [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3],
      [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2],
      [8, 1], [9, 1], [10, 1],
      [6, 4], [6, 5],
    ],
    highlight: [[9, 1], [10, 1], [11, 2], [12, 2]],
  },
  {
    back: [
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
    highlight: [[8, 1], [9, 1], [10, 1]],
  },
  {
    back: [
      [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
    ],
    front: [
      [8, 3], [9, 3], [10, 3], [11, 3],
      [7, 3], [12, 3],
    ],
    highlight: [[9, 3], [10, 3]],
  },
  {
    back: [
      [4, 4], [4, 5], [4, 6], [4, 7],
      [15, 4], [15, 5], [15, 6], [15, 7],
      [5, 3], [5, 4], [5, 5],
      [14, 3], [14, 4], [14, 5],
      [6, 16], [7, 16], [8, 16], [9, 16], [10, 16], [11, 16], [12, 16], [13, 16],
    ],
    front: [
      [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],
      [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
      [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3],
      [5, 3], [5, 4], [5, 5],
      [14, 3], [14, 4], [14, 5],
      [6, 3], [13, 3],
    ],
    highlight: [[8, 1], [10, 1], [12, 1], [9, 2], [11, 2]],
  },
];

function upscalePixels(pixels: readonly Pixel[], factor: number = DETAIL_SCALE): Pixel[] {
  const out: Pixel[] = [];
  for (const [x, y] of pixels) {
    for (let dy = 0; dy < factor; dy++) {
      for (let dx = 0; dx < factor; dx++) {
        out.push([x * factor + dx, y * factor + dy]);
      }
    }
  }
  return out;
}

function toDetailPixels(pixels: readonly Pixel[]): Pixel[] {
  return pixels.map(([x, y]) => [x, y]);
}

function pixelKey([x, y]: Pixel): string {
  return `${x},${y}`;
}

function parsePixelKey(key: string): Pixel {
  const [x, y] = key.split(',').map(Number);
  return [x, y];
}

function sortPixels(a: Pixel, b: Pixel): number {
  return a[1] - b[1] || a[0] - b[0];
}

function applyPixelMutations(base: readonly Pixel[], add: readonly Pixel[] = [], remove: readonly Pixel[] = []): Pixel[] {
  const pixels = new Set(base.map(pixelKey));
  for (const pixel of remove) pixels.delete(pixelKey(pixel));
  for (const pixel of add) pixels.add(pixelKey(pixel));
  return Array.from(pixels, parsePixelKey).sort(sortPixels);
}

const HAIR_STYLES: readonly HairStyle[] = HAIR_STYLES_SRC.map((style) => ({
  back: upscalePixels(style.back),
  front: upscalePixels(style.front),
  highlight: upscalePixels(style.highlight),
}));

const SKIN_BASE = upscalePixels(SKIN_PIXELS);
const EAR_LEFT_BASE = toDetailPixels([[9, 15], [8, 16], [8, 17], [9, 18]]);
const EAR_RIGHT_BASE = toDetailPixels([[30, 15], [31, 16], [31, 17], [30, 18]]);
const EYE_LEFT_WHITE = toDetailPixels([[14, 15], [15, 15], [16, 15], [17, 15], [15, 16], [16, 16]]);
const EYE_RIGHT_WHITE = toDetailPixels([[22, 15], [23, 15], [24, 15], [25, 15], [23, 16], [24, 16]]);
const MOUTH_BASE = toDetailPixels([[18, 25], [19, 25], [20, 25], [21, 25], [18, 26], [19, 26], [20, 26], [21, 26]]);
const FACIAL_HAIR_BASE = toDetailPixels([[17, 24], [18, 24], [21, 24], [22, 24], [18, 28], [19, 29], [20, 29], [21, 28]]);

const NECK = toDetailPixels([
  [17, 31], [18, 31], [19, 31], [20, 31], [21, 31], [22, 31],
  [17, 32], [18, 32], [19, 32], [20, 32], [21, 32], [22, 32],
  [18, 33], [19, 33], [20, 33], [21, 33],
]);

const FOREHEAD_HIGHLIGHT = toDetailPixels([
  [17, 10], [18, 10], [19, 10], [20, 10], [21, 10], [22, 10],
  [16, 11], [17, 11], [18, 11], [19, 11], [20, 11], [21, 11],
]);

const LEFT_CHEEK_HIGHLIGHT = toDetailPixels([[13, 20], [14, 20], [14, 21], [15, 21]]);
const RIGHT_CHEEK_HIGHLIGHT = toDetailPixels([[24, 20], [25, 20], [23, 21], [24, 21]]);
const LEFT_CHEEK_SHADE = toDetailPixels([[12, 22], [13, 23], [13, 24], [14, 25]]);
const RIGHT_CHEEK_SHADE = toDetailPixels([[25, 22], [24, 23], [24, 24], [23, 25]]);
const CHIN_SHADE = toDetailPixels([[17, 28], [18, 28], [19, 29], [20, 29], [21, 28], [22, 28]]);

const LEFT_BROW = toDetailPixels([[14, 13], [15, 12], [16, 12], [17, 12]]);
const RIGHT_BROW = toDetailPixels([[22, 12], [23, 12], [24, 12], [25, 13]]);
const LEFT_IRIS = toDetailPixels([[15, 15], [16, 15], [15, 16]]);
const RIGHT_IRIS = toDetailPixels([[23, 15], [24, 15], [24, 16]]);
const LEFT_PUPIL = toDetailPixels([[16, 15]]);
const RIGHT_PUPIL = toDetailPixels([[23, 15]]);
const LEFT_EYE_SHADOW = toDetailPixels([[15, 17], [16, 17], [17, 17]]);
const RIGHT_EYE_SHADOW = toDetailPixels([[22, 17], [23, 17], [24, 17]]);

const NOSE_BRIDGE = toDetailPixels([[19, 16], [20, 16], [19, 17], [20, 17], [19, 18], [20, 18]]);
const NOSE_TIP = toDetailPixels([[18, 20], [19, 20], [20, 20], [21, 20], [19, 21], [20, 21]]);
const NOSE_SIDE_SHADE = toDetailPixels([[18, 18], [18, 19], [21, 18], [21, 19]]);

const UPPER_LIP = toDetailPixels([[18, 24], [19, 24], [20, 24], [21, 24]]);
const LOWER_LIP = toDetailPixels([[18, 26], [19, 26], [20, 26], [21, 26]]);
const MOUTH_SHADE = toDetailPixels([[18, 27], [19, 27], [20, 27], [21, 27]]);

const BEARD_EXTRA = toDetailPixels([[17, 28], [18, 29], [21, 29], [22, 28]]);

const HAIRLINE_VARIANTS = [
  {
    fill: toDetailPixels([[12, 10], [13, 10], [14, 10], [25, 10], [26, 10], [27, 10], [13, 11], [26, 11]]),
    highlight: toDetailPixels([[14, 9], [25, 9]]),
  },
  {
    fill: toDetailPixels([[13, 10], [14, 9], [15, 9], [18, 8], [19, 7], [20, 7], [21, 8], [24, 9], [25, 9], [26, 10]]),
    highlight: toDetailPixels([[18, 7], [20, 7], [22, 8]]),
  },
  {
    fill: toDetailPixels([[13, 9], [14, 9], [15, 10], [24, 10], [25, 9], [26, 9], [13, 10], [26, 10]]),
    highlight: toDetailPixels([[15, 9], [24, 9]]),
  },
  {
    fill: toDetailPixels([[11, 10], [12, 10], [13, 10], [14, 9], [17, 9], [18, 9], [19, 9], [20, 9], [21, 9], [22, 9], [25, 9], [26, 10], [27, 10], [28, 10]]),
    highlight: toDetailPixels([[17, 9], [20, 9], [23, 9]]),
  },
] as const;

const FACE_SHAPE_VARIANTS = [
  {
    cheekHighlight: toDetailPixels([[13, 22], [25, 22]]),
    jawShade: toDetailPixels([[15, 27], [24, 27], [16, 29], [23, 29]]),
  },
  {
    cheekHighlight: toDetailPixels([[12, 21], [13, 21], [25, 21], [26, 21]]),
    jawShade: toDetailPixels([[14, 27], [15, 28], [24, 28], [25, 27], [18, 30], [21, 30]]),
  },
  {
    cheekHighlight: toDetailPixels([[14, 21], [15, 22], [23, 22], [24, 21]]),
    jawShade: toDetailPixels([[16, 27], [17, 28], [22, 28], [23, 27], [19, 30], [20, 30]]),
  },
] as const;

const SILHOUETTE_VARIANTS: readonly SilhouetteVariant[] = [
  {
    skinAdd: toDetailPixels([]),
    skinRemove: toDetailPixels([]),
    neckAdd: toDetailPixels([]),
    neckRemove: toDetailPixels([]),
    earLeftAdd: toDetailPixels([]),
    earLeftRemove: toDetailPixels([]),
    earRightAdd: toDetailPixels([]),
    earRightRemove: toDetailPixels([]),
    foreheadHighlightAdd: toDetailPixels([[18, 9], [19, 9], [20, 9], [21, 9]]),
    cheekShadeAdd: toDetailPixels([[14, 24], [23, 24]]),
    chinShadeAdd: toDetailPixels([[18, 29], [21, 29]]),
  },
  {
    skinAdd: toDetailPixels([]),
    skinRemove: toDetailPixels([]),
    neckAdd: toDetailPixels([]),
    neckRemove: toDetailPixels([]),
    earLeftAdd: toDetailPixels([]),
    earLeftRemove: toDetailPixels([]),
    earRightAdd: toDetailPixels([]),
    earRightRemove: toDetailPixels([]),
    foreheadHighlightAdd: toDetailPixels([[16, 10], [17, 10], [22, 10], [23, 10]]),
    cheekShadeAdd: toDetailPixels([[13, 23], [24, 23], [14, 25], [23, 25]]),
    chinShadeAdd: toDetailPixels([[17, 29], [22, 29]]),
  },
  {
    skinAdd: toDetailPixels([]),
    skinRemove: toDetailPixels([]),
    neckAdd: toDetailPixels([]),
    neckRemove: toDetailPixels([]),
    earLeftAdd: toDetailPixels([]),
    earLeftRemove: toDetailPixels([]),
    earRightAdd: toDetailPixels([]),
    earRightRemove: toDetailPixels([]),
    foreheadHighlightAdd: toDetailPixels([[15, 11], [16, 10], [23, 10], [24, 11]]),
    cheekShadeAdd: toDetailPixels([[12, 24], [25, 24], [13, 26], [24, 26]]),
    chinShadeAdd: toDetailPixels([[18, 30], [19, 30], [20, 30], [21, 30]]),
  },
  {
    skinAdd: toDetailPixels([]),
    skinRemove: toDetailPixels([]),
    neckAdd: toDetailPixels([]),
    neckRemove: toDetailPixels([]),
    earLeftAdd: toDetailPixels([]),
    earLeftRemove: toDetailPixels([]),
    earRightAdd: toDetailPixels([]),
    earRightRemove: toDetailPixels([]),
    foreheadHighlightAdd: toDetailPixels([[18, 8], [19, 8], [20, 8], [21, 8], [17, 9], [22, 9]]),
    cheekShadeAdd: toDetailPixels([[13, 24], [24, 24], [14, 26], [23, 26]]),
    chinShadeAdd: toDetailPixels([[18, 29], [19, 30], [20, 30], [21, 29]]),
  },
] as const;

const HAIR_VOLUME_VARIANTS: readonly HairVolumeVariant[] = [
  {
    backAdd: toDetailPixels([]),
    backRemove: toDetailPixels([]),
    frontAdd: toDetailPixels([]),
    frontRemove: toDetailPixels([]),
    highlightAdd: toDetailPixels([]),
  },
  {
    backAdd: toDetailPixels([[11, 11], [12, 10], [27, 10], [28, 11]]),
    backRemove: toDetailPixels([]),
    frontAdd: toDetailPixels([[15, 8], [16, 8], [23, 8], [24, 8]]),
    frontRemove: toDetailPixels([]),
    highlightAdd: toDetailPixels([[16, 7], [23, 7], [19, 7], [20, 7]]),
  },
  {
    backAdd: toDetailPixels([[12, 12], [27, 12]]),
    backRemove: toDetailPixels([]),
    frontAdd: toDetailPixels([[16, 10], [17, 9], [18, 9], [21, 9], [22, 9], [23, 10]]),
    frontRemove: toDetailPixels([]),
    highlightAdd: toDetailPixels([[18, 9], [21, 9], [19, 9], [20, 9]]),
  },
  {
    backAdd: toDetailPixels([[10, 12], [29, 12], [11, 29], [28, 29]]),
    backRemove: toDetailPixels([]),
    frontAdd: toDetailPixels([[13, 9], [14, 8], [15, 8], [25, 8], [26, 9], [27, 10], [13, 10], [26, 10]]),
    frontRemove: toDetailPixels([]),
    highlightAdd: toDetailPixels([[15, 8], [25, 8], [16, 9], [24, 9]]),
  },
] as const;

const EYE_VARIANTS = [
  {
    browExtra: toDetailPixels([]),
    lowerLid: toDetailPixels([[15, 18], [16, 18], [23, 18], [24, 18]]),
  },
  {
    browExtra: toDetailPixels([[13, 13], [14, 12], [25, 12], [26, 13]]),
    lowerLid: toDetailPixels([[14, 18], [15, 18], [24, 18], [25, 18]]),
  },
  {
    browExtra: toDetailPixels([[14, 14], [15, 13], [24, 13], [25, 14]]),
    lowerLid: toDetailPixels([[16, 18], [17, 18], [22, 18], [23, 18]]),
  },
  {
    browExtra: toDetailPixels([[13, 14], [14, 13], [25, 13], [26, 14]]),
    lowerLid: toDetailPixels([[15, 19], [16, 19], [23, 19], [24, 19]]),
  },
] as const;

const NOSE_VARIANTS = [
  {
    bridge: toDetailPixels([[19, 15], [20, 15]]),
    nostrils: toDetailPixels([[18, 22], [21, 22]]),
  },
  {
    bridge: toDetailPixels([[19, 15], [20, 15], [19, 16], [20, 16]]),
    nostrils: toDetailPixels([[17, 22], [18, 22], [21, 22], [22, 22]]),
  },
  {
    bridge: toDetailPixels([[19, 15], [20, 15], [18, 16], [21, 16]]),
    nostrils: toDetailPixels([[18, 21], [21, 21], [19, 22], [20, 22]]),
  },
] as const;

const MOUTH_VARIANTS = [
  {
    corners: toDetailPixels([[17, 25], [22, 25]]),
    philtrum: toDetailPixels([[19, 23], [20, 23]]),
  },
  {
    corners: toDetailPixels([[17, 25], [18, 25], [21, 25], [22, 25]]),
    philtrum: toDetailPixels([[19, 23], [20, 23], [19, 24]]),
  },
  {
    corners: toDetailPixels([[17, 25], [22, 25], [18, 26], [21, 26]]),
    philtrum: toDetailPixels([[19, 23], [20, 23], [20, 24]]),
  },
  {
    corners: toDetailPixels([[17, 26], [22, 26], [18, 27], [21, 27]]),
    philtrum: toDetailPixels([[18, 23], [19, 23], [20, 23], [21, 23]]),
  },
] as const;

const ALL_PORTRAIT_PIXELS: readonly Pixel[][] = [
  SKIN_BASE,
  EAR_LEFT_BASE,
  EAR_RIGHT_BASE,
  EYE_LEFT_WHITE,
  EYE_RIGHT_WHITE,
  MOUTH_BASE,
  FACIAL_HAIR_BASE,
  NECK,
  FOREHEAD_HIGHLIGHT,
  LEFT_CHEEK_HIGHLIGHT,
  RIGHT_CHEEK_HIGHLIGHT,
  LEFT_CHEEK_SHADE,
  RIGHT_CHEEK_SHADE,
  CHIN_SHADE,
  LEFT_BROW,
  RIGHT_BROW,
  LEFT_IRIS,
  RIGHT_IRIS,
  LEFT_PUPIL,
  RIGHT_PUPIL,
  LEFT_EYE_SHADOW,
  RIGHT_EYE_SHADOW,
  NOSE_BRIDGE,
  NOSE_TIP,
  NOSE_SIDE_SHADE,
  UPPER_LIP,
  LOWER_LIP,
  MOUTH_SHADE,
  BEARD_EXTRA,
  ...SILHOUETTE_VARIANTS.flatMap((variant) => [
    variant.skinAdd,
    variant.neckAdd,
    variant.earLeftAdd,
    variant.earRightAdd,
    variant.foreheadHighlightAdd,
    variant.cheekShadeAdd,
    variant.chinShadeAdd,
  ]),
  ...HAIR_VOLUME_VARIANTS.flatMap((variant) => [variant.backAdd, variant.frontAdd, variant.highlightAdd]),
  ...HAIRLINE_VARIANTS.flatMap((variant) => [variant.fill, variant.highlight]),
  ...FACE_SHAPE_VARIANTS.flatMap((variant) => [variant.cheekHighlight, variant.jawShade]),
  ...EYE_VARIANTS.flatMap((variant) => [variant.browExtra, variant.lowerLid]),
  ...NOSE_VARIANTS.flatMap((variant) => [variant.bridge, variant.nostrils]),
  ...MOUTH_VARIANTS.flatMap((variant) => [variant.corners, variant.philtrum]),
  ...HAIR_STYLES.flatMap((style) => [style.back, style.front, style.highlight]),
];

const CONTENT_BOUNDS = ALL_PORTRAIT_PIXELS.reduce(
  (bounds, pixels) => {
    for (const [gx, gy] of pixels) {
      bounds.minX = Math.min(bounds.minX, gx);
      bounds.maxX = Math.max(bounds.maxX, gx);
      bounds.minY = Math.min(bounds.minY, gy);
      bounds.maxY = Math.max(bounds.maxY, gy);
    }
    return bounds;
  },
  { minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY },
);

const CONTENT_W = CONTENT_BOUNDS.maxX - CONTENT_BOUNDS.minX + 1;
const CONTENT_H = CONTENT_BOUNDS.maxY - CONTENT_BOUNDS.minY + 1;
const CONTENT_PADDING = 1;

function getRenderMetrics(canvas: HTMLCanvasElement): RenderMetrics {
  const scale = Math.max(
    1,
    Math.floor(Math.min(
      canvas.width / (CONTENT_W + CONTENT_PADDING * 2),
      canvas.height / (CONTENT_H + CONTENT_PADDING * 2),
    )),
  );
  const drawnWidth = CONTENT_W * scale;
  const drawnHeight = CONTENT_H * scale;
  return {
    scale,
    offsetX: Math.floor((canvas.width - drawnWidth) / 2) - CONTENT_BOUNDS.minX * scale,
    offsetY: Math.floor((canvas.height - drawnHeight) / 2) - CONTENT_BOUNDS.minY * scale,
  };
}

function setPixelLegacy(ctx: CanvasRenderingContext2D, metrics: RenderMetrics, gx: number, gy: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(
    metrics.offsetX + gx * metrics.scale,
    metrics.offsetY + gy * metrics.scale,
    metrics.scale,
    metrics.scale,
  );
}

function setPixelSoft(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  pixels: ReadonlySet<string>,
  gx: number,
  gy: number,
  colour: string,
): void {
  const key = `${gx},${gy}`;
  if (!pixels.has(key)) return;

  const x = metrics.offsetX + gx * metrics.scale;
  const y = metrics.offsetY + gy * metrics.scale;
  const inset = Math.max(1, Math.floor(metrics.scale * 0.2));

  const hasLeft = pixels.has(`${gx - 1},${gy}`);
  const hasRight = pixels.has(`${gx + 1},${gy}`);
  const hasTop = pixels.has(`${gx},${gy - 1}`);
  const hasBottom = pixels.has(`${gx},${gy + 1}`);

  const leftInset = hasLeft ? 0 : inset;
  const rightInset = hasRight ? 0 : inset;
  const topInset = hasTop ? 0 : inset;
  const bottomInset = hasBottom ? 0 : inset;

  ctx.fillStyle = colour;
  ctx.fillRect(
    x + leftInset,
    y + topInset,
    Math.max(1, metrics.scale - leftInset - rightInset),
    Math.max(1, metrics.scale - topInset - bottomInset),
  );
}

function drawLayer(
  ctx: CanvasRenderingContext2D,
  metrics: RenderMetrics,
  pixels: readonly Pixel[],
  colour: string,
  renderMode: 'active' | 'soft' | 'legacy' = 'active',
): void {
  const mode = renderMode === 'active' ? ACTIVE_RENDERER : renderMode;
  if (mode === 'legacy') {
    for (const [gx, gy] of pixels) {
      setPixelLegacy(ctx, metrics, gx, gy, colour);
    }
    return;
  }

  const pixelSet = new Set(pixels.map(([gx, gy]) => `${gx},${gy}`));
  for (const [gx, gy] of pixels) {
    setPixelSoft(ctx, metrics, pixelSet, gx, gy, colour);
  }
}

function darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - amount);
  const g = Math.max(0, ((n >> 8) & 0xff) - amount);
  const b = Math.max(0, (n & 0xff) - amount);
  return `rgb(${r},${g},${b})`;
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amount);
  const g = Math.min(255, ((n >> 8) & 0xff) + amount);
  const b = Math.min(255, (n & 0xff) + amount);
  return `rgb(${r},${g},${b})`;
}

export function generatePortrait(canvas: HTMLCanvasElement, player: PlayerState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const metrics = getRenderMetrics(canvas);
  const spec = resolvePortraitSpec(player);
  const palette = getPalette(player.nationality);

  const skinColour = readPaletteColour(palette.skin, spec.skinTone);
  const hairStyle = HAIR_STYLES[Math.max(0, Math.min(HAIR_STYLES.length - 1, spec.hairStyle))]!;
  const hairline = HAIRLINE_VARIANTS[Math.max(0, Math.min(HAIRLINE_VARIANTS.length - 1, spec.hairlineVariant ?? 0))]!;
  const faceShape = FACE_SHAPE_VARIANTS[Math.max(0, Math.min(FACE_SHAPE_VARIANTS.length - 1, spec.faceShapeVariant ?? 0))]!;
  const silhouette = SILHOUETTE_VARIANTS[0]!;
  const hairVolume = HAIR_VOLUME_VARIANTS[0]!;
  const eyeVariant = EYE_VARIANTS[Math.max(0, Math.min(EYE_VARIANTS.length - 1, spec.eyeVariant ?? 0))]!;
  const noseVariant = NOSE_VARIANTS[Math.max(0, Math.min(NOSE_VARIANTS.length - 1, spec.noseVariant ?? 0))]!;
  const mouthVariant = MOUTH_VARIANTS[Math.max(0, Math.min(MOUTH_VARIANTS.length - 1, spec.mouthVariant ?? 0))]!;
  const hairColour = readPaletteColour(palette.hair, spec.hairColor);
  const eyeColour = readPaletteColour(EYE_COLOURS, spec.eyeColor);

  const skin = applyPixelMutations(SKIN_BASE, silhouette.skinAdd, silhouette.skinRemove);
  const neck = applyPixelMutations(NECK, silhouette.neckAdd, silhouette.neckRemove);
  const earLeft = applyPixelMutations(EAR_LEFT_BASE, silhouette.earLeftAdd, silhouette.earLeftRemove);
  const earRight = applyPixelMutations(EAR_RIGHT_BASE, silhouette.earRightAdd, silhouette.earRightRemove);
  const foreheadHighlight = applyPixelMutations(FOREHEAD_HIGHLIGHT, silhouette.foreheadHighlightAdd);
  const leftCheekShade = applyPixelMutations(LEFT_CHEEK_SHADE, silhouette.cheekShadeAdd);
  const rightCheekShade = applyPixelMutations(RIGHT_CHEEK_SHADE, silhouette.cheekShadeAdd.map(([x, y]) => [GRID_W - 1 - x, y] as Pixel));
  const chinShade = applyPixelMutations(CHIN_SHADE, silhouette.chinShadeAdd);
  const hairBack = applyPixelMutations(hairStyle.back, hairVolume.backAdd, hairVolume.backRemove);
  const hairFront = applyPixelMutations(hairStyle.front, hairVolume.frontAdd, hairVolume.frontRemove);
  const hairHighlightPixels = applyPixelMutations(hairStyle.highlight, hairVolume.highlightAdd);

  const skinHighlight = lighten(skinColour, 14);
  const skinShade = darken(skinColour, 18);
  const deepSkinShade = darken(skinColour, 30);
  const hairHighlightColour = lighten(hairColour, 18);
  const hairShade = darken(hairColour, 12);
  const browColour = darken(hairColour, 30);
  const earColour = darken(skinColour, 10);
  const mouthColour = '#8b3a2a';
  const mouthShade = darken(mouthColour, 18);
  const eyeWhite = '#d7dde8';
  const pupil = '#0b1020';
  const facialHairColour = darken(hairColour, 8);

  ctx.fillStyle = BG_COLOUR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawLayer(ctx, metrics, hairBack, hairShade);
  drawLayer(ctx, metrics, neck, skinShade);
  drawLayer(ctx, metrics, skin, skinColour);
  drawLayer(ctx, metrics, foreheadHighlight, skinHighlight);
  drawLayer(ctx, metrics, LEFT_CHEEK_HIGHLIGHT, skinHighlight);
  drawLayer(ctx, metrics, RIGHT_CHEEK_HIGHLIGHT, skinHighlight);
  drawLayer(ctx, metrics, faceShape.cheekHighlight, skinHighlight);
  drawLayer(ctx, metrics, leftCheekShade, skinShade);
  drawLayer(ctx, metrics, rightCheekShade, skinShade);
  drawLayer(ctx, metrics, chinShade, deepSkinShade);
  drawLayer(ctx, metrics, faceShape.jawShade, deepSkinShade);

  drawLayer(ctx, metrics, earLeft, earColour);
  drawLayer(ctx, metrics, earRight, earColour);

  drawLayer(ctx, metrics, LEFT_BROW, browColour, 'legacy');
  drawLayer(ctx, metrics, RIGHT_BROW, browColour, 'legacy');
  drawLayer(ctx, metrics, eyeVariant.browExtra, browColour, 'legacy');
  drawLayer(ctx, metrics, EYE_LEFT_WHITE, eyeWhite, 'legacy');
  drawLayer(ctx, metrics, EYE_RIGHT_WHITE, eyeWhite, 'legacy');
  drawLayer(ctx, metrics, LEFT_IRIS, eyeColour, 'legacy');
  drawLayer(ctx, metrics, RIGHT_IRIS, eyeColour, 'legacy');
  drawLayer(ctx, metrics, LEFT_PUPIL, pupil, 'legacy');
  drawLayer(ctx, metrics, RIGHT_PUPIL, pupil, 'legacy');
  drawLayer(ctx, metrics, LEFT_EYE_SHADOW, skinShade, 'legacy');
  drawLayer(ctx, metrics, RIGHT_EYE_SHADOW, skinShade, 'legacy');
  drawLayer(ctx, metrics, eyeVariant.lowerLid, deepSkinShade, 'legacy');

  drawLayer(ctx, metrics, NOSE_BRIDGE, skinHighlight);
  drawLayer(ctx, metrics, NOSE_SIDE_SHADE, skinShade);
  drawLayer(ctx, metrics, NOSE_TIP, deepSkinShade, 'legacy');
  drawLayer(ctx, metrics, noseVariant.bridge, skinHighlight, 'legacy');
  drawLayer(ctx, metrics, noseVariant.nostrils, deepSkinShade, 'legacy');

  drawLayer(ctx, metrics, UPPER_LIP, mouthShade, 'legacy');
  drawLayer(ctx, metrics, MOUTH_BASE, mouthColour, 'legacy');
  drawLayer(ctx, metrics, LOWER_LIP, lighten(mouthColour, 20), 'legacy');
  drawLayer(ctx, metrics, MOUTH_SHADE, mouthShade, 'legacy');
  drawLayer(ctx, metrics, mouthVariant.corners, mouthShade, 'legacy');
  drawLayer(ctx, metrics, mouthVariant.philtrum, deepSkinShade, 'legacy');

  if (spec.facialHair) {
    drawLayer(ctx, metrics, FACIAL_HAIR_BASE, facialHairColour, 'legacy');
    drawLayer(ctx, metrics, BEARD_EXTRA, darken(facialHairColour, 10), 'legacy');
  }

  drawLayer(ctx, metrics, hairFront, hairColour);
  drawLayer(ctx, metrics, hairline.fill, hairColour);
  drawLayer(ctx, metrics, hairHighlightPixels, hairHighlightColour);
  drawLayer(ctx, metrics, hairline.highlight, hairHighlightColour);

  void (GRID_W + GRID_H);
}

import { createRng } from '../../simulation/math/random.ts';
import type { PortraitSpec, PlayerState } from '../../simulation/types.ts';
import { getPalette } from './palettes.ts';

export const EYE_COLOURS: ReadonlyArray<string> = [
  '#3a6a9e',
  '#5e8b3a',
  '#8b6a3a',
  '#3a3a3a',
  '#6a4a2a',
];

export const HAIR_STYLE_COUNT = 5;
export const HAIRLINE_VARIANT_COUNT = 4;
export const FACE_SHAPE_VARIANT_COUNT = 3;
export const SILHOUETTE_VARIANT_COUNT = 4;
export const HAIR_VOLUME_VARIANT_COUNT = 4;
export const EYE_VARIANT_COUNT = 4;
export const NOSE_VARIANT_COUNT = 3;
export const MOUTH_VARIANT_COUNT = 4;

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, index));
}

export function createPortraitSpec(seedKey: string, nationality?: string): PortraitSpec {
  const rng = createRng(`portrait-${seedKey}`);
  const palette = getPalette(nationality);
  return {
    skinTone: clampIndex(Math.floor(rng() * palette.skin.length), palette.skin.length),
    hairStyle: clampIndex(Math.floor(rng() * HAIR_STYLE_COUNT), HAIR_STYLE_COUNT),
    hairColor: clampIndex(Math.floor(rng() * palette.hair.length), palette.hair.length),
    eyeColor: clampIndex(Math.floor(rng() * EYE_COLOURS.length), EYE_COLOURS.length),
    facialHair: rng() > 0.65,
    hairlineVariant: clampIndex(Math.floor(rng() * HAIRLINE_VARIANT_COUNT), HAIRLINE_VARIANT_COUNT),
    faceShapeVariant: clampIndex(Math.floor(rng() * FACE_SHAPE_VARIANT_COUNT), FACE_SHAPE_VARIANT_COUNT),
    silhouetteVariant: clampIndex(Math.floor(rng() * SILHOUETTE_VARIANT_COUNT), SILHOUETTE_VARIANT_COUNT),
    hairVolumeVariant: clampIndex(Math.floor(rng() * HAIR_VOLUME_VARIANT_COUNT), HAIR_VOLUME_VARIANT_COUNT),
    eyeVariant: clampIndex(Math.floor(rng() * EYE_VARIANT_COUNT), EYE_VARIANT_COUNT),
    noseVariant: clampIndex(Math.floor(rng() * NOSE_VARIANT_COUNT), NOSE_VARIANT_COUNT),
    mouthVariant: clampIndex(Math.floor(rng() * MOUTH_VARIANT_COUNT), MOUTH_VARIANT_COUNT),
  };
}

export function resolvePortraitSpec(player: Pick<PlayerState, 'id' | 'nationality' | 'portraitSpec'>): PortraitSpec {
  return player.portraitSpec ?? createPortraitSpec(player.id, player.nationality);
}

export function readPaletteColour(colours: readonly string[], index: number): string {
  return colours[clampIndex(index, colours.length)] ?? '#000000';
}

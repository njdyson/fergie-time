/**
 * Nationality-to-palette mapping for player portrait generation.
 * Each palette provides skin tone and hair colour arrays for a nationality group.
 * Skin tones range light→dark within each group; hair colours reflect regional distributions.
 */

export interface NationalityPalette {
  readonly skin: readonly string[];
  readonly hair: readonly string[];
}

/**
 * Nationality palettes for the 10 ISO codes used in this project.
 * Grouped by region for visual coherence.
 */
export const NATIONALITY_PALETTES: Record<string, NationalityPalette> = {
  // Northern/Western Europe: fair to medium skin, blonde/brown/red/dark hair
  GB: {
    skin: ['#f5c9a0', '#e8b48a', '#d4956a'],
    hair: ['#c8a45e', '#8b5e3c', '#3d2b1f', '#cc4c1e'],
  },
  FR: {
    skin: ['#f5c9a0', '#e8b48a', '#d4956a', '#c07850'],
    hair: ['#3d2b1f', '#8b5e3c', '#c8a45e', '#1a1008'],
  },
  NL: {
    skin: ['#f5c9a0', '#e8b48a', '#d4956a'],
    hair: ['#c8a45e', '#d4aa60', '#8b5e3c', '#3d2b1f'],
  },
  DE: {
    skin: ['#f5c9a0', '#e8b48a', '#d4956a'],
    hair: ['#c8a45e', '#8b5e3c', '#3d2b1f', '#1a1008'],
  },
  // Southern Europe: medium to olive skin, dark hair dominant
  ES: {
    skin: ['#e8b48a', '#d4956a', '#c07850'],
    hair: ['#1a1008', '#3d2b1f', '#8b5e3c'],
  },
  IT: {
    skin: ['#e8b48a', '#d4956a', '#c07850'],
    hair: ['#1a1008', '#3d2b1f', '#8b5e3c'],
  },
  PT: {
    skin: ['#e8b48a', '#d4956a', '#c07850'],
    hair: ['#1a1008', '#3d2b1f', '#5c3a1e'],
  },
  // South America: medium to brown skin, very dark hair
  BR: {
    skin: ['#d4956a', '#c07850', '#a05c38', '#7a3c20'],
    hair: ['#1a1008', '#3d2b1f', '#0d0805'],
  },
  AR: {
    skin: ['#e8b48a', '#d4956a', '#c07850'],
    hair: ['#1a1008', '#3d2b1f', '#0d0805'],
  },
  // West Africa: deep brown to very dark skin, very dark hair
  NG: {
    skin: ['#7a3c20', '#5e2a10', '#3d1a08', '#2a1005'],
    hair: ['#0d0805', '#1a1008'],
  },
};

/**
 * Fallback palette for players with unknown or missing nationality.
 * Covers the full skin and hair range.
 */
export const FALLBACK_PALETTE: NationalityPalette = {
  skin: ['#f5c9a0', '#d4956a', '#a05c38', '#5e2a10'],
  hair: ['#c8a45e', '#3d2b1f', '#1a1008'],
};

/**
 * Returns the nationality palette for the given ISO code, or the fallback palette.
 */
export function getPalette(nationality?: string): NationalityPalette {
  return (nationality != null ? NATIONALITY_PALETTES[nationality] : undefined) ?? FALLBACK_PALETTE;
}

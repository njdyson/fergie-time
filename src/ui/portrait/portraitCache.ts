/**
 * Session-level cache for player portraits.
 *
 * Wraps generatePortrait() with a Map<playerId+size, ImageData> cache so that
 * portrait pixels are only computed once per session per player. On repeat
 * visits to the same player's profile, the cached ImageData is stamped onto
 * the canvas directly via putImageData() — no re-generation cost.
 *
 * The cache is naturally cleared on page reload. Since generation is
 * deterministic, a cleared cache is never a problem.
 */

import { generatePortrait } from './portraitGenerator.ts';
import type { PlayerState } from '../../simulation/types.ts';

const cache = new Map<string, ImageData>();

function getCacheKey(playerId: string, canvas: HTMLCanvasElement): string {
  return `${playerId}:${canvas.width}x${canvas.height}`;
}

/**
 * Renders a player portrait onto the canvas, using the cache if available.
 * On first call for a player, generates the portrait and caches the ImageData.
 * On subsequent calls, restores the cached ImageData directly.
 */
export function getOrGeneratePortrait(canvas: HTMLCanvasElement, player: PlayerState): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const cacheKey = getCacheKey(player.id, canvas);
  const cached = cache.get(cacheKey);
  if (cached) {
    ctx.putImageData(cached, 0, 0);
    return;
  }

  generatePortrait(canvas, player);
  cache.set(cacheKey, ctx.getImageData(0, 0, canvas.width, canvas.height));
}

/**
 * Clears all cached portrait data. Primarily for testing.
 */
export function clearPortraitCache(): void {
  cache.clear();
}

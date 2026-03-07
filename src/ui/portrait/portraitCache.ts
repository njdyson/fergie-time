/**
 * Session-level cache for player portraits.
 *
 * Wraps generatePortrait() with a Map<playerId, ImageData> cache so that
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

/**
 * Renders a player portrait onto the canvas, using the cache if available.
 * On first call for a player, generates the portrait and caches the ImageData.
 * On subsequent calls, restores the cached ImageData directly.
 */
export function getOrGeneratePortrait(canvas: HTMLCanvasElement, player: PlayerState): void {
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

/**
 * Clears all cached portrait data. Primarily for testing.
 */
export function clearPortraitCache(): void {
  cache.clear();
}

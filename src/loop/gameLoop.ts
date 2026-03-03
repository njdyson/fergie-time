import type { SimulationEngine } from '../simulation/engine.ts';
import type { CanvasRenderer } from '../renderer/canvas.ts';

// Fixed timestep: 30 ticks per second = 33.33ms per tick
const FIXED_DT_MS = 1000 / 30; // ~33.333ms

// Spiral-of-death guard: cap accumulator at 200ms
// If the browser tab freezes for longer than this, we clamp to avoid
// catching up with hundreds of ticks at once.
const MAX_ACCUMULATED_MS = 200;

let animationFrameId: number | null = null;

/**
 * Starts the fixed-timestep game loop.
 *
 * Pattern: accumulator-based fixed timestep.
 *   - accumulator collects elapsed time
 *   - while accumulator >= FIXED_DT_MS: tick engine, subtract FIXED_DT_MS
 *   - alpha = accumulator / FIXED_DT_MS (0..1 interpolation factor)
 *   - renderer draws interpolated state between prevSnapshot and currSnapshot
 *
 * The engine runs at ~30 ticks/sec (physics), renderer runs at display refresh rate (~60fps).
 *
 * @param engine   - SimulationEngine to tick
 * @param renderer - CanvasRenderer to draw each frame
 */
export function startGameLoop(engine: SimulationEngine, renderer: CanvasRenderer): void {
  if (animationFrameId !== null) {
    stopGameLoop();
  }

  let lastTimestamp: number | null = null;
  let accumulator = 0;

  let prevSnapshot = engine.getCurrentSnapshot();
  let currSnapshot = engine.getCurrentSnapshot();

  function frame(timestamp: number): void {
    // Initialise on first frame
    if (lastTimestamp === null) {
      lastTimestamp = timestamp;
    }

    const elapsed = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    // Spiral-of-death guard
    const clamped = Math.min(elapsed, MAX_ACCUMULATED_MS);
    accumulator += clamped;

    // Consume accumulated time in fixed steps
    while (accumulator >= FIXED_DT_MS) {
      prevSnapshot = currSnapshot;
      currSnapshot = engine.tick(FIXED_DT_MS);
      accumulator -= FIXED_DT_MS;
    }

    // Alpha is fraction of a tick not yet consumed — used for interpolation
    const alpha = accumulator / FIXED_DT_MS;

    // Draw interpolated frame
    renderer.draw(prevSnapshot, currSnapshot, alpha);

    animationFrameId = requestAnimationFrame(frame);
  }

  animationFrameId = requestAnimationFrame(frame);
}

/**
 * Stops the game loop by cancelling the pending requestAnimationFrame.
 */
export function stopGameLoop(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

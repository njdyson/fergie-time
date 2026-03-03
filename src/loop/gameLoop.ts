import type { SimulationEngine } from '../simulation/engine.ts';
import type { CanvasRenderer } from '../renderer/canvas.ts';

// Fixed timestep: 30 ticks per second = 33.33ms per tick
const FIXED_DT_MS = 1000 / 30; // ~33.333ms

// Spiral-of-death guard: cap accumulator at 200ms
// If the browser tab freezes for longer than this, we clamp to avoid
// catching up with hundreds of ticks at once.
const MAX_ACCUMULATED_MS = 200;

let animationFrameId: number | null = null;

// Match speed state (ticks per render frame)
// 1 = normal (1 tick/frame at 30/sec), 2 = 2x (2 ticks), 3 = 4x (4 ticks)
let speedMultiplier: number = 1;
let paused: boolean = false;

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
 * Key bindings:
 *   '1' = normal speed (1x)
 *   '2' = 2x speed
 *   '3' = 4x speed
 *   'P' = pause/resume
 *
 * @param engine   - SimulationEngine to tick
 * @param renderer - CanvasRenderer to draw each frame
 */
export function startGameLoop(engine: SimulationEngine, renderer: CanvasRenderer): void {
  if (animationFrameId !== null) {
    stopGameLoop();
  }

  // Reset speed state
  speedMultiplier = 1;
  paused = false;

  // Register speed control key bindings
  const keyHandler = (e: KeyboardEvent): void => {
    if (e.key === '1') {
      speedMultiplier = 1;
      console.log('[GameLoop] Speed: 1x');
    } else if (e.key === '2') {
      speedMultiplier = 2;
      console.log('[GameLoop] Speed: 2x');
    } else if (e.key === '3') {
      speedMultiplier = 4;
      console.log('[GameLoop] Speed: 4x');
    } else if (e.key === 'p' || e.key === 'P') {
      paused = !paused;
      console.log(`[GameLoop] ${paused ? 'Paused' : 'Resumed'}`);
    }
  };

  document.addEventListener('keydown', keyHandler);

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

    if (!paused) {
      // Scale elapsed time by speed multiplier (2x = consume 2x more time)
      const scaledElapsed = elapsed * speedMultiplier;

      // Spiral-of-death guard
      const clamped = Math.min(scaledElapsed, MAX_ACCUMULATED_MS * speedMultiplier);
      accumulator += clamped;

      // Consume accumulated time in fixed steps
      while (accumulator >= FIXED_DT_MS) {
        prevSnapshot = currSnapshot;
        currSnapshot = engine.tick(FIXED_DT_MS);
        accumulator -= FIXED_DT_MS;
      }
    }

    // Alpha is fraction of a tick not yet consumed — used for interpolation
    const alpha = paused ? 0 : accumulator / FIXED_DT_MS;

    // Draw interpolated frame
    renderer.draw(prevSnapshot, currSnapshot, alpha);

    animationFrameId = requestAnimationFrame(frame);
  }

  animationFrameId = requestAnimationFrame(frame);

  // Store key handler for cleanup (attach to the frame function for later removal)
  (frame as unknown as { _keyHandler: typeof keyHandler })._keyHandler = keyHandler;
  (startGameLoop as unknown as { _keyHandler: typeof keyHandler })._keyHandler = keyHandler;
}

/**
 * Stops the game loop by cancelling the pending requestAnimationFrame.
 */
export function stopGameLoop(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  // Remove key handler if registered
  const handler = (startGameLoop as unknown as { _keyHandler?: (e: KeyboardEvent) => void })._keyHandler;
  if (handler) {
    document.removeEventListener('keydown', handler);
  }
}

import { SimulationEngine, createTestRosters } from './simulation/engine.ts';
import { CanvasRenderer } from './renderer/canvas.ts';
import { startGameLoop } from './loop/gameLoop.ts';

// Get canvas element
const canvasEl = document.getElementById('match-canvas');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #match-canvas element');
}

// Create engine with test rosters and a visible initial ball kick
const { home, away } = createTestRosters();
const engine = new SimulationEngine({
  seed: 'fergie-time-init',
  homeRoster: home,
  awayRoster: away,
  // Give the ball an initial velocity so it moves visibly on load
  // Kicks toward the right goal at 15 m/s with slight upward component
  initialBallVelocity: { x: 15, y: 2 },
});

// Create renderer
const renderer = new CanvasRenderer(canvasEl);

// Start the game loop — engine ticks at 30/sec, renderer draws at ~60fps
startGameLoop(engine, renderer);

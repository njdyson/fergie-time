import { SimulationEngine, createMatchRosters } from './simulation/engine.ts';
import { CanvasRenderer } from './renderer/canvas.ts';
import { DebugOverlay } from './renderer/debug.ts';
import { startGameLoop } from './loop/gameLoop.ts';
import { MatchPhase } from './simulation/types.ts';
import { auditScoreRanges } from './simulation/ai/decisionLog.ts';
import type { SimSnapshot } from './simulation/types.ts';

// ============================================================
// Canvas setup
// ============================================================

const canvasEl = document.getElementById('match-canvas');
if (!(canvasEl instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #match-canvas element');
}

// ============================================================
// Match setup
// ============================================================

const { home, away } = createMatchRosters();
const engine = new SimulationEngine({
  seed: 'fergie-time-match-01',
  homeRoster: home,
  awayRoster: away,
});

// ============================================================
// Renderer and debug overlay
// ============================================================

const renderer = new CanvasRenderer(canvasEl);
const debugOverlay = new DebugOverlay(canvasEl, engine.decisionLog);

// ============================================================
// Custom draw loop that also renders debug overlay
// ============================================================

// We override the renderer.draw to also call the debug overlay after each frame.
// The DebugOverlay expects to be called after main renderer draws.
const originalDraw = renderer.draw.bind(renderer);
renderer.draw = (prev: SimSnapshot, curr: SimSnapshot, alpha: number): void => {
  originalDraw(prev, curr, alpha);

  // Debug overlay draws on top of the main renderer
  const ctx = (renderer as unknown as { ctx: CanvasRenderingContext2D }).ctx;
  if (ctx && renderer.showDebug) {
    debugOverlay.draw(ctx, curr, (v) => renderer.pitchToCanvas(v), renderer.showDebug);
  }
};

// ============================================================
// Full-time handler: log stats and score range audit
// ============================================================

let fullTimeLogged = false;

// Poll for full-time to log final stats
const fullTimePoll = setInterval(() => {
  const snap = engine.getCurrentSnapshot();
  if (snap.matchPhase === MatchPhase.FULL_TIME && !fullTimeLogged) {
    fullTimeLogged = true;
    clearInterval(fullTimePoll);

    const stats = snap.stats;
    const [homeScore, awayScore] = snap.score;

    console.log('\n========================================');
    console.log('        FULL TIME');
    console.log('========================================');
    console.log(`Final Score: Home ${homeScore} - ${awayScore} Away`);
    console.log('\nMatch Statistics:');
    console.log(`  Possession:  Home ${stats.possession[0].toFixed(1)}%  Away ${stats.possession[1].toFixed(1)}%`);
    console.log(`  Shots:       Home ${stats.shots[0]}  Away ${stats.shots[1]}`);
    console.log(`  Passes:      Home ${stats.passes[0]}  Away ${stats.passes[1]}`);
    console.log(`  Tackles:     Home ${stats.tackles[0]}  Away ${stats.tackles[1]}`);

    // Score range audit
    console.log('\nScore Range Audit (last 300 ticks per player):');
    const allEntries = [...snap.players].flatMap(p =>
      engine.decisionLog.getEntries(p.id)
    );
    const auditReport = auditScoreRanges(allEntries);

    console.log('  Action Frequencies:');
    for (const [action, freq] of Object.entries(auditReport.actionFrequencies)) {
      const pct = (freq * 100).toFixed(1);
      const flag = freq > 0.40 ? ' DEGENERATE' : freq < 0.05 ? ' underused' : '';
      console.log(`    ${action.padEnd(20)} ${pct}%${flag}`);
    }

    if (auditReport.degenerate.length > 0) {
      console.warn('\n  DEGENERATE actions (>40% selection):', auditReport.degenerate.join(', '));
    } else {
      console.log('\n  No degenerate actions detected.');
    }

    if (auditReport.underused.length > 0) {
      console.log('  Underused actions (<5%):', auditReport.underused.join(', '));
    }

    console.log('\n========================================\n');
  }
}, 1000);

// ============================================================
// Start the game loop
// ============================================================

startGameLoop(engine, renderer);

console.log('[Fergie Time] Match started. Controls:');
console.log('  1 = 1x speed, 2 = 2x, 3 = 4x, P = pause/resume');
console.log('  S = stats overlay, D = debug overlay (click player), H = heatmap');
console.log('  Escape = deselect player in debug mode');

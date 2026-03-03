import { SimulationEngine, createMatchRosters } from './simulation/engine.ts';
import { CanvasRenderer } from './renderer/canvas.ts';
import { DebugOverlay } from './renderer/debug.ts';
import { startGameLoop, stopGameLoop, getIsPaused, setPaused, setSpeedMultiplier } from './loop/gameLoop.ts';
import { MatchPhase } from './simulation/types.ts';
import { auditScoreRanges } from './simulation/ai/decisionLog.ts';
import { TUNING } from './simulation/tuning.ts';
import type { TuningConfig } from './simulation/tuning.ts';
import type { SimSnapshot } from './simulation/types.ts';

// ============================================================
// Canvas setup
// ============================================================

const canvasElRaw = document.getElementById('match-canvas');
if (!(canvasElRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #match-canvas element');
}
const canvasEl: HTMLCanvasElement = canvasElRaw;

// ============================================================
// Button references
// ============================================================

const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement | null;
const btnReset   = document.getElementById('btn-reset')   as HTMLButtonElement | null;
const btn1x      = document.getElementById('btn-1x')      as HTMLButtonElement | null;
const btn2x      = document.getElementById('btn-2x')      as HTMLButtonElement | null;
const btn4x      = document.getElementById('btn-4x')      as HTMLButtonElement | null;
const btnStats   = document.getElementById('btn-stats')   as HTMLButtonElement | null;
const btnDebug   = document.getElementById('btn-debug')   as HTMLButtonElement | null;
const btnHeatmap = document.getElementById('btn-heatmap') as HTMLButtonElement | null;
const btnTuning  = document.getElementById('btn-tuning')  as HTMLButtonElement | null;

// ============================================================
// Renderer (created once, reused across resets)
// ============================================================

const renderer = new CanvasRenderer(canvasEl);

// ============================================================
// Match lifecycle
// ============================================================

let engine: SimulationEngine;
let debugOverlay: DebugOverlay;
let fullTimePoll: ReturnType<typeof setInterval> | null = null;
let fullTimeLogged = false;

function startMatch(): void {
  // Stop any existing loop
  stopGameLoop();
  if (fullTimePoll !== null) {
    clearInterval(fullTimePoll);
    fullTimePoll = null;
  }
  fullTimeLogged = false;

  // Build engine and debug overlay
  const { home, away } = createMatchRosters();
  engine = new SimulationEngine({
    seed: 'fergie-time-match-' + Date.now(),
    homeRoster: home,
    awayRoster: away,
  });
  debugOverlay = new DebugOverlay(canvasEl, engine.decisionLog);

  // Wrap renderer.draw to include debug overlay on top
  const originalDraw = renderer.draw.bind(renderer);
  renderer.draw = (prev: SimSnapshot, curr: SimSnapshot, alpha: number): void => {
    originalDraw(prev, curr, alpha);
    if (renderer.showDebug) {
      const canvas2d = canvasEl.getContext('2d');
      if (canvas2d) {
        debugOverlay.draw(canvas2d, curr, (v) => renderer.pitchToCanvas(v), true);
      }
    }
  };

  // Poll for full-time to log final stats
  fullTimePoll = setInterval(() => {
    const snap = engine.getCurrentSnapshot();
    if (snap.matchPhase === MatchPhase.FULL_TIME && !fullTimeLogged) {
      fullTimeLogged = true;
      logFullTime(snap);
    }
  }, 500);

  startGameLoop(engine, renderer);
}

function logFullTime(snap: SimSnapshot): void {
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

// ============================================================
// Button wiring
// ============================================================

function setSpeedActive(multiplier: 1 | 2 | 4): void {
  setSpeedMultiplier(multiplier);
  btn1x?.classList.toggle('active', multiplier === 1);
  btn2x?.classList.toggle('active', multiplier === 2);
  btn4x?.classList.toggle('active', multiplier === 4);
}

function updatePauseButton(): void {
  if (!btnPause) return;
  const paused = getIsPaused();
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  btnPause.classList.toggle('active', paused);
}

btnPause?.addEventListener('click', () => {
  setPaused(!getIsPaused());
  updatePauseButton();
});

btnReset?.addEventListener('click', () => {
  setPaused(false);
  updatePauseButton();
  setSpeedActive(1);
  startMatch();
  console.log('[Fergie Time] Match reset.');
});

btn1x?.addEventListener('click', () => setSpeedActive(1));
btn2x?.addEventListener('click', () => setSpeedActive(2));
btn4x?.addEventListener('click', () => setSpeedActive(4));

btnStats?.addEventListener('click', () => {
  renderer.showStats = !renderer.showStats;
  btnStats.classList.toggle('active', renderer.showStats);
});

btnDebug?.addEventListener('click', () => {
  renderer.showDebug = !renderer.showDebug;
  btnDebug.classList.toggle('active', renderer.showDebug);
});

btnHeatmap?.addEventListener('click', () => {
  renderer.showHeatmap = !renderer.showHeatmap;
  btnHeatmap.classList.toggle('active', renderer.showHeatmap);
});

// ============================================================
// Tuning panel
// ============================================================

const tuningPanel = document.getElementById('tuning-panel');

btnTuning?.addEventListener('click', () => {
  tuningPanel?.classList.toggle('open');
  btnTuning.classList.toggle('active', tuningPanel?.classList.contains('open') ?? false);
});

// Wire each slider to its TUNING property
const sliderBindings: { id: string; key: keyof TuningConfig; decimals: number }[] = [
  { id: 't-hysteresis',         key: 'hysteresisBonus',      decimals: 2 },
  { id: 't-noiseScale',         key: 'noiseScale',           decimals: 2 },
  { id: 't-moveToPosIntercept', key: 'moveToPosIntercept',   decimals: 2 },
  { id: 't-moveToPosSlope',     key: 'moveToPosSlope',       decimals: 2 },
  { id: 't-pressDecayK',        key: 'pressDecayK',          decimals: 1 },
  { id: 't-pressNorm',          key: 'pressNorm',            decimals: 0 },
  { id: 't-pressRankDecay',     key: 'pressRankDecay',        decimals: 2 },
  { id: 't-controlRadius',      key: 'controlRadius',        decimals: 1 },
  { id: 't-passSpeed',          key: 'passSpeed',            decimals: 0 },
  { id: 't-shootSpeed',         key: 'shootSpeed',           decimals: 0 },
  { id: 't-playerBaseSpeed',    key: 'playerBaseSpeed',      decimals: 1 },
  { id: 't-dribbleSpeedRatio',  key: 'dribbleSpeedRatio',    decimals: 2 },
  { id: 't-separationRadius',   key: 'separationRadius',     decimals: 1 },
  { id: 't-separationScale',    key: 'separationScale',      decimals: 1 },
];

for (const binding of sliderBindings) {
  const slider = document.getElementById(binding.id) as HTMLInputElement | null;
  const valueEl = document.getElementById('v-' + binding.key) as HTMLElement | null;
  if (!slider || !valueEl) continue;

  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    (TUNING as Record<string, number>)[binding.key] = val;
    valueEl.textContent = val.toFixed(binding.decimals);
  });
}

// Copy settings to clipboard
const btnCopySettings = document.getElementById('btn-copy-settings') as HTMLButtonElement | null;
btnCopySettings?.addEventListener('click', () => {
  const settings = JSON.stringify(TUNING, null, 2);
  navigator.clipboard.writeText(settings).then(() => {
    if (btnCopySettings) {
      btnCopySettings.textContent = 'Copied!';
      setTimeout(() => { btnCopySettings.textContent = 'Copy Settings'; }, 1500);
    }
  });
});

// Sync button state on keyboard events
document.addEventListener('keydown', (e) => {
  if (e.key === 'p' || e.key === 'P') {
    updatePauseButton();
  } else if (e.key === '1') {
    setSpeedActive(1);
  } else if (e.key === '2') {
    setSpeedActive(2);
  } else if (e.key === '3') {
    setSpeedActive(4);
  } else if (e.key === 's' || e.key === 'S') {
    btnStats?.classList.toggle('active', renderer.showStats);
  } else if (e.key === 'd' || e.key === 'D') {
    btnDebug?.classList.toggle('active', renderer.showDebug);
  } else if (e.key === 'h' || e.key === 'H') {
    btnHeatmap?.classList.toggle('active', renderer.showHeatmap);
  } else if (e.key === 't' || e.key === 'T') {
    tuningPanel?.classList.toggle('open');
    btnTuning?.classList.toggle('active', tuningPanel?.classList.contains('open') ?? false);
  }
});

// ============================================================
// Initial start
// ============================================================

startMatch();

console.log('[Fergie Time] Match started. Controls:');
console.log('  Buttons: Pause, Reset, 1x/2x/4x speed, Stats, Debug, Heatmap, Tuning');
console.log('  Keys: 1/2/3 = speed, P = pause, S = stats, D = debug, H = heatmap, T = tuning');
console.log('  Debug mode: click a player to inspect action scores');
console.log('  Tuning: adjust sliders live — changes take effect immediately');

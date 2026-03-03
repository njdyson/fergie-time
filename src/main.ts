import { SimulationEngine, createMatchRosters } from './simulation/engine.ts';
import { CanvasRenderer } from './renderer/canvas.ts';
import { DebugOverlay } from './renderer/debug.ts';
import { startGameLoop, stopGameLoop, getIsPaused, setPaused, setSpeedMultiplier } from './loop/gameLoop.ts';
import { MatchPhase } from './simulation/types.ts';
import type { FormationId } from './simulation/types.ts';
import { auditScoreRanges } from './simulation/ai/decisionLog.ts';
import { TUNING } from './simulation/tuning.ts';
import type { TuningConfig } from './simulation/tuning.ts';
import type { SimSnapshot } from './simulation/types.ts';
import { generateCommentary } from './simulation/match/commentary.ts';
import { TacticsBoard } from './ui/tacticsBoard.ts';

// ============================================================
// Canvas setup
// ============================================================

const canvasElRaw = document.getElementById('match-canvas');
if (!(canvasElRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #match-canvas element');
}
const canvasEl: HTMLCanvasElement = canvasElRaw;

const debugCanvasRaw = document.getElementById('debug-canvas');
if (!(debugCanvasRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #debug-canvas element');
}
const debugCanvasEl: HTMLCanvasElement = debugCanvasRaw;
const debugSidebar = document.getElementById('debug-sidebar');
const tuningPanel = document.getElementById('tuning-panel');

// ============================================================
// Tactics board setup
// ============================================================

const tacticsBoardCanvasRaw = document.getElementById('tactics-canvas');
if (!(tacticsBoardCanvasRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #tactics-canvas element');
}
const tacticsBoardCanvas: HTMLCanvasElement = tacticsBoardCanvasRaw;

// Size the tactics canvas to match available space
function sizeTacticsCanvas(): void {
  const availW = window.innerWidth;
  const availH = window.innerHeight;
  // Leave room for formation buttons + kickoff button row (~48px) + gaps
  const ctrlHeight = 48 + 16;
  const maxH = availH - ctrlHeight;
  const aspectRatio = 105 / 68;
  let cw = availW - 8;
  let ch = Math.floor(cw / aspectRatio);
  if (ch > maxH) {
    ch = maxH;
    cw = Math.floor(ch * aspectRatio);
  }
  tacticsBoardCanvas.width = cw;
  tacticsBoardCanvas.height = ch;
}

sizeTacticsCanvas();
window.addEventListener('resize', () => {
  sizeTacticsCanvas();
  tacticsBoard.render();
});

const tacticsBoard = new TacticsBoard(tacticsBoardCanvas, '4-4-2');

// ============================================================
// View state
// ============================================================

type View = 'tactics' | 'match';
let currentView: View = 'tactics';

const tacticsScreen = document.getElementById('tactics-screen');
const pitchArea = document.getElementById('pitch-area');
const matchControls = document.getElementById('controls');

function showTacticsView(): void {
  currentView = 'tactics';
  if (tacticsScreen) tacticsScreen.style.display = 'flex';
  if (pitchArea) pitchArea.style.display = 'none';
  if (matchControls) matchControls.style.display = 'none';
  // Close debug panels when returning to tactics
  _setDebugPanels(false);
}

function showMatchView(): void {
  currentView = 'match';
  if (tacticsScreen) tacticsScreen.style.display = 'none';
  if (pitchArea) pitchArea.style.display = '';
  if (matchControls) matchControls.style.display = 'flex';
}

// ============================================================
// Formation preset buttons
// ============================================================

const formationBtns = document.querySelectorAll<HTMLButtonElement>('.formation-btn');

function setActiveFormationBtn(formationId: string): void {
  formationBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.formation === formationId);
  });
}

formationBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const f = btn.dataset.formation as FormationId | undefined;
    if (f) {
      tacticsBoard.setFormation(f);
      setActiveFormationBtn(f);
    }
  });
});

// ============================================================
// Button references
// ============================================================

const btnTacticsKickoff = document.getElementById('btn-tactics-kickoff') as HTMLButtonElement | null;
const btnTacticsSecondHalf = document.getElementById('btn-tactics-second-half') as HTMLButtonElement | null;
const btnKickoff = document.getElementById('btn-kickoff') as HTMLButtonElement | null;
const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement | null;
const btnReset   = document.getElementById('btn-reset')   as HTMLButtonElement | null;
const speedSlider = document.getElementById('speed-slider') as HTMLInputElement | null;
const speedLabel  = document.getElementById('speed-label')  as HTMLElement | null;
const benchPanel = document.getElementById('bench-panel') as HTMLElement | null;
const benchPlayersEl = document.getElementById('bench-players') as HTMLElement | null;
const benchSubCounter = document.getElementById('bench-sub-counter') as HTMLElement | null;

// ============================================================
// Renderer (created once, reused across resets)
// ============================================================

const renderer = new CanvasRenderer(canvasEl);
// Debug panels hidden by default (per user notes)
renderer.showDebug = false;
renderer.showStats = false;
renderer.showHeatmap = false;

// ============================================================
// Match lifecycle
// ============================================================

let engine: SimulationEngine;
let debugOverlay: DebugOverlay;
let fullTimePoll: ReturnType<typeof setInterval> | null = null;
let halfTimePoll: ReturnType<typeof setInterval> | null = null;
let commentaryPoll: ReturnType<typeof setInterval> | null = null;
let fullTimeLogged = false;
let halftimeHandled = false;
let lastCommentaryIdx = 0;
const commentaryEl = document.getElementById('commentary');


function startMatch(): void {
  // Stop any existing loop and polls
  stopGameLoop();
  if (fullTimePoll !== null) { clearInterval(fullTimePoll); fullTimePoll = null; }
  if (halfTimePoll !== null) { clearInterval(halfTimePoll); halfTimePoll = null; }
  if (commentaryPoll !== null) { clearInterval(commentaryPoll); commentaryPoll = null; }
  fullTimeLogged = false;
  halftimeHandled = false;
  lastCommentaryIdx = 0;
  if (commentaryEl) commentaryEl.innerHTML = '';

  // Reset substitution state for new match
  tacticsBoard.resetSubstitutions();
  hideBenchPanel();

  // Get tactical config from tactics board
  const tacticalConfig = tacticsBoard.getTacticalConfig();

  // Build engine and debug overlay (now with bench players)
  const { home, away, homeBench, awayBench } = createMatchRosters();

  engine = new SimulationEngine({
    seed: 'fergie-time-match-' + Date.now(),
    homeRoster: home,
    awayRoster: away,
    homeBench,
    awayBench,
    homeTacticalConfig: tacticalConfig,
  });
  debugOverlay = new DebugOverlay(debugCanvasEl, engine.decisionLog);

  // Wrap renderer.draw to include debug overlay highlights on top
  const originalDraw = renderer.draw.bind(renderer);
  renderer.draw = (prev: SimSnapshot, curr: SimSnapshot, alpha: number): void => {
    originalDraw(prev, curr, alpha);
    if (renderer.showDebug) {
      // Draw panels on the sidebar canvas
      debugOverlay.drawPanels(curr);
      // Draw highlight rings on the main pitch canvas
      const canvas2d = canvasEl.getContext('2d');
      if (canvas2d) {
        debugOverlay.drawHighlights(canvas2d, (v) => renderer.pitchToCanvas(v));
      }
    }
  };

  // Poll for halftime
  halfTimePoll = setInterval(() => {
    if (!engine) return;
    const snap = engine.getCurrentSnapshot();
    if (snap.matchPhase === MatchPhase.HALFTIME && !halftimeHandled) {
      halftimeHandled = true;
      handleHalftime();
    }
  }, 250);

  // Poll for full-time to log final stats
  fullTimePoll = setInterval(() => {
    if (!engine) return;
    const snap = engine.getCurrentSnapshot();
    if (snap.matchPhase === MatchPhase.FULL_TIME && !fullTimeLogged) {
      fullTimeLogged = true;
      logFullTime(snap);
    }
  }, 500);

  // Poll for new commentary lines
  commentaryPoll = setInterval(() => updateCommentary(), 250);

  // Start paused — user clicks "Kick Off" to begin
  startGameLoop(engine, renderer, true);
  updatePauseButton();
  if (btnKickoff) btnKickoff.style.display = '';
}

// ============================================================
// Halftime flow
// ============================================================

function handleHalftime(): void {
  // Pause the match
  setPaused(true);
  updatePauseButton();

  // Switch to tactics view (tactics board for halftime changes)
  showTacticsView();

  // Show "Start 2nd Half" button instead of "Kick Off"
  if (btnTacticsKickoff) btnTacticsKickoff.style.display = 'none';
  if (btnTacticsSecondHalf) btnTacticsSecondHalf.style.display = '';

  // Show bench panel with current bench (from engine, in case subs were made — but at halftime, none yet)
  const benchFromEngine = engine.getBench('home');
  showBenchPanel(benchFromEngine, engine.getSubstitutionCount('home'));

  // Wire sub queued callback so bench buttons update
  tacticsBoard._onSubstitutionQueued = (_pitchIndex) => {
    updateBenchPanel();
    tacticsBoard.render();
  };

  console.log('[Fergie Time] Halftime — tactics board shown. Make changes and click "Start 2nd Half".');
}

function showBenchPanel(bench: import('./simulation/types.ts').PlayerState[], subsUsed: number): void {
  if (!benchPanel || !benchPlayersEl || !benchSubCounter) return;

  // Update remaining subs
  const subsRemaining = 3 - subsUsed;
  tacticsBoard.setSubsRemaining(subsRemaining);

  // Build bench player buttons
  benchPlayersEl.innerHTML = '';

  for (const player of bench) {
    const btn = document.createElement('button');
    btn.className = 'bench-player-btn';
    btn.dataset.playerId = player.id;
    btn.disabled = subsRemaining <= 0;

    const roleEl = document.createElement('span');
    roleEl.className = 'bench-player-role';
    roleEl.textContent = String(player.role);

    const nameEl = document.createElement('span');
    nameEl.className = 'bench-player-name';
    nameEl.textContent = player.name ?? player.id;

    const paceEl = document.createElement('span');
    paceEl.className = 'bench-player-pace';
    paceEl.textContent = `${Math.round(player.attributes.pace * 99)}`;
    paceEl.title = 'Pace';

    btn.appendChild(roleEl);
    btn.appendChild(nameEl);
    btn.appendChild(paceEl);

    btn.addEventListener('click', () => {
      if (tacticsBoard.getPendingBenchPlayer()?.id === player.id) {
        // Deselect if clicking same bench player
        tacticsBoard.setPendingBenchPlayer(null);
        btn.classList.remove('selected');
      } else {
        // Deselect all, select this one
        benchPlayersEl.querySelectorAll('.bench-player-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        tacticsBoard.setPendingBenchPlayer(player);
      }
    });

    benchPlayersEl.appendChild(btn);
  }

  updateBenchSubCounter(subsUsed);
  benchPanel.style.display = '';
}

function updateBenchPanel(): void {
  if (!benchPlayersEl || !benchSubCounter) return;

  // Count pending subs made via the tactics board
  const subbedOutIndices = tacticsBoard.getSubbedOutIndices();
  const subsUsed = subbedOutIndices.size;
  const subsRemaining = 3 - engine.getSubstitutionCount('home') - subsUsed;

  updateBenchSubCounter(engine.getSubstitutionCount('home') + subsUsed);

  // Mark bench players that have been used (their pending sub is queued)
  const pendingSubs = tacticsBoard.getSubstitutions();
  const usedBenchIds = new Set(pendingSubs.map(s => s.inPlayer.id));

  const btns = benchPlayersEl.querySelectorAll<HTMLButtonElement>('.bench-player-btn');
  btns.forEach(btn => {
    const pid = btn.dataset.playerId ?? '';
    if (usedBenchIds.has(pid)) {
      btn.classList.add('used');
      btn.classList.remove('selected');
      btn.disabled = true;
    } else {
      btn.disabled = subsRemaining <= 0;
    }
  });

  tacticsBoard.setSubsRemaining(subsRemaining);
}

function updateBenchSubCounter(subsUsed: number): void {
  if (!benchSubCounter) return;
  benchSubCounter.textContent = `Subs: ${subsUsed}/3`;
}

function hideBenchPanel(): void {
  if (benchPanel) benchPanel.style.display = 'none';
  if (btnTacticsKickoff) btnTacticsKickoff.style.display = '';
  if (btnTacticsSecondHalf) btnTacticsSecondHalf.style.display = 'none';
  // Clear sub callback using void 0 (satisfies exactOptionalPropertyTypes)
  tacticsBoard._onSubstitutionQueued = void 0;
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
// Commentary
// ============================================================

// Possession-tinted backgrounds (home=blue, away=red, neutral=dark)
const COMMENTARY_BG_HOME = 'rgba(20, 40, 100, 0.92)';
const COMMENTARY_BG_AWAY = 'rgba(100, 20, 30, 0.92)';
const COMMENTARY_BG_NEUTRAL = 'rgba(26, 26, 46, 0.93)';

function updateCommentary(): void {
  if (!commentaryEl || !engine) return;

  // Tint background based on possession team
  const snap = engine.getCurrentSnapshot();
  const carrierId = snap.ball.carrierId;
  if (carrierId) {
    const carrier = snap.players.find(p => p.id === carrierId);
    commentaryEl.style.backgroundColor =
      carrier?.teamId === 'home' ? COMMENTARY_BG_HOME
      : carrier?.teamId === 'away' ? COMMENTARY_BG_AWAY
      : COMMENTARY_BG_NEUTRAL;
  } else {
    commentaryEl.style.backgroundColor = COMMENTARY_BG_NEUTRAL;
  }

  const entries = engine.gameLog.getEntries();
  if (entries.length <= lastCommentaryIdx) return;

  const playerMap = new Map(snap.players.map(p => [p.id, p]));

  const frag = document.createDocumentFragment();
  for (let i = lastCommentaryIdx; i < entries.length; i++) {
    const line = generateCommentary(entries[i]!, playerMap);
    if (!line) continue;
    const div = document.createElement('div');
    div.className = `line ${line.type}`;
    div.innerHTML = `<span class="minute">${line.matchMinute}'</span> ${line.text}`;
    frag.appendChild(div);
  }
  lastCommentaryIdx = entries.length;

  if (frag.childNodes.length > 0) {
    commentaryEl.appendChild(frag);
    commentaryEl.scrollTop = commentaryEl.scrollHeight;
  }
}

// ============================================================
// Debug panel toggle (D key shows ALL panels)
// ============================================================

let debugPanelsOpen = false;

function _setDebugPanels(open: boolean): void {
  debugPanelsOpen = open;
  renderer.showDebug = open;
  renderer.showStats = open;
  renderer.showHeatmap = open;
  debugSidebar?.classList.toggle('open', open);
  tuningPanel?.classList.toggle('open', open);
}

function toggleDebugPanels(): void {
  _setDebugPanels(!debugPanelsOpen);
}

// ============================================================
// Button wiring
// ============================================================

function setSpeed(value: number): void {
  setSpeedMultiplier(value);
  if (speedSlider) speedSlider.value = String(value);
  if (speedLabel) speedLabel.textContent = value < 1 ? `${value}x` : `${value.toFixed(1)}x`;
}

function updatePauseButton(): void {
  if (!btnPause) return;
  const paused = getIsPaused();
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  btnPause.classList.toggle('active', paused);
}

function kickoff(): void {
  setPaused(false);
  updatePauseButton();
  if (btnKickoff) btnKickoff.style.display = 'none';
}

// Tactics screen "Kick Off" button → read config, start match, switch to match view
btnTacticsKickoff?.addEventListener('click', () => {
  showMatchView();
  startMatch();
  console.log('[Fergie Time] Kick off — formation:', tacticsBoard.getFormation());
});

// "Start 2nd Half" button — apply halftime changes and resume
btnTacticsSecondHalf?.addEventListener('click', () => {
  // Apply tactical config changes
  const newConfig = tacticsBoard.getTacticalConfig();
  engine.setHomeTactics(newConfig);

  // Apply pending substitutions
  const pendingSubs = tacticsBoard.getSubstitutions();
  for (const sub of pendingSubs) {
    const applied = engine.substitutePlayer('home', sub.outId, sub.inPlayer);
    if (applied) {
      console.log(`[Fergie Time] Sub: ${sub.outId} -> ${sub.inPlayer.name ?? sub.inPlayer.id}`);
    }
  }

  // Hide bench panel, restore UI
  hideBenchPanel();
  tacticsBoard.resetSubstitutions();

  // Switch to match view and unpause
  showMatchView();
  setPaused(false);
  updatePauseButton();
  halftimeHandled = true; // ensure we don't retrigger

  console.log('[Fergie Time] 2nd half started — formation:', tacticsBoard.getFormation(), `(${pendingSubs.length} sub(s) applied)`);
});

// Match controls kick off button (for Space bar / direct click after match has started paused)
btnKickoff?.addEventListener('click', () => kickoff());

btnPause?.addEventListener('click', () => {
  setPaused(!getIsPaused());
  updatePauseButton();
});

// Reset returns to tactics board
btnReset?.addEventListener('click', () => {
  stopGameLoop();
  if (halfTimePoll !== null) { clearInterval(halfTimePoll); halfTimePoll = null; }
  setSpeed(1);
  hideBenchPanel();
  tacticsBoard.resetSubstitutions();
  showTacticsView();
  console.log('[Fergie Time] Reset — returning to tactics board.');
});

// Speed slider
speedSlider?.addEventListener('input', () => {
  const val = parseFloat(speedSlider.value);
  setSpeed(val);
});

// ============================================================
// Game log export (moved to tuning panel)
// ============================================================

const btnSaveLog = document.getElementById('btn-save-log') as HTMLButtonElement | null;

btnSaveLog?.addEventListener('click', () => {
  if (!engine) return;
  const json = engine.gameLog.toJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fergie-time-log-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ============================================================
// Tuning panel
// ============================================================

// Wire each slider to its TUNING property
const sliderBindings: { id: string; key: keyof TuningConfig; decimals: number }[] = [
  { id: 't-hysteresis',         key: 'hysteresisBonus',      decimals: 2 },
  { id: 't-passBias',           key: 'passBias',             decimals: 2 },
  { id: 't-goalUrgency',        key: 'goalUrgency',          decimals: 2 },
  { id: 't-noiseScale',         key: 'noiseScale',           decimals: 2 },
  { id: 't-moveToPosIntercept', key: 'moveToPosIntercept',   decimals: 2 },
  { id: 't-moveToPosSlope',     key: 'moveToPosSlope',       decimals: 2 },
  { id: 't-pressDecayK',        key: 'pressDecayK',          decimals: 1 },
  { id: 't-pressNorm',          key: 'pressNorm',            decimals: 0 },
  { id: 't-pressRankDecay',     key: 'pressRankDecay',        decimals: 2 },
  { id: 't-looseBallPressBoost', key: 'looseBallPressBoost', decimals: 1 },
  { id: 't-controlRadius',      key: 'controlRadius',        decimals: 1 },
  { id: 't-kickLockoutTicks',   key: 'kickLockoutTicks',     decimals: 0 },
  { id: 't-passSpeed',          key: 'passSpeed',            decimals: 0 },
  { id: 't-shootSpeed',         key: 'shootSpeed',           decimals: 0 },
  { id: 't-playerBaseSpeed',    key: 'playerBaseSpeed',      decimals: 1 },
  { id: 't-dribbleSpeedRatio',  key: 'dribbleSpeedRatio',    decimals: 2 },
  { id: 't-separationRadius',   key: 'separationRadius',     decimals: 1 },
  { id: 't-separationScale',    key: 'separationScale',      decimals: 1 },
  { id: 't-supportPull',        key: 'supportPull',          decimals: 2 },
];

// Snapshot of compile-time defaults for "Reset Defaults"
const DEFAULT_TUNING: Record<string, number> = { ...TUNING };

// Sync all sliders and value labels to current TUNING state
function syncSlidersToTuning(): void {
  for (const binding of sliderBindings) {
    const slider = document.getElementById(binding.id) as HTMLInputElement | null;
    const valueEl = document.getElementById('v-' + binding.key) as HTMLElement | null;
    if (!slider || !valueEl) continue;
    const val = TUNING[binding.key];
    slider.value = String(val);
    valueEl.textContent = val.toFixed(binding.decimals);
  }
}

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

// ── Settings persistence (localStorage) ─────────────────────────────────────
const STORAGE_KEY = 'fergie-time-tuning';

function saveSettings(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(TUNING));
}

function loadSettings(): boolean {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return false;
  try {
    const parsed = JSON.parse(stored);
    for (const key of Object.keys(TUNING)) {
      if (typeof parsed[key] === 'number') {
        (TUNING as Record<string, number>)[key] = parsed[key];
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Load saved settings on startup (before match starts)
if (loadSettings()) {
  syncSlidersToTuning();
  console.log('[Fergie Time] Loaded saved settings from localStorage.');
}

// Save Settings button
const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement | null;
btnSaveSettings?.addEventListener('click', () => {
  saveSettings();
  if (btnSaveSettings) {
    btnSaveSettings.textContent = 'Saved!';
    setTimeout(() => { btnSaveSettings.textContent = 'Save Settings'; }, 1500);
  }
});

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

// Reset Defaults button
const btnResetSettings = document.getElementById('btn-reset-settings') as HTMLButtonElement | null;
btnResetSettings?.addEventListener('click', () => {
  for (const key of Object.keys(DEFAULT_TUNING)) {
    (TUNING as Record<string, number>)[key] = DEFAULT_TUNING[key]!;
  }
  localStorage.removeItem(STORAGE_KEY);
  syncSlidersToTuning();
  if (btnResetSettings) {
    btnResetSettings.textContent = 'Reset!';
    setTimeout(() => { btnResetSettings.textContent = 'Reset Defaults'; }, 1500);
  }
});

// ============================================================
// Keyboard shortcuts
// ============================================================

document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    if (currentView === 'tactics') {
      // Space on tactics board = kick off (only if not at halftime)
      if (btnTacticsSecondHalf?.style.display !== 'none') {
        // At halftime — Space triggers "Start 2nd Half"
        btnTacticsSecondHalf?.click();
      } else {
        showMatchView();
        startMatch();
      }
    } else if (getIsPaused() && btnKickoff?.style.display !== 'none') {
      kickoff();
    } else {
      setPaused(!getIsPaused());
      updatePauseButton();
    }
    e.preventDefault();
  } else if (e.key === 'p' || e.key === 'P') {
    if (currentView === 'match') updatePauseButton();
  } else if (e.key === '1') {
    setSpeed(1);
  } else if (e.key === '2') {
    setSpeed(2);
  } else if (e.key === '3') {
    setSpeed(4);
  } else if (e.key === 'd' || e.key === 'D') {
    // D toggles ALL debug panels (Debug sidebar, Stats overlay, Tuning panel)
    if (currentView === 'match') {
      toggleDebugPanels();
    }
  }
});

// ============================================================
// Initial view: tactics board
// ============================================================

showTacticsView();

console.log('[Fergie Time] Ready — tactics board loaded.');
console.log('  Select a formation and click "Kick Off" (or press Space) to start the match.');
console.log('  During match: D = toggle debug/stats/tuning panels, 1/2/3 = speed, P = pause, R = reset.');

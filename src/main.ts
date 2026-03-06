import { SimulationEngine, createMatchRosters } from './simulation/engine.ts';
import seedrandom from 'seedrandom';
import { getNames } from './season/nameService.ts';
import { createAITeam } from './season/teamGen.ts';
import { CanvasRenderer } from './renderer/canvas.ts';
import { DebugOverlay } from './renderer/debug.ts';
import { startGameLoop, stopGameLoop, getIsPaused, setPaused, setSpeedMultiplier } from './loop/gameLoop.ts';
import { MatchPhase } from './simulation/types.ts';
import type { FormationId, TacticsPhase } from './simulation/types.ts';
import { auditScoreRanges } from './simulation/ai/decisionLog.ts';
import { TUNING } from './simulation/tuning.ts';
import type { TuningConfig } from './simulation/tuning.ts';
import type { SimSnapshot } from './simulation/types.ts';
import { generateCommentary } from './simulation/match/commentary.ts';
import { TacticsBoard } from './ui/tacticsBoard.ts';
import { TacticsOverlay } from './ui/tacticsOverlay.ts';
import { computeFormationAnchors } from './simulation/tactical/formation.ts';
import { showAttributeTooltip, scheduleHideTooltip } from './ui/tooltip.ts';
import { show as showFullTimeOverlay } from './ui/fullTimeOverlay.ts';
import { TacticSelector } from './ui/panels/tacticSelector.ts';
import { listTactics, saveTactic, loadTactic, deleteTactic, buildSavedTactic, applySavedTactic } from './ui/tacticStore.ts';
import { HubScreen } from './ui/screens/hubScreen.ts';
import { FixturesScreen } from './ui/screens/fixturesScreen.ts';
import { TableScreen } from './ui/screens/tableScreen.ts';
import { SquadScreen } from './ui/screens/squadScreen.ts';
import { LoginScreen } from './ui/screens/loginScreen.ts';
import { createSeason, validateSquadSelection, isSeasonComplete, getChampion, startNewSeason, recordPlayerResult, simOneAIFixture, finalizeMatchday } from './season/season.ts';
import type { SeasonState } from './season/season.ts';
import { saveGame, loadGame, logout } from './api/client.ts';
import { serializeState, deserializeState } from '../server/serialize.ts';

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
const debugCanvasAwayRaw = document.getElementById('debug-canvas-away');
if (!(debugCanvasAwayRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #debug-canvas-away element');
}
const debugCanvasAwayEl: HTMLCanvasElement = debugCanvasAwayRaw;
const debugSidebar = document.getElementById('debug-sidebar');
const debugSidebarAway = document.getElementById('debug-sidebar-away');
const tuningPanel = document.getElementById('tuning-panel');

// ============================================================
// Tactics board (visible canvas — shown when paused)
// ============================================================

const tacticsCanvasRaw = document.getElementById('tactics-canvas');
if (!(tacticsCanvasRaw instanceof HTMLCanvasElement)) {
  throw new Error('Could not find #tactics-canvas element');
}
const tacticsCanvasEl: HTMLCanvasElement = tacticsCanvasRaw;
const tacticsBoard = new TacticsBoard(tacticsCanvasEl, '4-4-2');

/** Resize canvas to fit current container (call after layout changes) */
function syncCanvasSize(): void {
  renderer.resize();
  if (tacticsCanvasEl.style.display !== 'none') {
    tacticsCanvasEl.width = canvasEl.width;
    tacticsCanvasEl.height = canvasEl.height;
    tacticsBoard.resizeCanvas(canvasEl.width, canvasEl.height);
  }
}

/** Show the tactics board canvas overlaying the match canvas */
function showTacticsCanvas(): void {
  tacticsCanvasEl.style.display = 'block';
  // Resize immediately + after panel transition (200ms)
  requestAnimationFrame(syncCanvasSize);
  setTimeout(syncCanvasSize, 220);
}

/** Hide the tactics board canvas */
function hideTacticsCanvas(): void {
  tacticsCanvasEl.style.display = 'none';
  requestAnimationFrame(syncCanvasSize);
  setTimeout(syncCanvasSize, 220);
}

// ============================================================
// Screen routing + Season state
// ============================================================

const ScreenId = { LOGIN: 'LOGIN', HUB: 'HUB', SQUAD: 'SQUAD', FIXTURES: 'FIXTURES', TABLE: 'TABLE', TACTICS: 'TACTICS', MATCH: 'MATCH' } as const;
type ScreenId = (typeof ScreenId)[keyof typeof ScreenId];
let currentScreen: ScreenId = ScreenId.HUB;

const hubScreenEl = document.getElementById('hub-screen')!;
const squadScreenEl = document.getElementById('squad-screen')!;
const fixturesScreenEl = document.getElementById('fixtures-screen')!;
const tableScreenEl = document.getElementById('table-screen')!;

const hubScreenView = new HubScreen(hubScreenEl);
// SquadScreen is created below with an inner container (see squad kickoff button section)
const fixturesScreenView = new FixturesScreen(fixturesScreenEl);
const tableScreenView = new TableScreen(tableScreenEl);

// Login screen
const loginScreenEl = document.getElementById('login-screen')!;
const loginScreenView = new LoginScreen(loginScreenEl);

// Season state — assigned in boot()
let seasonState: SeasonState;

function updateCurrentScreen(): void {
  if (!seasonState) return;
  const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
  if (currentScreen === ScreenId.HUB) {
    hubScreenView.update(seasonState, playerTeam.name);
    // Show champion banner if season is complete
    if (isSeasonComplete(seasonState)) {
      const champion = getChampion(seasonState);
      const championBanner = document.createElement('div');
      championBanner.style.cssText = 'max-width:600px; margin:24px auto 0; background:#1e3a5f; border:2px solid #60a5fa; border-radius:8px; padding:20px; text-align:center;';
      championBanner.innerHTML = `
        <div style="color:#fbbf24; font-size:28px; font-weight:bold; margin-bottom:8px;">CHAMPION</div>
        <div style="color:#e2e8f0; font-size:22px; margin-bottom:16px;">${champion.teamName}</div>
        <button id="btn-new-season" style="padding:10px 32px; background:#60a5fa; color:#0f172a; border:none; border-radius:4px; font:bold 13px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em;">New Season</button>
      `;
      hubScreenEl.appendChild(championBanner);
      document.getElementById('btn-new-season')?.addEventListener('click', () => {
        seasonState = startNewSeason(seasonState, playerTeam.squad);
        saveGame(serializeState(seasonState), 1).catch(err => console.error('Auto-save failed:', err));
        showScreen(ScreenId.HUB);
      });
    }
  }
  if (currentScreen === ScreenId.SQUAD) {
    squadScreenViewInner.setFormationRoles(tacticsBoard.getPhaseRoles('inPossession'), tacticsBoard.getPhaseRoles('outOfPossession'));
    squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap);
  }
  if (currentScreen === ScreenId.FIXTURES) fixturesScreenView.update(seasonState, seasonState.playerTeamId);
  if (currentScreen === ScreenId.TABLE) tableScreenView.update(seasonState, seasonState.playerTeamId);
}

const tacticsCenterEl = document.getElementById('tactics-center')!;
const tacticsLeftContentEl = document.getElementById('tactics-left-content')!;
const tacticsRightEl = document.getElementById('tactics-right')!;
const canvasWrapperEl = document.getElementById('canvas-wrapper')!;
// Original parent for canvas wrapper (pitch-center inside pitch-area)
const canvasWrapperParent = canvasWrapperEl.parentElement!;
// Original parent for right panel (pitch-area)
const rightPanelParent = document.getElementById('pitch-area')!;

function showScreen(screen: ScreenId): void {
  const map: Record<string, string> = {
    LOGIN: 'login-screen', HUB: 'hub-screen', SQUAD: 'squad-screen',
    FIXTURES: 'fixtures-screen', TABLE: 'table-screen', TACTICS: 'tactics-screen', MATCH: 'pitch-area',
  };
  const flexScreens = new Set(['MATCH', 'SQUAD', 'LOGIN', 'TACTICS']);
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.style.display = key === screen ? (flexScreens.has(key) ? 'flex' : 'block') : 'none';
  }
  const navEl = document.getElementById('nav-tabs');
  if (navEl) navEl.style.display = (screen === ScreenId.MATCH || screen === ScreenId.LOGIN) ? 'none' : 'flex';
  // Mark active nav tab
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.screen === screen);
  });

  // Handle tactics screen — reparent canvas wrapper + sidebar elements
  if (screen === ScreenId.TACTICS) {
    tacticsCenterEl.appendChild(canvasWrapperEl);
    // Move the entire tactics overlay left section into the tactics screen sidebar
    tacticsLeftContentEl.appendChild(leftPanelEl);
    // Move right panel (player instructions) into tactics screen
    tacticsRightEl.appendChild(rightPanelEl);
    showTacticsCanvas();
    // Open overlay with player team squad (first 11 as 'home' so overlay can display them)
    const ptSquad = seasonState?.teams.find(t => t.isPlayerTeam)?.squad;
    const tacticsPlayers = ptSquad
      ? ptSquad.slice(0, 11).map(p => ({ ...p, teamId: 'home' as const }))
      : [];
    tacticsOverlay.open(tacticsPlayers, 'inPossession');
    tacticsBoard.setPlayerNames(tacticsPlayers.map(p => p.name ?? ''));
    tacticSelector.show();
    tacticsBoard.render();
    requestAnimationFrame(() => syncCanvasSize());
    setTimeout(syncCanvasSize, 220);
  } else if (currentScreen === ScreenId.TACTICS) {
    // Moving away from tactics — return everything to pitch-area
    canvasWrapperParent.insertBefore(canvasWrapperEl, canvasWrapperParent.firstChild);
    // Return tactics overlay section to the match left panel (after live-stats)
    const matchLeftPanel = document.getElementById('left-panel')!;
    const liveStatsSection = matchLeftPanel.querySelector('#live-stats');
    if (liveStatsSection) {
      liveStatsSection.after(leftPanelEl);
    }
    // Return right panel to pitch-area
    rightPanelParent.appendChild(rightPanelEl);
    tacticsOverlay.close();
    tacticSelector.hide();
    hideTacticsCanvas();
  }

  currentScreen = screen;
  if (screen === ScreenId.MATCH) {
    // Canvas was zero-sized while pitch-area was hidden; resize now that it's visible
    requestAnimationFrame(() => syncCanvasSize());
  }
  updateCurrentScreen();
}

// Nav tab click handlers
document.getElementById('nav-hub')?.addEventListener('click', () => showScreen(ScreenId.HUB));
document.getElementById('nav-squad')?.addEventListener('click', () => showScreen(ScreenId.SQUAD));
document.getElementById('nav-fixtures')?.addEventListener('click', () => showScreen(ScreenId.FIXTURES));
document.getElementById('nav-table')?.addEventListener('click', () => showScreen(ScreenId.TABLE));
document.getElementById('nav-tactics')?.addEventListener('click', () => showScreen(ScreenId.TACTICS));
document.getElementById('nav-logout')?.addEventListener('click', async () => {
  await logout();
  window.location.reload();
});

// Squad screen — no kickoff button here (moved to Hub)
squadScreenEl.style.display = 'none';
squadScreenEl.style.flexDirection = 'column';

const squadScreenViewInner = new SquadScreen(squadScreenEl);

// ============================================================
// Button references
// ============================================================

const btnKickoff = document.getElementById('btn-kickoff') as HTMLButtonElement | null;
const btnSecondHalf = document.getElementById('btn-second-half') as HTMLButtonElement | null;
const btnPause   = document.getElementById('btn-pause')   as HTMLButtonElement | null;
const btnReset   = document.getElementById('btn-reset')   as HTMLButtonElement | null;
const speedSliderEl = document.getElementById('speed-slider') as HTMLInputElement | null;
const speedValueEl = document.getElementById('speed-value') as HTMLElement | null;
const benchPanel = document.getElementById('bench-panel') as HTMLElement | null;
const benchPlayersEl = document.getElementById('bench-players') as HTMLElement | null;
const benchSubCounter = document.getElementById('bench-sub-counter') as HTMLElement | null;

// Scoreboard + stats DOM refs
const sbScoreEl = document.getElementById('sb-score') as HTMLElement | null;
const sbTimeEl = document.getElementById('sb-time') as HTMLElement | null;
const sbScorersEl = document.getElementById('sb-scorers') as HTMLElement | null;
const liveStatsEl = document.getElementById('live-stats') as HTMLElement | null;

// ============================================================
// Renderer (created once, reused across resets)
// ============================================================

const renderer = new CanvasRenderer(canvasEl);
// Debug panels hidden by default (per user notes)
renderer.showDebug = false;
renderer.showStats = false;
renderer.showHeatmap = false;

/** Update the HTML scoreboard from the current snapshot */
function updateScoreboard(snap: SimSnapshot): void {
  const [h, a] = snap.score;
  if (sbScoreEl) sbScoreEl.textContent = `${h} - ${a}`;

  // Time label
  const matchMinute = Math.min(90, Math.floor(snap.tick / 60));
  const phaseLabels: Record<string, string> = {
    KICKOFF: 'Kickoff',
    FIRST_HALF: `${matchMinute}'`,
    HALFTIME: 'HT',
    SECOND_HALF: `${matchMinute}'`,
    FULL_TIME: 'FT',
  };
  if (sbTimeEl) sbTimeEl.textContent = phaseLabels[snap.matchPhase] ?? snap.matchPhase;

  // Goal scorers
  if (sbScorersEl) {
    const goals = snap.events.filter(e => e.type === 'goal');
    if (goals.length === 0) {
      sbScorersEl.innerHTML = '';
    } else {
      sbScorersEl.innerHTML = goals.map(g => {
        const min = Math.min(90, Math.floor(g.tick / 60));
        const player = snap.players.find(p => p.id === g.playerId);
        const name = player?.name ?? g.playerId ?? '?';
        const side = g.teamId === 'home' ? '' : ' (A)';
        return `<div class="sb-scorer-row"><span class="scorer-min">${min}'</span> ${name}${side}</div>`;
      }).join('');
    }
  }
}

/** Update the live stats panel from the current snapshot */
function updateLiveStats(snap: SimSnapshot): void {
  if (!liveStatsEl) return;
  const s = snap.stats;

  function statRow(label: string, home: number | string, away: number | string): string {
    return `<div class="stat-row"><span class="stat-val">${home}</span><span class="stat-label">${label}</span><span class="stat-val">${away}</span></div>`;
  }

  const homePoss = s.possession[0].toFixed(0);
  const awayPoss = s.possession[1].toFixed(0);

  liveStatsEl.innerHTML =
    `<div class="poss-block">` +
      `<div class="poss-header"><span class="stat-val">${homePoss}%</span><span class="poss-label">Possession</span><span class="stat-val">${awayPoss}%</span></div>` +
      `<div class="poss-bar"><div class="poss-bar-fill" style="width:${s.possession[0]}%"></div></div>` +
    `</div>` +
    `<div class="stat-heading">Stats</div>` +
    statRow('Shots', s.shots[0], s.shots[1]) +
    statRow('On Target', s.shotsOnTarget[0], s.shotsOnTarget[1]) +
    statRow('Passes', s.passes[0], s.passes[1]) +
    statRow('Completed', s.passesCompleted[0], s.passesCompleted[1]) +
    statRow('Tackles', s.tackles[0], s.tackles[1]) +
    statRow('Corners', s.corners?.[0] ?? 0, s.corners?.[1] ?? 0) +
    statRow('Throw-ins', s.throwIns?.[0] ?? 0, s.throwIns?.[1] ?? 0) +
    statRow('Goal Kicks', s.goalKicks?.[0] ?? 0, s.goalKicks?.[1] ?? 0);
}

// ============================================================
// Tactics overlay (V1 overhaul — in-match editing)
// ============================================================

const phaseBarEl = document.getElementById('phase-bar')!;
const leftPanelEl = document.getElementById('tactics-overlay-left')!;
const rightPanelEl = document.getElementById('right-panel')!;

const tacticsOverlay = new TacticsOverlay(phaseBarEl, leftPanelEl, rightPanelEl, canvasEl);

// ── Tactic save/load selector ──
const tacticSelectorEl = document.getElementById('tactic-selector')!;
const tacticSelector = new TacticSelector(tacticSelectorEl);
tacticSelector.refresh(listTactics());

/** Push current board+overlay configs to engine after a tactic load */
function pushAllTacticsToEngine(): void {
  if (!engine) return;
  const baseInPoss = tacticsBoard.getTacticalConfig();
  const baseOop = tacticsBoard.getOutOfPossessionConfig();
  const inPoss = tacticsOverlay.getInPossConfig(baseInPoss);
  const oop = tacticsOverlay.getOutOfPossConfig(baseOop);
  engine.setHomeTactics(inPoss);
  engine.setHomeTacticsOOP(oop);
  engine.setHomeTacticsDefTrans(tacticsOverlay.getDefTransConfig(baseOop));
  engine.setHomeTacticsAttTrans(tacticsOverlay.getAttTransConfig(baseInPoss));
  tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
  // Sync duties + freedom values to board and renderer
  const activePhase = tacticsOverlay.getCurrentPhase() as 'inPossession' | 'outOfPossession';
  const activeBase = activePhase === 'inPossession' ? baseInPoss : baseOop;
  const activeConfig = tacticsOverlay.getActivePhaseConfig(activeBase);
  tacticsBoard.setDuties(activeConfig.duties);
  const mults = tacticsOverlay.getActivePhaseMultipliers();
  renderer.freedomValues = mults.map(m => m.freedom);
  tacticsBoard.setFreedomValues(mults.map(m => m.freedom));
}

tacticSelector.onSave((name) => {
  const tactic = buildSavedTactic(name, tacticsBoard, tacticsOverlay);
  saveTactic(tactic);
  tacticSelector.refresh(listTactics(), name);
});

tacticSelector.onLoad((name) => {
  const tactic = loadTactic(name);
  if (!tactic) return;
  applySavedTactic(tactic, tacticsBoard, tacticsOverlay);
  // Sync board phase display to current overlay phase
  const phase = tacticsOverlay.getCurrentPhase() as 'inPossession' | 'outOfPossession';
  tacticsBoard.setPhase(phase);
  tacticsBoard.render();
  pushAllTacticsToEngine();
});

tacticSelector.onDelete((name) => {
  deleteTactic(name);
  tacticSelector.refresh(listTactics());
});

// When overlay controls change, push updated config to engine.
// Always push the ACTIVE phase's config through setHomeTactics() so
// the canvas displays the correct anchors for whichever tab is selected.
// Both in-poss and OOP configs are stored, but the one being edited
// gets its anchors rendered on the snapshot.
tacticsOverlay.onChanged(() => {
  // Sync duties and freedom to board even without engine (pre-match editor)
  const overlayState = tacticsOverlay.getOverlayPhaseState(
    tacticsOverlay.getCurrentPhase() as 'inPossession' | 'outOfPossession',
  );
  tacticsBoard.setDuties(overlayState.duties);
  tacticsBoard.setFreedomValues(overlayState.multipliers.map(m => m.freedom));

  if (!engine) return;
  const baseInPoss = tacticsBoard.getTacticalConfig();
  const baseOop = tacticsBoard.getOutOfPossessionConfig();
  const oopConfig = tacticsOverlay.getOutOfPossConfig(baseOop);
  // Store OOP config (in-poss is restored at unpause)
  engine.setHomeTacticsOOP(oopConfig);
  // Push transition configs so per-player multipliers take effect
  engine.setHomeTacticsDefTrans(tacticsOverlay.getDefTransConfig(baseOop));
  engine.setHomeTacticsAttTrans(tacticsOverlay.getAttTransConfig(baseInPoss));
  // Push the active phase's config to the snapshot for anchor display
  const activeConfig = tacticsOverlay.getActivePhaseConfig(
    tacticsOverlay.getCurrentPhase() === 'inPossession' ? baseInPoss : baseOop,
  );
  engine.setHomeTactics(activeConfig);
  // Refresh player refs so click hit-test uses updated anchor positions
  tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
  // Sync freedom values to renderer
  const mults = tacticsOverlay.getActivePhaseMultipliers();
  renderer.freedomValues = mults.map(m => m.freedom);
});

// When phase tab switches (In Poss / Out of Poss), update displayed anchors
tacticsOverlay.onPhaseChanged(() => {
  // Always sync board phase (works pre-match without engine)
  const phase = tacticsOverlay.getCurrentPhase() as 'inPossession' | 'outOfPossession';
  tacticsBoard.setPhase(phase);

  if (!engine) return;

  const base = phase === 'inPossession'
    ? tacticsBoard.getTacticalConfig()
    : tacticsBoard.getOutOfPossessionConfig();
  const activeConfig = tacticsOverlay.getActivePhaseConfig(base);
  engine.setHomeTactics(activeConfig);
  tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);

  const mults = tacticsOverlay.getActivePhaseMultipliers();
  renderer.freedomValues = mults.map(m => m.freedom);
  tacticsBoard.setFreedomValues(mults.map(m => m.freedom));
  tacticsBoard.setDuties(activeConfig.duties);
});

// When a quick-shape preset is clicked, apply it to the tactics board + engine
tacticsOverlay.onQuickShape((formationId) => {
  const f = formationId as FormationId;
  tacticsBoard.applyPresetPositions(f);
  if (engine) {
    const baseInPoss = tacticsBoard.getTacticalConfig();
    const baseOop = tacticsBoard.getOutOfPossessionConfig();
    const inPoss = tacticsOverlay.getInPossConfig(baseInPoss);
    const oop = tacticsOverlay.getOutOfPossConfig(baseOop);
    engine.setHomeTactics(inPoss);
    engine.setHomeTacticsOOP(oop);
    tacticsOverlay.loadFromConfig(inPoss, oop);
    tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
  }
});

// Wire TacticsBoard player selection → overlay player panel + renderer highlight
tacticsBoard.onPlayerSelected((index) => {
  tacticsOverlay.selectPlayer(index);
  renderer.selectedHomePlayerIndex = index;
  syncTransitionAnchors();
});

// Wire TacticsBoard config changes (drag complete) → push to engine
tacticsBoard.onConfigChanged(() => {
  if (!engine) return;
  const baseInPoss = tacticsBoard.getTacticalConfig();
  const baseOop = tacticsBoard.getOutOfPossessionConfig();
  const inPoss = tacticsOverlay.getInPossConfig(baseInPoss);
  const oop = tacticsOverlay.getOutOfPossConfig(baseOop);
  engine.setHomeTactics(inPoss);
  engine.setHomeTacticsOOP(oop);
  engine.setHomeTacticsDefTrans(tacticsOverlay.getDefTransConfig(baseOop));
  engine.setHomeTacticsAttTrans(tacticsOverlay.getAttTransConfig(baseInPoss));
  tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
});

// Wire TacticsBoard substitution completion → update bench UI
tacticsBoard._onSubstitutionQueued = () => {
  updateBenchPanel();
};

// Wire overlay player selection (from player panel clicks) → renderer highlight
tacticsOverlay.onPlayerSelected((index) => {
  renderer.selectedHomePlayerIndex = index;
  // Refresh transition anchors if in transition edit mode
  syncTransitionAnchors();
});

// When the player panel sub-phase changes, update transition visualization
tacticsOverlay.onPlayerSubPhaseChanged((phase) => {
  if (!engine) return;
  const baseInPoss = tacticsBoard.getTacticalConfig();
  const baseOop = tacticsBoard.getOutOfPossessionConfig();

  if (phase === 'defensiveTransition') {
    // Def trans: player was in-poss → push in-poss config so main circle shows "from" position
    renderer.editingTransitionPhase = phase;
    engine.setHomeTactics(tacticsOverlay.getInPossConfig(baseInPoss));
    tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
    syncTransitionAnchors();
  } else if (phase === 'attackingTransition') {
    // Att trans: player was OOP → push OOP config so main circle shows "from" position
    renderer.editingTransitionPhase = phase;
    engine.setHomeTactics(tacticsOverlay.getOutOfPossConfig(baseOop));
    tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
    syncTransitionAnchors();
  } else {
    // Back to base phase — restore the current global phase's config
    renderer.editingTransitionPhase = null;
    const globalPhase = tacticsOverlay.getCurrentPhase();
    const base = globalPhase === 'inPossession' ? baseInPoss : baseOop;
    engine.setHomeTactics(tacticsOverlay.getActivePhaseConfig(base));
    tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
  }
});

/** Compute and push both in-poss and OOP anchor positions to the renderer */
function syncTransitionAnchors(): void {
  if (!engine) return;
  const snap = engine.getCurrentSnapshot();
  const baseInPoss = tacticsBoard.getTacticalConfig();
  const baseOop = tacticsBoard.getOutOfPossessionConfig();
  const inPossConfig = tacticsOverlay.getInPossConfig(baseInPoss);
  const oopConfig = tacticsOverlay.getOutOfPossConfig(baseOop);
  renderer.inPossAnchors = computeFormationAnchors(
    inPossConfig.formation, 'home', snap.ball.position, true, inPossConfig.teamControls,
  );
  renderer.oopAnchors = computeFormationAnchors(
    oopConfig.formation, 'home', snap.ball.position, false, oopConfig.teamControls,
  );
}

// Wire substitution handling — when a bench player is pending and a
// pitch player is clicked, the overlay fires this callback
tacticsOverlay.onSubstitutionQueued((pitchIndex, benchPlayer) => {
  tacticsBoard.queueSubstitution(pitchIndex, benchPlayer);
  updateBenchPanel();
});

// ============================================================
// Match lifecycle
// ============================================================

let engine: SimulationEngine;
let homeDebugOverlay: DebugOverlay;
let awayDebugOverlay: DebugOverlay;
let selectedDebugPlayerId: string | null = null;
let fullTimePoll: ReturnType<typeof setInterval> | null = null;
let halfTimePoll: ReturnType<typeof setInterval> | null = null;
let commentaryPoll: ReturnType<typeof setInterval> | null = null;
let fullTimeLogged = false;
let halftimeHandled = false;
let lastCommentaryIdx = 0;
const commentaryEl = document.getElementById('commentary');

/** Tracks which side (home/away) the player's team is on in the current match */
let currentMatchPlayerSide: 'home' | 'away' = 'home';

/**
 * Initialize and start a match with the given roster config.
 * Extracts the engine setup, debug overlay, polls, and game loop into one reusable helper.
 */
function initMatchWithConfig(config: {
  homeRoster: import('./simulation/types.ts').PlayerState[];
  homeBench: import('./simulation/types.ts').PlayerState[];
  awayRoster: import('./simulation/types.ts').PlayerState[];
  awayBench: import('./simulation/types.ts').PlayerState[];
  seed?: string;
}): void {
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
  // Set player names on tactics board (home team starters)
  tacticsBoard.setPlayerNames(config.homeRoster.map(p => p.name ?? ''));
  hideBenchPanel();

  // Get tactical configs from tactics board (in-possession + out-of-possession)
  const inPossConfig = tacticsBoard.getTacticalConfig();
  const oopConfig = tacticsBoard.getOutOfPossessionConfig();

  engine = new SimulationEngine({
    seed: config.seed ?? 'fergie-time-match-' + Date.now(),
    homeRoster: config.homeRoster,
    awayRoster: config.awayRoster,
    homeBench: config.homeBench,
    awayBench: config.awayBench,
    homeTacticalConfig: inPossConfig,
    homeTacticalConfigOOP: oopConfig,
  });
  homeDebugOverlay = new DebugOverlay(debugCanvasEl, engine.decisionLog, 'home');
  awayDebugOverlay = new DebugOverlay(debugCanvasAwayEl, engine.decisionLog, 'away');
  selectedDebugPlayerId = null;
  syncDebugSelection();

  // Wrap renderer.draw to include debug overlay highlights on top
  const originalDraw = renderer.draw.bind(renderer);
  renderer.draw = (prev: SimSnapshot, curr: SimSnapshot, alpha: number): void => {
    originalDraw(prev, curr, alpha);
    updateScoreboard(curr);
    updateLiveStats(curr);
    // Update squad list + possession highlight during live play
    if (!getIsPaused()) {
      tacticsOverlay.updateLiveSquad(curr.players, curr.ball.carrierId);
    }
    if (renderer.showDebug) {
      homeDebugOverlay.drawPanels(curr);
      awayDebugOverlay.drawPanels(curr);
      const canvas2d = canvasEl.getContext('2d');
      if (canvas2d) {
        const debugIntents = engine.getLatestDebugIntents();
        homeDebugOverlay.drawPitchVisuals(curr, canvas2d, (v) => renderer.pitchToCanvas(v), debugIntents);
        awayDebugOverlay.drawPitchVisuals(curr, canvas2d, (v) => renderer.pitchToCanvas(v), debugIntents);
        homeDebugOverlay.drawPossessionHighlight(curr, canvas2d, (v) => renderer.pitchToCanvas(v));
      }
    }
  };

  // Poll for halftime (engine latches in HALFTIME until startSecondHalf is called)
  halfTimePoll = setInterval(() => {
    if (!engine) return;
    if (engine.isHalftimeLatched() && !halftimeHandled) {
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
      // Show player stats overlay
      const canvasWrapper = document.getElementById('canvas-wrapper');
      if (canvasWrapper) {
        const playerStats = engine.gameLog.getPlayerStats();
        showFullTimeOverlay(canvasWrapper, snap.score, snap.players, playerStats, () => {
          // 1. Record player team fatigue from match result
          for (const player of snap.players) {
            if (player.teamId === currentMatchPlayerSide) {
              seasonState.fatigueMap.set(player.id, player.fatigue);
            }
          }

          // 2. Record player result, then sim AI fixtures one-by-one with vidiprinter
          const playerResult = { homeGoals: snap.score[0], awayGoals: snap.score[1] };
          const playerWasHome = currentMatchPlayerSide === 'home';
          const progress = recordPlayerResult(seasonState, playerResult, playerWasHome);
          seasonState = progress.state;

          // Show vidiprinter (manages its own screen visibility)
          showVidiprinter(progress.aiFixtures);
        });
      }
    }
  }, 500);

  // Poll for new commentary lines
  commentaryPoll = setInterval(() => updateCommentary(), 250);

  // Start paused — user clicks "Kick Off" to begin
  startGameLoop(engine, renderer, true);
  updatePauseButton();
  if (btnKickoff) btnKickoff.style.display = '';
  if (btnSecondHalf) btnSecondHalf.style.display = 'none';
}

function startMatch(): void {
  // Legacy/dev path: use createMatchRosters
  const { home, away, homeBench, awayBench } = createMatchRosters();
  currentMatchPlayerSide = 'home';
  initMatchWithConfig({
    homeRoster: home,
    homeBench,
    awayRoster: away,
    awayBench,
  });
}

// ============================================================
// Halftime flow
// ============================================================

function handleHalftime(): void {
  // Pause the match and show tactics overlay
  setPaused(true);
  updatePauseButton();

  // Show "Start 2nd Half" button instead of "Kick Off"
  if (btnKickoff) btnKickoff.style.display = 'none';
  if (btnSecondHalf) btnSecondHalf.style.display = '';

  // Show bench panel with current bench
  const benchFromEngine = engine.getBench('home');
  showBenchPanel(benchFromEngine, engine.getSubstitutionCount('home'));

  console.log('[Fergie Time] Halftime — make changes and click "Start 2nd Half".');
}

function showBenchPanel(bench: import('./simulation/types.ts').PlayerState[], subsUsed: number): void {
  if (!benchPanel || !benchPlayersEl || !benchSubCounter) return;

  // Update remaining subs
  const subsRemaining = 3 - subsUsed;

  // Build bench player rows (matching squad-row style)
  benchPlayersEl.innerHTML = '';

  for (let bi = 0; bi < bench.length; bi++) {
    const player = bench[bi]!;
    const btn = document.createElement('button');
    btn.className = 'bench-player-btn';
    btn.dataset.playerId = player.id;
    btn.disabled = subsRemaining <= 0;

    const numEl = document.createElement('span');
    numEl.className = 'bench-player-number';
    numEl.textContent = String(12 + bi);

    const nameEl = document.createElement('span');
    nameEl.className = 'bench-player-name';
    nameEl.textContent = player.name ?? player.id;

    const roleEl = document.createElement('span');
    roleEl.className = 'bench-player-role';
    roleEl.textContent = String(player.role);

    btn.appendChild(numEl);
    btn.appendChild(nameEl);
    btn.appendChild(roleEl);

    // Attribute tooltip on hover
    btn.addEventListener('mouseenter', () => {
      showAttributeTooltip(player.name ?? player.id, {
        attributes: player.attributes,
        personality: player.personality,
      }, btn);
    });
    btn.addEventListener('mouseleave', () => {
      scheduleHideTooltip();
    });

    btn.addEventListener('click', () => {
      if (tacticsOverlay.getPendingBenchPlayer()?.id === player.id) {
        // Deselect if clicking same bench player
        tacticsOverlay.setPendingBenchPlayer(null);
        tacticsBoard.setPendingBenchPlayer(null);
        btn.classList.remove('selected');
      } else {
        // Deselect all, select this one
        benchPlayersEl.querySelectorAll('.bench-player-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        tacticsOverlay.setPendingBenchPlayer(player);
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

  // Count pending subs made via the overlay
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

  // Clear pending bench player selection
  tacticsOverlay.setPendingBenchPlayer(null);
}

function updateBenchSubCounter(subsUsed: number): void {
  if (!benchSubCounter) return;
  benchSubCounter.textContent = `Subs: ${subsUsed}/3`;
}

function hideBenchPanel(): void {
  if (benchPanel) benchPanel.style.display = 'none';
  if (btnSecondHalf) btnSecondHalf.style.display = 'none';
  tacticsOverlay.setPendingBenchPlayer(null);
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
// Thoughts/tuning toggles
// ============================================================

let debugThoughtsOpen = false;
let tuningPanelOpen = false;

function _setTuningPanel(open: boolean): void {
  tuningPanelOpen = open;
  tuningPanel?.classList.toggle('open', open);
  if (getIsPaused()) updatePauseButton();
}

function syncDebugSelection(): void {
  homeDebugOverlay?.setSelectedPlayerId(selectedDebugPlayerId);
  awayDebugOverlay?.setSelectedPlayerId(selectedDebugPlayerId);
}

function handleDebugPanelClick(overlay: DebugOverlay, event: MouseEvent): void {
  const playerId = overlay.getSelectedPlayerIdAt(event.offsetY);
  if (!playerId) return;
  selectedDebugPlayerId = selectedDebugPlayerId === playerId ? null : playerId;
  syncDebugSelection();
}

debugCanvasEl.addEventListener('click', (event) => {
  if (!renderer.showDebug) return;
  handleDebugPanelClick(homeDebugOverlay, event);
});

debugCanvasAwayEl.addEventListener('click', (event) => {
  if (!renderer.showDebug) return;
  handleDebugPanelClick(awayDebugOverlay, event);
});

function _setDebugThoughts(open: boolean): void {
  debugThoughtsOpen = open;
  renderer.showDebug = open;
  debugSidebar?.classList.toggle('open', open);
  debugSidebarAway?.classList.toggle('open', open);
  if (open) _setTuningPanel(false);
  if (getIsPaused()) updatePauseButton();
}

function toggleDebugThoughts(): void {
  _setDebugThoughts(!debugThoughtsOpen);
}

function toggleTuningPanel(): void {
  const next = !tuningPanelOpen;
  if (next) _setDebugThoughts(false);
  _setTuningPanel(next);
}

// ============================================================
// Button wiring
// ============================================================

// Speed slider: 5 discrete stops → actual multiplier values
const SPEED_STEPS = [0.25, 0.5, 1, 2, 4];
const SPEED_LABELS = ['0.25x', '0.5x', '1x', '2x', '4x'];

function setSpeed(value: number): void {
  setSpeedMultiplier(value);
  // Sync slider position
  const idx = SPEED_STEPS.indexOf(value);
  if (idx >= 0 && speedSliderEl) speedSliderEl.value = String(idx);
  if (speedValueEl) speedValueEl.textContent = SPEED_LABELS[idx >= 0 ? idx : 2] ?? '1x';
}

/** Detect the current tactical phase for the home team from engine state. */
function detectTacticalPhase(): TacticsPhase {
  if (!engine) return 'inPossession';
  const snap = engine.getCurrentSnapshot();
  const transState = engine.getTransitionState();

  // Check transition state first (overrides possession)
  if (transState.team !== null && transState.ticksRemaining > 0) {
    if (transState.team === 'home') return 'defensiveTransition';
    return 'attackingTransition';
  }

  // Normal possession: who has the ball?
  if (snap.ball.carrierId) {
    const carrier = snap.players.find(p => p.id === snap.ball.carrierId);
    if (carrier?.teamId === 'away') return 'outOfPossession';
  }
  return 'inPossession';
}

function updatePauseButton(): void {
  if (!btnPause) return;
  const paused = getIsPaused();
  btnPause.textContent = paused ? 'Resume' : 'Pause';
  btnPause.classList.toggle('active', paused);
  const debugFreezeView = paused && debugThoughtsOpen;

  // Show/hide tactics overlay on pause
  if (paused && engine) {
    if (debugFreezeView) {
      hideTacticsCanvas();
      tacticsOverlay.close();
      tacticSelector.hide();
      renderer.showAnchors = false;
      renderer.editingTransitionPhase = null;
      hideBenchPanel();
      if (liveStatsEl) liveStatsEl.style.display = '';
      return;
    }

    // Hide live stats, show tactics
    if (liveStatsEl) liveStatsEl.style.display = 'none';
    const snap = engine.getCurrentSnapshot();

    // Auto-detect the current tactical phase
    const detectedPhase = detectTacticalPhase();

    // Show the tactics canvas overlay
    showTacticsCanvas();

    tacticsOverlay.open(snap.players, detectedPhase);
    tacticSelector.show();
    // Sync tactics board to the auto-detected base phase
    const activePhase = tacticsOverlay.getCurrentPhase() as 'inPossession' | 'outOfPossession';
    tacticsBoard.setPhase(activePhase);
    // Load current config into overlay, then push merged config back to engine
    // so overlay's teamControls defaults are applied to the snapshot
    const baseInPoss = tacticsBoard.getTacticalConfig();
    const baseOop = tacticsBoard.getOutOfPossessionConfig();
    tacticsOverlay.loadFromConfig(baseInPoss, baseOop);
    // Sync duties from overlay to TacticsBoard for visual rendering
    const activeConfig = tacticsOverlay.getActivePhaseConfig(
      activePhase === 'inPossession' ? baseInPoss : baseOop,
    );
    tacticsBoard.setDuties(activeConfig.duties);
    // Store both configs, display the active phase's anchors
    engine.setHomeTacticsOOP(tacticsOverlay.getOutOfPossConfig(baseOop));
    engine.setHomeTacticsDefTrans(tacticsOverlay.getDefTransConfig(baseOop));
    engine.setHomeTacticsAttTrans(tacticsOverlay.getAttTransConfig(baseInPoss));
    const activeBase = tacticsOverlay.getCurrentPhase() === 'inPossession' ? baseInPoss : baseOop;
    engine.setHomeTactics(tacticsOverlay.getActivePhaseConfig(activeBase));
    // Refresh player refs so click hit-test uses engine's computed anchor positions
    tacticsOverlay.updatePlayers(engine.getCurrentSnapshot().players);
    renderer.showAnchors = true;
    // Sync freedom values to renderer and TacticsBoard for radius overlay
    const activeMults = tacticsOverlay.getActivePhaseMultipliers();
    renderer.freedomValues = activeMults.map(m => m.freedom);
    tacticsBoard.setFreedomValues(activeMults.map(m => m.freedom));

    // Show bench panel (available during any pause, not just halftime)
    const benchFromEngine = engine.getBench('home');
    showBenchPanel(benchFromEngine, engine.getSubstitutionCount('home'));
  } else {
    // Unpausing — apply any pending substitutions
    if (engine) {
      const pendingSubs = tacticsBoard.getSubstitutions();
      for (const sub of pendingSubs) {
        const applied = engine.substitutePlayer('home', sub.outId, sub.inPlayer);
        if (applied) {
          console.log(`[Fergie Time] Sub: ${sub.outId} -> ${sub.inPlayer.name ?? sub.inPlayer.id}`);
        }
      }
      if (pendingSubs.length > 0) {
        tacticsBoard.resetSubstitutions();
      }
    }
    hideBenchPanel();
    hideTacticsCanvas();
    // Show live stats again
    if (liveStatsEl) liveStatsEl.style.display = '';
    // Restore real in-poss config to snapshot before resuming
    // (during editing, setHomeTactics may hold OOP anchors for display)
    if (engine) {
      const baseInPoss = tacticsBoard.getTacticalConfig();
      const baseOop = tacticsBoard.getOutOfPossessionConfig();
      engine.setHomeTactics(tacticsOverlay.getInPossConfig(baseInPoss));
      engine.setHomeTacticsOOP(tacticsOverlay.getOutOfPossConfig(baseOop));
      engine.setHomeTacticsDefTrans(tacticsOverlay.getDefTransConfig(baseOop));
      engine.setHomeTacticsAttTrans(tacticsOverlay.getAttTransConfig(baseInPoss));
    }
    tacticsOverlay.close();
    tacticSelector.hide();
    renderer.showAnchors = false;
    renderer.editingTransitionPhase = null;
  }
}

function kickoff(): void {
  setPaused(false);
  updatePauseButton();
  if (btnKickoff) btnKickoff.style.display = 'none';
}

// Match "Kick Off" button
btnKickoff?.addEventListener('click', () => kickoff());

// "Start 2nd Half" button — apply halftime changes and resume
btnSecondHalf?.addEventListener('click', () => {
  // Apply tactical config changes (both in-possession and out-of-possession)
  engine.setHomeTactics(tacticsBoard.getTacticalConfig());
  engine.setHomeTacticsOOP(tacticsBoard.getOutOfPossessionConfig());

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

  // Release the engine's halftime latch so ticks advance to SECOND_HALF
  engine.startSecondHalf();

  // Unpause
  setPaused(false);
  updatePauseButton();
  if (btnKickoff) btnKickoff.style.display = 'none';
  halftimeHandled = true; // ensure we don't retrigger

  console.log('[Fergie Time] 2nd half started — formation:', tacticsBoard.getFormationString(), `(${pendingSubs.length} sub(s) applied)`);
});

btnPause?.addEventListener('click', () => {
  setPaused(!getIsPaused());
  updatePauseButton();
});

// Reset restarts the match
btnReset?.addEventListener('click', () => {
  stopGameLoop();
  if (halfTimePoll !== null) { clearInterval(halfTimePoll); halfTimePoll = null; }
  setSpeed(1);
  hideBenchPanel();
  tacticsBoard.resetSubstitutions();
  _setDebugThoughts(false);
  _setTuningPanel(false);
  startMatch();
  console.log('[Fergie Time] Reset — new match started.');
});

// Speed slider
speedSliderEl?.addEventListener('input', () => {
  const idx = parseInt(speedSliderEl.value, 10);
  const val = SPEED_STEPS[idx] ?? 1;
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
// Window resize — keep tactics canvas in sync
// ============================================================

window.addEventListener('resize', () => {
  if (getIsPaused() && tacticsCanvasEl.style.display !== 'none') {
    // Re-sync tactics canvas size with resized match canvas
    tacticsCanvasEl.width = canvasEl.width;
    tacticsCanvasEl.height = canvasEl.height;
    tacticsBoard.resizeCanvas(canvasEl.width, canvasEl.height);
  }
});

// ============================================================
// Keyboard shortcuts
// ============================================================

document.addEventListener('keydown', (e) => {
  // Don't intercept keys when typing in an input field
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  // Only allow match shortcuts during an active match
  if (currentScreen !== ScreenId.MATCH) return;

  if (e.key === ' ') {
    if (getIsPaused() && btnKickoff?.style.display !== 'none') {
      kickoff();
    } else if (getIsPaused() && btnSecondHalf?.style.display !== 'none') {
      btnSecondHalf?.click();
    } else {
      setPaused(!getIsPaused());
      updatePauseButton();
    }
    e.preventDefault();
  } else if (e.key === '1') {
    setSpeed(1);
  } else if (e.key === '2') {
    setSpeed(2);
  } else if (e.key === '3') {
    setSpeed(4);
  } else if (e.key === '4') {
    setSpeed(0.5);
  } else if (e.key === '5') {
    setSpeed(0.25);
  } else if (e.key === 'd' || e.key === 'D') {
    toggleDebugThoughts();
  } else if (e.key === 'c' || e.key === 'C') {
    toggleTuningPanel();
  } else if (e.key === 'g' || e.key === 'G') {
    renderer.showGhosts = !renderer.showGhosts;
  }
});

// ============================================================
// Vidiprinter — show AI fixture results one-by-one
// ============================================================

function showVidiprinter(aiFixtures: import('./season/fixtures.ts').Fixture[]): void {
  // Hide all screens and nav
  for (const id of ['hub-screen', 'squad-screen', 'fixtures-screen', 'table-screen', 'pitch-area']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const navEl = document.getElementById('nav-tabs');
  if (navEl) navEl.style.display = 'none';

  // Create full-screen vidiprinter
  const vidiEl = document.createElement('div');
  vidiEl.id = 'vidiprinter';
  vidiEl.style.cssText = `
    background: #0a0a0a;
    color: #fbbf24;
    font-family: 'Courier New', monospace;
    padding: 32px 24px;
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
  `;
  vidiEl.innerHTML = `
    <div style="max-width: 500px; width: 100%;">
      <div style="color: #f59e0b; font-weight: bold; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 6px;">
        Matchday ${seasonState.currentMatchday}
      </div>
      <div style="color: #f59e0b; font-weight: bold; font-size: 13px; letter-spacing: 0.15em; margin-bottom: 20px; text-transform: uppercase; border-bottom: 1px solid #f59e0b; padding-bottom: 8px;" id="vidi-header">
        ■ Results Coming In...
      </div>
      <div id="vidi-results"></div>
    </div>
  `;

  // Insert into the app container (sibling of other screens)
  const appContainer = document.getElementById('hub-screen')?.parentElement;
  if (appContainer) {
    appContainer.appendChild(vidiEl);
  } else {
    document.body.appendChild(vidiEl);
  }

  const resultsContainer = document.getElementById('vidi-results')!;
  let i = 0;

  function simNext(): void {
    if (i >= aiFixtures.length) {
      seasonState = finalizeMatchday(seasonState);
      saveGame(serializeState(seasonState), 1).catch(err => console.error('Auto-save failed:', err));

      const header = document.getElementById('vidi-header')!;
      header.textContent = '■ All Results In';
      header.style.color = '#22c55e';
      header.style.borderBottomColor = '#22c55e';

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'text-align: center; margin-top: 24px;';
      const btn = document.createElement('button');
      btn.textContent = 'Continue';
      btn.style.cssText = 'padding: 10px 36px; background: #f59e0b; color: #0a0a0a; border: none; border-radius: 4px; font: bold 14px/1 \'Segoe UI\', system-ui, sans-serif; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em;';
      btn.addEventListener('click', () => {
        vidiEl.remove();
        showScreen(ScreenId.HUB);
      });
      btnRow.appendChild(btn);
      resultsContainer.parentElement!.appendChild(btnRow);
      return;
    }

    const fixture = aiFixtures[i]!;
    const step = simOneAIFixture(seasonState, fixture);
    seasonState = step.state;
    const r = step.result;

    const row = document.createElement('div');
    row.style.cssText = 'padding: 8px 0; opacity: 0; transition: opacity 0.3s; display: flex; align-items: center; border-bottom: 1px solid #1e293b;';
    row.innerHTML = `
      <span style="color: #e2e8f0; flex: 1; text-align: right; font-size: 14px;">${r.homeName}</span>
      <span style="color: #fbbf24; font-weight: bold; width: 70px; text-align: center; font-size: 15px;">${r.homeGoals} - ${r.awayGoals}</span>
      <span style="color: #e2e8f0; flex: 1; text-align: left; font-size: 14px;">${r.awayName}</span>
    `;
    resultsContainer.appendChild(row);
    requestAnimationFrame(() => { row.style.opacity = '1'; });

    i++;
    setTimeout(simNext, 600 + Math.random() * 400);
  }

  setTimeout(simNext, 500);
}

// ============================================================
// Hub Kick Off — start match from hub screen (season path)
// ============================================================

function startMatchFromSquad(): void {
  const selection = squadScreenViewInner.getSelection();
  const valid = validateSquadSelection(selection);
  if (!valid.valid) return;

  // Find opponent for current matchday
  const playerFixture = seasonState.fixtures.find(f =>
    f.matchday === seasonState.currentMatchday &&
    (f.homeTeamId === seasonState.playerTeamId || f.awayTeamId === seasonState.playerTeamId)
  );
  if (!playerFixture) {
    console.error('No fixture found for matchday', seasonState.currentMatchday);
    return;
  }
  const playerIsHome = playerFixture.homeTeamId === seasonState.playerTeamId;
  const opponentId = playerIsHome ? playerFixture.awayTeamId : playerFixture.homeTeamId;
  const opponentTeam = seasonState.teams.find(t => t.id === opponentId);
  if (!opponentTeam) return;

  // Apply fatigueMap to player squad
  const fatigueMap = seasonState.fatigueMap;
  const playerStarters = selection.starters.map(p => ({
    ...p, fatigue: fatigueMap.get(p.id) ?? 0, teamId: (playerIsHome ? 'home' : 'away') as 'home' | 'away',
  }));
  const playerBench = selection.bench.map(p => ({
    ...p, fatigue: fatigueMap.get(p.id) ?? 0, teamId: (playerIsHome ? 'home' : 'away') as 'home' | 'away',
  }));

  // Build opponent roster with fatigue
  const opponentSquad = opponentTeam.squad.map(p => ({
    ...p, fatigue: fatigueMap.get(p.id) ?? 0, teamId: (playerIsHome ? 'away' : 'home') as 'home' | 'away',
  }));
  const opponentStarters = opponentSquad.slice(0, 11);
  const opponentBench = opponentSquad.slice(11, 18);

  // Set which side the player is on for post-match fatigue capture
  currentMatchPlayerSide = playerIsHome ? 'home' : 'away';

  // Build match config with correct home/away assignment
  const homeRoster = playerIsHome ? playerStarters : opponentStarters;
  const homeBench = playerIsHome ? playerBench : opponentBench;
  const awayRoster = playerIsHome ? opponentStarters : playerStarters;
  const awayBench = playerIsHome ? opponentBench : playerBench;

  const matchSeed = `${seasonState.seed}-md-${seasonState.currentMatchday}-player`;

  showScreen(ScreenId.MATCH);
  initMatchWithConfig({ homeRoster, homeBench, awayRoster, awayBench, seed: matchSeed });
}

hubScreenView.onKickoff(() => {
  // Ensure squad screen has latest data for default selection
  const playerTeam = seasonState.teams.find(t => t.isPlayerTeam)!;
  squadScreenViewInner.setFormationRoles(tacticsBoard.getPhaseRoles('inPossession'), tacticsBoard.getPhaseRoles('outOfPossession'));
  squadScreenViewInner.update(playerTeam.squad, seasonState.fatigueMap);
  startMatchFromSquad();
});

// ============================================================
// Boot — login gate + session restore
// ============================================================

async function boot(): Promise<void> {
  // Try to resume an existing session (cookie still valid)
  try {
    const loadResult = await loadGame();
    if (loadResult.hasState && loadResult.gameState) {
      const envelope = deserializeState(loadResult.gameState);
      seasonState = envelope.state;
      showScreen(ScreenId.HUB);
      console.log('[Fergie Time] Session restored — welcome back.');
      return;
    }
  } catch {
    // 401 or network error — fall through to login screen
  }

  // Show login screen
  showScreen(ScreenId.LOGIN);
  loginScreenView.show(async (teamName, isNewGame, gameStateJson) => {
    if (isNewGame) {
      // Fetch realistic names for all 20 teams (500 = 20 * 25)
      const names = await getNames(500, seedrandom('names-' + teamName));
      // Create player squad using createAITeam with 'mid' tier
      const playerSquad = createAITeam('mid', 'player-team', teamName, seedrandom('player-' + teamName), names.slice(0, 25));
      // Create season with remaining names for AI teams
      seasonState = createSeason('player-team', teamName, playerSquad, 'season-1', names.slice(25));
      // Auto-save the fresh season immediately
      const json = serializeState(seasonState);
      saveGame(json, 1).catch(err => console.error('Initial save failed:', err));
    } else if (gameStateJson) {
      // Restore from loaded state
      const envelope = deserializeState(gameStateJson);
      seasonState = envelope.state;
    }
    loginScreenView.hide();
    showScreen(ScreenId.HUB);
    console.log('[Fergie Time] Season started — navigate to Squad to select your team and Kick Off.');
  });
}
boot();

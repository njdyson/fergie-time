import type { TacticsPhase, PlayerTacticalMultipliers, TeamControls, PressConfig, TransitionConfig, Duty, PlayerState, ExtendedTeamControls } from '../simulation/types.ts';
import { defaultPlayerMultipliers, defaultTeamControls, defaultPressConfig, defaultTransitionConfig, defaultExtendedTeamControls } from '../simulation/types.ts';
import { PhaseBar } from './panels/phaseBar.ts';
import { TeamPanel } from './panels/teamPanel.ts';
import { PlayerPanel } from './panels/playerPanel.ts';
import { SquadPanel } from './panels/squadPanel.ts';
import type { TacticalConfig } from '../simulation/engine.ts';

// ============================================================
// Per-phase tactical state
// ============================================================

export interface OverlayPhaseState {
  multipliers: PlayerTacticalMultipliers[];
  teamControls: TeamControls;
  press: PressConfig;
  transitions: TransitionConfig;
  duties: Duty[];
  extended: ExtendedTeamControls;
}

function defaultPhaseState(playerCount: number = 11): OverlayPhaseState {
  return {
    multipliers: defaultPlayerMultipliers(playerCount),
    teamControls: defaultTeamControls(),
    press: defaultPressConfig(),
    transitions: defaultTransitionConfig(),
    duties: Array(playerCount).fill('SUPPORT') as Duty[],
    extended: defaultExtendedTeamControls(),
  };
}

// ============================================================
// TacticsOverlay
// ============================================================

/**
 * Orchestrates the in-match tactics overlay.
 * Shows/hides panels on pause, manages per-phase state, and
 * produces TacticalConfig objects for the engine.
 */
export class TacticsOverlay {
  private readonly phaseBar: PhaseBar;
  private readonly teamPanel: TeamPanel;
  private readonly playerPanel: PlayerPanel;
  private readonly squadPanel: SquadPanel;
  private readonly matchCanvas: HTMLCanvasElement;
  private readonly squadViewEl: HTMLElement;
  private readonly playerViewEl: HTMLElement;

  private phases: Record<TacticsPhase, OverlayPhaseState> = {
    inPossession: defaultPhaseState(),
    outOfPossession: defaultPhaseState(),
    defensiveTransition: defaultPhaseState(),
    attackingTransition: defaultPhaseState(),
  };

  private currentPhase: TacticsPhase = 'inPossession';
  private isOpen: boolean = false;
  private players: readonly PlayerState[] = [];

  // Callback fired when any control changes
  private onConfigChange: (() => void) | null = null;
  private onPhaseChange: (() => void) | null = null;
  private onPlayerSelect: ((index: number) => void) | null = null;
  private canvasClickHandler: ((e: MouseEvent) => void) | null = null;

  // Bench substitution state
  private pendingBench: PlayerState | null = null;
  private onSubQueued: ((pitchIndex: number, benchPlayer: PlayerState) => void) | null = null;

  constructor(
    phaseBarEl: HTMLElement,
    leftPanelEl: HTMLElement,
    rightPanelEl: HTMLElement,
    matchCanvas: HTMLCanvasElement,
  ) {
    this.matchCanvas = matchCanvas;
    this.phaseBar = new PhaseBar(phaseBarEl);
    this.teamPanel = new TeamPanel(leftPanelEl);

    // Right panel has two views: squad list and player detail
    this.squadViewEl = rightPanelEl.querySelector('#squad-view') as HTMLElement;
    this.playerViewEl = rightPanelEl.querySelector('#player-view') as HTMLElement;
    this.squadPanel = new SquadPanel(this.squadViewEl);
    this.playerPanel = new PlayerPanel(this.playerViewEl);

    // Wire squad panel player selection → show player detail
    this.squadPanel.onPlayerSelected((index) => {
      this._showPlayerView(index);
    });

    // Wire player panel back button → show squad view
    this.playerPanel.onBack(() => {
      this._showSquadView();
    });

    // Wire phase switching
    this.phaseBar.onPhaseChange((phase) => {
      this._saveCurrentPhase();
      this.currentPhase = phase;
      this._loadPhase(phase);
      this.onPhaseChange?.();
      // Also fire config change so anchors update on canvas
      this.onConfigChange?.();
    });

    // Wire team panel changes
    this.teamPanel.onControlChange(() => {
      const ps = this.phases[this.currentPhase]!;
      ps.teamControls = this.teamPanel.getControls();
      ps.press = this.teamPanel.getPress();
      ps.extended = this.teamPanel.getExtended();
      this.onConfigChange?.();
    });

    // Wire player panel changes (multiplier changes include target phase)
    this.playerPanel.onMultiplierChange((idx, mult, phase) => {
      this.phases[phase]!.multipliers[idx] = mult;
      this.onConfigChange?.();
    });

    this.playerPanel.onDutyChanged((idx, duty) => {
      this.phases[this.currentPhase]!.duties[idx] = duty;
      this._updateSquadList();
      this.onConfigChange?.();
    });

  }

  /**
   * Show the overlay (called on pause).
   * @param players Current player states for click detection
   * @param detectedPhase Auto-detected tactical phase from live match state
   */
  open(players: readonly PlayerState[], detectedPhase?: TacticsPhase): void {
    this.players = players;
    this.isOpen = true;

    // Auto-select phase based on detected match state
    if (detectedPhase) {
      const TRANSITION_LABELS: Record<string, string> = {
        defensiveTransition: 'Defensive Transition',
        attackingTransition: 'Attacking Transition',
      };

      if (detectedPhase === 'defensiveTransition' || detectedPhase === 'attackingTransition') {
        // Transition active — select the base phase, show status text
        const basePhase = detectedPhase === 'defensiveTransition' ? 'outOfPossession' : 'inPossession';
        this.currentPhase = basePhase;
        this.phaseBar.setStatusText(TRANSITION_LABELS[detectedPhase]!);
      } else {
        this.currentPhase = detectedPhase;
        this.phaseBar.setStatusText('');
      }
    } else {
      this.phaseBar.setStatusText('');
    }

    // Sync tab visually without firing onChange (we handle loading below)
    this.phaseBar.setSilent(this.currentPhase);
    this.phaseBar.show();
    this.teamPanel.show();
    // Right panel starts in squad view
    this._loadPhase(this.currentPhase);
    this._showSquadView();
    this._attachCanvasClick();
  }

  /** Hide the overlay (called on unpause). */
  close(): void {
    this._saveCurrentPhase();
    this.isOpen = false;
    this.phaseBar.setStatusText('');
    this.phaseBar.hide();
    this.teamPanel.hide();
    this.playerPanel.deselect();
    this._showSquadView();  // Return to squad view on unpause
    this.onPlayerSelect?.(-1);
    this._detachCanvasClick();
  }

  /** Update player references (call after engine recomputes anchors) */
  updatePlayers(players: readonly PlayerState[]): void {
    this.players = players;
  }

  /**
   * Update the squad list during live play (not paused).
   * Refreshes names/roles and highlights the ball carrier.
   * @param players Current player states from snapshot
   * @param carrierId The ball.carrierId from snapshot (e.g. "home-3" or null)
   */
  updateLiveSquad(players: readonly PlayerState[], carrierId: string | null): void {
    this.players = players;
    this._updateSquadList();
    // Find the home-team index of the carrier
    let highlightIdx = -1;
    if (carrierId) {
      const homePlayers = players.filter(p => p.teamId === 'home');
      highlightIdx = homePlayers.findIndex(p => p.id === carrierId);
    }
    this.squadPanel.setHighlight(highlightIdx);
  }

  isVisible(): boolean { return this.isOpen; }

  /** Select a player by index from an external source (e.g. TacticsBoard click) */
  selectPlayer(index: number): void {
    if (index < 0) {
      this._showSquadView();
    } else {
      this._showPlayerView(index);
    }
  }

  /** Get the currently active editing phase */
  getCurrentPhase(): TacticsPhase { return this.currentPhase; }

  /** Get per-player multiplier array for the active phase (for UI sync) */
  getActivePhaseMultipliers(): PlayerTacticalMultipliers[] {
    this._saveCurrentPhase();
    return this.phases[this.currentPhase]!.multipliers.map(m => ({ ...m }));
  }

  /** Get extended controls for a specific phase */
  getExtendedControls(phase: TacticsPhase): ExtendedTeamControls {
    this._saveCurrentPhase();
    return this.phases[phase]!.extended;
  }

  /** Register callback for config changes */
  onChanged(cb: () => void): void { this.onConfigChange = cb; }

  /** Register callback for phase tab changes */
  onPhaseChanged(cb: () => void): void { this.onPhaseChange = cb; }

  /** Register callback for player selection changes (index = -1 means deselected) */
  onPlayerSelected(cb: (index: number) => void): void { this.onPlayerSelect = cb; }

  /** Register callback for quick-shape preset selection */
  onQuickShape(cb: (formationId: string) => void): void { this.teamPanel.onQuickShape(cb); }

  /** Register callback for substitution queued (bench player → pitch player) */
  onSubstitutionQueued(cb: (pitchIndex: number, benchPlayer: PlayerState) => void): void {
    this.onSubQueued = cb;
  }

  /** Set a bench player as pending for substitution (click a pitch player to complete) */
  setPendingBenchPlayer(player: PlayerState | null): void {
    this.pendingBench = player;
  }

  /** Get the currently pending bench player */
  getPendingBenchPlayer(): PlayerState | null {
    return this.pendingBench;
  }

  /** Get the in-possession TacticalConfig (merges with base formation from tactics board) */
  getInPossConfig(baseConfig: TacticalConfig): TacticalConfig {
    const ps = this.phases.inPossession;
    return {
      ...baseConfig,
      duties: ps.duties,
      multipliers: ps.multipliers,
      teamControls: ps.teamControls,
      press: ps.press,
      transitions: ps.transitions,
    };
  }

  /** Get the out-of-possession TacticalConfig */
  getOutOfPossConfig(baseConfig: TacticalConfig): TacticalConfig {
    const ps = this.phases.outOfPossession;
    return {
      ...baseConfig,
      duties: ps.duties,
      multipliers: ps.multipliers,
      teamControls: ps.teamControls,
      press: ps.press,
      transitions: ps.transitions,
    };
  }

  /** Get the defensive transition TacticalConfig (multipliers only) */
  getDefTransConfig(baseConfig: TacticalConfig): TacticalConfig {
    const ps = this.phases.defensiveTransition;
    return {
      ...baseConfig,
      duties: ps.duties,
      multipliers: ps.multipliers,
    };
  }

  /** Get the attacking transition TacticalConfig (multipliers only) */
  getAttTransConfig(baseConfig: TacticalConfig): TacticalConfig {
    const ps = this.phases.attackingTransition;
    return {
      ...baseConfig,
      duties: ps.duties,
      multipliers: ps.multipliers,
    };
  }

  /**
   * Get the config for whichever phase is currently being edited.
   * Used to display the correct anchors on the canvas.
   */
  getActivePhaseConfig(baseConfig: TacticalConfig): TacticalConfig {
    this._saveCurrentPhase();
    const ps = this.phases[this.currentPhase]!;
    return {
      ...baseConfig,
      duties: ps.duties,
      multipliers: ps.multipliers,
      teamControls: ps.teamControls,
      press: ps.press,
      transitions: ps.transitions,
    };
  }

  /** Load existing tactical config into overlay state */
  loadFromConfig(inPoss: TacticalConfig, outOfPoss: TacticalConfig): void {
    this._loadConfigIntoPhase('inPossession', inPoss);
    this._loadConfigIntoPhase('outOfPossession', outOfPoss);
    this._loadPhase(this.currentPhase);
  }

  private _loadConfigIntoPhase(phase: TacticsPhase, config: TacticalConfig): void {
    const ps = this.phases[phase]!;
    if (config.multipliers) ps.multipliers = config.multipliers.map(m => ({ ...m }));
    if (config.teamControls) ps.teamControls = { ...config.teamControls };
    if (config.press) ps.press = { ...config.press };
    if (config.transitions) ps.transitions = { ...config.transitions };
    ps.duties = [...config.duties];
  }

  /** Get full phase state for saving (saves working state first) */
  getOverlayPhaseState(phase: TacticsPhase): OverlayPhaseState {
    this._saveCurrentPhase();
    const ps = this.phases[phase]!;
    return {
      multipliers: ps.multipliers.map(m => ({ ...m })),
      teamControls: { ...ps.teamControls },
      press: { ...ps.press },
      transitions: { ...ps.transitions },
      duties: [...ps.duties],
      extended: { ...ps.extended, setPieces: { ...ps.extended.setPieces }, manMarkAssignments: [...ps.extended.manMarkAssignments] },
    };
  }

  /** Load full phase state (used by tactic loader) */
  setOverlayPhaseState(phase: TacticsPhase, state: OverlayPhaseState): void {
    this.phases[phase] = {
      multipliers: state.multipliers.map(m => ({ ...m })),
      teamControls: { ...state.teamControls },
      press: { ...state.press },
      transitions: { ...state.transitions },
      duties: [...state.duties],
      extended: state.extended ? { ...state.extended, setPieces: { ...state.extended.setPieces }, manMarkAssignments: [...state.extended.manMarkAssignments] } : defaultExtendedTeamControls(),
    };
    // If this is the active editing phase, reload the UI
    if (phase === this.currentPhase) {
      this._loadPhase(phase);
    }
  }

  /** Switch right panel to squad list view */
  private _showSquadView(): void {
    this.squadViewEl.style.display = '';
    this.playerViewEl.style.display = 'none';
    this.playerPanel.deselect();
    this._updateSquadList();
    this.onPlayerSelect?.(-1);
  }

  /** Switch right panel to player detail view */
  private _showPlayerView(index: number): void {
    // If a bench player is pending, queue substitution instead of opening player detail
    if (this.pendingBench) {
      this.onSubQueued?.(index, this.pendingBench);
      this.pendingBench = null;
      return;
    }
    this.squadViewEl.style.display = 'none';
    this.playerViewEl.style.display = '';
    this._selectPlayerByIndex(index);
  }

  /** Rebuild the squad list from current player/duty state */
  private _updateSquadList(): void {
    const homePlayers = this.players.filter(p => p.teamId === 'home');
    const ps = this.phases[this.currentPhase]!;
    const entries = homePlayers.map((p, i) => ({
      name: p.name ?? p.id,
      role: String(p.role),
      number: i + 1,
      duty: ps.duties[i] ?? 'SUPPORT' as Duty,
      attributes: p.attributes,
      personality: p.personality,
      fatigue: p.fatigue,
    }));
    this.squadPanel.update(entries);
  }

  private _saveCurrentPhase(): void {
    const ps = this.phases[this.currentPhase]!;
    ps.teamControls = this.teamPanel.getControls();
    ps.press = this.teamPanel.getPress();
    ps.extended = this.teamPanel.getExtended();
  }

  private _loadPhase(phase: TacticsPhase): void {
    const ps = this.phases[phase]!;
    this.teamPanel.setControls(ps.teamControls, ps.press, phase);
    this.teamPanel.setExtended(ps.extended);
    this.playerPanel.setPhase(phase);
    // Refresh squad list for the new phase's duties
    if (this.players.length > 0) this._updateSquadList();
    // If a player is selected, update the player panel with this phase's data
    const selectedIdx = this.playerPanel.getSelectedIndex();
    if (selectedIdx >= 0 && this.players.length > 0) {
      this._selectPlayerByIndex(selectedIdx);
    }
  }

  private _selectPlayerByIndex(idx: number): void {
    // idx is the index within home team (0-10)
    const homePlayersCount = this.players.filter(p => p.teamId === 'home').length;
    if (idx < 0 || idx >= homePlayersCount) return;

    const player = this.players.filter(p => p.teamId === 'home')[idx];
    if (!player) return;

    const ps = this.phases[this.currentPhase]!;
    const defaultMult = defaultPlayerMultipliers(1)[0]!;

    // Build all 4 phase multipliers for this player
    const allPhaseMultipliers = {
      inPossession: this.phases.inPossession.multipliers[idx] ?? defaultMult,
      outOfPossession: this.phases.outOfPossession.multipliers[idx] ?? defaultMult,
      defensiveTransition: this.phases.defensiveTransition.multipliers[idx] ?? defaultMult,
      attackingTransition: this.phases.attackingTransition.multipliers[idx] ?? defaultMult,
    };

    this.playerPanel.selectPlayer(
      idx,
      player.name ?? player.id,
      String(player.role),
      idx + 1,
      ps.duties[idx] ?? 'SUPPORT',
      allPhaseMultipliers,
      this.currentPhase,
    );
    this.onPlayerSelect?.(idx);
  }

  private _attachCanvasClick(): void {
    this._detachCanvasClick();
    this.canvasClickHandler = (e: MouseEvent) => {
      if (!this.isOpen) return;
      const rect = this.matchCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      // Convert canvas pixel to pitch coordinates
      // Match canvas uses the same coordinate system as the renderer
      const scaleX = rect.width / this.matchCanvas.width;
      const scaleY = rect.height / this.matchCanvas.height;
      const canvasX = clickX / scaleX;
      const canvasY = clickY / scaleY;

      // Find closest home player to click position
      // We need to map pitch coords — the renderer maps (0..105, 0..68) to canvas pixels
      // with padding. For now, use a rough mapping.
      const PADDING = 20;
      const pitchW = this.matchCanvas.width - PADDING * 2;
      const pitchH = this.matchCanvas.height - PADDING * 2;
      const pitchX = ((canvasX - PADDING) / pitchW) * 105;
      const pitchY = ((canvasY - PADDING) / pitchH) * 68;

      let bestIdx = -1;
      let bestDist = 8; // max click radius in metres
      const homePlayers = this.players.filter(p => p.teamId === 'home');
      for (let i = 0; i < homePlayers.length; i++) {
        const p = homePlayers[i]!;
        // Hit-test against anchor positions (what's visible on screen when paused)
        const dx = p.formationAnchor.x - pitchX;
        const dy = p.formationAnchor.y - pitchY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        // If a bench player is pending, queue substitution instead of selecting
        if (this.pendingBench) {
          this.onSubQueued?.(bestIdx, this.pendingBench);
          this.pendingBench = null;
          return;
        }
        this._showPlayerView(bestIdx);
      } else {
        this._showSquadView();
      }
    };
    this.matchCanvas.addEventListener('click', this.canvasClickHandler);
  }

  private _detachCanvasClick(): void {
    if (this.canvasClickHandler) {
      this.matchCanvas.removeEventListener('click', this.canvasClickHandler);
      this.canvasClickHandler = null;
    }
  }
}

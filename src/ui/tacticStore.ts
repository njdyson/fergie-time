import type { PlayerTacticalMultipliers, TeamControls, PressConfig, TransitionConfig, Duty, Role } from '../simulation/types.ts';
import { defaultExtendedTeamControls } from '../simulation/types.ts';
import type { OverlayPhaseState } from './tacticsOverlay.ts';
import type { TacticsBoard } from './tacticsBoard.ts';
import type { TacticsOverlay } from './tacticsOverlay.ts';
import { Vec2 } from '../simulation/math/vec2.ts';

// ============================================================
// Saved tactic JSON schema
// ============================================================

interface SavedPhase {
  positions: { x: number; y: number }[];
  roles: string[];
  duties: string[];
  /** Multipliers keyed by role (e.g. "CB", "CB_2" for duplicates) */
  multipliers: Record<string, PlayerTacticalMultipliers>;
  teamControls: TeamControls;
  press: PressConfig;
  transitions: TransitionConfig;
}

export interface SavedTactic {
  name: string;
  version: 1;
  phases: {
    inPossession: SavedPhase;
    outOfPossession: SavedPhase;
  };
}

// ============================================================
// Role-keyed multiplier helpers
// ============================================================

/** Convert slot-indexed multipliers to role-keyed map */
function multipliersToRoleMap(
  roles: string[],
  multipliers: PlayerTacticalMultipliers[],
): Record<string, PlayerTacticalMultipliers> {
  const map: Record<string, PlayerTacticalMultipliers> = {};
  const count: Record<string, number> = {};
  for (let i = 0; i < roles.length; i++) {
    const role = roles[i]!;
    count[role] = (count[role] ?? 0) + 1;
    const key = count[role]! > 1 ? `${role}_${count[role]}` : role;
    map[key] = { ...multipliers[i]! };
  }
  return map;
}

/** Convert role-keyed map back to slot-indexed multipliers */
function roleMapToMultipliers(
  roles: string[],
  map: Record<string, PlayerTacticalMultipliers>,
  fallback: PlayerTacticalMultipliers,
): PlayerTacticalMultipliers[] {
  const count: Record<string, number> = {};
  return roles.map(role => {
    count[role] = (count[role] ?? 0) + 1;
    const key = count[role]! > 1 ? `${role}_${count[role]}` : role;
    return map[key] ? { ...map[key]! } : { ...fallback };
  });
}

// ============================================================
// Build / Apply helpers
// ============================================================

const DEFAULT_MULT: PlayerTacticalMultipliers = {
  risk: 0.5, directness: 0.5, press: 0.5, holdUp: 0.5,
  dribble: 0.5, freedom: 0.5, decisionWindow: 0.5,
};

function buildPhase(
  board: TacticsBoard,
  overlay: TacticsOverlay,
  phase: 'inPossession' | 'outOfPossession',
): SavedPhase {
  const positions = board.getPhasePositions(phase);
  const roles = board.getPhaseRoles(phase);
  const duties = board.getPhaseDuties(phase);
  const overlayState = overlay.getOverlayPhaseState(phase);

  return {
    positions: positions.map(p => ({ x: p.x, y: p.y })),
    roles: roles.map(String),
    duties: duties.map(String),
    multipliers: multipliersToRoleMap(roles.map(String), overlayState.multipliers),
    teamControls: { ...overlayState.teamControls },
    press: { ...overlayState.press },
    transitions: { ...overlayState.transitions },
  };
}

/** Extract current state from board + overlay into a SavedTactic */
export function buildSavedTactic(
  name: string,
  board: TacticsBoard,
  overlay: TacticsOverlay,
): SavedTactic {
  return {
    name,
    version: 1,
    phases: {
      inPossession: buildPhase(board, overlay, 'inPossession'),
      outOfPossession: buildPhase(board, overlay, 'outOfPossession'),
    },
  };
}

/** Apply a SavedTactic to the board + overlay */
export function applySavedTactic(
  tactic: SavedTactic,
  board: TacticsBoard,
  overlay: TacticsOverlay,
): void {
  for (const phase of ['inPossession', 'outOfPossession'] as const) {
    const sp = tactic.phases[phase];
    const positions = sp.positions.map(p => new Vec2(p.x, p.y));
    const roles = sp.roles as Role[];
    const duties = sp.duties as Duty[];

    // Load board state (positions, roles, duties)
    board.loadPhaseState(phase, positions, roles, duties);

    // Load overlay state (multipliers, team controls, press, transitions)
    const multipliers = roleMapToMultipliers(sp.roles, sp.multipliers, DEFAULT_MULT);
    const overlayState: OverlayPhaseState = {
      multipliers,
      teamControls: { ...sp.teamControls },
      press: { ...sp.press },
      transitions: { ...sp.transitions },
      duties: [...duties],
      extended: defaultExtendedTeamControls(),
    };
    overlay.setOverlayPhaseState(phase, overlayState);
  }
}

// ============================================================
// localStorage persistence
// ============================================================

const STORAGE_KEY = 'fergie-time-tactics';

function getStore(): Record<string, SavedTactic> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setStore(store: Record<string, SavedTactic>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function listTactics(): string[] {
  return Object.keys(getStore()).sort();
}

export function saveTactic(tactic: SavedTactic): void {
  const store = getStore();
  store[tactic.name] = tactic;
  setStore(store);
}

export function loadTactic(name: string): SavedTactic | null {
  return getStore()[name] ?? null;
}

export function deleteTactic(name: string): void {
  const store = getStore();
  delete store[name];
  setStore(store);
}

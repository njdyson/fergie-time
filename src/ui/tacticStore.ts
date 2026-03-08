import type { PlayerTacticalMultipliers, TeamControls, PressConfig, TransitionConfig, Duty, Role, FormationId } from '../simulation/types.ts';
import { defaultExtendedTeamControls } from '../simulation/types.ts';
import type { OverlayPhaseState } from './tacticsOverlay.ts';
import type { TacticsBoard } from './tacticsBoard.ts';
import type { TacticsOverlay } from './tacticsOverlay.ts';
import { Vec2 } from '../simulation/math/vec2.ts';
import { FORMATION_TEMPLATES } from '../simulation/tactical/formation.ts';

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

/** Build stable role keys from a role list (e.g. "CB", "CB_2"). */
function roleKeysForRoles(roles: string[]): string[] {
  const count: Record<string, number> = {};
  return roles.map((role) => {
    count[role] = (count[role] ?? 0) + 1;
    return count[role]! > 1 ? `${role}_${count[role]}` : role;
  });
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

type MultPatch = Partial<PlayerTacticalMultipliers>;

interface PhasePresetConfig {
  formation: FormationId;
  dutiesByRole?: Record<string, Duty>;
  dutiesByKey?: Record<string, Duty>;
  multipliersByRole?: Record<string, MultPatch>;
  multipliersByKey?: Record<string, MultPatch>;
  teamControls: TeamControls;
  press: PressConfig;
  transitions: TransitionConfig;
}

function buildPresetPhase(config: PhasePresetConfig): SavedPhase {
  const template = FORMATION_TEMPLATES[config.formation];
  const positions = template.basePositions.map((p) => ({ x: p.x, y: p.y }));
  const roles = template.roles.map(String);
  const roleKeys = roleKeysForRoles(roles);

  const duties: string[] = roleKeys.map((key, idx) => {
    const role = roles[idx]!;
    return config.dutiesByKey?.[key] ?? config.dutiesByRole?.[role] ?? 'SUPPORT';
  });

  const multipliers = roleKeys.map((key, idx) => {
    const role = roles[idx]!;
    return {
      ...DEFAULT_MULT,
      ...(config.multipliersByRole?.[role] ?? {}),
      ...(config.multipliersByKey?.[key] ?? {}),
    };
  });

  return {
    positions,
    roles,
    duties,
    multipliers: multipliersToRoleMap(roles, multipliers),
    teamControls: { ...config.teamControls },
    press: { ...config.press },
    transitions: { ...config.transitions },
  };
}

function buildPresetTactic(
  name: string,
  inPossession: PhasePresetConfig,
  outOfPossession: PhasePresetConfig,
): SavedTactic {
  return {
    name,
    version: 1,
    phases: {
      inPossession: buildPresetPhase(inPossession),
      outOfPossession: buildPresetPhase(outOfPossession),
    },
  };
}

function cloneTactic(tactic: SavedTactic): SavedTactic {
  return JSON.parse(JSON.stringify(tactic)) as SavedTactic;
}

const BUILT_IN_TACTICS: Record<string, SavedTactic> = (() => {
  const presets: SavedTactic[] = [
    buildPresetTactic(
      'Balanced 4-2-3-1',
      {
        formation: '4-2-3-1',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'SUPPORT',
          CB: 'DEFEND',
          RB: 'SUPPORT',
          CDM: 'SUPPORT',
          CAM: 'SUPPORT',
          ST: 'ATTACK',
        },
        dutiesByKey: {
          CDM: 'DEFEND',
          CAM_2: 'ATTACK',
        },
        multipliersByRole: {
          GK: { risk: 0.35, directness: 0.45, press: 0.2, holdUp: 0.35, dribble: 0.2, freedom: 0.2, decisionWindow: 0.55 },
          LB: { risk: 0.5, directness: 0.52, press: 0.58, holdUp: 0.45, dribble: 0.55, freedom: 0.55, decisionWindow: 0.52 },
          CB: { risk: 0.35, directness: 0.44, press: 0.5, holdUp: 0.45, dribble: 0.32, freedom: 0.35, decisionWindow: 0.5 },
          RB: { risk: 0.5, directness: 0.52, press: 0.58, holdUp: 0.45, dribble: 0.55, freedom: 0.55, decisionWindow: 0.52 },
          CDM: { risk: 0.42, directness: 0.48, press: 0.56, holdUp: 0.58, dribble: 0.42, freedom: 0.42, decisionWindow: 0.5 },
          CAM: { risk: 0.58, directness: 0.58, press: 0.6, holdUp: 0.45, dribble: 0.6, freedom: 0.62, decisionWindow: 0.58 },
          ST: { risk: 0.6, directness: 0.62, press: 0.64, holdUp: 0.6, dribble: 0.52, freedom: 0.6, decisionWindow: 0.62 },
        },
        teamControls: { lineHeight: 0.52, compactness: 0.56, width: 0.54, tempo: 0.55, restDefence: 3 },
        press: { height: 'mid', counterPressSecs: 2, intensity: 0.58 },
        transitions: { counterPressDuration: 2, collapseDepth: 0.5, forwardBias: 0.58, runnerCount: 2 },
      },
      {
        formation: '4-4-2',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'DEFEND',
          CB: 'DEFEND',
          RB: 'DEFEND',
          LW: 'SUPPORT',
          CM: 'SUPPORT',
          RW: 'SUPPORT',
          ST: 'SUPPORT',
        },
        dutiesByKey: {
          ST_2: 'ATTACK',
          CM_2: 'DEFEND',
        },
        multipliersByRole: {
          GK: { risk: 0.33, directness: 0.44, press: 0.18, holdUp: 0.35, dribble: 0.18, freedom: 0.2, decisionWindow: 0.52 },
          LB: { risk: 0.4, directness: 0.46, press: 0.55, holdUp: 0.42, dribble: 0.44, freedom: 0.42, decisionWindow: 0.5 },
          CB: { risk: 0.3, directness: 0.4, press: 0.52, holdUp: 0.44, dribble: 0.28, freedom: 0.3, decisionWindow: 0.5 },
          RB: { risk: 0.4, directness: 0.46, press: 0.55, holdUp: 0.42, dribble: 0.44, freedom: 0.42, decisionWindow: 0.5 },
          LW: { risk: 0.48, directness: 0.55, press: 0.62, holdUp: 0.4, dribble: 0.56, freedom: 0.5, decisionWindow: 0.54 },
          CM: { risk: 0.42, directness: 0.5, press: 0.58, holdUp: 0.52, dribble: 0.44, freedom: 0.42, decisionWindow: 0.5 },
          RW: { risk: 0.48, directness: 0.55, press: 0.62, holdUp: 0.4, dribble: 0.56, freedom: 0.5, decisionWindow: 0.54 },
          ST: { risk: 0.52, directness: 0.58, press: 0.6, holdUp: 0.62, dribble: 0.46, freedom: 0.52, decisionWindow: 0.58 },
        },
        multipliersByKey: {
          ST_2: { holdUp: 0.48, dribble: 0.6, freedom: 0.62, press: 0.66, directness: 0.64 },
        },
        teamControls: { lineHeight: 0.48, compactness: 0.62, width: 0.5, tempo: 0.5, restDefence: 3 },
        press: { height: 'mid', counterPressSecs: 2, intensity: 0.6 },
        transitions: { counterPressDuration: 2, collapseDepth: 0.56, forwardBias: 0.56, runnerCount: 2 },
      },
    ),
    buildPresetTactic(
      'Control Press 4-3-3',
      {
        formation: '4-3-3',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'SUPPORT',
          CB: 'DEFEND',
          RB: 'SUPPORT',
          CM: 'SUPPORT',
          LW: 'ATTACK',
          ST: 'ATTACK',
          RW: 'ATTACK',
        },
        dutiesByKey: {
          CM_2: 'DEFEND',
        },
        multipliersByRole: {
          GK: { risk: 0.34, directness: 0.42, press: 0.2, holdUp: 0.35, dribble: 0.2, freedom: 0.2, decisionWindow: 0.52 },
          LB: { risk: 0.5, directness: 0.56, press: 0.62, holdUp: 0.46, dribble: 0.58, freedom: 0.58, decisionWindow: 0.55 },
          CB: { risk: 0.34, directness: 0.46, press: 0.56, holdUp: 0.45, dribble: 0.32, freedom: 0.35, decisionWindow: 0.52 },
          RB: { risk: 0.5, directness: 0.56, press: 0.62, holdUp: 0.46, dribble: 0.58, freedom: 0.58, decisionWindow: 0.55 },
          CM: { risk: 0.48, directness: 0.54, press: 0.6, holdUp: 0.52, dribble: 0.48, freedom: 0.5, decisionWindow: 0.52 },
          LW: { risk: 0.62, directness: 0.66, press: 0.7, holdUp: 0.42, dribble: 0.74, freedom: 0.7, decisionWindow: 0.62 },
          ST: { risk: 0.58, directness: 0.64, press: 0.72, holdUp: 0.58, dribble: 0.52, freedom: 0.62, decisionWindow: 0.62 },
          RW: { risk: 0.62, directness: 0.66, press: 0.7, holdUp: 0.42, dribble: 0.74, freedom: 0.7, decisionWindow: 0.62 },
        },
        multipliersByKey: {
          CM_2: { risk: 0.4, directness: 0.46, holdUp: 0.58, dribble: 0.4, freedom: 0.42 },
        },
        teamControls: { lineHeight: 0.66, compactness: 0.64, width: 0.62, tempo: 0.58, restDefence: 3 },
        press: { height: 'high', counterPressSecs: 4, intensity: 0.74 },
        transitions: { counterPressDuration: 4, collapseDepth: 0.35, forwardBias: 0.62, runnerCount: 2 },
      },
      {
        formation: '4-5-1',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'DEFEND',
          CB: 'DEFEND',
          RB: 'DEFEND',
          LM: 'SUPPORT',
          CM: 'SUPPORT',
          RM: 'SUPPORT',
          ST: 'SUPPORT',
        },
        dutiesByKey: {
          CM_2: 'DEFEND',
        },
        multipliersByRole: {
          GK: { risk: 0.32, directness: 0.42, press: 0.18, holdUp: 0.34, dribble: 0.18, freedom: 0.2, decisionWindow: 0.52 },
          LB: { risk: 0.36, directness: 0.42, press: 0.62, holdUp: 0.42, dribble: 0.42, freedom: 0.38, decisionWindow: 0.5 },
          CB: { risk: 0.28, directness: 0.38, press: 0.6, holdUp: 0.45, dribble: 0.25, freedom: 0.28, decisionWindow: 0.5 },
          RB: { risk: 0.36, directness: 0.42, press: 0.62, holdUp: 0.42, dribble: 0.42, freedom: 0.38, decisionWindow: 0.5 },
          LM: { risk: 0.46, directness: 0.54, press: 0.74, holdUp: 0.4, dribble: 0.54, freedom: 0.46, decisionWindow: 0.54 },
          CM: { risk: 0.4, directness: 0.46, press: 0.72, holdUp: 0.5, dribble: 0.42, freedom: 0.38, decisionWindow: 0.5 },
          RM: { risk: 0.46, directness: 0.54, press: 0.74, holdUp: 0.4, dribble: 0.54, freedom: 0.46, decisionWindow: 0.54 },
          ST: { risk: 0.52, directness: 0.6, press: 0.64, holdUp: 0.66, dribble: 0.42, freedom: 0.5, decisionWindow: 0.58 },
        },
        teamControls: { lineHeight: 0.58, compactness: 0.7, width: 0.55, tempo: 0.5, restDefence: 4 },
        press: { height: 'high', counterPressSecs: 3, intensity: 0.7 },
        transitions: { counterPressDuration: 3, collapseDepth: 0.45, forwardBias: 0.6, runnerCount: 2 },
      },
    ),
    buildPresetTactic(
      'Vertical 4-4-2',
      {
        formation: '4-4-2',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'SUPPORT',
          CB: 'DEFEND',
          RB: 'SUPPORT',
          LW: 'ATTACK',
          CM: 'SUPPORT',
          RW: 'ATTACK',
          ST: 'ATTACK',
        },
        dutiesByKey: {
          ST: 'SUPPORT',
          ST_2: 'ATTACK',
          CM_2: 'ATTACK',
        },
        multipliersByRole: {
          GK: { risk: 0.32, directness: 0.58, press: 0.18, holdUp: 0.32, dribble: 0.18, freedom: 0.2, decisionWindow: 0.6 },
          LB: { risk: 0.48, directness: 0.62, press: 0.58, holdUp: 0.42, dribble: 0.56, freedom: 0.52, decisionWindow: 0.58 },
          CB: { risk: 0.32, directness: 0.54, press: 0.5, holdUp: 0.42, dribble: 0.3, freedom: 0.34, decisionWindow: 0.56 },
          RB: { risk: 0.48, directness: 0.62, press: 0.58, holdUp: 0.42, dribble: 0.56, freedom: 0.52, decisionWindow: 0.58 },
          LW: { risk: 0.58, directness: 0.74, press: 0.62, holdUp: 0.36, dribble: 0.66, freedom: 0.64, decisionWindow: 0.62 },
          CM: { risk: 0.52, directness: 0.66, press: 0.56, holdUp: 0.52, dribble: 0.48, freedom: 0.52, decisionWindow: 0.6 },
          RW: { risk: 0.58, directness: 0.74, press: 0.62, holdUp: 0.36, dribble: 0.66, freedom: 0.64, decisionWindow: 0.62 },
          ST: { risk: 0.56, directness: 0.72, press: 0.58, holdUp: 0.72, dribble: 0.42, freedom: 0.54, decisionWindow: 0.64 },
        },
        multipliersByKey: {
          ST_2: { holdUp: 0.46, dribble: 0.64, freedom: 0.68, press: 0.7, directness: 0.76 },
        },
        teamControls: { lineHeight: 0.56, compactness: 0.46, width: 0.7, tempo: 0.72, restDefence: 2 },
        press: { height: 'mid', counterPressSecs: 2, intensity: 0.63 },
        transitions: { counterPressDuration: 2, collapseDepth: 0.42, forwardBias: 0.84, runnerCount: 3 },
      },
      {
        formation: '4-4-2',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'DEFEND',
          CB: 'DEFEND',
          RB: 'DEFEND',
          LW: 'SUPPORT',
          CM: 'SUPPORT',
          RW: 'SUPPORT',
          ST: 'SUPPORT',
        },
        dutiesByKey: {
          ST_2: 'ATTACK',
          CM_2: 'DEFEND',
        },
        multipliersByRole: {
          GK: { risk: 0.3, directness: 0.56, press: 0.16, holdUp: 0.32, dribble: 0.16, freedom: 0.2, decisionWindow: 0.58 },
          LB: { risk: 0.34, directness: 0.5, press: 0.56, holdUp: 0.4, dribble: 0.42, freedom: 0.36, decisionWindow: 0.54 },
          CB: { risk: 0.28, directness: 0.46, press: 0.54, holdUp: 0.42, dribble: 0.26, freedom: 0.28, decisionWindow: 0.54 },
          RB: { risk: 0.34, directness: 0.5, press: 0.56, holdUp: 0.4, dribble: 0.42, freedom: 0.36, decisionWindow: 0.54 },
          LW: { risk: 0.46, directness: 0.62, press: 0.62, holdUp: 0.38, dribble: 0.52, freedom: 0.46, decisionWindow: 0.56 },
          CM: { risk: 0.4, directness: 0.54, press: 0.6, holdUp: 0.52, dribble: 0.42, freedom: 0.4, decisionWindow: 0.54 },
          RW: { risk: 0.46, directness: 0.62, press: 0.62, holdUp: 0.38, dribble: 0.52, freedom: 0.46, decisionWindow: 0.56 },
          ST: { risk: 0.48, directness: 0.66, press: 0.58, holdUp: 0.68, dribble: 0.4, freedom: 0.48, decisionWindow: 0.6 },
        },
        multipliersByKey: {
          ST_2: { holdUp: 0.46, dribble: 0.58, freedom: 0.62, press: 0.66, directness: 0.72 },
        },
        teamControls: { lineHeight: 0.5, compactness: 0.52, width: 0.63, tempo: 0.55, restDefence: 3 },
        press: { height: 'mid', counterPressSecs: 2, intensity: 0.6 },
        transitions: { counterPressDuration: 2, collapseDepth: 0.5, forwardBias: 0.7, runnerCount: 2 },
      },
    ),
    buildPresetTactic(
      'Low Block Counter 4-5-1',
      {
        formation: '4-3-3',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'SUPPORT',
          CB: 'DEFEND',
          RB: 'SUPPORT',
          CM: 'SUPPORT',
          LW: 'ATTACK',
          ST: 'ATTACK',
          RW: 'ATTACK',
        },
        dutiesByKey: {
          CM_2: 'DEFEND',
        },
        multipliersByRole: {
          GK: { risk: 0.3, directness: 0.6, press: 0.16, holdUp: 0.3, dribble: 0.16, freedom: 0.2, decisionWindow: 0.6 },
          LB: { risk: 0.42, directness: 0.56, press: 0.48, holdUp: 0.42, dribble: 0.48, freedom: 0.48, decisionWindow: 0.54 },
          CB: { risk: 0.28, directness: 0.52, press: 0.44, holdUp: 0.42, dribble: 0.24, freedom: 0.28, decisionWindow: 0.54 },
          RB: { risk: 0.42, directness: 0.56, press: 0.48, holdUp: 0.42, dribble: 0.48, freedom: 0.48, decisionWindow: 0.54 },
          CM: { risk: 0.38, directness: 0.52, press: 0.48, holdUp: 0.55, dribble: 0.4, freedom: 0.42, decisionWindow: 0.52 },
          LW: { risk: 0.54, directness: 0.7, press: 0.52, holdUp: 0.36, dribble: 0.68, freedom: 0.62, decisionWindow: 0.6 },
          ST: { risk: 0.56, directness: 0.74, press: 0.5, holdUp: 0.6, dribble: 0.46, freedom: 0.58, decisionWindow: 0.62 },
          RW: { risk: 0.54, directness: 0.7, press: 0.52, holdUp: 0.36, dribble: 0.68, freedom: 0.62, decisionWindow: 0.6 },
        },
        multipliersByKey: {
          CM_2: { risk: 0.32, directness: 0.46, holdUp: 0.6, freedom: 0.34, press: 0.46 },
        },
        teamControls: { lineHeight: 0.42, compactness: 0.58, width: 0.6, tempo: 0.47, restDefence: 4 },
        press: { height: 'mid', counterPressSecs: 1, intensity: 0.45 },
        transitions: { counterPressDuration: 1, collapseDepth: 0.7, forwardBias: 0.78, runnerCount: 3 },
      },
      {
        formation: '4-5-1',
        dutiesByRole: {
          GK: 'DEFEND',
          LB: 'DEFEND',
          CB: 'DEFEND',
          RB: 'DEFEND',
          LM: 'DEFEND',
          CM: 'DEFEND',
          RM: 'DEFEND',
          ST: 'SUPPORT',
        },
        dutiesByKey: {
          CM_2: 'SUPPORT',
        },
        multipliersByRole: {
          GK: { risk: 0.28, directness: 0.58, press: 0.14, holdUp: 0.3, dribble: 0.14, freedom: 0.18, decisionWindow: 0.58 },
          LB: { risk: 0.28, directness: 0.38, press: 0.34, holdUp: 0.42, dribble: 0.3, freedom: 0.24, decisionWindow: 0.46 },
          CB: { risk: 0.24, directness: 0.36, press: 0.32, holdUp: 0.44, dribble: 0.2, freedom: 0.22, decisionWindow: 0.46 },
          RB: { risk: 0.28, directness: 0.38, press: 0.34, holdUp: 0.42, dribble: 0.3, freedom: 0.24, decisionWindow: 0.46 },
          LM: { risk: 0.34, directness: 0.46, press: 0.38, holdUp: 0.38, dribble: 0.42, freedom: 0.32, decisionWindow: 0.48 },
          CM: { risk: 0.32, directness: 0.42, press: 0.36, holdUp: 0.5, dribble: 0.32, freedom: 0.3, decisionWindow: 0.48 },
          RM: { risk: 0.34, directness: 0.46, press: 0.38, holdUp: 0.38, dribble: 0.42, freedom: 0.32, decisionWindow: 0.48 },
          ST: { risk: 0.44, directness: 0.74, press: 0.4, holdUp: 0.7, dribble: 0.44, freedom: 0.48, decisionWindow: 0.56 },
        },
        teamControls: { lineHeight: 0.26, compactness: 0.79, width: 0.42, tempo: 0.34, restDefence: 4 },
        press: { height: 'low', counterPressSecs: 1, intensity: 0.34 },
        transitions: { counterPressDuration: 1, collapseDepth: 0.84, forwardBias: 0.82, runnerCount: 2 },
      },
    ),
    buildPresetTactic(
      'Wingback Surge 3-5-2',
      {
        formation: '3-5-2',
        dutiesByRole: {
          GK: 'DEFEND',
          CB: 'DEFEND',
          LB: 'ATTACK',
          CDM: 'DEFEND',
          CM: 'SUPPORT',
          RB: 'ATTACK',
          ST: 'ATTACK',
        },
        dutiesByKey: {
          ST: 'SUPPORT',
          ST_2: 'ATTACK',
          CM_2: 'ATTACK',
        },
        multipliersByRole: {
          GK: { risk: 0.34, directness: 0.5, press: 0.18, holdUp: 0.34, dribble: 0.18, freedom: 0.2, decisionWindow: 0.55 },
          CB: { risk: 0.34, directness: 0.48, press: 0.56, holdUp: 0.45, dribble: 0.3, freedom: 0.34, decisionWindow: 0.52 },
          LB: { risk: 0.6, directness: 0.68, press: 0.64, holdUp: 0.42, dribble: 0.68, freedom: 0.72, decisionWindow: 0.6 },
          CDM: { risk: 0.4, directness: 0.46, press: 0.6, holdUp: 0.6, dribble: 0.4, freedom: 0.36, decisionWindow: 0.52 },
          CM: { risk: 0.5, directness: 0.56, press: 0.6, holdUp: 0.5, dribble: 0.5, freedom: 0.54, decisionWindow: 0.55 },
          RB: { risk: 0.6, directness: 0.68, press: 0.64, holdUp: 0.42, dribble: 0.68, freedom: 0.72, decisionWindow: 0.6 },
          ST: { risk: 0.56, directness: 0.64, press: 0.62, holdUp: 0.72, dribble: 0.42, freedom: 0.54, decisionWindow: 0.6 },
        },
        multipliersByKey: {
          ST_2: { holdUp: 0.46, dribble: 0.62, freedom: 0.68, press: 0.7, directness: 0.7 },
        },
        teamControls: { lineHeight: 0.6, compactness: 0.56, width: 0.73, tempo: 0.63, restDefence: 3 },
        press: { height: 'high', counterPressSecs: 3, intensity: 0.67 },
        transitions: { counterPressDuration: 3, collapseDepth: 0.46, forwardBias: 0.76, runnerCount: 3 },
      },
      {
        formation: '3-5-2',
        dutiesByRole: {
          GK: 'DEFEND',
          CB: 'DEFEND',
          LB: 'SUPPORT',
          CDM: 'DEFEND',
          CM: 'SUPPORT',
          RB: 'SUPPORT',
          ST: 'SUPPORT',
        },
        dutiesByKey: {
          ST_2: 'ATTACK',
        },
        multipliersByRole: {
          GK: { risk: 0.32, directness: 0.48, press: 0.16, holdUp: 0.34, dribble: 0.16, freedom: 0.2, decisionWindow: 0.54 },
          CB: { risk: 0.28, directness: 0.4, press: 0.56, holdUp: 0.44, dribble: 0.24, freedom: 0.28, decisionWindow: 0.5 },
          LB: { risk: 0.4, directness: 0.5, press: 0.6, holdUp: 0.4, dribble: 0.48, freedom: 0.42, decisionWindow: 0.52 },
          CDM: { risk: 0.34, directness: 0.4, press: 0.62, holdUp: 0.56, dribble: 0.34, freedom: 0.3, decisionWindow: 0.5 },
          CM: { risk: 0.42, directness: 0.48, press: 0.6, holdUp: 0.46, dribble: 0.44, freedom: 0.42, decisionWindow: 0.5 },
          RB: { risk: 0.4, directness: 0.5, press: 0.6, holdUp: 0.4, dribble: 0.48, freedom: 0.42, decisionWindow: 0.52 },
          ST: { risk: 0.5, directness: 0.6, press: 0.58, holdUp: 0.66, dribble: 0.4, freedom: 0.46, decisionWindow: 0.56 },
        },
        multipliersByKey: {
          ST_2: { holdUp: 0.42, dribble: 0.56, freedom: 0.6, press: 0.66, directness: 0.66 },
        },
        teamControls: { lineHeight: 0.47, compactness: 0.68, width: 0.55, tempo: 0.48, restDefence: 4 },
        press: { height: 'mid', counterPressSecs: 2, intensity: 0.58 },
        transitions: { counterPressDuration: 2, collapseDepth: 0.56, forwardBias: 0.64, runnerCount: 2 },
      },
    ),
  ];

  const map: Record<string, SavedTactic> = {};
  for (const tactic of presets) map[tactic.name] = tactic;
  return map;
})();

const BUILT_IN_TACTIC_NAMES = Object.keys(BUILT_IN_TACTICS).sort();

export function listBuiltInTactics(): string[] {
  return [...BUILT_IN_TACTIC_NAMES];
}

export function loadBuiltInTactic(name: string): SavedTactic | null {
  const tactic = BUILT_IN_TACTICS[name];
  return tactic ? cloneTactic(tactic) : null;
}

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
  const store = getStore();
  const customOnly = Object.keys(store).filter((name) => !(name in BUILT_IN_TACTICS)).sort();
  return [...BUILT_IN_TACTIC_NAMES, ...customOnly];
}

export function saveTactic(tactic: SavedTactic): void {
  const store = getStore();
  store[tactic.name] = tactic;
  setStore(store);
}

export function loadTactic(name: string): SavedTactic | null {
  const fromStore = getStore()[name];
  if (fromStore) return cloneTactic(fromStore);
  const fromBuiltIn = BUILT_IN_TACTICS[name];
  return fromBuiltIn ? cloneTactic(fromBuiltIn) : null;
}

export function deleteTactic(name: string): void {
  const store = getStore();
  delete store[name];
  setStore(store);
}

import { Vec2 } from '../simulation/math/vec2.ts';
import type { FormationId, Duty, Role, PlayerTacticalMultipliers } from '../simulation/types.ts';
import { FORMATION_TEMPLATES } from '../simulation/tactical/formation.ts';
import type { TacticalConfig } from '../simulation/engine.ts';
import type { TeamTier } from './teamGen.ts';
import { listBuiltInTactics, loadBuiltInTactic, type SavedTactic } from '../ui/tacticStore.ts';

const DEFAULT_MULT: PlayerTacticalMultipliers = {
  risk: 0.5,
  directness: 0.5,
  press: 0.5,
  holdUp: 0.5,
  dribble: 0.5,
  freedom: 0.5,
  decisionWindow: 0.5,
};

function canonicalRole(role: string): string {
  switch (role) {
    case 'LM': return 'LW';
    case 'RM': return 'RW';
    case 'LWB': return 'LB';
    case 'RWB': return 'RB';
    default: return role;
  }
}

function toRole(role: string): Role {
  const r = canonicalRole(role);
  switch (r) {
    case 'GK':
    case 'CB':
    case 'LB':
    case 'RB':
    case 'CDM':
    case 'CM':
    case 'CAM':
    case 'LW':
    case 'RW':
    case 'ST':
      return r;
    default:
      return 'CM';
  }
}

function toDuty(duty: string): Duty {
  if (duty === 'DEFEND' || duty === 'SUPPORT' || duty === 'ATTACK') return duty;
  return 'SUPPORT';
}

function roleKeysForRoles(roles: readonly string[]): string[] {
  const count: Record<string, number> = {};
  return roles.map((rawRole) => {
    const role = canonicalRole(rawRole);
    count[role] = (count[role] ?? 0) + 1;
    return count[role]! > 1 ? `${role}_${count[role]}` : role;
  });
}

function detectFormationId(positions: readonly { x: number; y: number }[]): FormationId | null {
  for (const [formationId, template] of Object.entries(FORMATION_TEMPLATES) as [FormationId, (typeof FORMATION_TEMPLATES)[FormationId]][]) {
    if (template.basePositions.length !== positions.length) continue;
    let matches = true;
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      const t = template.basePositions[i]!;
      if (Math.abs(p.x - t.x) > 0.01 || Math.abs(p.y - t.y) > 0.01) {
        matches = false;
        break;
      }
    }
    if (matches) return formationId;
  }
  return null;
}

function phaseToConfig(
  phase: SavedTactic['phases']['inPossession'],
  detectedFormation: FormationId | null,
): TacticalConfig {
  const roles = phase.roles.map((r) => toRole(r));
  const roleKeys = roleKeysForRoles(phase.roles);
  const multipliers = roleKeys.map((k) => ({
    ...DEFAULT_MULT,
    ...(phase.multipliers[k] ?? {}),
  }));
  const formationVec = phase.positions.map((p) => new Vec2(p.x, p.y));

  return {
    formation: detectedFormation ?? formationVec,
    roles,
    duties: phase.duties.map((d) => toDuty(d)),
    multipliers,
    teamControls: { ...phase.teamControls },
    press: { ...phase.press },
    transitions: { ...phase.transitions },
  };
}

export interface BuiltInTacticSystem {
  name: string;
  inPossession: TacticalConfig;
  outOfPossession: TacticalConfig;
  inPossessionFormation: FormationId;
  outOfPossessionFormation: FormationId;
}

export function loadBuiltInTacticSystem(name: string): BuiltInTacticSystem | null {
  const tactic = loadBuiltInTactic(name);
  if (!tactic) return null;

  const inPossFormation = detectFormationId(tactic.phases.inPossession.positions) ?? '4-4-2';
  const outOfPossFormation = detectFormationId(tactic.phases.outOfPossession.positions) ?? inPossFormation;

  return {
    name,
    inPossession: phaseToConfig(tactic.phases.inPossession, inPossFormation),
    outOfPossession: phaseToConfig(tactic.phases.outOfPossession, outOfPossFormation),
    inPossessionFormation: inPossFormation,
    outOfPossessionFormation: outOfPossFormation,
  };
}

function weightedChoice(
  options: readonly [string, number][],
  availableNames: readonly string[],
  rng: () => number,
): string | null {
  const availableSet = new Set(availableNames);
  const filtered = options.filter(([name]) => availableSet.has(name));
  if (filtered.length === 0) return null;
  const total = filtered.reduce((sum, [, w]) => sum + w, 0);
  let roll = rng() * total;
  for (const [name, weight] of filtered) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return filtered[filtered.length - 1]![0];
}

export function choosePreferredBuiltInTacticName(tier: TeamTier, rng: () => number): string {
  const available = listBuiltInTactics();
  const knownWeights: readonly [string, number][] =
    tier === 'strong'
      ? [
          ['Control Press 4-3-3', 30],
          ['Balanced 4-2-3-1', 28],
          ['Wingback Surge 3-5-2', 18],
          ['Vertical 4-4-2', 14],
          ['Low Block Counter 4-5-1', 10],
        ]
      : tier === 'weak'
        ? [
            ['Low Block Counter 4-5-1', 34],
            ['Vertical 4-4-2', 24],
            ['Balanced 4-2-3-1', 20],
            ['Control Press 4-3-3', 12],
            ['Wingback Surge 3-5-2', 10],
          ]
        : [
            ['Balanced 4-2-3-1', 28],
            ['Vertical 4-4-2', 22],
            ['Control Press 4-3-3', 20],
            ['Low Block Counter 4-5-1', 16],
            ['Wingback Surge 3-5-2', 14],
          ];

  const picked = weightedChoice(knownWeights, available, rng);
  if (picked) return picked;

  if (available.length === 0) return 'Balanced 4-2-3-1';
  return available[Math.floor(rng() * available.length)]!;
}

export function getDefaultBuiltInTacticName(): string {
  const available = listBuiltInTactics();
  if (available.includes('Balanced 4-2-3-1')) return 'Balanced 4-2-3-1';
  return available[0] ?? 'Balanced 4-2-3-1';
}

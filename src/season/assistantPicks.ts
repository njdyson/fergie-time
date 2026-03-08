import type { PlayerState, FormationId, Duty, Role } from '../simulation/types.ts';
import type { TeamTier } from './teamGen.ts';
import { FORMATION_TEMPLATES } from '../simulation/tactical/formation.ts';
import type { TacticalConfig } from '../simulation/engine.ts';

export interface AssistantLineup {
  starters: PlayerState[];
  bench: PlayerState[];
}

const ALL_FORMATIONS: readonly FormationId[] = ['4-4-2', '4-3-3', '4-5-1', '3-5-2', '4-2-3-1'] as const;

function canonicalRole(role: string): string {
  switch (role) {
    case 'LM': return 'LW';
    case 'RM': return 'RW';
    case 'LWB': return 'LB';
    case 'RWB': return 'RB';
    default: return role;
  }
}

function getFitness(player: PlayerState, fatigueMap?: ReadonlyMap<string, number>): number {
  const fatigue = fatigueMap?.get(player.id) ?? player.fatigue ?? 0;
  return Math.max(0, Math.min(1, 1 - fatigue));
}

function roleSimilarity(natural: string, target: string): number {
  if (natural === target) return 2.2;
  if ((natural === 'LB' && target === 'RB') || (natural === 'RB' && target === 'LB')) return 0.5;
  if ((natural === 'LW' && target === 'RW') || (natural === 'RW' && target === 'LW')) return 0.6;
  if ((natural === 'CM' && target === 'CDM') || (natural === 'CDM' && target === 'CM')) return 0.7;
  if ((natural === 'CM' && target === 'CAM') || (natural === 'CAM' && target === 'CM')) return 0.65;
  if ((natural === 'CAM' && target === 'ST') || (natural === 'ST' && target === 'CAM')) return 0.45;
  if ((natural === 'LW' && target === 'CAM') || (natural === 'RW' && target === 'CAM')) return 0.35;
  if ((natural === 'CDM' && target === 'CB') || (natural === 'CB' && target === 'CDM')) return 0.45;
  return 0;
}

function scoreForTargetRole(player: PlayerState, targetRoleRaw: string, fatigueMap?: ReadonlyMap<string, number>): number {
  const targetRole = canonicalRole(targetRoleRaw);
  const naturalRole = canonicalRole(player.role);
  const a = player.attributes;

  let score: number;
  switch (targetRole) {
    case 'GK':
      score = a.reflexes * 2.1 + a.handling * 2.0 + a.oneOnOnes * 1.7 + a.positioning * 1.4 + a.distribution * 0.9 + a.aerial * 0.7 + a.concentration * 0.8;
      break;
    case 'CB':
      score = a.tackling * 2.0 + a.positioning * 1.7 + a.strength * 1.4 + a.aerial * 1.4 + a.heading * 1.1 + a.passing * 0.4;
      break;
    case 'LB':
    case 'RB':
      score = a.tackling * 1.2 + a.positioning * 1.0 + a.pace * 1.3 + a.acceleration * 1.0 + a.stamina * 1.2 + a.crossing * 1.0 + a.passing * 0.7;
      break;
    case 'CDM':
      score = a.tackling * 1.6 + a.positioning * 1.4 + a.passing * 1.1 + a.stamina * 1.0 + a.strength * 0.9 + a.concentration * 0.9;
      break;
    case 'CM':
      score = a.passing * 1.45 + a.vision * 1.2 + a.stamina * 1.1 + a.positioning * 0.9 + a.tackling * 0.85 + a.dribbling * 0.75;
      break;
    case 'CAM':
      score = a.vision * 1.5 + a.passing * 1.35 + a.dribbling * 1.2 + a.finishing * 1.0 + a.shooting * 0.9 + a.agility * 0.8;
      break;
    case 'LW':
    case 'RW':
      score = a.pace * 1.35 + a.acceleration * 1.1 + a.dribbling * 1.35 + a.crossing * 1.0 + a.passing * 0.8 + a.finishing * 0.7;
      break;
    case 'ST':
      score = a.finishing * 1.8 + a.shooting * 1.6 + a.positioning * 1.1 + a.pace * 1.0 + a.heading * 0.9 + a.strength * 0.7;
      break;
    default:
      score = a.passing + a.shooting + a.tackling + a.pace;
      break;
  }

  const compatibility = roleSimilarity(naturalRole, targetRole);
  const fitnessFactor = 0.55 + 0.45 * getFitness(player, fatigueMap);
  return (score + compatibility) * fitnessFactor;
}

function overallBenchScore(player: PlayerState, fatigueMap?: ReadonlyMap<string, number>): number {
  const values = Object.values(player.attributes);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const natRole = canonicalRole(player.role);
  const roleBias = natRole === 'GK' ? 0.06 : 0.1;
  return (avg + roleBias) * (0.6 + 0.4 * getFitness(player, fatigueMap));
}

export function pickAssistantLineup(
  squad: readonly PlayerState[],
  formation: FormationId,
  fatigueMap?: ReadonlyMap<string, number>,
): AssistantLineup {
  const roles = FORMATION_TEMPLATES[formation].roles;
  const assigned = new Set<string>();
  const starters: PlayerState[] = [];

  for (const slotRole of roles) {
    let best: PlayerState | null = null;
    let bestScore = -Infinity;
    for (const player of squad) {
      if (assigned.has(player.id)) continue;
      const score = scoreForTargetRole(player, slotRole, fatigueMap);
      if (
        score > bestScore ||
        (score === bestScore && best && player.id < best.id)
      ) {
        best = player;
        bestScore = score;
      }
    }
    if (best) {
      starters.push(best);
      assigned.add(best.id);
    }
  }

  const remaining = squad.filter((p) => !assigned.has(p.id));
  const bench: PlayerState[] = [];

  const gkCandidates = remaining
    .filter((p) => canonicalRole(p.role) === 'GK')
    .sort((a, b) => overallBenchScore(b, fatigueMap) - overallBenchScore(a, fatigueMap));
  if (gkCandidates.length > 0 && bench.length < 7) {
    bench.push(gkCandidates[0]!);
  }

  const benchIds = new Set(bench.map((p) => p.id));
  const fieldCandidates = remaining
    .filter((p) => !benchIds.has(p.id))
    .sort((a, b) => {
      const diff = overallBenchScore(b, fatigueMap) - overallBenchScore(a, fatigueMap);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id);
    });

  for (const player of fieldCandidates) {
    if (bench.length >= 7) break;
    bench.push(player);
  }

  return { starters, bench };
}

export function getPreferredFormationForTier(tier: TeamTier, rng: () => number): FormationId {
  const roll = rng();
  if (tier === 'strong') {
    if (roll < 0.32) return '4-3-3';
    if (roll < 0.6) return '4-2-3-1';
    if (roll < 0.76) return '4-4-2';
    if (roll < 0.9) return '3-5-2';
    return '4-5-1';
  }
  if (tier === 'weak') {
    if (roll < 0.34) return '4-5-1';
    if (roll < 0.62) return '4-4-2';
    if (roll < 0.78) return '4-2-3-1';
    if (roll < 0.9) return '4-3-3';
    return '3-5-2';
  }
  // Mid-tier: balanced spread
  return ALL_FORMATIONS[Math.floor(roll * ALL_FORMATIONS.length)] ?? '4-4-2';
}

function normalizeRoleForEngine(role: string): Role {
  return canonicalRole(role) as Role;
}

function defaultDutyForRole(role: string): Duty {
  const canonical = canonicalRole(role);
  if (canonical === 'GK') return 'DEFEND';
  if (canonical === 'CB' || canonical === 'CDM') return 'DEFEND';
  if (canonical === 'ST') return 'ATTACK';
  return 'SUPPORT';
}

export function buildFormationTacticalConfig(formation: FormationId): TacticalConfig {
  const template = FORMATION_TEMPLATES[formation];
  return {
    formation,
    roles: template.roles.map((r) => normalizeRoleForEngine(r)),
    duties: template.roles.map((r) => defaultDutyForRole(r)),
  };
}

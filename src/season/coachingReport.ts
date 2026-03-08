/**
 * Coaching report email generation.
 *
 * After each training day (non-rest), generates a brief coaching report email
 * summarising the preset used, per-group drills, and standout improvers.
 *
 * Pure function — no side effects, no external state.
 */

import type { PlayerState } from '../simulation/types.ts';
import type { TrainingDayPlan } from './season.ts';
import { DRILL_LABELS, DRILL_ATTRIBUTE_MAP, ATTR_LABELS, SLOT_LABELS, INTENSITY_LABELS } from './training.ts';
import type { DrillType, TrainingDayPreset, TrainingGroup } from './training.ts';
import { getPlayerTrainingGroup } from './training.ts';
import type { PlayerAttributes } from '../simulation/types.ts';
import type { MessageCategory } from './inbox.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CoachingReportParams {
  readonly subject: string;
  readonly body: string;
  readonly from: string;
  readonly category: MessageCategory;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function attrToTitle(attr: string): string {
  return attr
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Core export
// ---------------------------------------------------------------------------

/**
 * Generate a coaching report email after a training day.
 * Returns null if the day was a rest day or the squad is empty.
 *
 * @param dayPlan          - The preset ID or 'rest' for the day that just completed
 * @param dayNumber        - Display day number (1-based, shown in subject)
 * @param squad            - The player team's squad AFTER training was applied
 * @param squadBefore      - The player team's squad BEFORE training was applied
 * @param preset           - The resolved TrainingDayPreset (if any)
 * @param groupOverrides   - Player training group overrides
 */
export function generateCoachingReport(
  dayPlan: TrainingDayPlan,
  dayNumber: number,
  squad: PlayerState[],
  squadBefore: PlayerState[],
  preset?: TrainingDayPreset | null,
  groupOverrides?: Map<string, TrainingGroup>,
): CoachingReportParams | null {
  if (dayPlan === 'rest') {
    return null;
  }

  if (squad.length === 0 || squadBefore.length === 0) {
    return null;
  }

  // Determine the drill label for the subject line
  const drillLabel = preset ? preset.name : (DRILL_LABELS[dayPlan as DrillType] ?? dayPlan);

  // Build per-slot summary if preset is available
  let groupSummary = '';
  if (preset) {
    const slotLines = preset.slots.map((slot, i) => {
      const gkLabel = slot.gk === 'rest' ? 'Rest' : (ATTR_LABELS[slot.gk as keyof PlayerAttributes] ?? slot.gk);
      const defLabel = slot.def === 'rest' ? 'Rest' : (ATTR_LABELS[slot.def as keyof PlayerAttributes] ?? slot.def);
      const atkLabel = slot.atk === 'rest' ? 'Rest' : (ATTR_LABELS[slot.atk as keyof PlayerAttributes] ?? slot.atk);
      return `${SLOT_LABELS[i]}: GK=${gkLabel}, DEF=${defLabel}, ATK=${atkLabel}`;
    });
    groupSummary = slotLines.join('\n');
  }

  // Compute per-player gains for this session
  interface PlayerGain {
    name: string;
    totalGain: number;
    improvedAttrs: string[];
  }

  const gains: PlayerGain[] = [];

  for (let i = 0; i < squad.length; i++) {
    const after = squad[i]!;
    const before = squadBefore[i];
    if (!before) continue;

    // Determine which attributes to check based on player's group
    const targetAttrs: Array<keyof PlayerState['attributes']> = [];
    if (preset) {
      const group = getPlayerTrainingGroup(before, groupOverrides);
      const groupKey: Record<string, 'gk' | 'def' | 'atk'> = { GK: 'gk', DEF: 'def', ATK: 'atk' };
      const key = groupKey[group]!;
      for (const slot of preset.slots) {
        const attr = slot[key];
        if (attr !== 'rest' && !targetAttrs.includes(attr as keyof PlayerState['attributes'])) {
          targetAttrs.push(attr as keyof PlayerState['attributes']);
        }
      }
      if (targetAttrs.length === 0) continue;
    } else {
      // Legacy: single drill for all
      const legacyAttrs = DRILL_ATTRIBUTE_MAP[dayPlan as DrillType] ?? [];
      targetAttrs.push(...legacyAttrs);
    }

    let totalGain = 0;
    const improvedAttrs: string[] = [];

    for (const attr of targetAttrs) {
      const gain = after.attributes[attr] - before.attributes[attr];
      if (gain > 0) {
        totalGain += gain;
        improvedAttrs.push(attrToTitle(attr));
      }
    }

    if (totalGain > 0 || improvedAttrs.length === 0) {
      gains.push({
        name: after.name ?? `Player ${i + 1}`,
        totalGain,
        improvedAttrs: improvedAttrs.length > 0 ? improvedAttrs : targetAttrs.map(attrToTitle),
      });
    }
  }

  // Sort by total gain descending (highest improvers first)
  gains.sort((a, b) => b.totalGain - a.totalGain);

  // Take top 3
  const top3 = gains.slice(0, 3);

  const subject = `Training Report: ${drillLabel} — Day ${dayNumber}`;

  const improverLines = top3
    .map(g => {
      const totalPct = (g.totalGain * 100).toFixed(1);
      const attrList = g.improvedAttrs.join(', ');
      return `• ${g.name} — ${attrList} (+${totalPct}%)`;
    })
    .join('\n');

  const bodyParts = [
    `Today's session: ${drillLabel}`,
  ];
  if (preset) {
    const intensityLabel = INTENSITY_LABELS[preset.intensity ?? 3] ?? 'Moderate';
    bodyParts.push(`Training intensity: ${intensityLabel} (${preset.intensity ?? 3}/5)`);
  }
  if (groupSummary) {
    bodyParts.push(groupSummary);
  }
  bodyParts.push(
    '',
    `Squad participation: ${squad.length} players`,
    '',
    'Standout improvers:',
    improverLines || '• No significant improvements recorded.',
  );

  return {
    subject,
    body: bodyParts.join('\n'),
    from: 'Coaching Staff',
    category: 'general',
  };
}

/**
 * Coaching report email generation.
 *
 * After each training day (non-rest), generates a brief coaching report email
 * summarising the drill run, squad participation count, and standout improvers.
 *
 * Pure function — no side effects, no external state.
 */

import type { PlayerState } from '../simulation/types.ts';
import type { TrainingDayPlan } from './season.ts';
import { DRILL_LABELS, DRILL_ATTRIBUTE_MAP } from './training.ts';
import type { DrillType } from './training.ts';
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

/**
 * Converts a camelCase attribute key to a Title Case display name.
 * e.g. 'pace' → 'Pace', 'stamina' → 'Stamina', 'set_pieces' → 'Set Pieces'
 */
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
 * @param dayPlan     - The drill or 'rest' for the day that just completed
 * @param dayNumber   - Display day number (e.g. 1-based, shown in subject)
 * @param squad       - The player team's squad AFTER training was applied
 * @param squadBefore - The player team's squad BEFORE training was applied
 */
export function generateCoachingReport(
  dayPlan: TrainingDayPlan,
  dayNumber: number,
  squad: PlayerState[],
  squadBefore: PlayerState[],
): CoachingReportParams | null {
  if (dayPlan === 'rest') {
    return null;
  }

  const drill = dayPlan as DrillType;
  const drillLabel = DRILL_LABELS[drill];
  const targetAttrs = DRILL_ATTRIBUTE_MAP[drill];

  // If no players, return null — nothing to report
  if (squad.length === 0 || squadBefore.length === 0) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Compute per-player gains for this session
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Build email content
  // ---------------------------------------------------------------------------

  const subject = `Training Report: ${drillLabel} — Day ${dayNumber}`;

  const improverLines = top3
    .map(g => {
      const totalPct = (g.totalGain * 100).toFixed(1);
      const attrList = g.improvedAttrs.join(', ');
      return `• ${g.name} — ${attrList} (+${totalPct}%)`;
    })
    .join('\n');

  const body = [
    `Today's session: ${drillLabel} drill`,
    '',
    `Squad participation: ${squad.length} players`,
    '',
    'Standout improvers:',
    improverLines || '• No significant improvements recorded.',
  ].join('\n');

  return {
    subject,
    body,
    from: 'Coaching Staff',
    category: 'general',
  };
}

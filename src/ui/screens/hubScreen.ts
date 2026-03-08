/**
 * Hub Screen — the season management home screen.
 * Shows team name, season number, league position, next fixture, and last result.
 *
 * Training days now use saved presets (per-group drills) instead of single drill selectors.
 */

import type { SeasonState, TrainingSchedule, TrainingDayPlan } from '../../season/season.ts';
import { isSeasonComplete } from '../../season/season.ts';
import { sortTable } from '../../season/leagueTable.ts';
import type { TrainingDayPreset } from '../../season/training.ts';
import { DEFAULT_PRESETS, ATTR_LABELS, SLOT_LABELS, INTENSITY_LABELS } from '../../season/training.ts';
import { getDaySchedule, isMatchDay } from '../../season/dayLoop.ts';
import type { DayDescriptor } from '../../season/dayLoop.ts';

// Color palette (dark theme)
const PANEL_BG = '#1e293b';
const TEXT = '#94a3b8';
const TEXT_BRIGHT = '#e2e8f0';
const ACCENT_BLUE = '#60a5fa';
const ACCENT_ORANGE = '#fb923c';
const GREEN = '#4ade80';

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0])!;
}

export class HubScreen {
  private container: HTMLElement;
  private kickoffCallbacks: Array<() => void> = [];
  private continueCallbacks: Array<() => void> = [];
  private scheduleChangeCallbacks: Array<(schedule: TrainingSchedule) => void> = [];
  private viewReportCallbacks: Array<(dayNumber: number) => void> = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.color = TEXT;
    this.container.style.fontFamily = "'Segoe UI', system-ui, sans-serif";
    this.container.style.boxSizing = 'border-box';
    this.container.style.scrollbarGutter = 'stable both-edges';
  }

  onKickoff(cb: () => void): void {
    this.kickoffCallbacks.push(cb);
  }

  onContinue(cb: () => void): void {
    this.continueCallbacks.push(cb);
  }

  onScheduleChange(cb: (schedule: TrainingSchedule) => void): void {
    this.scheduleChangeCallbacks.push(cb);
  }

  onViewReport(cb: (dayNumber: number) => void): void {
    this.viewReportCallbacks.push(cb);
  }

  private fireScheduleChange(schedule: TrainingSchedule): void {
    for (const cb of this.scheduleChangeCallbacks) cb(schedule);
  }

  update(state: SeasonState, playerTeamName: string): void {
    const sorted = sortTable(state.table);
    const positionIndex = sorted.findIndex(r => r.teamId === state.playerTeamId);
    const position = positionIndex + 1;

    // Find next fixture (first without result for player team)
    const nextFixture = state.fixtures.find(
      f => !f.result && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId)
    );

    // Current training schedule (defaults to all rest)
    const schedule: TrainingSchedule = state.trainingSchedule ?? {};
    const presets = state.trainingPresets ?? [...DEFAULT_PRESETS];

    // Find last result (most recent fixture with result for player team)
    const playedFixtures = state.fixtures
      .filter(f => f.result && (f.homeTeamId === state.playerTeamId || f.awayTeamId === state.playerTeamId))
      .sort((a, b) => b.matchday - a.matchday);
    const lastResult = playedFixtures[0];

    // Resolve team names
    const getTeamName = (id: string) => state.teams.find(t => t.id === id)?.name ?? id;

    // Build next fixture text
    let nextText = 'Season complete';
    let nextOpponentText = '';
    let isHome = false;
    if (nextFixture) {
      isHome = nextFixture.homeTeamId === state.playerTeamId;
      const opponentId = isHome ? nextFixture.awayTeamId : nextFixture.homeTeamId;
      const ha = isHome ? 'H' : 'A';
      nextOpponentText = `${getTeamName(opponentId)} (${ha})`;
      nextText = nextOpponentText;
    }

    // Build last result text
    let lastText = 'No matches played';
    if (lastResult && lastResult.result) {
      const isLastHome = lastResult.homeTeamId === state.playerTeamId;
      const opponentId = isLastHome ? lastResult.awayTeamId : lastResult.homeTeamId;
      const playerGoals = isLastHome ? lastResult.result.homeGoals : lastResult.result.awayGoals;
      const opponentGoals = isLastHome ? lastResult.result.awayGoals : lastResult.result.homeGoals;
      lastText = `${getTeamName(opponentId)} ${playerGoals}-${opponentGoals}`;
    }

    // Stats for the record bar
    const record = sorted.find(r => r.teamId === state.playerTeamId);
    const wins = record?.won ?? 0;
    const draws = record?.drawn ?? 0;
    const losses = record?.lost ?? 0;
    const gf = record?.goalsFor ?? 0;
    const ga = record?.goalsAgainst ?? 0;
    const pts = record?.points ?? 0;
    const played = record?.played ?? 0;

    // Result badge for last match
    let resultBadge = '';
    if (lastResult?.result) {
      const isLastHome = lastResult.homeTeamId === state.playerTeamId;
      const pg = isLastHome ? lastResult.result.homeGoals : lastResult.result.awayGoals;
      const og = isLastHome ? lastResult.result.awayGoals : lastResult.result.homeGoals;
      if (pg > og) resultBadge = `<span style="background:#166534; color:${GREEN}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">W</span>`;
      else if (pg < og) resultBadge = `<span style="background:#7f1d1d; color:#f87171; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">L</span>`;
      else resultBadge = `<span style="background:#1e3a5f; color:${ACCENT_BLUE}; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:bold; margin-left:8px;">D</span>`;
    }

    const cardStyle = `background: linear-gradient(135deg, ${PANEL_BG} 0%, #151d2e 100%); border-radius: 12px; padding: 20px 24px; border: 1px solid rgba(255,255,255,0.05); box-shadow: 0 4px 16px rgba(0,0,0,0.3);`;
    const labelStyle = `color: ${TEXT}; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 10px; font-weight: 600;`;

    // Build day schedule card (only when a next fixture exists)
    let scheduleCardHtml = '';
    if (nextFixture) {
      const dayDescriptors = getDaySchedule(state);
      const onMatchDay = isMatchDay(state);

      // Header: count days remaining (current + future training days only)
      const daysRemaining = dayDescriptors.filter(
        d => (d.status === 'current' || d.status === 'future') && d.type === 'training'
      ).length;
      const headerText = onMatchDay
        ? `Schedule &mdash; Match Day vs ${nextOpponentText}`
        : `Schedule &mdash; ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} until ${nextOpponentText}`;

      let rowsHtml = '';
      for (const day of dayDescriptors) {
        rowsHtml += this.buildDayRow(day, schedule, presets);
      }

      scheduleCardHtml = `
        <div style="${cardStyle}">
          <div style="${labelStyle}">${headerText}</div>
          ${rowsHtml}
        </div>`;
    }

    // Button: Continue or Kick Off
    let actionButtonHtml = '';
    if (!isSeasonComplete(state)) {
      if (isMatchDay(state)) {
        actionButtonHtml = `<button id="hub-kickoff-btn" class="hub-kickoff" style="display:block; width:100%; margin-top:4px; padding:16px 32px; background: linear-gradient(135deg, #166534 0%, #14532d 100%); color:#bbf7d0; border:2px solid #22c55e; border-radius:12px; font:bold 18px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.1em; box-shadow: 0 4px 20px rgba(34,197,94,0.2); transition: transform 0.1s, box-shadow 0.1s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 24px rgba(34,197,94,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(34,197,94,0.2)'">Kick Off</button>`;
      } else {
        actionButtonHtml = `<button id="hub-continue-btn" style="display:block; width:100%; margin-top:4px; padding:16px 32px; background: linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); color:#bfdbfe; border:2px solid #60a5fa; border-radius:12px; font:bold 18px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.1em; box-shadow: 0 4px 20px rgba(96,165,250,0.2); transition: transform 0.1s, box-shadow 0.1s;" onmouseover="this.style.transform='translateY(-1px)';this.style.boxShadow='0 6px 24px rgba(96,165,250,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 20px rgba(96,165,250,0.2)'">Continue</button>`;
      }
    } else {
      actionButtonHtml = `<div style="${cardStyle} text-align: center;"><div style="color: ${ACCENT_ORANGE}; font-size: 20px; font-weight: bold;">Season Complete</div></div>`;
    }

    this.container.innerHTML = `
      <div data-hub-shell="true" style="width: min(100%, 1040px); margin: 0 auto; padding: 0 8px 24px;">
        <!-- Team header -->
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: ${TEXT_BRIGHT}; font-size: 32px; margin: 0 0 6px 0; font-weight: 800; letter-spacing: -0.5px;">${playerTeamName}</h1>
          <div style="color: ${ACCENT_BLUE}; font-size: 14px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase;">Season ${state.seasonNumber} &bull; Matchday ${state.currentMatchday}</div>
        </div>

        <div style="display: grid; gap: 14px;">
          <!-- Position card (prominent) -->
          <div style="${cardStyle} display: flex; align-items: center; justify-content: space-between;">
            <div>
              <div style="${labelStyle}">League Position</div>
              <div style="color: ${ACCENT_ORANGE}; font-size: 42px; font-weight: 900; line-height: 1;">${ordinalSuffix(position)}</div>
            </div>
            <div style="text-align: right;">
              <div style="color: ${TEXT_BRIGHT}; font-size: 28px; font-weight: 800;">${pts} <span style="color: ${TEXT}; font-size: 13px; font-weight: 600;">PTS</span></div>
              <div style="color: ${TEXT}; font-size: 12px; margin-top: 4px;">P${played} &middot; W${wins} D${draws} L${losses} &middot; ${gf}:${ga}</div>
            </div>
          </div>

          <!-- Two-column row -->
          <div class="hub-two-col" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
            <div style="${cardStyle}">
              <div style="${labelStyle}">Next Fixture</div>
              <div style="color: ${TEXT_BRIGHT}; font-size: 17px; font-weight: 600;">${nextText}</div>
              ${nextFixture ? `<div style="color: ${TEXT}; font-size: 11px; margin-top: 6px;">Matchday ${nextFixture.matchday}</div>` : ''}
            </div>

            <div style="${cardStyle}">
              <div style="${labelStyle}">Last Result</div>
              <div style="color: ${TEXT_BRIGHT}; font-size: 17px; font-weight: 600;">${lastText}${resultBadge}</div>
              ${lastResult ? `<div style="color: ${TEXT}; font-size: 11px; margin-top: 6px;">Matchday ${lastResult.matchday}</div>` : ''}
            </div>
          </div>

          <!-- Day Schedule card -->
          ${scheduleCardHtml}

          <!-- Action button: Continue or Kick Off -->
          ${actionButtonHtml}
        </div>
      </div>
    `;

    // Wire action button
    this.container.querySelector('#hub-kickoff-btn')?.addEventListener('click', () => {
      for (const cb of this.kickoffCallbacks) cb();
    });
    this.container.querySelector('#hub-continue-btn')?.addEventListener('click', () => {
      for (const cb of this.continueCallbacks) cb();
    });

    // Wire preset selectors for editable days
    if (nextFixture) {
      const readAndFireSchedule = () => {
        const dayDescriptors = getDaySchedule(state);
        const updatedSchedule: TrainingSchedule = {};

        for (const day of dayDescriptors) {
          if (day.type !== 'training') continue;

          if (day.status === 'past') {
            updatedSchedule[day.dayIndex] = schedule[day.dayIndex] ?? 'rest';
          } else {
            const presetSelect = this.container.querySelector(`#train-preset-${day.dayIndex}`) as HTMLSelectElement | null;
            updatedSchedule[day.dayIndex] = (presetSelect?.value ?? 'rest') as TrainingDayPlan;
          }
        }
        this.fireScheduleChange(updatedSchedule);
      };

      const dayDescriptors = getDaySchedule(state);
      for (const day of dayDescriptors) {
        if (day.type !== 'training' || day.status === 'past') continue;
        const presetSelect = this.container.querySelector(`#train-preset-${day.dayIndex}`) as HTMLSelectElement | null;
        if (presetSelect) {
          presetSelect.addEventListener('change', () => readAndFireSchedule());
        }
      }
    }

    // Wire "View Report" links on past training days
    for (const link of this.container.querySelectorAll('[data-view-report]')) {
      const dayNumber = parseInt((link as HTMLElement).dataset.viewReport!, 10);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        for (const cb of this.viewReportCallbacks) cb(dayNumber);
      });
    }
  }

  /** Build HTML for a single day row in the schedule list. */
  private buildDayRow(day: DayDescriptor, schedule: TrainingSchedule, presets: TrainingDayPreset[]): string {
    // Style based on status
    let rowBg: string;
    let rowBorder: string;
    let labelColor: string;

    if (day.status === 'past') {
      rowBg = '#0f172a';
      rowBorder = 'border-bottom: 1px solid rgba(255,255,255,0.03);';
      labelColor = '#475569';
    } else if (day.status === 'current') {
      rowBg = '#1e3a5f';
      rowBorder = 'border-left: 3px solid #60a5fa; border-bottom: 1px solid rgba(255,255,255,0.05);';
      labelColor = TEXT_BRIGHT;
    } else {
      // future
      rowBg = PANEL_BG;
      rowBorder = 'border-bottom: 1px solid rgba(255,255,255,0.05);';
      labelColor = TEXT;
    }

    const rowStyle = `display:flex; align-items:center; gap:10px; padding:10px 12px; background:${rowBg}; border-radius:6px; margin-bottom:8px; ${rowBorder}`;

    if (day.type === 'match') {
      const matchLabel = day.status === 'past' ? 'Played' : (day.status === 'current' ? 'Ready to Kick Off' : 'Upcoming');
      const matchColor = day.status === 'current' ? GREEN : labelColor;
      return `
        <div style="${rowStyle} min-height:60px;">
          <span style="color:${labelColor}; font-size:13px; font-weight:700; width:70px; flex-shrink:0;">${day.label}</span>
          <span style="color:${matchColor}; font-size:12px; font-style:italic;">${matchLabel}</span>
        </div>`;
    }

    // Training day row
    const dayPlan: TrainingDayPlan = schedule[day.dayIndex] ?? 'rest';

    const trainRowStyle = `${rowStyle} min-height:60px;`;

    if (day.status === 'past') {
      // Locked display — show what was scheduled + view report link for non-rest days
      const preset = presets.find(p => p.id === dayPlan);
      const displayLabel = dayPlan === 'rest' ? 'Rest' : (preset?.name ?? dayPlan);
      const doneColor = '#475569';
      const reportLink = dayPlan !== 'rest'
        ? `<a href="#" data-view-report="${day.dayIndex + 1}" style="color:#60a5fa; font-size:11px; text-decoration:none; white-space:nowrap; cursor:pointer;">View Report</a>`
        : `<span style="color:#374151; font-size:11px;">Done</span>`;
      return `
        <div style="${trainRowStyle}">
          <span style="color:${doneColor}; font-size:12px; width:70px; flex-shrink:0;">${day.label}</span>
          <span style="color:${doneColor}; font-size:12px; flex:1;">${displayLabel}</span>
          ${reportLink}
        </div>`;
    }

    // Current or future: preset dropdown
    const presetOptions = presets.map(p => {
      const drillSummary = this.presetSummary(p);
      const selected = p.id === dayPlan ? ' selected' : '';
      return `<option value="${p.id}"${selected}>${p.name} (${drillSummary})</option>`;
    }).join('');

    return `
      <div style="${trainRowStyle}">
        <span style="color:${labelColor}; font-size:12px; width:70px; flex-shrink:0;">${day.label}</span>
        <select id="train-preset-${day.dayIndex}" data-day="${day.dayIndex}"
          style="flex:1; background:#0f172a; border:1px solid #334155; border-radius:6px; color:${TEXT_BRIGHT}; font:12px/1 'Segoe UI',system-ui,sans-serif; padding:5px 8px; cursor:pointer;"
        >
          <option value="rest"${dayPlan === 'rest' ? ' selected' : ''}>Rest Day</option>
          ${presetOptions}
        </select>
      </div>`;
  }

  private presetSummary(p: TrainingDayPreset): string {
    const intensityLabel = INTENSITY_LABELS[p.intensity ?? 3] ?? 'Moderate';
    const slotPart = p.slots.map((slot, i) => {
      const gk = slot.gk === 'rest' ? 'Rest' : (ATTR_LABELS[slot.gk as keyof import('../../simulation/types.ts').PlayerAttributes] ?? slot.gk);
      const def = slot.def === 'rest' ? 'Rest' : (ATTR_LABELS[slot.def as keyof import('../../simulation/types.ts').PlayerAttributes] ?? slot.def);
      const atk = slot.atk === 'rest' ? 'Rest' : (ATTR_LABELS[slot.atk as keyof import('../../simulation/types.ts').PlayerAttributes] ?? slot.atk);
      return `${SLOT_LABELS[i]}: ${gk}/${def}/${atk}`;
    }).join(' | ');
    return `${intensityLabel} | ${slotPart}`;
  }

  getElement(): HTMLElement {
    return this.container;
  }
}

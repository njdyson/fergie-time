import type { PlayerLogStats } from '../simulation/match/gameLog.ts';
import type { PlayerState, TeamId } from '../simulation/types.ts';

/**
 * Full-time player performance overlay — shows a per-player stats grid
 * over the pitch when the match ends.
 */

let overlayEl: HTMLElement | null = null;
let currentOnContinue: (() => void) | undefined;

function getOrCreateOverlay(): HTMLElement {
  if (overlayEl) return overlayEl;

  overlayEl = document.createElement('div');
  overlayEl.id = 'fulltime-overlay';
  overlayEl.innerHTML = '';

  // Close on click outside the tables
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      hide();
      currentOnContinue?.();
    }
  });

  return overlayEl;
}

function buildTeamTable(
  teamId: TeamId,
  players: readonly PlayerState[],
  statsMap: Map<string, PlayerLogStats>,
): string {
  const teamLabel = teamId === 'home' ? 'Home' : 'Away';
  const teamPlayers = players.filter(p => p.teamId === teamId);

  let rows = '';
  for (const p of teamPlayers) {
    const s = statsMap.get(p.id);
    const name = p.name ? p.name.split(' ').pop() : p.id;
    const shirtNum = p.id.split('-')[1];
    const passes = s?.passes ?? 0;
    const passComp = s?.passesCompleted ?? 0;
    const shots = s?.shots ?? 0;
    const sot = s?.shotsOnTarget ?? 0;
    const goals = s?.goals ?? 0;
    const assists = s?.assists ?? 0;
    const tklWon = s?.tacklesWon ?? 0;
    const tklAtt = s?.tacklesAttempted ?? 0;

    // Highlight goals/assists
    const goalCls = goals > 0 ? ' ft-highlight-goal' : '';
    const assistCls = assists > 0 ? ' ft-highlight-assist' : '';

    rows += `<tr>
      <td class="ft-num">${shirtNum}</td>
      <td class="ft-name">${name}</td>
      <td class="ft-role">${p.role}</td>
      <td>${passes}</td>
      <td>${passComp}</td>
      <td>${shots}</td>
      <td>${sot}</td>
      <td class="${goalCls}">${goals}</td>
      <td class="${assistCls}">${assists}</td>
      <td>${tklAtt}</td>
      <td>${tklWon}</td>
    </tr>`;
  }

  return `
    <div class="ft-team-block ft-team-${teamId}">
      <div class="ft-team-header">${teamLabel}</div>
      <table class="ft-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Pos</th>
            <th>PAS</th>
            <th>CMP</th>
            <th>SHO</th>
            <th>SOT</th>
            <th>GOL</th>
            <th>AST</th>
            <th>TKL</th>
            <th>WON</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export function show(
  container: HTMLElement,
  score: readonly [number, number],
  players: readonly PlayerState[],
  statsMap: Map<string, PlayerLogStats>,
  onContinue?: () => void,
): void {
  currentOnContinue = onContinue;
  const overlay = getOrCreateOverlay();

  const homeTable = buildTeamTable('home', players, statsMap);
  const awayTable = buildTeamTable('away', players, statsMap);

  overlay.innerHTML = `
    <div class="ft-content">
      <div class="ft-header">
        <div class="ft-title">FULL TIME</div>
        <div class="ft-score">${score[0]} - ${score[1]}</div>
      </div>
      <div class="ft-tables">
        ${homeTable}
        ${awayTable}
      </div>
      <button id="ft-continue-btn" style="display:block; margin:16px auto 0; padding:10px 32px; background:#60a5fa; color:#0f172a; border:none; border-radius:4px; font:bold 13px/1 monospace; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em;">Continue</button>
    </div>`;

  // Wire the Continue button
  overlay.querySelector('#ft-continue-btn')?.addEventListener('click', () => {
    hide();
    onContinue?.();
  });

  if (!overlay.parentElement) {
    container.appendChild(overlay);
  }
  overlay.style.display = 'flex';
}

export function hide(): void {
  if (overlayEl) overlayEl.style.display = 'none';
}

export function isVisible(): boolean {
  return overlayEl?.style.display === 'flex';
}

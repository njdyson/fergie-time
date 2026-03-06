import { register, login, loadGame, listGames, deleteGame } from '../../api/client.ts';

/**
 * Login / registration screen.
 *
 * Two tabs: "New Game" (register) and "Continue" (pick from list + login).
 * Calls back with team name, whether it's a new game, and optional
 * serialised game state for continue flow.
 */
export class LoginScreen {
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  show(onAuth: (teamName: string, isNewGame: boolean, gameState?: string) => void): void {
    this.container.style.display = 'flex';
    this.container.innerHTML = '';
    this.container.style.cssText =
      'display:flex; justify-content:center; align-items:center; flex:1; overflow:auto; background: linear-gradient(rgba(15,23,42,0.55), rgba(15,23,42,0.55)), url("/stadium.jpeg") center/cover no-repeat #0f172a;';

    // Outer card
    const card = document.createElement('div');
    card.style.cssText =
      'background:rgba(15,23,42,0.92); border-radius:12px; padding:40px 36px 32px; width:360px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.5); backdrop-filter:blur(8px);';

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Fergie Time';
    title.style.cssText =
      "color:#f59e0b; font:bold 32px/1.1 'Segoe UI',system-ui,sans-serif; text-align:center; margin:0 0 28px;";
    card.appendChild(title);

    // Tab buttons
    const tabRow = document.createElement('div');
    tabRow.style.cssText = 'display:flex; gap:0; margin-bottom:24px; border-radius:6px; overflow:hidden; border:1px solid #334155;';

    const tabNew = this.makeTab('New Game', true);
    const tabContinue = this.makeTab('Continue', false);
    tabRow.appendChild(tabNew);
    tabRow.appendChild(tabContinue);
    card.appendChild(tabRow);

    // Form areas (one for new game, one for continue)
    const newGameArea = document.createElement('div');
    const continueArea = document.createElement('div');
    continueArea.style.display = 'none';

    // --- New Game form ---
    const teamInput = this.makeInput('Team name');
    const passInput = this.makeInput('Password', true);
    const newErrorMsg = this.makeError();
    const createBtn = this.makeButton('Create');

    newGameArea.appendChild(teamInput);
    newGameArea.appendChild(passInput);
    newGameArea.appendChild(newErrorMsg);
    newGameArea.appendChild(createBtn);

    // --- Continue form ---
    const gameList = document.createElement('div');
    gameList.style.cssText = 'max-height:200px; overflow-y:auto; margin-bottom:12px;';

    const continueErrorMsg = this.makeError();

    // Password row (hidden until a game is selected)
    const passwordRow = document.createElement('div');
    passwordRow.style.cssText = 'display:none;';

    const selectedLabel = document.createElement('div');
    selectedLabel.style.cssText =
      "color:#e2e8f0; font:13px/1.4 'Segoe UI',system-ui,sans-serif; margin-bottom:8px; display:flex; align-items:center; gap:8px;";

    const continuePassInput = this.makeInput('Password', true);
    const continueBtn = this.makeButton('Continue');

    passwordRow.appendChild(selectedLabel);
    passwordRow.appendChild(continuePassInput);
    passwordRow.appendChild(continueErrorMsg);
    passwordRow.appendChild(continueBtn);

    continueArea.appendChild(gameList);
    continueArea.appendChild(passwordRow);

    card.appendChild(newGameArea);
    card.appendChild(continueArea);
    this.container.appendChild(card);

    // State
    let selectedTeam: string | null = null;

    const setActiveTab = (newGame: boolean) => {
      tabNew.style.background = newGame ? '#f59e0b' : '#0f172a';
      tabNew.style.color = newGame ? '#0a0a0a' : '#94a3b8';
      tabContinue.style.background = newGame ? '#0f172a' : '#f59e0b';
      tabContinue.style.color = newGame ? '#94a3b8' : '#0a0a0a';
      newGameArea.style.display = newGame ? '' : 'none';
      continueArea.style.display = newGame ? 'none' : '';
      if (!newGame) refreshGameList();
    };

    tabNew.addEventListener('click', () => setActiveTab(true));
    tabContinue.addEventListener('click', () => setActiveTab(false));

    // Game list rendering
    const refreshGameList = async () => {
      gameList.innerHTML = '';
      passwordRow.style.display = 'none';
      selectedTeam = null;
      continueErrorMsg.textContent = '';

      try {
        const { games } = await listGames();
        if (games.length === 0) {
          const empty = document.createElement('div');
          empty.textContent = 'No saved games';
          empty.style.cssText =
            "color:#64748b; font:14px/1.4 'Segoe UI',system-ui,sans-serif; text-align:center; padding:24px 0;";
          gameList.appendChild(empty);
          return;
        }

        for (const game of games) {
          const row = document.createElement('div');
          row.style.cssText =
            "display:flex; align-items:center; padding:10px 12px; margin-bottom:4px; background:#0f172a; border:1px solid #334155; border-radius:6px; cursor:pointer; transition:border-color .15s;";

          row.addEventListener('mouseenter', () => { row.style.borderColor = '#f59e0b'; });
          row.addEventListener('mouseleave', () => {
            row.style.borderColor = selectedTeam === game.teamName ? '#f59e0b' : '#334155';
          });

          const info = document.createElement('div');
          info.style.cssText = 'flex:1; min-width:0;';

          const name = document.createElement('div');
          name.textContent = game.teamName;
          name.style.cssText =
            "color:#e2e8f0; font:bold 14px/1.3 'Segoe UI',system-ui,sans-serif; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

          const date = document.createElement('div');
          const d = new Date(game.updatedAt + 'Z');
          date.textContent = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
          date.style.cssText =
            "color:#64748b; font:11px/1.3 'Segoe UI',system-ui,sans-serif;";

          info.appendChild(name);
          info.appendChild(date);

          const delBtn = document.createElement('button');
          delBtn.textContent = '\u00D7';
          delBtn.title = 'Delete save';
          delBtn.style.cssText =
            "background:none; border:none; color:#64748b; font:bold 20px/1 sans-serif; cursor:pointer; padding:0 0 0 8px; transition:color .15s; flex-shrink:0;";
          delBtn.addEventListener('mouseenter', () => { delBtn.style.color = '#ef4444'; });
          delBtn.addEventListener('mouseleave', () => { delBtn.style.color = '#64748b'; });

          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!confirm(`Delete "${game.teamName}"? This cannot be undone.`)) return;

            // Need to authenticate first to delete
            const pwd = prompt(`Enter password for "${game.teamName}" to confirm deletion:`);
            if (!pwd) return;

            try {
              const loginResult = await login(game.teamName, pwd);
              if (!loginResult.success) {
                alert(loginResult.error ?? 'Wrong password');
                return;
              }
              await deleteGame();
              refreshGameList();
            } catch {
              alert('Failed to delete game');
            }
          });

          row.appendChild(info);
          row.appendChild(delBtn);

          row.addEventListener('click', () => {
            selectedTeam = game.teamName;
            selectedLabel.textContent = game.teamName;
            passwordRow.style.display = '';
            continuePassInput.value = '';
            continueErrorMsg.textContent = '';
            continuePassInput.focus();

            // Highlight selected row
            for (const child of gameList.children) {
              (child as HTMLElement).style.borderColor = '#334155';
            }
            row.style.borderColor = '#f59e0b';
          });

          gameList.appendChild(row);
        }
      } catch {
        const err = document.createElement('div');
        err.textContent = 'Failed to load saved games';
        err.style.cssText =
          "color:#ef4444; font:13px/1.4 'Segoe UI',system-ui,sans-serif; text-align:center; padding:16px 0;";
        gameList.appendChild(err);
      }
    };

    // --- Submit handlers ---

    const submitNewGame = async () => {
      const teamName = teamInput.value.trim();
      const password = passInput.value;
      newErrorMsg.textContent = '';

      if (!teamName || !password) {
        newErrorMsg.textContent = 'Please fill in both fields.';
        return;
      }

      createBtn.disabled = true;
      createBtn.style.opacity = '0.6';

      try {
        const result = await register(teamName, password);
        if (result.success) {
          onAuth(teamName, true);
        } else {
          newErrorMsg.textContent = result.error ?? 'Registration failed';
        }
      } catch {
        newErrorMsg.textContent = 'Network error — is the server running?';
      } finally {
        createBtn.disabled = false;
        createBtn.style.opacity = '1';
      }
    };

    const submitContinue = async () => {
      if (!selectedTeam) return;
      const password = continuePassInput.value;
      continueErrorMsg.textContent = '';

      if (!password) {
        continueErrorMsg.textContent = 'Please enter your password.';
        return;
      }

      continueBtn.disabled = true;
      continueBtn.style.opacity = '0.6';

      try {
        const result = await login(selectedTeam, password);
        if (result.success) {
          try {
            const loaded = await loadGame();
            if (loaded.hasState && loaded.gameState) {
              onAuth(selectedTeam, false, loaded.gameState);
            } else {
              onAuth(selectedTeam, true);
            }
          } catch {
            continueErrorMsg.textContent = 'Failed to load saved game';
          }
        } else {
          continueErrorMsg.textContent = result.error ?? 'Login failed';
        }
      } catch {
        continueErrorMsg.textContent = 'Network error — is the server running?';
      } finally {
        continueBtn.disabled = false;
        continueBtn.style.opacity = '1';
      }
    };

    createBtn.addEventListener('click', submitNewGame);
    passInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitNewGame();
    });

    continueBtn.addEventListener('click', submitContinue);
    continuePassInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitContinue();
    });
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  // --- Helpers ---

  private makeTab(label: string, active: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `flex:1; padding:10px; border:none; font:bold 13px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; transition:background .15s;`;
    btn.style.background = active ? '#f59e0b' : '#0f172a';
    btn.style.color = active ? '#0a0a0a' : '#94a3b8';
    return btn;
  }

  private makeInput(placeholder: string, isPassword = false): HTMLInputElement {
    const input = document.createElement('input');
    input.type = isPassword ? 'password' : 'text';
    input.placeholder = placeholder;
    input.style.cssText =
      "width:100%; padding:10px 12px; margin-bottom:12px; background:#0f172a; border:1px solid #334155; border-radius:4px; color:#e2e8f0; font:14px/1.4 'Segoe UI',system-ui,sans-serif; outline:none; box-sizing:border-box;";
    input.addEventListener('focus', () => { input.style.borderColor = '#f59e0b'; });
    input.addEventListener('blur', () => { input.style.borderColor = '#334155'; });
    return input;
  }

  private makeButton(label: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText =
      "width:100%; padding:12px; background:#f59e0b; color:#0a0a0a; border:none; border-radius:6px; font:bold 14px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em;";
    return btn;
  }

  private makeError(): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText =
      "color:#ef4444; font:13px/1.4 'Segoe UI',system-ui,sans-serif; min-height:20px; margin-bottom:12px; text-align:center;";
    return el;
  }
}

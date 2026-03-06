import { register, login, loadGame } from '../../api/client.ts';

/**
 * Login / registration screen.
 *
 * Two tabs: "New Game" (register) and "Continue" (login + load).
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
      'display:flex; justify-content:center; align-items:center; flex:1; overflow:auto; background:#0f172a;';

    // Outer card
    const card = document.createElement('div');
    card.style.cssText =
      'background:#1e293b; border-radius:12px; padding:40px 36px 32px; width:360px; max-width:90vw; box-shadow:0 8px 32px rgba(0,0,0,0.5);';

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

    // Form area
    const formArea = document.createElement('div');

    // Inputs
    const teamInput = this.makeInput('Team name');
    const passInput = this.makeInput('Password', true);
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = "color:#ef4444; font:13px/1.4 'Segoe UI',system-ui,sans-serif; min-height:20px; margin-bottom:12px; text-align:center;";

    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Create';
    submitBtn.style.cssText =
      "width:100%; padding:12px; background:#f59e0b; color:#0a0a0a; border:none; border-radius:6px; font:bold 14px/1 'Segoe UI',system-ui,sans-serif; cursor:pointer; text-transform:uppercase; letter-spacing:0.05em;";

    formArea.appendChild(teamInput);
    formArea.appendChild(passInput);
    formArea.appendChild(errorMsg);
    formArea.appendChild(submitBtn);
    card.appendChild(formArea);
    this.container.appendChild(card);

    // State
    let isNewGame = true;

    const setActiveTab = (newGame: boolean) => {
      isNewGame = newGame;
      tabNew.style.background = newGame ? '#f59e0b' : '#0f172a';
      tabNew.style.color = newGame ? '#0a0a0a' : '#94a3b8';
      tabContinue.style.background = newGame ? '#0f172a' : '#f59e0b';
      tabContinue.style.color = newGame ? '#94a3b8' : '#0a0a0a';
      submitBtn.textContent = newGame ? 'Create' : 'Continue';
      errorMsg.textContent = '';
    };

    tabNew.addEventListener('click', () => setActiveTab(true));
    tabContinue.addEventListener('click', () => setActiveTab(false));

    // Submit handler
    const submit = async () => {
      const teamName = (teamInput as HTMLInputElement).value.trim();
      const password = (passInput as HTMLInputElement).value;
      errorMsg.textContent = '';

      if (!teamName || !password) {
        errorMsg.textContent = 'Please fill in both fields.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.6';

      try {
        if (isNewGame) {
          const result = await register(teamName, password);
          if (result.success) {
            onAuth(teamName, true);
          } else {
            errorMsg.textContent = result.error ?? 'Registration failed';
          }
        } else {
          const result = await login(teamName, password);
          if (result.success) {
            // Load saved game
            try {
              const loaded = await loadGame();
              if (loaded.hasState && loaded.gameState) {
                onAuth(teamName, false, loaded.gameState);
              } else {
                // No save — treat as new
                onAuth(teamName, true);
              }
            } catch {
              errorMsg.textContent = 'Failed to load saved game';
            }
          } else {
            errorMsg.textContent = result.error ?? 'Login failed';
          }
        }
      } catch {
        errorMsg.textContent = 'Network error — is the server running?';
      } finally {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
      }
    };

    submitBtn.addEventListener('click', submit);
    passInput.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') submit();
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
}

/**
 * API client for auth and game persistence.
 *
 * All requests use same-origin cookies for session auth.
 * Save/load errors are logged but never thrown to avoid
 * disrupting gameplay.
 */

// --- Auth ---

export async function register(
  teamName: string,
  password: string,
): Promise<{ success: boolean; error?: string; teamName?: string }> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ teamName, password }),
  });
  return res.json();
}

export async function login(
  teamName: string,
  password: string,
): Promise<{ success: boolean; error?: string; teamName?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ teamName, password }),
  });
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
}

// --- Game persistence ---

export async function saveGame(gameState: string, version: number): Promise<void> {
  try {
    const res = await fetch('/api/games/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ gameState, version }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[saveGame] Server error:', (body as { error?: string }).error ?? res.statusText);
    }
  } catch (err) {
    console.error('[saveGame] Network error:', err);
  }
}

export async function loadGame(): Promise<{ hasState: boolean; gameState?: string; version?: number }> {
  const res = await fetch('/api/games/load', {
    method: 'GET',
    credentials: 'same-origin',
  });
  if (!res.ok) {
    throw new Error(`loadGame failed: ${res.status}`);
  }
  return res.json();
}

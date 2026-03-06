import { Router, type Request, type Response } from 'express';
import { getDb } from '../db.js';

export const gamesRouter = Router();

function requireAuth(req: Request, res: Response): number | null {
  const saveId = req.session?.saveId;
  if (!saveId) {
    res.status(401).json({ error: 'Not authenticated' });
    return null;
  }
  return saveId;
}

gamesRouter.post('/api/games/save', (req, res) => {
  const saveId = requireAuth(req, res);
  if (saveId === null) return;

  const { gameState, version } = req.body;
  if (!gameState || typeof gameState !== 'string') {
    res.status(400).json({ error: 'gameState is required and must be a string' });
    return;
  }

  const db = getDb();
  db.prepare(
    "UPDATE saves SET game_state = ?, version = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(gameState, version ?? 1, saveId);

  res.json({ success: true });
});

gamesRouter.get('/api/games/load', (req, res) => {
  const saveId = requireAuth(req, res);
  if (saveId === null) return;

  const db = getDb();
  const row = db.prepare('SELECT game_state, version FROM saves WHERE id = ?').get(saveId) as
    | { game_state: string; version: number }
    | undefined;

  if (!row || row.game_state === '{}') {
    res.json({ hasState: false });
    return;
  }

  res.json({ hasState: true, gameState: row.game_state, version: row.version });
});

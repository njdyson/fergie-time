import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getDb } from '../db.js';

const AuthBody = z.object({
  teamName: z.string().min(1).max(50),
  password: z.string().min(4).max(100),
});

export const authRouter = Router();

authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = AuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const { teamName, password } = parsed.data;
  const db = getDb();

  // Check uniqueness
  const existing = db.prepare('SELECT id FROM saves WHERE team_name = ?').get(teamName);
  if (existing) {
    res.status(409).json({ error: 'Team name already taken' });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = db.prepare(
    'INSERT INTO saves (team_name, password_hash, game_state, version) VALUES (?, ?, ?, ?)'
  ).run(teamName, passwordHash, '{}', 1);

  req.session!.saveId = Number(result.lastInsertRowid);
  req.session!.teamName = teamName;

  res.json({ success: true, teamName });
});

authRouter.post('/api/auth/login', async (req, res) => {
  const parsed = AuthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const { teamName, password } = parsed.data;
  const db = getDb();

  const row = db.prepare('SELECT id, password_hash FROM saves WHERE team_name = ?').get(teamName) as
    | { id: number; password_hash: string }
    | undefined;

  if (!row) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  req.session!.saveId = row.id;
  req.session!.teamName = teamName;

  res.json({ success: true, teamName });
});

authRouter.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ success: true });
});

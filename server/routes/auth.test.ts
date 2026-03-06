import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { getDb, closeDb } from '../db.js';
import bcrypt from 'bcryptjs';

// Clean up test rows before each test to avoid cross-file pollution
beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM saves WHERE team_name LIKE 'tauth-%'");
});

afterAll(() => {
  const db = getDb();
  db.exec("DELETE FROM saves WHERE team_name LIKE 'tauth-%'");
  closeDb();
});

describe('POST /api/auth/register', () => {
  it('creates a save row with hashed password and sets session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-united', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, teamName: 'tauth-united' });

    // Verify the row exists in DB with hashed password
    const db = getDb();
    const row = db.prepare('SELECT * FROM saves WHERE team_name = ?').get('tauth-united') as any;
    expect(row).toBeDefined();
    expect(row.password_hash).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', row.password_hash)).toBe(true);
    expect(row.game_state).toBe('{}');
  });

  it('returns 409 if team name already taken', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-dupe', password: 'secret123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-dupe', password: 'other456' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Team name already taken');
  });

  it('returns 400 for empty teamName', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: '', password: 'secret123' });

    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-short', password: 'ab' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('sets session and returns success with correct credentials', async () => {
    // Register first
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-login', password: 'mypass1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'tauth-login', password: 'mypass1234' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, teamName: 'tauth-login' });
  });

  it('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'tauth-wrongpw', password: 'correct123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'tauth-wrongpw', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for unknown team', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'tauth-nonexistent', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

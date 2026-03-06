import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { getDb, closeDb } from '../db.js';
import bcrypt from 'bcryptjs';

// Clean up test rows after each test
afterEach(() => {
  const db = getDb();
  db.exec("DELETE FROM saves WHERE team_name LIKE 'test-%'");
});

afterAll(() => {
  closeDb();
});

describe('POST /api/auth/register', () => {
  it('creates a save row with hashed password and sets session', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'test-united', password: 'secret123' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, teamName: 'test-united' });

    // Verify the row exists in DB with hashed password
    const db = getDb();
    const row = db.prepare('SELECT * FROM saves WHERE team_name = ?').get('test-united') as any;
    expect(row).toBeDefined();
    expect(row.password_hash).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', row.password_hash)).toBe(true);
    expect(row.game_state).toBe('{}');
  });

  it('returns 409 if team name already taken', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'test-dupe', password: 'secret123' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'test-dupe', password: 'other456' });

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
      .send({ teamName: 'test-short', password: 'ab' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('sets session and returns success with correct credentials', async () => {
    // Register first
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'test-login', password: 'mypass1234' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'test-login', password: 'mypass1234' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, teamName: 'test-login' });
  });

  it('returns 401 for wrong password', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ teamName: 'test-wrongpw', password: 'correct123' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'test-wrongpw', password: 'wrongpass' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for unknown team', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ teamName: 'test-nonexistent', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });
});

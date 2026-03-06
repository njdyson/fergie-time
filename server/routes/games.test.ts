import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { getDb, closeDb } from '../db.js';

// Use supertest agent to preserve cookies across requests
function agent() {
  return request.agent(app);
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM saves WHERE team_name LIKE 'tgame-%'");
});

afterAll(() => {
  const db = getDb();
  db.exec("DELETE FROM saves WHERE team_name LIKE 'tgame-%'");
  closeDb();
});

describe('POST /api/games/save', () => {
  it('stores game state for authenticated user', async () => {
    const a = agent();

    // Register to get a session
    await a.post('/api/auth/register').send({ teamName: 'tgame-saver', password: 'pass1234' });

    const res = await a
      .post('/api/games/save')
      .send({ gameState: '{"score":1}', version: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // Verify in DB
    const db = getDb();
    const row = db.prepare('SELECT game_state, version FROM saves WHERE team_name = ?').get('tgame-saver') as any;
    expect(row.game_state).toBe('{"score":1}');
    expect(row.version).toBe(2);
  });

  it('returns 401 without session', async () => {
    const res = await request(app)
      .post('/api/games/save')
      .send({ gameState: '{"data":1}', version: 1 });

    expect(res.status).toBe(401);
  });

  it('returns 400 without gameState in body', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({ teamName: 'tgame-nobody', password: 'pass1234' });

    const res = await a.post('/api/games/save').send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/games/load', () => {
  it('returns game state for authenticated user with saved data', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({ teamName: 'tgame-loader', password: 'pass1234' });
    await a.post('/api/games/save').send({ gameState: '{"match":42}', version: 3 });

    const res = await a.get('/api/games/load');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasState: true, gameState: '{"match":42}', version: 3 });
  });

  it('returns hasState false when game_state is empty', async () => {
    const a = agent();
    await a.post('/api/auth/register').send({ teamName: 'tgame-empty', password: 'pass1234' });

    // Don't save anything -- game_state defaults to '{}'
    const res = await a.get('/api/games/load');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ hasState: false });
  });

  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/games/load');

    expect(res.status).toBe(401);
  });
});

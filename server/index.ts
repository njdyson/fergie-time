import express from 'express';
import cookieSession from 'cookie-session';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from './db.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { gamesRouter } from './routes/games.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(cookieSession({
  name: 'session',
  keys: ['fergie-time-dev-key'],
  maxAge: 24 * 60 * 60 * 1000,
}));

app.use(healthRouter);
app.use(authRouter);
app.use(gamesRouter);

// Serve static frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('/{*splat}', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize database on startup
getDb();

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app };

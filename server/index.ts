import express from 'express';
import cookieSession from 'cookie-session';
import { getDb } from './db.js';
import { healthRouter } from './routes/health.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.use(cookieSession({
  name: 'session',
  keys: ['fergie-time-dev-key'],
  maxAge: 24 * 60 * 60 * 1000,
}));

app.use(healthRouter);

// Initialize database on startup
getDb();

const PORT = process.env.PORT ?? 3001;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app };

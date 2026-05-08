import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import recommendationsRouter from './api/routes/recommendations';
import marketsRouter from './api/routes/markets';
import pipelineRouter from './api/routes/pipeline';
import betsRouter from './api/routes/bets';
import { startScheduler } from './scheduler/cron';
import { db } from './db/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/recommendations', recommendationsRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/bets', betsRouter);

async function start() {
  // Run migrations before accepting traffic
  try {
    const schema = readFileSync(join(__dirname, 'db/schema.sql'), 'utf-8');
    await db.query(schema);
    console.log('Database migrations applied');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
    startScheduler();
  });
}

start();

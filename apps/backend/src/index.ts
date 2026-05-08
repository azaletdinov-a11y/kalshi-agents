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

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.FRONTEND_URL ?? '*' }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/recommendations', recommendationsRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/bets', betsRouter);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  db.connect()
    .then((client) => {
      client.release();
      console.log('Database connected');
    })
    .catch((err) => console.error('Database connection failed:', err));

  startScheduler();
});

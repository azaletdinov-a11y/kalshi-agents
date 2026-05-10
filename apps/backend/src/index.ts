import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import recommendationsRouter from './api/routes/recommendations';
import marketsRouter from './api/routes/markets';
import pipelineRouter from './api/routes/pipeline';
import betsRouter from './api/routes/bets';
import settingsRouter from './api/routes/settings';
import whalesRouter from './api/routes/whales';
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
app.use('/api/settings', settingsRouter);
app.use('/api/whales', whalesRouter);

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS markets (
  ticker TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT,
  yes_price DECIMAL,
  volume INTEGER,
  volume_24h INTEGER,
  close_time TIMESTAMPTZ,
  scanned_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS recommendations (
  id SERIAL PRIMARY KEY,
  market_ticker TEXT NOT NULL,
  market_title TEXT NOT NULL,
  category TEXT,
  market_yes_price DECIMAL NOT NULL,
  estimated_probability DECIMAL NOT NULL,
  edge DECIMAL NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  kelly_fraction DECIMAL NOT NULL,
  recommended_bet DECIMAL NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
  reasoning TEXT NOT NULL,
  key_factors JSONB DEFAULT '[]',
  research_summary TEXT NOT NULL,
  close_time TIMESTAMPTZ,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'won', 'lost', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  markets_scanned INTEGER DEFAULT 0,
  recommendations_generated INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  error TEXT
);
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  recommendation_id INTEGER REFERENCES recommendations(id) ON DELETE CASCADE,
  market_ticker TEXT NOT NULL,
  market_title TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('yes', 'no')),
  fill_price DECIMAL(6,2) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'won', 'lost', 'cancelled')),
  pnl DECIMAL(10,2),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  close_time TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_outcome ON recommendations(outcome);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_bets_outcome ON bets(outcome);
CREATE INDEX IF NOT EXISTS idx_bets_close_time ON bets(close_time);

CREATE TABLE IF NOT EXISTS market_snapshots (
  id SERIAL PRIMARY KEY,
  ticker TEXT NOT NULL,
  title TEXT,
  category TEXT,
  yes_price INT NOT NULL,
  volume_24h BIGINT NOT NULL,
  captured_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_ticker_time ON market_snapshots(ticker, captured_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_captured_at ON market_snapshots(captured_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bets ADD COLUMN IF NOT EXISTS kalshi_fill_id TEXT UNIQUE;
DELETE FROM bets WHERE fill_price::text = 'NaN' OR amount::text = 'NaN';
INSERT INTO settings (key, value) VALUES
  ('auto_bet_enabled', 'false'),
  ('auto_bet_max_per_bet', '3'),
  ('auto_bet_min_edge', '0.20'),
  ('auto_bet_min_price', '30'),
  ('auto_bet_max_price', '75'),
  ('auto_bet_max_days', '30'),
  ('auto_bet_dry_run', 'true')
ON CONFLICT (key) DO NOTHING;
`;

async function start() {
  try {
    await db.query(MIGRATIONS);
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

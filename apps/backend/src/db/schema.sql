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

CREATE INDEX IF NOT EXISTS idx_recommendations_created_at ON recommendations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_outcome ON recommendations(outcome);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON pipeline_runs(started_at DESC);

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

CREATE INDEX IF NOT EXISTS idx_bets_outcome ON bets(outcome);
CREATE INDEX IF NOT EXISTS idx_bets_close_time ON bets(close_time);

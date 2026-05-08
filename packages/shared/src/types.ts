export type Confidence = 'high' | 'medium' | 'low';
export type Side = 'yes' | 'no';
export type Outcome = 'pending' | 'won' | 'lost' | 'cancelled';
export type PipelineStatus = 'running' | 'completed' | 'failed';

export interface KalshiMarket {
  ticker: string;
  title: string;
  category: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  close_time: string;
  open_interest: number;
}

export interface Recommendation {
  id: number;
  market_ticker: string;
  market_title: string;
  category: string;
  market_yes_price: number;
  estimated_probability: number;
  edge: number;
  side: Side;
  kelly_fraction: number;
  recommended_bet: number;
  confidence: Confidence;
  reasoning: string;
  key_factors: string[];
  research_summary: string;
  close_time: string;
  outcome: Outcome;
  created_at: string;
}

export interface PipelineRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  markets_scanned: number;
  recommendations_generated: number;
  status: PipelineStatus;
  error: string | null;
}

export interface DashboardStats {
  active_recommendations: number;
  last_run: PipelineRun | null;
  next_run_at: string;
  win_rate: number | null;
  total_resolved: number;
}

export type BetOutcome = 'pending' | 'won' | 'lost' | 'cancelled';

export interface Bet {
  id: number;
  recommendation_id: number;
  market_ticker: string;
  market_title: string;
  side: Side;
  fill_price: number;
  amount: number;
  outcome: BetOutcome;
  pnl: number | null;
  placed_at: string;
  resolved_at: string | null;
  close_time: string;
}

export interface PnlSummary {
  total_bets: number;
  total_wagered: number;
  total_pnl: number;
  win_rate: number | null;
  pending_bets: number;
  roi: number | null;
}

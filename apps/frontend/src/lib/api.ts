import type { Recommendation, PipelineRun, DashboardStats, Bet, PnlSummary } from '@kalshi/shared';

const BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function getStats(): Promise<DashboardStats> {
  return get('/api/pipeline/stats');
}

function normalizeRec(r: Recommendation): Recommendation {
  return {
    ...r,
    market_yes_price: Number(r.market_yes_price),
    estimated_probability: Number(r.estimated_probability),
    edge: Number(r.edge),
    kelly_fraction: Number(r.kelly_fraction),
    recommended_bet: Number(r.recommended_bet),
  };
}

export async function getRecommendations(outcome = 'pending'): Promise<Recommendation[]> {
  const recs = await get<Recommendation[]>(`/api/recommendations?outcome=${outcome}&limit=100`);
  return recs.map(normalizeRec);
}

export async function getRecommendation(id: string): Promise<Recommendation> {
  return normalizeRec(await get<Recommendation>(`/api/recommendations/${id}`));
}

export async function getPipelineStatus(): Promise<{ is_running: boolean; runs: PipelineRun[] }> {
  return get('/api/pipeline/status');
}

export async function triggerPipeline(): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/api/pipeline/run`, { method: 'POST' });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function markOutcome(
  id: number,
  outcome: 'won' | 'lost' | 'cancelled'
): Promise<Recommendation> {
  const res = await fetch(`${BASE}/api/recommendations/${id}/outcome`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ outcome }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function normalizeBet(b: Bet): Bet {
  return {
    ...b,
    fill_price: Number(b.fill_price),
    amount: Number(b.amount),
    pnl: b.pnl != null ? Number(b.pnl) : null,
  };
}

export async function getBets(outcome?: string): Promise<Bet[]> {
  const qs = outcome ? `?outcome=${outcome}` : '';
  const bets = await get<Bet[]>(`/api/bets${qs}`);
  return bets.map(normalizeBet);
}

export async function getBetsClosingSoon(): Promise<Bet[]> {
  const bets = await get<Bet[]>('/api/bets/closing-soon');
  return bets.map(normalizeBet);
}

export async function getPnlSummary(): Promise<PnlSummary> {
  return get('/api/bets/summary');
}

export async function recordBet(
  recommendation_id: number,
  fill_price: number,
  amount: number
): Promise<Bet> {
  const res = await fetch(`${BASE}/api/bets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recommendation_id, fill_price, amount }),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return normalizeBet(await res.json());
}

export async function cancelBet(id: number): Promise<void> {
  await fetch(`${BASE}/api/bets/${id}`, { method: 'DELETE' });
}

export interface CategoryPnl {
  category: string;
  total_bets: number;
  total_wagered: number;
  total_pnl: number;
  win_rate: number | null;
}

export async function getBetsByCategory(): Promise<CategoryPnl[]> {
  return get('/api/bets/by-category');
}

export interface CalibrationBucket {
  bucket: number;
  label: string;
  total: number;
  wins: number;
  win_rate: number | null;
  avg_estimate: number;
}

export async function getCalibration(): Promise<CalibrationBucket[]> {
  return get('/api/recommendations/calibration');
}

export interface EvSummary {
  total_ev: number;
  total_exposure: number;
  pending_count: number;
}

export async function getEvSummary(): Promise<EvSummary> {
  return get('/api/recommendations/ev-summary');
}

export interface BankrollInfo {
  starting_bankroll: number;
  realized_pnl: number;
  current_bankroll: number;
}

export async function getBankroll(): Promise<BankrollInfo> {
  return get('/api/settings/bankroll');
}

export async function setBankroll(amount: number): Promise<void> {
  await fetch(`${BASE}/api/settings/bankroll`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
}

export async function getMarketPrice(ticker: string): Promise<{ yes_ask: number; yes_bid: number; no_ask: number; no_bid: number }> {
  return get(`/api/markets/${ticker}/price`);
}

export async function syncKalshiBets(reset = false): Promise<{ imported: number; skipped: number; total_fills: number; total_orders: number; errors: string[] }> {
  const res = await fetch(`${BASE}/api/bets/sync-kalshi`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reset }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export interface KalshiBalance { cash: number; portfolio_value: number; }

export async function resolveOutcomes(): Promise<{ resolved: number }> {
  const res = await fetch(`${BASE}/api/bets/resolve-outcomes`, { method: 'POST' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export interface AutoBetSettings { enabled: boolean; max_per_bet: number; min_edge: number; min_price: number; max_price: number; max_days: number; dry_run: boolean; }

export async function getAutoBetSettings(): Promise<AutoBetSettings> {
  return get<AutoBetSettings>('/api/settings/auto-bet');
}

export interface WhaleAlert {
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  vol_delta: number;
  vol_delta_usd: number;
  baseline_avg: number;
  spike_ratio: number | null;
  readings: number;
  momentum_move: number | null;
  rec_side: string | null;
  rec_edge: number | null;
  rec_confidence: string | null;
  captured_at: string;
}

export interface WhaleEvent {
  id: number;
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  vol_delta: number;
  vol_delta_usd: number;
  spike_ratio: number | null;
  signals: string[];
  detected_at: string;
}

export interface WhaleData {
  alerts: WhaleAlert[];
  events: WhaleEvent[];
  last_snapshot: string | null;
  snapshot_count: number;
  market_count: number;
}

export async function getWhales(minVol = 50, minPrice = 8): Promise<WhaleData> {
  return get<WhaleData>(`/api/whales?min_vol=${minVol}&min_price=${minPrice}`);
}

export async function getKalshiBalance(): Promise<KalshiBalance | null> {
  try {
    return await get<KalshiBalance>('/api/bets/kalshi-balance');
  } catch {
    return null;
  }
}

import type { Recommendation, PipelineRun, DashboardStats, Bet, PnlSummary } from '@kalshi/shared';

const BASE =
  process.env.API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3001';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { next: { revalidate: 30 } });
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

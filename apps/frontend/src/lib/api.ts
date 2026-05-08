import type { Recommendation, PipelineRun, DashboardStats } from '@kalshi/shared';

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

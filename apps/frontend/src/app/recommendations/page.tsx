import { getRecommendations, getBets } from '@/lib/api';
import { RecommendationsView } from './RecommendationsView';

export const dynamic = 'force-dynamic';

export default async function RecommendationsPage() {
  const [recs, bets] = await Promise.all([
    getRecommendations('pending').catch(() => []),
    getBets().catch(() => []),
  ]);

  const betsByTicker = Object.fromEntries(bets.map((b) => [b.market_ticker, b]));

  return <RecommendationsView recs={recs} betsByTicker={betsByTicker} />;
}

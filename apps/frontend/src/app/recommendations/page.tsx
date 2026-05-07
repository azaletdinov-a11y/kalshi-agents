import { getRecommendations } from '@/lib/api';
import { RecommendationCard } from '@/components/RecommendationCard';

export const revalidate = 30;

export default async function RecommendationsPage() {
  const recs = await getRecommendations('pending').catch(() => []);

  const sorted = [...recs].sort((a, b) => b.edge - a.edge);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Active Recommendations</h1>
        <span className="text-sm text-slate-500">{recs.length} markets</span>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-500">
          No active recommendations. Run the pipeline from the dashboard.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((r) => <RecommendationCard key={r.id} rec={r} />)}
        </div>
      )}
    </div>
  );
}

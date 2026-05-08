import { getStats, getRecommendations } from '@/lib/api';
import { RecommendationCard } from '@/components/RecommendationCard';
import { PipelineControls } from '@/components/PipelineControls';

export const revalidate = 0;

export default async function DashboardPage() {
  const [stats, recs] = await Promise.all([
    getStats().catch((e) => { console.error('[Dashboard] stats error:', e.message); return null; }),
    getRecommendations('pending').catch((e) => { console.error('[Dashboard] recs error:', e.message); return []; }),
  ]);

  const top = recs.slice(0, 6);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <PipelineControls />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active Recs" value={stats?.active_recommendations ?? '—'} />
        <StatCard
          label="Last Run"
          value={
            stats?.last_run?.completed_at
              ? timeAgo(stats.last_run.completed_at)
              : 'Never'
          }
        />
        <StatCard
          label="Win Rate"
          value={stats?.win_rate != null ? `${stats.win_rate}%` : '—'}
        />
        <StatCard
          label="Resolved"
          value={stats?.total_resolved ?? '—'}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Top Recommendations</h2>
          <a href="/recommendations" className="text-sm text-emerald-400 hover:text-emerald-300">
            View all →
          </a>
        </div>
        {top.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
            No recommendations yet. Run the pipeline to generate them.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {top.map((r) => <RecommendationCard key={r.id} rec={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

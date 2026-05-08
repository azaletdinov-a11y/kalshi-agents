import { getStats, getRecommendations, getBets, getBetsClosingSoon, getEvSummary } from '@/lib/api';
import { RecommendationCard } from '@/components/RecommendationCard';
import { PipelineControls } from '@/components/PipelineControls';
import type { Bet } from '@kalshi/shared';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [stats, recs, allBets, closingSoon, ev] = await Promise.all([
    getStats().catch((e) => { console.error('[Dashboard] stats error:', e.message); return null; }),
    getRecommendations('pending').catch((e) => { console.error('[Dashboard] recs error:', e.message); return []; }),
    getBets().catch(() => [] as Bet[]),
    getBetsClosingSoon().catch(() => [] as Bet[]),
    getEvSummary().catch(() => null),
  ]);

  const top = recs.slice(0, 6);
  const betsByTicker = Object.fromEntries(allBets.map((b) => [b.market_ticker, b]));

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

      {ev && ev.pending_count > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Expected P&L (pending bets)"
            value={ev.total_ev > 0 ? `+$${ev.total_ev.toFixed(2)}` : `$${ev.total_ev.toFixed(2)}`}
          />
          <StatCard
            label="Amount at Risk"
            value={`$${ev.total_exposure.toFixed(2)}`}
          />
          <StatCard
            label="Pending Bets"
            value={ev.pending_count}
          />
        </div>
      )}

      {closingSoon.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-2" />
            Closing Within 24h
          </h2>
          <div className="flex flex-col gap-2">
            {closingSoon.map((b) => (
              <ClosingBetRow key={b.id} bet={b} />
            ))}
          </div>
        </div>
      )}

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
            {top.map((r) => <RecommendationCard key={r.id} rec={r} bet={betsByTicker[r.market_ticker]} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClosingBetRow({ bet }: { bet: Bet }) {
  const hoursLeft = Math.max(
    0,
    Math.round((new Date(bet.close_time).getTime() - Date.now()) / 3600000)
  );
  const pnl = bet.pnl;
  const pnlLabel = pnl != null
    ? pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`
    : null;

  const outcomeEl =
    bet.outcome === 'won' ? <span className="text-emerald-400 font-semibold">WON {pnlLabel}</span>
    : bet.outcome === 'lost' ? <span className="text-red-400 font-semibold">LOST {pnlLabel}</span>
    : hoursLeft === 0
      ? <span className="text-amber-400">Market closed — awaiting resolution</span>
      : <span className="text-slate-400">{hoursLeft}h remaining</span>;

  return (
    <div className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-4 py-3 flex items-center justify-between gap-4">
      <p className="text-sm text-slate-200 line-clamp-1 flex-1">{bet.market_title}</p>
      <span className="text-xs text-slate-400 shrink-0">
        BET {bet.side.toUpperCase()} · ${bet.amount.toFixed(2)} @ {bet.fill_price}¢
      </span>
      <span className="text-xs shrink-0">{outcomeEl}</span>
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

import { getRecommendations } from '@/lib/api';
import type { Recommendation } from '@kalshi/shared';

export const revalidate = 60;

export default async function MarketPage({ params }: { params: { ticker: string } }) {
  const all = await getRecommendations('pending').catch(() => [] as Recommendation[]);
  const rec = all.find((r) => r.market_ticker === params.ticker);

  if (!rec) {
    return (
      <div className="text-slate-500 text-center py-20">
        Market not found or no active recommendation.
      </div>
    );
  }

  const edgeDirection = rec.side === 'yes'
    ? `Market prices YES at ${rec.market_yes_price}%, we estimate ${rec.estimated_probability}%`
    : `Market prices NO at ${100 - rec.market_yes_price}%, we estimate ${100 - rec.estimated_probability}%`;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <div className="text-sm text-slate-500 mb-2">{rec.category} · {rec.market_ticker}</div>
        <h1 className="text-xl font-bold leading-snug">{rec.market_title}</h1>
        <div className="text-sm text-slate-500 mt-1">
          Closes {new Date(rec.close_time).toLocaleDateString()}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Recommend" value={`BET ${rec.side.toUpperCase()}`} accent />
        <MetricCard label="Edge" value={`${rec.edge}%`} accent />
        <MetricCard label="Bet Size" value={`$${rec.recommended_bet.toFixed(2)}`} />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
        <h2 className="font-semibold text-slate-200">Probability Analysis</h2>
        <div className="flex items-center gap-6">
          <ProbBar label="Market" value={rec.market_yes_price} color="bg-slate-600" />
          <ProbBar label="Our Estimate" value={rec.estimated_probability} color="bg-emerald-500" />
        </div>
        <p className="text-xs text-slate-400">{edgeDirection} — {rec.confidence} confidence</p>
      </div>

      {rec.key_factors?.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="font-semibold text-slate-200 mb-3">Key Factors</h2>
          <ul className="space-y-2">
            {rec.key_factors.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-300">
                <span className="text-emerald-400 shrink-0">·</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="font-semibold text-slate-200 mb-3">Claude&apos;s Reasoning</h2>
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{rec.reasoning}</p>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="font-semibold text-slate-200 mb-3">Research Evidence</h2>
        <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{rec.research_summary}</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${accent ? 'text-emerald-400' : 'text-white'}`}>{value}</div>
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-800">
        <div className={`h-3 rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

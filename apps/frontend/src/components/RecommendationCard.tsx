import type { Recommendation } from '@kalshi/shared';
import Link from 'next/link';

const confidenceColor = {
  high: 'bg-emerald-900 text-emerald-300',
  medium: 'bg-yellow-900 text-yellow-300',
  low: 'bg-slate-700 text-slate-300',
};

const sideColor = {
  yes: 'bg-blue-900 text-blue-300',
  no: 'bg-purple-900 text-purple-300',
};

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const daysLeft = Math.ceil(
    (new Date(rec.close_time).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const direction = rec.side === 'yes'
    ? rec.estimated_probability > rec.market_yes_price ? '↑' : '↓'
    : rec.estimated_probability < rec.market_yes_price ? '↑' : '↓';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2">{rec.market_title}</p>
        <span className="text-xs text-slate-500 shrink-0">{daysLeft}d left</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-center">
          <div className="text-xs text-slate-500">Market</div>
          <div className="text-lg font-bold text-slate-300">{rec.market_yes_price}%</div>
        </div>
        <div className="text-2xl text-emerald-400">{direction}</div>
        <div className="text-center">
          <div className="text-xs text-slate-500">Estimate</div>
          <div className="text-lg font-bold text-emerald-400">{rec.estimated_probability}%</div>
        </div>
        <div className="ml-auto text-center">
          <div className="text-xs text-slate-500">Edge</div>
          <div className="text-lg font-bold text-emerald-400">{rec.edge}%</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sideColor[rec.side]}`}>
          BET {rec.side.toUpperCase()}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceColor[rec.confidence]}`}>
          {rec.confidence} confidence
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
          {rec.category}
        </span>
        <span className="ml-auto text-sm font-semibold text-white">
          ${rec.recommended_bet.toFixed(2)}
        </span>
      </div>

      <Link
        href={`/markets/${rec.market_ticker}`}
        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
      >
        View full analysis →
      </Link>
    </div>
  );
}

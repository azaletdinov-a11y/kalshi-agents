'use client';

import { useState, useMemo } from 'react';
import type { Recommendation, Bet } from '@kalshi/shared';
import { RecommendationCard } from '@/components/RecommendationCard';

type SortKey = 'edge' | 'days_left' | 'confidence' | 'estimated_probability';

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 };

export function RecommendationsView({
  recs,
  betsByTicker,
}: {
  recs: Recommendation[];
  betsByTicker: Record<string, Bet>;
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState<SortKey>('edge');
  const [minEdge, setMinEdge] = useState(0);

  const categories = useMemo(() => {
    const cats = [...new Set(recs.map((r) => r.category).filter(Boolean))].sort();
    return ['All', ...cats];
  }, [recs]);

  const filtered = useMemo(() => {
    return recs
      .filter((r) => {
        if (category !== 'All' && r.category !== category) return false;
        if (r.edge < minEdge) return false;
        if (search && !r.market_title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'edge') return b.edge - a.edge;
        if (sortBy === 'days_left') {
          return new Date(a.close_time).getTime() - new Date(b.close_time).getTime();
        }
        if (sortBy === 'confidence') {
          return CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
        }
        if (sortBy === 'estimated_probability') return b.estimated_probability - a.estimated_probability;
        return 0;
      });
  }, [recs, category, sortBy, minEdge, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recommendations</h1>
        <span className="text-sm text-slate-500">{filtered.length} of {recs.length}</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search markets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-52"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortKey)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
        >
          <option value="edge">Sort: Edge</option>
          <option value="days_left">Sort: Closing Soon</option>
          <option value="confidence">Sort: Confidence</option>
          <option value="estimated_probability">Sort: Estimate</option>
        </select>

        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Min edge</span>
          <input
            type="number"
            min={0}
            max={50}
            value={minEdge}
            onChange={(e) => setMinEdge(Number(e.target.value))}
            className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-slate-500">%</span>
        </div>

        {(search || category !== 'All' || minEdge > 0) && (
          <button
            onClick={() => { setSearch(''); setCategory('All'); setMinEdge(0); }}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-500">
          No recommendations match your filters.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <RecommendationCard key={r.id} rec={r} bet={betsByTicker[r.market_ticker]} />
          ))}
        </div>
      )}
    </div>
  );
}

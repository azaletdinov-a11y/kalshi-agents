'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Settings {
  enabled: boolean;
  max_per_bet: number;
  min_edge: number;
  dry_run: boolean;
}

export function AutoBetSettings({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save(patch: Partial<Settings>) {
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    const base = process.env.NEXT_PUBLIC_API_URL ?? '';
    await fetch(`${base}/api/settings/auto-bet`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: next.enabled,
        max_per_bet: next.max_per_bet,
        min_edge: next.min_edge,
        dry_run: next.dry_run,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Auto-Bet</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {s.dry_run ? 'Dry run — logs only, no real orders' : 'Live — places real orders on Kalshi'}
          </div>
        </div>
        <button
          onClick={() => save({ enabled: !s.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${s.enabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${s.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Max per bet ($)</label>
          <input
            type="number" min="0.5" max="10" step="0.5"
            value={s.max_per_bet}
            onChange={(e) => setS({ ...s, max_per_bet: parseFloat(e.target.value) })}
            onBlur={() => save({ max_per_bet: s.max_per_bet })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Min edge (%)</label>
          <input
            type="number" min="5" max="50" step="1"
            value={Math.round(s.min_edge * 100)}
            onChange={(e) => setS({ ...s, min_edge: parseFloat(e.target.value) / 100 })}
            onBlur={() => save({ min_edge: s.min_edge })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={s.dry_run}
          onChange={(e) => save({ dry_run: e.target.checked })}
          className="accent-emerald-500"
        />
        <span className="text-slate-400">Dry run (safe mode)</span>
      </label>

      {saving && <div className="text-xs text-slate-500">Saving…</div>}
    </div>
  );
}

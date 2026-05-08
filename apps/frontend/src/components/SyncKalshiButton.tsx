'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { syncKalshiBets } from '@/lib/api';

export function SyncKalshiButton() {
  const [state, setState] = useState<'idle' | 'syncing' | 'done'>('idle');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const router = useRouter();

  async function sync() {
    setState('syncing');
    try {
      const r = await syncKalshiBets();
      if (r.errors.length > 0) {
        alert(`Sync errors:\n${r.errors.join('\n')}`);
      }
      setResult({ imported: r.imported, skipped: r.skipped });
      setState('done');
      router.refresh();
      setTimeout(() => setState('idle'), 4000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      alert(`Sync failed: ${msg}`);
      setState('idle');
    }
  }

  return (
    <div className="flex items-center gap-3">
      {state === 'done' && result && (
        <span className="text-xs text-emerald-400">
          {result.imported} imported · {result.skipped} already tracked
        </span>
      )}
      <button
        onClick={sync}
        disabled={state === 'syncing'}
        className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm transition-colors flex items-center gap-2"
      >
        {state === 'syncing' && (
          <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
        )}
        {state === 'syncing' ? 'Syncing…' : '↓ Sync from Kalshi'}
      </button>
    </div>
  );
}

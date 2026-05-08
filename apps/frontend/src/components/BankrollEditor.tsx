'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BankrollInfo } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function BankrollEditor({ bankroll }: { bankroll: BankrollInfo }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(bankroll.starting_bankroll.toFixed(2));
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function save() {
    setSaving(true);
    try {
      await fetch(`${BASE}/api/settings/bankroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(value) }),
      });
      setEditing(false);
      router.refresh();
    } catch { alert('Failed to save'); }
    finally { setSaving(false); }
  }

  const pnlColor = bankroll.realized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">Bankroll</span>
        <button
          onClick={() => setEditing(!editing)}
          className="text-xs text-slate-500 hover:text-white transition-colors"
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>

      <div className="text-2xl font-bold">${bankroll.current_bankroll.toFixed(2)}</div>

      <div className="text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span>Starting</span>
          <span className="text-slate-300">${bankroll.starting_bankroll.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span>Realized P&L</span>
          <span className={pnlColor}>
            {bankroll.realized_pnl >= 0 ? '+' : ''}${bankroll.realized_pnl.toFixed(2)}
          </span>
        </div>
      </div>

      {editing && (
        <div className="flex gap-2 pt-1">
          <input
            type="number"
            step="1"
            min="1"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm transition-colors"
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  );
}

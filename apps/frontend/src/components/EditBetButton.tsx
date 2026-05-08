'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Bet } from '@kalshi/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function kalshiPnl(amount: number, fillPrice: number): number {
  if (amount <= 0 || fillPrice <= 0 || fillPrice >= 100) return 0;
  const contracts = Math.floor((amount / (fillPrice / 100)) * 100) / 100;
  const grossProfit = contracts - amount;
  const fee = Math.max(0, grossProfit) * 0.07;
  return Math.round((grossProfit - fee) * 100) / 100;
}

export function EditBetButton({ bet }: { bet: Bet }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(bet.amount.toFixed(2));
  const [fillPrice, setFillPrice] = useState(bet.fill_price.toString());
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  if (bet.outcome !== 'pending') return null;

  const profit = kalshiPnl(parseFloat(amount), parseFloat(fillPrice));
  const totalPayout = parseFloat(amount) + profit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/bets/${bet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          fill_price: parseFloat(fillPrice),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      setOpen(false);
      router.refresh();
    } catch {
      alert('Failed to update bet.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this bet? This cannot be undone.')) return;
    await fetch(`${BASE}/api/bets/${bet.id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-slate-400 hover:text-white transition-colors"
        title="Edit bet"
      >
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-slate-100 mb-1 leading-snug">
              Edit Bet
            </h3>
            <p className="text-xs text-slate-500 mb-5 line-clamp-1">{bet.market_title}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Amount paid ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  {bet.side === 'yes' ? 'YES' : 'NO'} fill price (¢)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="99"
                  value={fillPrice}
                  onChange={(e) => setFillPrice(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              {profit > 0 && (
                <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-400">
                  If wins: <span className="text-emerald-400 font-semibold">${totalPayout.toFixed(2)} total</span>
                  <span className="text-slate-500 ml-1">(+${profit.toFixed(2)} profit)</span>
                  {'  '}·{'  '}
                  If loses: <span className="text-red-400 font-semibold">-${parseFloat(amount).toFixed(2)}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-2 rounded-lg bg-red-950 hover:bg-red-900 text-red-400 text-sm transition-colors"
                >
                  Cancel Bet
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

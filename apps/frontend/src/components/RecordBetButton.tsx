'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Recommendation, Bet } from '@kalshi/shared';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

function kalshiPnl(amount: number, fillPrice: number): number {
  if (amount <= 0 || fillPrice <= 0 || fillPrice >= 100) return 0;
  const contracts = Math.floor((amount / (fillPrice / 100)) * 100) / 100;
  const grossProfit = contracts - amount;
  const fee = Math.max(0, grossProfit) * 0.07;
  return Math.round((grossProfit - fee) * 100) / 100;
}

export function RecordBetButton({
  rec,
  existingBet,
}: {
  rec: Recommendation;
  existingBet?: Bet;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(rec.recommended_bet.toFixed(2));
  const [fillPrice, setFillPrice] = useState(
    rec.side === 'yes'
      ? rec.market_yes_price.toString()
      : (100 - rec.market_yes_price).toString()
  );
  const [saving, setSaving] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const router = useRouter();

  async function openModal() {
    setOpen(true);
    setFetchingPrice(true);
    try {
      const res = await fetch(`${BASE}/api/markets/${rec.market_ticker}/price`);
      if (res.ok) {
        const prices = await res.json();
        const live = rec.side === 'yes' ? prices.yes_ask : prices.no_ask;
        if (live > 0) setFillPrice(live.toString());
      }
    } catch { /* use default */ } finally {
      setFetchingPrice(false);
    }
  }

  if (existingBet && existingBet.outcome !== 'cancelled') {
    const pnl = existingBet.pnl;
    const pnlLabel =
      pnl != null
        ? pnl >= 0
          ? `+$${pnl.toFixed(2)}`
          : `-$${Math.abs(pnl).toFixed(2)}`
        : null;

    const outcomeColor =
      existingBet.outcome === 'won'
        ? 'text-emerald-400'
        : existingBet.outcome === 'lost'
        ? 'text-red-400'
        : 'text-slate-400';

    return (
      <div className="text-xs text-slate-400">
        Bet: <span className="text-white">${existingBet.amount.toFixed(2)}</span> @{' '}
        <span className="text-white">{existingBet.fill_price}¢</span>
        {existingBet.outcome !== 'pending' && (
          <span className={`ml-2 font-semibold ${outcomeColor}`}>
            {existingBet.outcome.toUpperCase()}
            {pnlLabel && ` ${pnlLabel}`}
          </span>
        )}
        {existingBet.outcome === 'pending' && (
          <span className="ml-2 text-slate-500">awaiting resolution</span>
        )}
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await fetch(`${BASE}/api/bets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendation_id: rec.id,
          fill_price: parseFloat(fillPrice),
          amount: parseFloat(amount),
        }),
      });
      setOpen(false);
      router.refresh();
    } catch {
      alert('Failed to save bet. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const fillLabel = rec.side === 'yes' ? 'YES price (¢)' : 'NO price (¢)';
  const expectedPnl = kalshiPnl(parseFloat(amount), parseFloat(fillPrice));

  return (
    <>
      <button
        onClick={openModal}
        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
      >
        + Record Bet
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
              {rec.market_title}
            </h3>
            <p className="text-xs text-slate-500 mb-5">
              Rec: BET {rec.side.toUpperCase()} · suggested ${rec.recommended_bet.toFixed(2)} · market {rec.market_yes_price}¢
            </p>

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
                  {fillLabel} — actual fill price (0–99)
                  {fetchingPrice && <span className="ml-2 text-slate-500">fetching live…</span>}
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

              {expectedPnl > 0 && (
                <div className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-400">
                  If wins: <span className="text-emerald-400 font-semibold">${(parseFloat(amount) + expectedPnl).toFixed(2)} total</span>
                  <span className="text-slate-500 ml-1">(+${expectedPnl.toFixed(2)} profit)</span>
                  {'  '}·{'  '}
                  If loses: <span className="text-red-400 font-semibold">-${parseFloat(amount).toFixed(2)}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving…' : 'Record Bet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

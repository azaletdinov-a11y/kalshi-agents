'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function CancelBetButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/bets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'cancelled' }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      alert(`Cancel failed: ${e}`);
    } finally {
      setLoading(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={handleCancel}
          disabled={loading}
          className="text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Cancel bet?'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-slate-600 hover:text-amber-400 transition-colors text-xs"
      title="Mark as cancelled"
    >
      void
    </button>
  );
}

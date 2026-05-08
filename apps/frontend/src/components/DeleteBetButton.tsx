'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function DeleteBetButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    try {
      const res = await fetch(`${BASE}/api/bets/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`${res.status}`);
      setConfirming(false);
      router.refresh();
    } catch (e) {
      alert(`Delete failed: ${e}`);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <button
          onClick={handleDelete}
          className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors"
        >
          Confirm
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
      className="text-slate-600 hover:text-red-400 transition-colors text-base leading-none"
      title="Delete bet"
    >
      ×
    </button>
  );
}

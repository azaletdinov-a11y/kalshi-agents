'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function WhaleRefresher({ intervalSeconds = 60 }: { intervalSeconds?: number }) {
  const [remaining, setRemaining] = useState(intervalSeconds);
  const router = useRouter();

  useEffect(() => {
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          router.refresh();
          return intervalSeconds;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [router, intervalSeconds]);

  return (
    <div className="flex items-center gap-3 text-xs text-slate-500">
      <span>Auto-refresh in {remaining}s</span>
      <button
        onClick={() => { router.refresh(); setRemaining(intervalSeconds); }}
        className="text-slate-400 hover:text-white transition-colors font-medium"
      >
        ↺ Now
      </button>
    </div>
  );
}

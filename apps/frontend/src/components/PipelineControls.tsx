'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Run {
  status: string;
  started_at: string;
  completed_at: string | null;
  markets_scanned: number;
  recommendations_generated: number;
}

interface Status {
  is_running: boolean;
  runs: Run[];
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export function PipelineControls() {
  const [status, setStatus] = useState<Status | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [resetting, setResetting] = useState(false);
  const wasRunning = useRef(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`${BASE}/api/pipeline/status`, { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const data: Status = await res.json();
        setStatus(data);

        // Refresh page content when pipeline finishes
        if (wasRunning.current && !data.is_running) {
          router.refresh();
        }
        wasRunning.current = data.is_running;
      } catch { /* backend unreachable */ }
    }

    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [router]);

  async function handleRun() {
    setTriggering(true);
    try {
      await fetch(`${BASE}/api/pipeline/run`, { method: 'POST' });
      wasRunning.current = true;
      setStatus((s) => s ? { ...s, is_running: true } : s);
    } catch { /* ignore */ } finally {
      setTriggering(false);
    }
  }

  async function handleReset() {
    if (!confirm('Cancel all pending recommendations and re-evaluate from scratch?')) return;
    setResetting(true);
    try {
      const res = await fetch(`${BASE}/api/pipeline/reset`, { method: 'POST' });
      const data = await res.json();
      alert(`Cancelled ${data.cancelled} pending recs. Run the pipeline to regenerate.`);
      router.refresh();
    } catch { /* ignore */ } finally {
      setResetting(false);
    }
  }

  const isRunning = status?.is_running ?? false;
  const lastRun = status?.runs?.[0];

  return (
    <div className="flex items-center gap-4">
      {isRunning && (
        <div className="flex items-center gap-2 text-sm text-emerald-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Pipeline running
          {lastRun && (
            <span className="text-slate-500">
              · {lastRun.markets_scanned} markets scanned
            </span>
          )}
        </div>
      )}
      {!isRunning && lastRun?.completed_at && (
        <span className="text-sm text-slate-500">
          Last run: {timeAgo(lastRun.completed_at)}
          {' · '}
          {lastRun.recommendations_generated} recs generated
        </span>
      )}
      <button
        onClick={handleReset}
        disabled={isRunning || resetting}
        className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-slate-300 text-sm font-medium transition-colors"
      >
        {resetting ? 'Resetting…' : 'Reset Recs'}
      </button>
      <button
        onClick={handleRun}
        disabled={isRunning || triggering}
        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
      >
        {isRunning || triggering ? 'Running…' : 'Run Pipeline Now'}
      </button>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

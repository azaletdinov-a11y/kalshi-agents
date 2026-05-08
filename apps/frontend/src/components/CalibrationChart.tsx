import type { CalibrationBucket } from '@/lib/api';

export function CalibrationChart({ data }: { data: CalibrationBucket[] }) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500 text-sm">
        No resolved bets yet — calibration data will appear after markets settle.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-end justify-between mb-2">
        <h3 className="text-sm font-semibold">Calibration</h3>
        <span className="text-xs text-slate-500">Estimated probability vs actual win rate</span>
      </div>

      <div className="relative mt-6">
        {/* Perfect calibration line */}
        <div className="absolute inset-0 flex items-end pointer-events-none" style={{ paddingBottom: '24px' }}>
          <div className="w-full h-px border-t border-dashed border-slate-600" style={{
            background: 'linear-gradient(to right, transparent, transparent)',
            transform: 'rotate(-0deg)',
          }} />
        </div>

        <div className="flex items-end gap-2 h-40 pb-6">
          {Array.from({ length: 10 }, (_, i) => {
            const bucket = data.find((d) => d.bucket === i * 10);
            const winRate = bucket?.win_rate ?? null;
            const estimate = bucket?.avg_estimate ?? (i * 10 + 5);
            const count = bucket?.total ?? 0;

            const barHeight = winRate != null ? (winRate / 100) * 100 : 0;
            const refHeight = (estimate / 100) * 100;

            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 relative group">
                {/* Tooltip */}
                {count > 0 && (
                  <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-10">
                    <div className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs whitespace-nowrap">
                      <div className="text-slate-300">{i * 10}–{i * 10 + 10}%</div>
                      <div>Estimate: ~{estimate}%</div>
                      <div>Win rate: {winRate ?? '—'}%</div>
                      <div className="text-slate-500">{count} bet{count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                )}

                <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '100px' }}>
                  {/* Ideal bar (faint) */}
                  <div
                    className="w-2 rounded-t bg-slate-700 opacity-40"
                    style={{ height: `${refHeight}%` }}
                  />
                  {/* Actual bar */}
                  {count > 0 && (
                    <div
                      className={`w-2 rounded-t ${winRate != null && winRate > estimate ? 'bg-emerald-500' : 'bg-blue-500'}`}
                      style={{ height: `${barHeight}%` }}
                    />
                  )}
                </div>

                <span className="text-xs text-slate-600">{i * 10}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-700 opacity-40 inline-block" /> Expected</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Actual win rate</span>
      </div>
    </div>
  );
}

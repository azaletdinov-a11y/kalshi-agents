import { getWhales } from '@/lib/api';
import type { WhaleAlert, WhaleEvent } from '@/lib/api';

export const dynamic = 'force-dynamic';

const CATEGORY_COLORS: Record<string, string> = {
  Crypto:        'bg-orange-900 text-orange-300',
  Economics:     'bg-blue-900 text-blue-300',
  Finance:       'bg-cyan-900 text-cyan-300',
  Politics:      'bg-purple-900 text-purple-300',
  Climate:       'bg-green-900 text-green-300',
  Technology:    'bg-indigo-900 text-indigo-300',
  Entertainment: 'bg-pink-900 text-pink-300',
};

function CategoryBadge({ cat }: { cat: string }) {
  const cls = CATEGORY_COLORS[cat] ?? 'bg-slate-700 text-slate-300';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{cat}</span>;
}

function SignalTag({ label }: { label: string }) {
  const cls = label === 'price'
    ? 'bg-emerald-900/60 text-emerald-300'
    : 'bg-amber-900/60 text-amber-300';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>;
}

function PriceDeltaCell({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-600">—</span>;
  const color = delta > 0 ? 'text-emerald-400' : 'text-red-400';
  return <span className={`font-semibold ${color}`}>{delta > 0 ? '+' : ''}{delta}¢</span>;
}

function VolCell({ contracts, usd, ratio }: { contracts: number; usd: number; ratio: number | null }) {
  if (contracts <= 0) return <span className="text-slate-600">—</span>;
  return (
    <span>
      <span className="text-amber-400 font-semibold">+{contracts.toLocaleString()}</span>
      <span className="text-slate-500 text-xs ml-1">(~${usd.toLocaleString()})</span>
      {ratio != null && ratio >= 3 && (
        <span className="ml-1 text-xs text-amber-300 font-bold">{ratio}×</span>
      )}
    </span>
  );
}

function AlertRow({ a }: { a: WhaleAlert }) {
  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <a
          href={`https://kalshi.com/markets/${a.ticker.split('-')[0]}#${a.ticker}`}
          target="_blank" rel="noreferrer"
          className="text-slate-200 text-sm hover:text-white hover:underline line-clamp-2 max-w-xs block"
        >
          {a.title}
        </a>
        <div className="text-slate-500 text-xs mt-0.5">{a.ticker}</div>
      </td>
      <td className="px-4 py-3"><CategoryBadge cat={a.category} /></td>
      <td className="px-4 py-3 text-right">
        <div className="text-slate-200 font-semibold">{a.yes_price}¢</div>
        <div className="text-slate-500 text-xs">was {a.prev_price}¢</div>
      </td>
      <td className="px-4 py-3 text-right"><PriceDeltaCell delta={a.price_delta} /></td>
      <td className="px-4 py-3 text-right">
        <VolCell contracts={a.vol_delta} usd={a.vol_delta_usd} ratio={a.spike_ratio} />
      </td>
      <td className="px-4 py-3 text-right text-xs text-slate-500">
        {a.baseline_avg > 0
          ? `baseline ${Math.round(a.baseline_avg)}/interval`
          : a.readings < 5 ? 'new market' : '—'}
      </td>
    </tr>
  );
}

function EventRow({ e }: { e: WhaleEvent }) {
  const when = new Date(e.detected_at);
  const isToday = when.toDateString() === new Date().toDateString();
  const label = isToday
    ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : when.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{label}</td>
      <td className="px-4 py-3">
        <a
          href={`https://kalshi.com/markets/${e.ticker.split('-')[0]}#${e.ticker}`}
          target="_blank" rel="noreferrer"
          className="text-slate-300 text-sm hover:text-white hover:underline line-clamp-1 max-w-xs block"
        >
          {e.title}
        </a>
        <div className="text-slate-600 text-xs">{e.ticker}</div>
      </td>
      <td className="px-4 py-3"><CategoryBadge cat={e.category} /></td>
      <td className="px-4 py-3 text-right">
        <span className="text-slate-300">{e.yes_price}¢</span>
        {e.price_delta !== 0 && (
          <span className={`ml-1 text-xs ${e.price_delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {e.price_delta > 0 ? '+' : ''}{e.price_delta}¢
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {e.vol_delta > 0 && (
          <span className="text-amber-400 text-sm">
            +{e.vol_delta.toLocaleString()}
            <span className="text-slate-500 text-xs ml-1">(~${e.vol_delta_usd.toLocaleString()})</span>
            {e.spike_ratio != null && <span className="ml-1 text-amber-300 font-bold text-xs">{e.spike_ratio}×</span>}
          </span>
        )}
        {e.vol_delta <= 0 && <span className="text-slate-600">—</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {(e.signals ?? []).map((s) => <SignalTag key={s} label={s} />)}
        </div>
      </td>
    </tr>
  );
}

export default async function WhalesPage() {
  let data;
  try {
    data = await getWhales();
  } catch {
    data = { alerts: [], events: [], last_snapshot: null, snapshot_count: 0, market_count: 0 };
  }

  const { alerts, events, last_snapshot, snapshot_count, market_count } = data;
  const hasData = snapshot_count >= 2;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Whale Hunter</h1>
          <p className="text-slate-500 text-sm mt-1">
            Sudden volume or price spikes across all Kalshi markets — possible informed/whale money
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 space-y-0.5">
          {last_snapshot
            ? <><div>Last scan: {new Date(last_snapshot).toLocaleTimeString()}</div>
               <div>{market_count.toLocaleString()} markets tracked · {snapshot_count} snapshots</div></>
            : <div>No snapshots yet — first scan runs within 30 min of deploy</div>}
        </div>
      </div>

      {/* Warming up */}
      {!hasData && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-6 text-center">
          <div className="text-amber-400 font-semibold mb-1">Warming up</div>
          <div className="text-slate-400 text-sm">
            Need at least 2 snapshots (30–60 min) to compute deltas.
            Currently have {snapshot_count} snapshot{snapshot_count !== 1 ? 's' : ''} of {market_count} markets.
          </div>
        </div>
      )}

      {/* Active spikes */}
      {hasData && (
        <div>
          <h2 className="text-base font-semibold mb-3">
            Active Spikes
            {alerts.length > 0 && (
              <span className="ml-2 text-xs bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
          </h2>
          {alerts.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-slate-500 text-sm">
              No spikes right now. Markets are quiet.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="px-4 py-3 font-medium">Market</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-right">Price Δ</th>
                    <th className="px-4 py-3 font-medium text-right">Volume Δ</th>
                    <th className="px-4 py-3 font-medium text-right">Baseline</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a) => <AlertRow key={a.ticker} a={a} />)}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Event history */}
      {events.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">
            Event History
            <span className="ml-2 text-xs text-slate-500 font-normal">last 48h</span>
          </h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">When</th>
                  <th className="px-4 py-3 font-medium">Market</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Price</th>
                  <th className="px-4 py-3 font-medium text-right">Volume Δ</th>
                  <th className="px-4 py-3 font-medium">Signals</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => <EventRow key={e.id} e={e} />)}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500 space-y-1">
        <div><span className="text-amber-300 font-semibold">Volume Δ</span> — contracts traded since last snapshot (~30 min window). Uses all-time cumulative volume, so the delta is always exact (no rolling-window noise).</div>
        <div><span className="text-amber-300 font-bold">3×</span> — spike ratio vs this market's 24h baseline. A market doing 10 contracts/interval suddenly doing 300 = 30× — much stronger signal than BTC going from 1000 to 1300.</div>
        <div><span className="text-emerald-400 font-semibold">Price Δ</span> — ask price moved ≥8¢ since last snapshot. Price movement with thin order books = large order pushing through.</div>
        <div>Event history persists whale events so you don't miss spikes when offline.</div>
      </div>
    </div>
  );
}

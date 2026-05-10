import { getWhales } from '@/lib/api';
import type { WhaleAlert } from '@/lib/api';

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
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{cat}</span>
  );
}

function PriceDelta({ delta }: { delta: number }) {
  if (delta === 0) return <span className="text-slate-500">—</span>;
  const color = delta > 0 ? 'text-emerald-400' : 'text-red-400';
  return <span className={`font-semibold ${color}`}>{delta > 0 ? '+' : ''}{delta}¢</span>;
}

function VolumeDelta({ contracts, usd }: { contracts: number; usd: number }) {
  if (contracts <= 0) return <span className="text-slate-500">—</span>;
  return (
    <span className="text-amber-400 font-semibold">
      +{contracts.toLocaleString()}
      <span className="text-slate-500 font-normal ml-1">(~${usd.toLocaleString()})</span>
    </span>
  );
}

function WhaleRow({ a }: { a: WhaleAlert }) {
  const isVolSpike  = a.vol_delta >= 100;
  const isPriceMove = Math.abs(a.price_delta) >= 8;

  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-start gap-2">
          <div>
            <div className="text-slate-200 text-sm leading-snug max-w-xs line-clamp-2">{a.title}</div>
            <div className="text-slate-500 text-xs mt-0.5">{a.ticker}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <CategoryBadge cat={a.category} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="text-slate-200 font-semibold">{a.yes_price}¢</div>
        <div className="text-slate-500 text-xs">was {a.prev_price}¢</div>
      </td>
      <td className="px-4 py-3 text-right">
        {isPriceMove
          ? <PriceDelta delta={a.price_delta} />
          : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {isVolSpike
          ? <VolumeDelta contracts={a.vol_delta} usd={a.vol_delta_usd} />
          : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex gap-1 justify-end">
          {isVolSpike  && <Tag label="Volume" color="amber" />}
          {isPriceMove && <Tag label="Price"  color={a.price_delta > 0 ? 'emerald' : 'red'} />}
        </div>
      </td>
    </tr>
  );
}

function Tag({ label, color }: { label: string; color: 'amber' | 'emerald' | 'red' }) {
  const cls = {
    amber:   'bg-amber-900/60  text-amber-300',
    emerald: 'bg-emerald-900/60 text-emerald-300',
    red:     'bg-red-900/60    text-red-300',
  }[color];
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{label}</span>;
}

export default async function WhalesPage() {
  let data;
  try {
    data = await getWhales();
  } catch {
    data = { alerts: [], last_snapshot: null, snapshot_count: 0 };
  }

  const { alerts, last_snapshot, snapshot_count } = data;

  const hasData = snapshot_count >= 2;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Whale Hunter</h1>
          <p className="text-slate-500 text-sm mt-1">
            Markets with sudden volume or price spikes — possible informed/whale money
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          {last_snapshot
            ? <>Last snapshot: {new Date(last_snapshot).toLocaleTimeString()}<br />{snapshot_count} snapshots</>
            : 'No snapshots yet'}
        </div>
      </div>

      {!hasData && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-6 text-center">
          <div className="text-amber-400 font-semibold mb-1">Warming up</div>
          <div className="text-slate-400 text-sm">
            The whale hunter snapshots markets every 15 minutes. Come back in ~30 minutes
            to see volume and price spike data. Currently have {snapshot_count} snapshot{snapshot_count !== 1 ? 's' : ''}.
          </div>
        </div>
      )}

      {hasData && alerts.length === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
          No significant spikes detected in the last hour. Markets are quiet.
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium text-right">Price</th>
                <th className="px-4 py-3 font-medium text-right">Price Δ</th>
                <th className="px-4 py-3 font-medium text-right">Volume Δ (1h)</th>
                <th className="px-4 py-3 font-medium text-right">Signal</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => <WhaleRow key={a.ticker} a={a} />)}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500 space-y-1">
        <div><span className="text-amber-400 font-semibold">Volume Δ</span> — contracts traded in the last ~1 hour. Est. $ = contracts × current price.</div>
        <div><span className="text-emerald-400 font-semibold">Price Δ</span> — price moved ≥8¢ since last hour. Big moves on low volume = order book thin.</div>
        <div>Both signals together = strong whale indicator (large informed bet moving the market).</div>
      </div>
    </div>
  );
}

import { getWhales } from '@/lib/api';
import type { WhaleAlert, WhaleEvent } from '@/lib/api';
import { WhaleRefresher } from '@/components/WhaleRefresher';

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

const SIGNAL_STYLES: Record<string, string> = {
  volume:          'bg-amber-900/60 text-amber-300',
  price:           'bg-emerald-900/60 text-emerald-300',
  'open-interest': 'bg-teal-900/60 text-teal-300',
  momentum:        'bg-orange-900/60 text-orange-300',
  'ai-match':      'bg-violet-900/60 text-violet-300',
};

function CategoryBadge({ cat }: { cat: string }) {
  const cls = CATEGORY_COLORS[cat] ?? 'bg-slate-700 text-slate-300';
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{cat}</span>;
}

const SIGNAL_LABELS: Record<string, string> = {
  'ai-match':      'AI ✓',
  'open-interest': 'OI spike',
};

function SignalTag({ label }: { label: string }) {
  const cls = SIGNAL_STYLES[label] ?? 'bg-slate-700/60 text-slate-300';
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{SIGNAL_LABELS[label] ?? label}</span>;
}

function AlertRow({ a }: { a: WhaleAlert }) {
  const hasRec     = a.rec_side != null;
  const hasMomentum = a.momentum_move != null;
  const rowBg = hasRec
    ? 'border-b border-violet-900/40 bg-violet-950/20 hover:bg-violet-950/30'
    : 'border-b border-slate-800/50 hover:bg-slate-800/30';

  const signals: string[] = [];
  if (a.vol_delta > 0 && (a.spike_ratio == null || a.spike_ratio >= 3)) signals.push('volume');
  if (Math.abs(a.price_delta) >= 8)                                       signals.push('price');
  if (a.oi_delta > 0 && a.oi_spike_ratio != null && a.oi_spike_ratio >= 3) signals.push('open-interest');
  if (hasMomentum)                                                          signals.push('momentum');
  if (hasRec)                                                               signals.push('ai-match');
  if (signals.length === 0)                                                 signals.push('volume');

  return (
    <tr className={`transition-colors ${rowBg}`}>
      <td className="px-4 py-3">
        <a
          href={`https://kalshi.com/markets/${a.ticker.split('-')[0]}#${a.ticker}`}
          target="_blank" rel="noreferrer"
          className="text-slate-200 text-sm hover:text-white hover:underline line-clamp-2 max-w-xs block leading-snug"
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
      <td className="px-4 py-3 text-right">
        {a.price_delta !== 0
          ? <span className={`font-semibold ${a.price_delta > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {a.price_delta > 0 ? '+' : ''}{a.price_delta}¢
            </span>
          : <span className="text-slate-600">—</span>}
        {hasMomentum && (
          <div className="text-xs text-orange-400 mt-0.5">
            {a.momentum_move! > 0 ? '+' : ''}{a.momentum_move}¢ trend
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {a.vol_delta > 0 ? (
          <div>
            <span className="text-amber-400 font-semibold">+{a.vol_delta.toLocaleString()}</span>
            <span className="text-slate-500 text-xs ml-1">(~${a.vol_delta_usd.toLocaleString()})</span>
            {a.spike_ratio != null && a.spike_ratio >= 3 && (
              <div className="text-xs text-amber-300 font-bold">{a.spike_ratio}× vol</div>
            )}
          </div>
        ) : <span className="text-slate-600">—</span>}
        {a.oi_delta > 0 && a.oi_spike_ratio != null && a.oi_spike_ratio >= 3 && (
          <div className="text-teal-400 text-xs mt-0.5">
            +{a.oi_delta.toLocaleString()} OI <span className="text-teal-300 font-bold">{a.oi_spike_ratio}×</span>
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        {hasRec && (
          <div className="text-xs text-violet-300 mb-1 font-medium">
            {a.rec_side!.toUpperCase()} · {a.rec_edge}% edge · {a.rec_confidence}
          </div>
        )}
        <div className="flex gap-1 flex-wrap">
          {signals.map((s) => <SignalTag key={s} label={s} />)}
        </div>
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

  const hasAiMatch = (e.signals ?? []).includes('ai-match');

  return (
    <tr className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${hasAiMatch ? 'bg-violet-950/20' : ''}`}>
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
        {e.vol_delta > 0 ? (
          <span className="text-amber-400 text-sm">
            +{e.vol_delta.toLocaleString()}
            <span className="text-slate-500 text-xs ml-1">(~${e.vol_delta_usd.toLocaleString()})</span>
            {e.spike_ratio != null && <span className="ml-1 text-amber-300 font-bold text-xs">{e.spike_ratio}×</span>}
          </span>
        ) : <span className="text-slate-600">—</span>}
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
            Volume spikes · Price momentum · AI confirmation — across all Kalshi markets
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <WhaleRefresher intervalSeconds={60} />
          <div className="text-xs text-slate-600">
            {last_snapshot
              ? `${market_count.toLocaleString()} markets · ${snapshot_count} snapshots · last ${new Date(last_snapshot).toLocaleTimeString()}`
              : 'No snapshots yet'}
          </div>
        </div>
      </div>

      {/* Warming up */}
      {!hasData && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-6 text-center">
          <div className="text-amber-400 font-semibold mb-1">Warming up</div>
          <div className="text-slate-400 text-sm">
            Need 2+ snapshots (30–60 min) to compute deltas.
            Currently have {snapshot_count} of {market_count} markets tracked.
          </div>
        </div>
      )}

      {/* Active spikes */}
      {hasData && (
        <div>
          <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
            Active Spikes
            {alerts.length > 0 && (
              <span className="text-xs bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded-full">
                {alerts.length}
              </span>
            )}
            {alerts.some((a) => a.rec_side != null) && (
              <span className="text-xs bg-violet-900/60 text-violet-300 px-2 py-0.5 rounded-full">
                {alerts.filter((a) => a.rec_side != null).length} AI match
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
                    <th className="px-4 py-3 font-medium">Signals</th>
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-500 space-y-1.5">
        <div><span className="text-amber-300 font-semibold">volume</span> — contracts spiked 3× above this market's 24h baseline. Ratio shown (e.g. 12×).</div>
        <div><span className="text-emerald-300 font-semibold">price</span> — ask price moved ≥8¢ in the last snapshot window.</div>
        <div><span className="text-orange-300 font-semibold">momentum</span> — price moved same direction for 3+ consecutive intervals over the last 4 hours. Stronger conviction than a single-snapshot spike.</div>
        <div><span className="text-teal-300 font-semibold">OI spike</span> — open interest jumped 3× baseline. New contracts being created = new money entering, not just existing holders trading with each other. Volume spike alone could be recycling; volume + OI together means real position buildup.</div>
        <div><span className="text-violet-300 font-semibold">AI ✓</span> — your AI has a pending high/medium confidence recommendation on this market. Whale + AI agreeing is the strongest signal.</div>
        <div className="text-slate-600 pt-1">Email alerts fire for spike_ratio ≥5×, AI matches, or momentum+price together. Set RESEND_API_KEY + ALERT_EMAIL in Railway to enable.</div>
      </div>
    </div>
  );
}

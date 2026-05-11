import { getBets, getPnlSummary, getBetsByCategory, getCalibration, getBankroll, getKalshiBalance, getAutoBetSettings } from '@/lib/api';
import { EditBetButton } from '@/components/EditBetButton';
import { DeleteBetButton } from '@/components/DeleteBetButton';
import { CalibrationChart } from '@/components/CalibrationChart';
import { BankrollEditor } from '@/components/BankrollEditor';
import { SyncKalshiButton } from '@/components/SyncKalshiButton';
import { AutoBetSettings } from '@/components/AutoBetSettings';
import { CancelBetButton } from '@/components/CancelBetButton';

export const dynamic = 'force-dynamic';

function kalshiPnl(amount: number, fillPrice: number): number {
  if (amount <= 0 || fillPrice <= 0 || fillPrice >= 100) return 0;
  const contracts = Math.floor((amount / (fillPrice / 100)) * 100) / 100;
  const grossProfit = contracts - amount;
  const fee = Math.max(0, grossProfit) * 0.07;
  return Math.round((grossProfit - fee) * 100) / 100;
}

export default async function PnlPage() {
  const [summary, bets, byCategory, calibration, bankroll, kalshiBalance, autoBetSettings] = await Promise.all([
    getPnlSummary().catch(() => null),
    getBets().catch(() => []),
    getBetsByCategory().catch(() => []),
    getCalibration().catch(() => []),
    getBankroll().catch(() => null),
    getKalshiBalance(),
    getAutoBetSettings().catch(() => null),
  ]);

  const activeBets = bets.filter((b) => b.outcome !== 'cancelled');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">P&amp;L</h1>
        <SyncKalshiButton />
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        {bankroll && <BankrollEditor bankroll={bankroll} />}
      {autoBetSettings && <AutoBetSettings initial={autoBetSettings} />}
        <div className="md:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4">
        {kalshiBalance != null && (
          <StatCard label="Kalshi Cash" value={`$${kalshiBalance.cash.toFixed(2)}`} />
        )}
        {kalshiBalance != null && (
          <StatCard label="Portfolio Value" value={`$${kalshiBalance.portfolio_value.toFixed(2)}`} color="emerald" />
        )}
        <StatCard
          label="Total Wagered"
          value={summary ? `$${summary.total_wagered.toFixed(2)}` : '—'}
        />
        <StatCard
          label="Total P&L"
          value={summary ? formatPnl(summary.total_pnl) : '—'}
          color={summary ? (summary.total_pnl >= 0 ? 'emerald' : 'red') : undefined}
        />
        <StatCard
          label="Win Rate"
          value={summary?.win_rate != null ? `${summary.win_rate}%` : '—'}
        />
        <StatCard
          label="ROI"
          value={summary?.roi != null ? `${summary.roi > 0 ? '+' : ''}${summary.roi}%` : '—'}
          color={summary?.roi != null ? (summary.roi >= 0 ? 'emerald' : 'red') : undefined}
        />
        </div>
      </div>

      {byCategory.length > 0 && (
        <div>
          <h2 className="text-base font-semibold mb-3">By Category</h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium text-right">Bets</th>
                  <th className="px-4 py-3 font-medium text-right">Wagered</th>
                  <th className="px-4 py-3 font-medium text-right">P&amp;L</th>
                  <th className="px-4 py-3 font-medium text-right">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((cat) => (
                  <tr key={cat.category} className="border-b border-slate-800/50">
                    <td className="px-4 py-3 text-slate-200">{cat.category}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{cat.total_bets}</td>
                    <td className="px-4 py-3 text-right text-slate-400">${(cat.total_wagered ?? 0).toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${(cat.total_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatPnl(cat.total_pnl ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {cat.win_rate != null ? `${cat.win_rate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <CalibrationChart data={calibration} />

      <div className="grid grid-cols-3 gap-4">
        <MiniStat label="Total Bets" value={summary?.total_bets ?? '—'} />
        <MiniStat label="Pending" value={summary?.pending_bets ?? '—'} />
        <MiniStat
          label="Resolved"
          value={summary ? summary.total_bets - summary.pending_bets : '—'}
        />
      </div>

      {activeBets.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
          No bets recorded yet. Click &ldquo;+ Record Bet&rdquo; on any recommendation.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Side</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
                <th className="px-4 py-3 font-medium text-right">Fill</th>
                <th className="px-4 py-3 font-medium text-right">If Wins</th>
                <th className="px-4 py-3 font-medium text-center">Status</th>
                <th className="px-4 py-3 font-medium text-right">P&amp;L</th>
                <th className="px-4 py-3 font-medium text-right">Placed</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {activeBets.map((b) => {
                const expectedWin = kalshiPnl(b.amount, b.fill_price);
                const pnlColor =
                  b.outcome === 'won' ? 'text-emerald-400'
                  : b.outcome === 'lost' ? 'text-red-400'
                  : 'text-slate-500';

                return (
                  <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 text-slate-200 max-w-xs">
                      <span className="line-clamp-1">{b.market_title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.side === 'yes' ? 'bg-blue-900 text-blue-300' : 'bg-purple-900 text-purple-300'
                      }`}>
                        {b.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300">${(b.amount ?? 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{b.fill_price}¢</td>
                    <td className="px-4 py-3 text-right text-slate-400">+${expectedWin.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center">
                      <OutcomeBadge outcome={b.outcome} />
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${pnlColor}`}>
                      {b.pnl != null ? formatPnl(b.pnl) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {new Date(b.placed_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="flex items-center justify-end gap-3">
                        <EditBetButton bet={b} />
                        {b.outcome === 'pending' && <CancelBetButton id={b.id} />}
                        <DeleteBetButton id={b.id} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function formatPnl(pnl: number): string {
  if (pnl === 0) return '$0.00';
  return pnl > 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-300',
    won: 'bg-emerald-900 text-emerald-300',
    lost: 'bg-red-900 text-red-300',
    cancelled: 'bg-slate-800 text-slate-500',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[outcome] ?? styles.pending}`}>
      {outcome}
    </span>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: 'emerald' | 'red';
}) {
  const textColor = color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : '';
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-3 flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

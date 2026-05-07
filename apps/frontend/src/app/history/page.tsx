import { getRecommendations } from '@/lib/api';

export const revalidate = 60;

const outcomeStyle = {
  won: 'text-emerald-400',
  lost: 'text-red-400',
  cancelled: 'text-slate-500',
};

export default async function HistoryPage() {
  const [won, lost, cancelled] = await Promise.all([
    getRecommendations('won').catch(() => []),
    getRecommendations('lost').catch(() => []),
    getRecommendations('cancelled').catch(() => []),
  ]);

  const all = [...won, ...lost, ...cancelled].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const winRate = won.length + lost.length > 0
    ? Math.round((won.length / (won.length + lost.length)) * 100)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">History</h1>
        <div className="text-sm text-slate-400">
          {winRate != null ? `Win rate: ${winRate}%` : 'No resolved bets yet'}
          {' · '}
          {won.length}W / {lost.length}L
        </div>
      </div>

      {all.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-500">
          No resolved recommendations yet.
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-slate-500 text-xs">
                <th className="text-left p-4">Market</th>
                <th className="text-center p-4">Side</th>
                <th className="text-center p-4">Edge</th>
                <th className="text-center p-4">Bet</th>
                <th className="text-center p-4">Confidence</th>
                <th className="text-center p-4">Outcome</th>
                <th className="text-right p-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {all.map((r) => (
                <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="p-4 max-w-xs">
                    <a href={`/markets/${r.market_ticker}`} className="text-slate-200 hover:text-white line-clamp-1">
                      {r.market_title}
                    </a>
                  </td>
                  <td className="p-4 text-center font-medium">{r.side.toUpperCase()}</td>
                  <td className="p-4 text-center text-emerald-400">{r.edge}%</td>
                  <td className="p-4 text-center">${r.recommended_bet.toFixed(2)}</td>
                  <td className="p-4 text-center capitalize">{r.confidence}</td>
                  <td className={`p-4 text-center font-semibold capitalize ${outcomeStyle[r.outcome as keyof typeof outcomeStyle]}`}>
                    {r.outcome}
                  </td>
                  <td className="p-4 text-right text-slate-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

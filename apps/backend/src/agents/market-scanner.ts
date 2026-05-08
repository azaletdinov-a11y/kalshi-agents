import { getOpenMarkets, parsePrice, KalshiMarketRaw } from '../lib/kalshi';
import { db } from '../db/client';

const MIN_VOLUME = 10;
const MIN_DAYS_TO_CLOSE = 1;
const MAX_DAYS_TO_CLOSE = 90;
const MIN_PRICE = 5;
const MAX_PRICE = 95;

// Sports/parlay ticker series — multi-leg bets not suitable for single-outcome analysis
const BLOCKED_PREFIXES = [
  'KXMVE', 'KXMLB', 'KXMNBA', 'KXMNFL', 'KXMNHL', 'KXMSO',
  'KXSOC', 'KXTEN', 'KXGOLF', 'KXNASCAR', 'KXMMA', 'KXBOXING',
  'KXOLY', 'KXWWE',
];

// Sports title keywords that indicate non-analytical markets
const BLOCKED_TITLE_WORDS = [
  'MVP', 'Cy Young', 'Heisman', 'Super Bowl', 'Stanley Cup', 'NBA Finals',
  'World Series', 'World Cup', 'Champions League', 'Premier League',
  'touchdown', 'home run', 'hat trick', 'grand slam', 'hole-in-one',
  'NASCAR', 'Formula 1', 'F1', 'UFC', 'boxing match',
];

export async function scanMarkets(): Promise<KalshiMarketRaw[]> {
  console.log('[Scanner] Fetching open markets from Kalshi...');
  const all = await getOpenMarkets(5000);

  const now = Date.now();
  const filtered = all.filter((m) => {
    if (!m.close_time) return false;
    // Exclude all multi-leg parlay markets (dynamically generated, not analytically tractable)
    if (m.mve_collection_ticker) return false;

    const daysToClose = (new Date(m.close_time).getTime() - now) / (1000 * 60 * 60 * 24);
    const volume = parseFloat(m.volume_fp ?? '0');
    const yesAsk = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    const hasLiquidity = parseFloat(m.yes_ask_dollars ?? '0') > 0 || parseFloat(m.no_bid_dollars ?? '0') > 0;
    const isBlockedTicker = BLOCKED_PREFIXES.some((p) => m.ticker.startsWith(p));
    const isBlockedTitle = BLOCKED_TITLE_WORDS.some((w) => m.title.toLowerCase().includes(w.toLowerCase()));

    return (
      !isBlockedTicker &&
      !isBlockedTitle &&
      volume >= MIN_VOLUME &&
      daysToClose >= MIN_DAYS_TO_CLOSE &&
      daysToClose <= MAX_DAYS_TO_CLOSE &&
      yesAsk >= MIN_PRICE &&
      yesAsk <= MAX_PRICE &&
      hasLiquidity
    );
  });

  filtered.sort((a, b) => parseFloat(b.volume_24h_fp ?? '0') - parseFloat(a.volume_24h_fp ?? '0'));

  const candidates = filtered.slice(0, 30);
  const categoryBreakdown = candidates.reduce<Record<string, number>>((acc, m) => {
    const c = m.category ?? 'Unknown';
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[Scanner] ${all.length} fetched → ${filtered.length} after filters → ${candidates.length} candidates`);
  candidates.forEach((m) => console.log(`[Scanner]  · ${m.ticker}: ${m.title}`));

  for (const m of candidates) {
    const yesAsk = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    const yesBid = parsePrice(m.yes_bid_dollars);
    const price = yesBid > 0 ? Math.round((yesBid + yesAsk) / 2) : yesAsk;
    const volume = Math.round(parseFloat(m.volume_fp ?? '0'));
    const volume24h = Math.round(parseFloat(m.volume_24h_fp ?? '0'));

    await db.query(
      `INSERT INTO markets (ticker, title, category, yes_price, volume, volume_24h, close_time, scanned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (ticker) DO UPDATE SET
         yes_price = EXCLUDED.yes_price, volume = EXCLUDED.volume,
         volume_24h = EXCLUDED.volume_24h, scanned_at = NOW()`,
      [m.ticker, m.title, m.category ?? 'Unknown', price, volume, volume24h, m.close_time]
    );
  }

  return candidates;
}

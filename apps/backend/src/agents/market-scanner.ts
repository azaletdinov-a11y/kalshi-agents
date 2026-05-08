import { getOpenMarkets, parsePrice, KalshiMarketRaw } from '../lib/kalshi';
import { db } from '../db/client';

const MIN_VOLUME = 10;
const MIN_DAYS_TO_CLOSE = 1;
const MAX_DAYS_TO_CLOSE = 90;
const MIN_PRICE = 5;
const MAX_PRICE = 95;

export async function scanMarkets(): Promise<KalshiMarketRaw[]> {
  console.log('[Scanner] Fetching open markets from Kalshi...');
  const all = await getOpenMarkets(500);

  const now = Date.now();
  const filtered = all.filter((m) => {
    if (!m.close_time) return false;
    const daysToClose = (new Date(m.close_time).getTime() - now) / (1000 * 60 * 60 * 24);
    const volume = parseFloat(m.volume_fp ?? '0');

    // Derive YES ask price: prefer yes_ask_dollars, fall back to (1 - no_bid)
    const yesAsk = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    const hasLiquidity = parseFloat(m.yes_ask_dollars ?? '0') > 0 || parseFloat(m.no_bid_dollars ?? '0') > 0;

    return (
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
  console.log(`[Scanner] ${all.length} markets fetched, ${candidates.length} candidates selected`);

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

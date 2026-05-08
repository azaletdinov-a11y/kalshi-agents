import { getOpenMarkets, KalshiMarketRaw } from '../lib/kalshi';
import { db } from '../db/client';

const MIN_VOLUME = 100;
const MIN_DAYS_TO_CLOSE = 1;
const MAX_DAYS_TO_CLOSE = 90;
const MIN_PRICE = 5;   // skip near-certain outcomes
const MAX_PRICE = 95;

export async function scanMarkets(): Promise<KalshiMarketRaw[]> {
  console.log('[Scanner] Fetching open markets from Kalshi...');
  const all = await getOpenMarkets(500);

  if (all.length > 0) {
    console.log('[Scanner] Sample market fields:', JSON.stringify(all[0], null, 2));
  }

  const now = Date.now();
  const filtered = all.filter((m) => {
    if (!m.close_time) return false;
    const closeMs = new Date(m.close_time).getTime();
    const daysToClose = (closeMs - now) / (1000 * 60 * 60 * 24);
    const price = m.last_price ?? m.yes_ask;

    return (
      m.volume >= MIN_VOLUME &&
      daysToClose >= MIN_DAYS_TO_CLOSE &&
      daysToClose <= MAX_DAYS_TO_CLOSE &&
      price >= MIN_PRICE &&
      price <= MAX_PRICE &&
      m.yes_bid > 0 &&
      m.yes_ask > 0
    );
  });

  // Sort by 24h volume descending — more liquid = more reliable price signal
  filtered.sort((a, b) => (b.volume_24h ?? 0) - (a.volume_24h ?? 0));

  const candidates = filtered.slice(0, 30);
  console.log(`[Scanner] ${all.length} markets fetched, ${candidates.length} candidates selected`);

  // Persist scanned markets
  for (const m of candidates) {
    const price = m.last_price ?? Math.round((m.yes_bid + m.yes_ask) / 2);
    await db.query(
      `INSERT INTO markets (ticker, title, category, yes_price, volume, volume_24h, close_time, scanned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (ticker) DO UPDATE SET
         yes_price = EXCLUDED.yes_price,
         volume = EXCLUDED.volume,
         volume_24h = EXCLUDED.volume_24h,
         scanned_at = NOW()`,
      [m.ticker, m.title, m.category ?? 'Unknown', price, m.volume, m.volume_24h ?? 0, m.close_time]
    );
  }

  return candidates;
}

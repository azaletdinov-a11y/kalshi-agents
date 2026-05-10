import { getOpenMarkets, parsePrice } from '../lib/kalshi';
import { inferCategory } from './market-scanner';
import { db } from '../db/client';

export async function snapshotMarkets(): Promise<number> {
  const markets = await getOpenMarkets(500);
  if (markets.length === 0) return 0;

  const tickers: string[] = [];
  const titles: string[] = [];
  const categories: string[] = [];
  const prices: number[] = [];
  const vols: number[] = [];

  for (const m of markets) {
    const yesPrice = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    if (yesPrice <= 0 || yesPrice >= 100) continue;
    const vol24h = Math.round(parseFloat(m.volume_24h_fp ?? '0'));
    tickers.push(m.ticker);
    titles.push(m.title);
    categories.push(m.category ?? inferCategory(m.ticker));
    prices.push(yesPrice);
    vols.push(vol24h);
  }

  await db.query(
    `INSERT INTO market_snapshots (ticker, title, category, yes_price, volume_24h)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::bigint[])`,
    [tickers, titles, categories, prices, vols]
  );

  // Keep only 48h of history
  await db.query(`DELETE FROM market_snapshots WHERE captured_at < NOW() - INTERVAL '48 hours'`);

  console.log(`[WhaleHunter] Snapshotted ${tickers.length} markets`);
  return tickers.length;
}

export interface WhaleAlert {
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  volume_24h: number;
  prev_vol24h: number;
  vol_delta: number;
  vol_delta_usd: number;  // approximate dollar value of new contracts
  captured_at: string;
}

export async function getWhaleAlerts(minVolDelta = 100, minPriceDelta = 8): Promise<WhaleAlert[]> {
  const result = await db.query<WhaleAlert & { vol_delta: number; prev_vol24h: number }>(`
    WITH latest AS (
      SELECT DISTINCT ON (ticker)
             ticker, title, category, yes_price, volume_24h, captured_at
      FROM market_snapshots
      ORDER BY ticker, captured_at DESC
    ),
    prev AS (
      SELECT DISTINCT ON (ticker)
             ticker,
             yes_price  AS prev_price,
             volume_24h AS prev_vol24h
      FROM market_snapshots
      WHERE captured_at BETWEEN NOW() - INTERVAL '75 minutes'
                             AND NOW() - INTERVAL '20 minutes'
      ORDER BY ticker, captured_at DESC
    )
    SELECT
      l.ticker, l.title, l.category,
      l.yes_price, p.prev_price,
      (l.yes_price - p.prev_price)    AS price_delta,
      l.volume_24h, p.prev_vol24h,
      (l.volume_24h - p.prev_vol24h)  AS vol_delta,
      ROUND(
        (l.volume_24h - p.prev_vol24h) * l.yes_price::numeric / 100
      )::int                           AS vol_delta_usd,
      l.captured_at
    FROM latest l
    JOIN prev p ON l.ticker = p.ticker
    WHERE (l.volume_24h - p.prev_vol24h) >= $1
       OR ABS(l.yes_price - p.prev_price) >= $2
    ORDER BY (l.volume_24h - p.prev_vol24h) DESC NULLS LAST,
             ABS(l.yes_price - p.prev_price) DESC
    LIMIT 50
  `, [minVolDelta, minPriceDelta]);

  return result.rows.map((r) => ({
    ...r,
    yes_price:     Number(r.yes_price),
    prev_price:    Number(r.prev_price),
    price_delta:   Number(r.price_delta),
    volume_24h:    Number(r.volume_24h),
    prev_vol24h:   Number(r.prev_vol24h),
    vol_delta:     Number(r.vol_delta),
    vol_delta_usd: Number(r.vol_delta_usd),
  }));
}

import { getOpenMarkets, parsePrice } from '../lib/kalshi';
import { inferCategory } from './market-scanner';
import { db } from '../db/client';

// Fetch ALL open markets every sweep for full coverage (Iran-style events live in obscure tickers)
const SNAPSHOT_LIMIT = 5000;

export async function snapshotMarkets(): Promise<number> {
  const markets = await getOpenMarkets(SNAPSHOT_LIMIT);
  if (markets.length === 0) return 0;

  const tickers: string[]  = [];
  const titles: string[]   = [];
  const cats: string[]     = [];
  const prices: number[]   = [];
  const volAll: number[]   = [];  // volume_fp: all-time cumulative, monotonically increasing
  const vol24h: number[]   = [];  // volume_24h_fp: kept for reference only

  for (const m of markets) {
    const yesPrice = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    if (yesPrice <= 0 || yesPrice >= 100) continue;
    tickers.push(m.ticker);
    titles.push(m.title);
    cats.push(m.category ?? inferCategory(m.ticker));
    prices.push(yesPrice);
    volAll.push(Math.round(parseFloat(m.volume_fp    ?? '0')));
    vol24h.push(Math.round(parseFloat(m.volume_24h_fp ?? '0')));
  }

  await db.query(
    `INSERT INTO market_snapshots (ticker, title, category, yes_price, volume_all, volume_24h)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::bigint[], $6::bigint[])`,
    [tickers, titles, cats, prices, volAll, vol24h]
  );

  await db.query(`DELETE FROM market_snapshots WHERE captured_at < NOW() - INTERVAL '48 hours'`);

  console.log(`[WhaleHunter] Snapshotted ${tickers.length} markets`);

  const persisted = await persistNewEvents();
  if (persisted > 0) console.log(`[WhaleHunter] Persisted ${persisted} new whale event(s)`);

  return tickers.length;
}

// ─── Detection ───────────────────────────────────────────────────────────────

export interface WhaleAlert {
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  vol_delta: number;       // contracts traded since last snapshot
  vol_delta_usd: number;   // estimated $ value
  baseline_avg: number;    // average contracts/interval over last 24h
  spike_ratio: number | null; // vol_delta / baseline_avg (null if insufficient history)
  readings: number;        // how many baseline data points we have
  captured_at: string;
}

export async function getWhaleAlerts(minAbsVol = 50, minPriceDelta = 8): Promise<WhaleAlert[]> {
  const result = await db.query(`
    WITH intervals AS (
      SELECT
        ticker, title, category, yes_price, volume_all, captured_at,
        GREATEST(
          volume_all - LAG(volume_all) OVER (PARTITION BY ticker ORDER BY captured_at),
          0
        )                                                                        AS vol_interval,
        yes_price - LAG(yes_price) OVER (PARTITION BY ticker ORDER BY captured_at) AS price_interval
      FROM market_snapshots
      WHERE captured_at >= NOW() - INTERVAL '26 hours'
    ),
    baseline AS (
      SELECT
        ticker,
        AVG(NULLIF(vol_interval, 0))                          AS avg_vol,
        COUNT(*) FILTER (WHERE vol_interval > 0)              AS active_readings
      FROM intervals
      WHERE vol_interval IS NOT NULL
        AND captured_at < NOW() - INTERVAL '25 minutes'
      GROUP BY ticker
    ),
    latest AS (
      SELECT DISTINCT ON (ticker)
        ticker, title, category, yes_price, vol_interval, price_interval, captured_at
      FROM intervals
      WHERE vol_interval IS NOT NULL OR price_interval IS NOT NULL
      ORDER BY ticker, captured_at DESC
    )
    SELECT
      l.ticker, l.title, l.category,
      l.yes_price,
      (l.yes_price - COALESCE(l.price_interval, 0))           AS prev_price,
      COALESCE(l.price_interval, 0)                           AS price_delta,
      COALESCE(l.vol_interval, 0)                             AS vol_delta,
      ROUND(COALESCE(l.vol_interval,0) * l.yes_price::numeric / 100)::int AS vol_delta_usd,
      COALESCE(ROUND(b.avg_vol)::bigint, 0)                   AS baseline_avg,
      COALESCE(b.active_readings, 0)                          AS readings,
      CASE WHEN COALESCE(b.avg_vol, 0) > 1
           THEN ROUND(l.vol_interval::numeric / b.avg_vol, 1)
           ELSE NULL
      END                                                      AS spike_ratio,
      l.captured_at
    FROM latest l
    LEFT JOIN baseline b ON l.ticker = b.ticker
    WHERE (
      -- Normalized spike: current interval is 3× the market's baseline activity
      (COALESCE(l.vol_interval, 0) > 0
        AND COALESCE(b.avg_vol, 0) > 1
        AND l.vol_interval > 3 * b.avg_vol
        AND l.vol_interval >= 10)
      -- Fallback absolute threshold for markets we've just started tracking
      OR (COALESCE(l.vol_interval, 0) >= $1
        AND COALESCE(b.active_readings, 0) < 5)
      -- Price spike (informed money moving the book)
      OR ABS(COALESCE(l.price_interval, 0)) >= $2
    )
    ORDER BY
      CASE WHEN COALESCE(b.avg_vol, 0) > 1
           THEN l.vol_interval::float / b.avg_vol ELSE 0 END DESC,
      COALESCE(l.vol_interval, 0) DESC
    LIMIT 50
  `, [minAbsVol, minPriceDelta]);

  return result.rows.map((r) => ({
    ticker:       r.ticker,
    title:        r.title,
    category:     r.category,
    yes_price:    Number(r.yes_price),
    prev_price:   Number(r.prev_price),
    price_delta:  Number(r.price_delta),
    vol_delta:    Number(r.vol_delta),
    vol_delta_usd: Number(r.vol_delta_usd),
    baseline_avg: Number(r.baseline_avg),
    spike_ratio:  r.spike_ratio != null ? Number(r.spike_ratio) : null,
    readings:     Number(r.readings),
    captured_at:  r.captured_at,
  }));
}

// ─── Event persistence ────────────────────────────────────────────────────────

export interface WhaleEvent {
  id: number;
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  vol_delta: number;
  vol_delta_usd: number;
  spike_ratio: number | null;
  signals: string[];
  detected_at: string;
}

async function persistNewEvents(): Promise<number> {
  const alerts = await getWhaleAlerts();
  let count = 0;

  for (const a of alerts) {
    const signals: string[] = [];
    if (a.vol_delta > 0 && (a.spike_ratio == null || a.spike_ratio >= 3)) signals.push('volume');
    if (Math.abs(a.price_delta) >= 8) signals.push('price');
    if (signals.length === 0) signals.push('volume');

    const res = await db.query(
      `INSERT INTO whale_events
         (ticker, title, category, yes_price, prev_price, price_delta,
          vol_delta, vol_delta_usd, spike_ratio, signals)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       WHERE NOT EXISTS (
         SELECT 1 FROM whale_events
         WHERE ticker = $1
           AND detected_at >= NOW() - INTERVAL '30 minutes'
       )`,
      [a.ticker, a.title, a.category, a.yes_price, a.prev_price, a.price_delta,
       a.vol_delta, a.vol_delta_usd, a.spike_ratio, signals]
    );
    if ((res.rowCount ?? 0) > 0) count++;
  }

  // Retain 7 days of history
  await db.query(`DELETE FROM whale_events WHERE detected_at < NOW() - INTERVAL '7 days'`);
  return count;
}

export async function getWhaleEventHistory(hours = 48): Promise<WhaleEvent[]> {
  const result = await db.query(
    `SELECT id, ticker, title, category, yes_price, prev_price, price_delta,
            vol_delta, vol_delta_usd, spike_ratio, signals, detected_at
     FROM whale_events
     WHERE detected_at >= NOW() - ($1 * INTERVAL '1 hour')
     ORDER BY detected_at DESC
     LIMIT 200`,
    [hours]
  );

  return result.rows.map((r) => ({
    id:           r.id,
    ticker:       r.ticker,
    title:        r.title,
    category:     r.category,
    yes_price:    Number(r.yes_price),
    prev_price:   Number(r.prev_price),
    price_delta:  Number(r.price_delta),
    vol_delta:    Number(r.vol_delta),
    vol_delta_usd: Number(r.vol_delta_usd),
    spike_ratio:  r.spike_ratio != null ? Number(r.spike_ratio) : null,
    signals:      r.signals ?? [],
    detected_at:  r.detected_at,
  }));
}

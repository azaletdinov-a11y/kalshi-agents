import { getOpenMarkets, parsePrice } from '../lib/kalshi';
import { inferCategory } from './market-scanner';
import { db } from '../db/client';
import { sendWhaleAlertEmail } from '../lib/email';

const SNAPSHOT_LIMIT = 5000;

export async function snapshotMarkets(): Promise<number> {
  const markets = await getOpenMarkets(SNAPSHOT_LIMIT);
  if (markets.length === 0) return 0;

  const tickers: string[]  = [];
  const titles: string[]   = [];
  const cats: string[]     = [];
  const prices: number[]   = [];
  const volAll: number[]   = [];
  const vol24h: number[]   = [];
  const oi: number[]       = [];

  for (const m of markets) {
    const yesPrice = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    if (yesPrice <= 0 || yesPrice >= 100) continue;
    tickers.push(m.ticker);
    titles.push(m.title);
    cats.push(m.category ?? inferCategory(m.ticker));
    prices.push(yesPrice);
    volAll.push(Math.round(parseFloat(m.volume_fp       ?? '0')));
    vol24h.push(Math.round(parseFloat(m.volume_24h_fp   ?? '0')));
    oi.push(Math.round(parseFloat(m.open_interest_fp    ?? '0')));
  }

  await db.query(
    `INSERT INTO market_snapshots (ticker, title, category, yes_price, volume_all, volume_24h, open_interest)
     SELECT * FROM UNNEST($1::text[], $2::text[], $3::text[], $4::int[], $5::bigint[], $6::bigint[], $7::bigint[])`,
    [tickers, titles, cats, prices, volAll, vol24h, oi]
  );

  await db.query(`DELETE FROM market_snapshots WHERE captured_at < NOW() - INTERVAL '48 hours'`);

  console.log(`[WhaleHunter] Snapshotted ${tickers.length} markets`);

  const persisted = await persistNewEvents();
  if (persisted > 0) console.log(`[WhaleHunter] Persisted ${persisted} new whale event(s)`);

  return tickers.length;
}

// ─── Detection ────────────────────────────────────────────────────────────────

export interface WhaleAlert {
  ticker: string;
  title: string;
  category: string;
  yes_price: number;
  prev_price: number;
  price_delta: number;
  vol_delta: number;
  vol_delta_usd: number;
  baseline_avg: number;
  spike_ratio: number | null;
  readings: number;
  momentum_move: number | null;   // cumulative ¢ move over last 4h (null = no momentum)
  oi_delta: number;               // open interest change since last snapshot
  oi_spike_ratio: number | null;  // oi_delta / baseline OI (null if insufficient history)
  rec_side: string | null;        // 'yes'|'no' if a pending high/med rec exists
  rec_edge: number | null;        // edge % of that rec
  rec_confidence: string | null;
  captured_at: string;
}

export async function getWhaleAlerts(minAbsVol = 50, minPriceDelta = 8): Promise<WhaleAlert[]> {
  const result = await db.query(`
    WITH intervals AS (
      SELECT
        ticker, title, category, yes_price, volume_all, open_interest, captured_at,
        GREATEST(
          volume_all    - LAG(volume_all)    OVER (PARTITION BY ticker ORDER BY captured_at),
          0
        )                                                                        AS vol_interval,
        GREATEST(
          open_interest - LAG(open_interest) OVER (PARTITION BY ticker ORDER BY captured_at),
          0
        )                                                                        AS oi_interval,
        yes_price - LAG(yes_price) OVER (PARTITION BY ticker ORDER BY captured_at) AS price_interval
      FROM market_snapshots
      WHERE captured_at >= NOW() - INTERVAL '26 hours'
    ),
    baseline AS (
      SELECT
        ticker,
        AVG(NULLIF(vol_interval, 0))                          AS avg_vol,
        AVG(NULLIF(oi_interval, 0))                           AS avg_oi,
        COUNT(*) FILTER (WHERE vol_interval > 0)              AS active_readings
      FROM intervals
      WHERE vol_interval IS NOT NULL
        AND captured_at < NOW() - INTERVAL '25 minutes'
      GROUP BY ticker
    ),
    momentum AS (
      -- Markets with 3+ consecutive intervals all moving the same direction (≥2¢ each)
      SELECT
        ticker,
        SUM(COALESCE(price_interval, 0)) AS cumulative_move
      FROM intervals
      WHERE captured_at >= NOW() - INTERVAL '4 hours'
        AND price_interval IS NOT NULL
      GROUP BY ticker
      HAVING COUNT(*) FILTER (WHERE price_interval >  2) >= 3
          OR COUNT(*) FILTER (WHERE price_interval < -2) >= 3
    ),
    recs AS (
      SELECT DISTINCT ON (market_ticker)
        market_ticker,
        side,
        ROUND(edge::numeric * 100, 1) AS edge_pct,
        confidence
      FROM recommendations
      WHERE outcome = 'pending'
        AND confidence IN ('high', 'medium')
      ORDER BY market_ticker, edge DESC
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
      COALESCE(l.oi_interval, 0)                              AS oi_delta,
      CASE WHEN COALESCE(b.avg_oi, 0) > 1
           THEN ROUND(l.oi_interval::numeric / b.avg_oi, 1)
           ELSE NULL
      END                                                      AS oi_spike_ratio,
      m.cumulative_move                                        AS momentum_move,
      r.side                                                   AS rec_side,
      r.edge_pct                                               AS rec_edge,
      r.confidence                                             AS rec_confidence,
      l.captured_at
    FROM latest l
    LEFT JOIN baseline b ON l.ticker = b.ticker
    LEFT JOIN momentum m ON l.ticker = m.ticker
    LEFT JOIN recs    r ON l.ticker = r.market_ticker
    WHERE (
      (COALESCE(l.vol_interval, 0) > 0
        AND COALESCE(b.avg_vol, 0) > 1
        AND l.vol_interval > 3 * b.avg_vol
        AND l.vol_interval >= 10)
      OR (COALESCE(l.vol_interval, 0) >= $1
        AND COALESCE(b.active_readings, 0) < 5)
      OR ABS(COALESCE(l.price_interval, 0)) >= $2
      OR m.ticker IS NOT NULL
      -- OI spike: new contracts being created (not just existing holders trading)
      OR (COALESCE(l.oi_interval, 0) > 0
          AND COALESCE(b.avg_oi, 0) > 1
          AND l.oi_interval > 3 * b.avg_oi
          AND l.oi_interval >= 10)
    )
    ORDER BY
      (r.side IS NOT NULL)::int DESC,
      CASE WHEN COALESCE(b.avg_vol, 0) > 1
           THEN l.vol_interval::float / b.avg_vol ELSE 0 END DESC,
      COALESCE(l.vol_interval, 0) DESC
    LIMIT 50
  `, [minAbsVol, minPriceDelta]);

  return result.rows.map((r) => ({
    ticker:          r.ticker,
    title:           r.title,
    category:        r.category,
    yes_price:       Number(r.yes_price),
    prev_price:      Number(r.prev_price),
    price_delta:     Number(r.price_delta),
    vol_delta:       Number(r.vol_delta),
    vol_delta_usd:   Number(r.vol_delta_usd),
    baseline_avg:    Number(r.baseline_avg),
    spike_ratio:     r.spike_ratio    != null ? Number(r.spike_ratio)    : null,
    readings:        Number(r.readings),
    oi_delta:        Number(r.oi_delta),
    oi_spike_ratio:  r.oi_spike_ratio != null ? Number(r.oi_spike_ratio) : null,
    momentum_move:   r.momentum_move  != null ? Number(r.momentum_move)  : null,
    rec_side:        r.rec_side       ?? null,
    rec_edge:        r.rec_edge       != null ? Number(r.rec_edge)       : null,
    rec_confidence:  r.rec_confidence ?? null,
    captured_at:     r.captured_at,
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
    if (Math.abs(a.price_delta) >= 8)                                      signals.push('price');
    if (a.oi_delta > 0 && a.oi_spike_ratio != null && a.oi_spike_ratio >= 3) signals.push('open-interest');
    if (a.momentum_move != null)                                            signals.push('momentum');
    if (a.rec_side != null)                                                 signals.push('ai-match');
    if (signals.length === 0)                                               signals.push('volume');

    const res = await db.query(
      `INSERT INTO whale_events
         (ticker, title, category, yes_price, prev_price, price_delta,
          vol_delta, vol_delta_usd, spike_ratio, signals)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
       WHERE NOT EXISTS (
         SELECT 1 FROM whale_events
         WHERE ticker = $1 AND detected_at >= NOW() - INTERVAL '30 minutes'
       )`,
      [a.ticker, a.title, a.category, a.yes_price, a.prev_price, a.price_delta,
       a.vol_delta, a.vol_delta_usd, a.spike_ratio, signals]
    );

    const isNew = (res.rowCount ?? 0) > 0;
    if (isNew) {
      count++;
      // Email for high-conviction events: 5× baseline spike, or AI match, or momentum+price together
      const isHighConviction =
        (a.spike_ratio != null && a.spike_ratio >= 5) ||
        a.rec_side != null ||
        (a.momentum_move != null && Math.abs(a.price_delta) >= 8);

      if (isHighConviction) {
        sendWhaleAlertEmail(a, signals).catch((err) =>
          console.error('[WhaleHunter] Email failed:', err)
        );
      }
    }
  }

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

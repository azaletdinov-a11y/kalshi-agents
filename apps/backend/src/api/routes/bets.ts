import { Router } from 'express';
import { db } from '../../db/client';
import { getMyFills, getMyOrders, getMarket } from '../../lib/kalshi';

const router = Router();

function normalizeBet(b: Record<string, unknown>) {
  return {
    ...b,
    fill_price: Number(b.fill_price),
    amount: Number(b.amount),
    pnl: b.pnl != null ? Number(b.pnl) : null,
  };
}

router.get('/', async (req, res) => {
  const { outcome } = req.query;
  const result = outcome
    ? await db.query(`SELECT * FROM bets WHERE outcome=$1 ORDER BY placed_at DESC LIMIT 200`, [outcome])
    : await db.query(`SELECT * FROM bets ORDER BY placed_at DESC LIMIT 200`);
  res.json(result.rows.map(normalizeBet));
});

router.get('/summary', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE outcome != 'cancelled') AS total_bets,
      COALESCE(SUM(amount) FILTER (WHERE outcome != 'cancelled'), 0) AS total_wagered,
      COALESCE(SUM(pnl) FILTER (WHERE outcome IN ('won','lost')), 0) AS total_pnl,
      COUNT(*) FILTER (WHERE outcome = 'pending') AS pending_bets,
      COUNT(*) FILTER (WHERE outcome = 'won') AS won,
      COUNT(*) FILTER (WHERE outcome IN ('won','lost')) AS resolved
    FROM bets
  `);
  const row = result.rows[0];
  const won = Number(row.won);
  const resolved = Number(row.resolved);
  const totalWagered = Number(row.total_wagered) || 0;
  const totalPnl = Number(row.total_pnl) || 0;
  res.json({
    total_bets: Number(row.total_bets),
    total_wagered: totalWagered,
    total_pnl: totalPnl,
    win_rate: resolved > 0 ? Math.round((won / resolved) * 100) : null,
    pending_bets: Number(row.pending_bets),
    roi: totalWagered > 0 ? Math.round((totalPnl / totalWagered) * 10000) / 100 : null,
  });
});

router.get('/by-category', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COALESCE(r.category, 'Other') AS category,
      COUNT(b.id) FILTER (WHERE b.outcome != 'cancelled') AS total_bets,
      COALESCE(SUM(b.amount) FILTER (WHERE b.outcome != 'cancelled'), 0) AS total_wagered,
      COALESCE(SUM(b.pnl) FILTER (WHERE b.outcome IN ('won','lost')), 0) AS total_pnl,
      COUNT(b.id) FILTER (WHERE b.outcome = 'won') AS wins,
      COUNT(b.id) FILTER (WHERE b.outcome IN ('won','lost')) AS resolved
    FROM bets b
    LEFT JOIN recommendations r ON r.id = b.recommendation_id
    GROUP BY r.category
    ORDER BY total_wagered DESC
  `);
  res.json(result.rows.map((r) => ({
    category: r.category ?? 'Other',
    total_bets: Number(r.total_bets),
    total_wagered: Number(r.total_wagered) || 0,
    total_pnl: Number(r.total_pnl) || 0,
    win_rate: Number(r.resolved) > 0 ? Math.round((Number(r.wins) / Number(r.resolved)) * 100) : null,
  })));
});

router.get('/closing-soon', async (_req, res) => {
  const result = await db.query(`
    SELECT * FROM bets
    WHERE outcome = 'pending'
      AND close_time <= NOW() + INTERVAL '24 hours'
    ORDER BY close_time ASC
  `);
  res.json(result.rows.map(normalizeBet));
});

router.post('/', async (req, res) => {
  const { recommendation_id, fill_price, amount } = req.body;
  if (!recommendation_id || fill_price == null || amount == null) {
    return res.status(400).json({ error: 'recommendation_id, fill_price, amount required' });
  }

  const rec = await db.query(
    `SELECT market_ticker, market_title, side, close_time FROM recommendations WHERE id=$1`,
    [recommendation_id]
  );
  if (rec.rows.length === 0) return res.status(404).json({ error: 'Recommendation not found' });

  const { market_ticker, market_title, side, close_time } = rec.rows[0];
  const result = await db.query(
    `INSERT INTO bets (recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time]
  );
  console.log(`[Bets] Recorded: ${market_ticker} ${side.toUpperCase()} $${amount} @ ${fill_price}%`);
  res.json(normalizeBet(result.rows[0]));
});

router.patch('/:id', async (req, res) => {
  const { fill_price, amount } = req.body;
  if (fill_price == null && amount == null) {
    return res.status(400).json({ error: 'fill_price or amount required' });
  }
  const fields: string[] = [];
  const vals: unknown[] = [];
  if (amount != null) { fields.push(`amount=$${fields.length + 1}`); vals.push(amount); }
  if (fill_price != null) { fields.push(`fill_price=$${fields.length + 1}`); vals.push(fill_price); }
  vals.push(req.params.id);
  const result = await db.query(
    `UPDATE bets SET ${fields.join(',')} WHERE id=$${vals.length} AND outcome='pending' RETURNING *`,
    vals
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Bet not found or already resolved' });
  res.json(normalizeBet(result.rows[0]));
});

router.get('/kalshi-fills-debug', async (_req, res) => {
  const keyId = process.env.KALSHI_KEY_ID ?? '';
  const privateKey = (process.env.KALSHI_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const cr = await import('crypto');
  const ax = (await import('axios')).default;

  async function tryRequest(label: string, signedPath: string, tsMs: boolean, url: string): Promise<unknown> {
    try {
      const timestamp = tsMs ? Date.now().toString() : Math.floor(Date.now() / 1000).toString();
      const message = `${timestamp}GET${signedPath}`;
      const signer = cr.createSign('RSA-SHA256');
      signer.update(message);
      const sig = signer.sign(privateKey, 'base64');
      const r = await ax.get(url, {
        params: { limit: 5 },
        headers: { 'KALSHI-ACCESS-KEY': keyId, 'KALSHI-ACCESS-SIGNATURE': sig, 'KALSHI-ACCESS-TIMESTAMP': timestamp },
        timeout: 8000,
      });
      return { label, ok: true, data: r.data };
    } catch (e: unknown) {
      const body = (e as {response?: {data?: unknown}})?.response?.data;
      const status = (e as {response?: {status?: number}})?.response?.status;
      return { label, ok: false, status, body };
    }
  }

  // No-auth request — tells us what error code Kalshi returns when totally unauthenticated
  let noAuthResult: unknown;
  try {
    const r = await ax.get('https://api.elections.kalshi.com/trade-api/v2/portfolio/fills', { params: { limit: 1 }, timeout: 6000 });
    noAuthResult = { ok: true, data: r.data };
  } catch (e: unknown) {
    noAuthResult = { status: (e as {response?: {status?: number}})?.response?.status, body: (e as {response?: {data?: unknown}})?.response?.data };
  }

  // Derive public key fingerprint from private key to verify which key pair this is
  let pubKeyFingerprint = '';
  try {
    const keyObj = cr.createPublicKey(privateKey);
    const pubDer = keyObj.export({ type: 'spki', format: 'der' }) as Buffer;
    pubKeyFingerprint = cr.createHash('sha256').update(pubDer).digest('hex').slice(0, 32);
  } catch (e: unknown) {
    pubKeyFingerprint = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  // Also try base64url encoding (some APIs require this instead of standard base64)
  async function tryBase64url(signedPath: string): Promise<unknown> {
    try {
      const timestamp = Date.now().toString();
      const message = `${timestamp}GET${signedPath}`;
      const signer = cr.createSign('RSA-SHA256');
      signer.update(message);
      const sigBuf = signer.sign(privateKey);
      const sig = sigBuf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const r = await ax.get('https://api.elections.kalshi.com/trade-api/v2/portfolio/fills', {
        params: { limit: 5 },
        headers: { 'KALSHI-ACCESS-KEY': keyId, 'KALSHI-ACCESS-SIGNATURE': sig, 'KALSHI-ACCESS-TIMESTAMP': timestamp },
        timeout: 8000,
      });
      return { label: 'base64url', ok: true, data: r.data };
    } catch (e: unknown) {
      return { label: 'base64url', ok: false, status: (e as {response?: {status?: number}})?.response?.status, body: (e as {response?: {data?: unknown}})?.response?.data };
    }
  }

  // PSS padding variant
  async function tryPSS(): Promise<unknown> {
    try {
      const timestamp = Date.now().toString();
      const message = `${timestamp}GET/trade-api/v2/portfolio/fills`;
      const sig = cr.sign('SHA256', Buffer.from(message), {
        key: privateKey,
        padding: cr.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: cr.constants.RSA_PSS_SALTLEN_DIGEST,
      }).toString('base64');
      const r = await ax.get('https://api.elections.kalshi.com/trade-api/v2/portfolio/fills', {
        params: { limit: 5 },
        headers: { 'KALSHI-ACCESS-KEY': keyId, 'KALSHI-ACCESS-SIGNATURE': sig, 'KALSHI-ACCESS-TIMESTAMP': timestamp },
        timeout: 8000,
      });
      return { label: 'pss_padding', ok: true, data: r.data };
    } catch (e: unknown) {
      return { label: 'pss_padding', ok: false, status: (e as {response?: {status?: number}})?.response?.status, body: (e as {response?: {data?: unknown}})?.response?.data };
    }
  }

  const results = await Promise.all([
    tryRequest('ms+full_path', '/trade-api/v2/portfolio/fills', true, 'https://api.elections.kalshi.com/trade-api/v2/portfolio/fills'),
    tryRequest('sec+full_path', '/trade-api/v2/portfolio/fills', false, 'https://api.elections.kalshi.com/trade-api/v2/portfolio/fills'),
    tryBase64url('/trade-api/v2/portfolio/fills'),
    tryPSS(),
  ]);

  res.json({ key_id: keyId, pub_key_fingerprint: pubKeyFingerprint, no_auth_result: noAuthResult, results });
});

router.post('/sync-kalshi', async (_req, res) => {
  let fills: Awaited<ReturnType<typeof getMyFills>> = [];
  let orders: Awaited<ReturnType<typeof getMyOrders>> = [];
  const fetchErrors: string[] = [];

  try { fills = await getMyFills(); } catch (e: unknown) {
    fetchErrors.push(`fills: ${e instanceof Error ? e.message : String(e)}`);
  }
  try { orders = await getMyOrders(); } catch (e: unknown) {
    fetchErrors.push(`orders: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (fetchErrors.length === 2) {
    return res.status(502).json({ error: fetchErrors.join(' | ') });
  }

  // Normalise fills and orders into a common shape with a unique key
  type Entry = { key: string; ticker: string; side: 'yes' | 'no'; fillPrice: number; amount: number; placedAt: string };

  const entries: Entry[] = [];

  for (const f of fills) {
    if (f.action !== 'buy') continue;
    const fillPrice = Math.round(parseFloat(f.side === 'yes' ? f.yes_price_dollars : f.no_price_dollars) * 100);
    const count = parseFloat(f.count_fp);
    entries.push({
      key: `fill:${f.fill_id}`,
      ticker: f.ticker,
      side: f.side,
      fillPrice,
      amount: Math.round(count * (fillPrice / 100) * 100) / 100,
      placedAt: f.created_time,
    });
  }

  for (const o of orders) {
    // Import orders that have at least some filled contracts (resting or executed)
    if (o.action !== 'buy') continue;
    if (o.filled_count <= 0) continue;
    const rawPrice = o.side === 'yes' ? o.yes_price_dollars : o.no_price_dollars;
    const fillPrice = rawPrice != null
      ? Math.round(parseFloat(rawPrice) * 100)
      : (o.side === 'yes' ? (o as unknown as Record<string, number>).yes_price : (o as unknown as Record<string, number>).no_price);
    entries.push({
      key: `order:${o.order_id}`,
      ticker: o.ticker,
      side: o.side,
      fillPrice,
      amount: Math.round(o.filled_count * (fillPrice / 100) * 100) / 100,
      placedAt: o.created_time,
    });
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      const exists = await db.query('SELECT id FROM bets WHERE kalshi_fill_id=$1', [entry.key]);
      if (exists.rows.length > 0) { skipped++; continue; }

      const rec = await db.query(
        `SELECT id, market_title, close_time FROM recommendations WHERE market_ticker=$1 ORDER BY created_at DESC LIMIT 1`,
        [entry.ticker]
      );

      let market_title: string = entry.ticker;
      let close_time: string | null = null;
      let recommendation_id: number | null = null;

      if (rec.rows.length > 0) {
        market_title = rec.rows[0].market_title as string;
        close_time = rec.rows[0].close_time as string;
        recommendation_id = rec.rows[0].id as number;
      } else {
        try {
          const market = await getMarket(entry.ticker);
          market_title = market.title;
          close_time = market.close_time;
        } catch {
          // leave title as ticker, close_time null
        }
      }

      await db.query(
        `INSERT INTO bets (kalshi_fill_id, recommendation_id, market_ticker, market_title, side, fill_price, amount, close_time, placed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [entry.key, recommendation_id, entry.ticker, market_title, entry.side, entry.fillPrice, entry.amount, close_time, entry.placedAt]
      );
      imported++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${entry.ticker}: ${msg}`);
    }
  }

  console.log(`[Bets] Kalshi sync: ${imported} imported, ${skipped} already existed (${fills.length} fills + ${orders.length} orders)`);
  res.json({ imported, skipped, total_fills: fills.length, total_orders: orders.length, errors: [...fetchErrors, ...errors] });
});

router.delete('/:id', async (req, res) => {
  await db.query(`DELETE FROM bets WHERE id=$1`, [req.params.id]);
  res.json({ ok: true });
});

export default router;

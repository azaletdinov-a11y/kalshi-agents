import { Router } from 'express';
import { db } from '../../db/client';
import { getMarket, parsePrice } from '../../lib/kalshi';

const router = Router();

router.get('/', async (_req, res) => {
  const result = await db.query(
    `SELECT * FROM markets ORDER BY scanned_at DESC LIMIT 100`
  );
  res.json(result.rows);
});

router.get('/:ticker/price', async (req, res) => {
  try {
    const market = await getMarket(req.params.ticker);
    const yesAsk = parsePrice(market.yes_ask_dollars);
    const yesBid = parsePrice(market.yes_bid_dollars);
    const noAsk = parsePrice(market.no_ask_dollars);
    const noBid = parsePrice(market.no_bid_dollars);
    res.json({ yes_ask: yesAsk, yes_bid: yesBid, no_ask: noAsk, no_bid: noBid });
  } catch {
    res.status(502).json({ error: 'Failed to fetch price from Kalshi' });
  }
});

export default router;

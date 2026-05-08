import { KalshiMarketRaw } from '../lib/kalshi';
import { inferCategory } from './market-scanner';
import { EstimationResult } from './estimator';
import { ResearchResult } from './researcher';
import { db } from '../db/client';

const BANKROLL = Number(process.env.BANKROLL ?? 100);
const MAX_BET = Number(process.env.MAX_BET ?? 5);
const MIN_EDGE = Number(process.env.MIN_EDGE ?? 0.05);
const KELLY_FRACTION = Number(process.env.KELLY_FRACTION ?? 0.25);

function kellyFraction(p: number, price: number): number {
  // p: our probability (0-1), price: market price (0-1)
  // Net odds b = (1 - price) / price for YES bet
  const b = (1 - price) / price;
  return (p * b - (1 - p)) / b;
}

export async function evaluateAndStore(
  market: KalshiMarketRaw,
  estimation: EstimationResult,
  research: ResearchResult
): Promise<boolean> {
  const marketP = estimation.marketYesPrice / 100;
  const ourP = estimation.estimated_probability / 100;

  // Determine which side has edge
  const yesEdge = ourP - marketP;
  const noEdge = (1 - ourP) - (1 - marketP); // = marketP - ourP

  const side = yesEdge > noEdge ? 'yes' : 'no';
  const edge = side === 'yes' ? yesEdge : noEdge;

  if (edge < MIN_EDGE) {
    console.log(`[RiskManager] ${market.ticker}: edge ${(edge * 100).toFixed(1)}% below threshold, skipping`);
    return false;
  }

  const betP = side === 'yes' ? ourP : 1 - ourP;
  const betPrice = side === 'yes' ? marketP : 1 - marketP;
  const fullKelly = kellyFraction(betP, betPrice);

  if (fullKelly <= 0) {
    console.log(`[RiskManager] ${market.ticker}: negative Kelly, skipping`);
    return false;
  }

  const fractionalKelly = fullKelly * KELLY_FRACTION;
  const rawBet = fractionalKelly * BANKROLL;
  const recommendedBet = Math.min(rawBet, MAX_BET);

  if (recommendedBet < 1) {
    console.log(`[RiskManager] ${market.ticker}: bet $${recommendedBet.toFixed(2)} too small, skipping`);
    return false;
  }

  // Skip if we already have a pending rec with price AND estimate both stable
  const existing = await db.query(
    `SELECT id, market_yes_price, estimated_probability FROM recommendations
     WHERE market_ticker=$1 AND outcome='pending' ORDER BY created_at DESC LIMIT 1`,
    [market.ticker]
  );
  if (existing.rows.length > 0) {
    const oldPrice = Number(existing.rows[0].market_yes_price);
    const oldEstimate = Number(existing.rows[0].estimated_probability);
    const priceDelta = Math.abs(estimation.marketYesPrice - oldPrice);
    const estimateDelta = Math.abs(estimation.estimated_probability - oldEstimate);
    if (priceDelta < 5 && estimateDelta < 15) {
      console.log(`[RiskManager] ${market.ticker}: already pending, price/estimate stable (price ${oldPrice}%→${estimation.marketYesPrice}%, est ${oldEstimate}%→${estimation.estimated_probability}%), skipping`);
      return false;
    }
    await db.query(`UPDATE recommendations SET outcome='cancelled' WHERE id=$1`, [existing.rows[0].id]);
    console.log(`[RiskManager] ${market.ticker}: price/estimate moved (Δprice=${priceDelta}pp, Δest=${estimateDelta}pp), replacing stale rec`);
  }

  await db.query(
    `INSERT INTO recommendations
      (market_ticker, market_title, category, market_yes_price, estimated_probability,
       edge, side, kelly_fraction, recommended_bet, confidence, reasoning, key_factors,
       research_summary, close_time)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      market.ticker,
      market.title,
      market.category ?? inferCategory(market.ticker),
      estimation.marketYesPrice,
      estimation.estimated_probability,
      Math.round(edge * 100 * 10) / 10,
      side,
      Math.round(fractionalKelly * 1000) / 1000,
      Math.round(recommendedBet * 100) / 100,
      estimation.confidence,
      estimation.reasoning,
      JSON.stringify(estimation.key_factors),
      research.summary.slice(0, 2000),
      market.close_time,
    ]
  );

  console.log(
    `[RiskManager] ✓ Recommendation stored: ${market.ticker} | ${side.toUpperCase()} | edge ${(edge * 100).toFixed(1)}% | $${recommendedBet.toFixed(2)}`
  );
  return true;
}

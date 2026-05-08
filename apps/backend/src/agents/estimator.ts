import { KalshiMarketRaw, parsePrice } from '../lib/kalshi';
import { estimateProbability, EstimationOutput } from '../lib/claude';
import { ResearchResult } from './researcher';

export interface EstimationResult extends EstimationOutput {
  ticker: string;
  marketYesPrice: number;
}

export async function estimateMarket(
  market: KalshiMarketRaw,
  research: ResearchResult
): Promise<EstimationResult> {
  const yesAsk = parsePrice(market.yes_ask_dollars) || (100 - parsePrice(market.no_bid_dollars));
  const yesBid = parsePrice(market.yes_bid_dollars);
  const yesPrice = yesBid > 0 ? Math.round((yesBid + yesAsk) / 2) : yesAsk;

  console.log(`[Estimator] Analyzing ${market.ticker} (market: ${yesPrice}%)`);

  const output = await estimateProbability({
    title: market.title,
    category: market.category ?? 'Unknown',
    yesPrice,
    closeTime: market.close_time,
    researchSummary: research.summary,
  });

  console.log(
    `[Estimator] ${market.ticker}: market=${yesPrice}%, estimate=${output.estimated_probability}%, confidence=${output.confidence}`
  );

  return { ...output, ticker: market.ticker, marketYesPrice: yesPrice };
}

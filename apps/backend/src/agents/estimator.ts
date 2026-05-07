import { KalshiMarketRaw } from '../lib/kalshi';
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
  const yesPrice = market.last_price ?? Math.round((market.yes_bid + market.yes_ask) / 2);

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

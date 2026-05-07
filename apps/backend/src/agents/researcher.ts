import { KalshiMarketRaw } from '../lib/kalshi';
import { searchTavily } from '../lib/tavily';
import { searchNews } from '../lib/news';

export interface ResearchResult {
  ticker: string;
  query: string;
  summary: string;
}

function buildQuery(market: KalshiMarketRaw): string {
  // Strip common prediction market boilerplate to get a clean search query
  return market.title
    .replace(/\b(will|by|before|end of|at least|more than|above|below)\b/gi, '')
    .replace(/\?$/, '')
    .trim()
    .slice(0, 120);
}

export async function researchMarket(market: KalshiMarketRaw): Promise<ResearchResult> {
  const query = buildQuery(market);
  console.log(`[Researcher] Searching: "${query}"`);

  const [tavilyText, newsText] = await Promise.allSettled([
    searchTavily(query),
    searchNews(query),
  ]);

  const parts: string[] = [];

  if (tavilyText.status === 'fulfilled' && tavilyText.value) {
    parts.push('=== Web Search ===\n' + tavilyText.value);
  }
  if (newsText.status === 'fulfilled' && newsText.value) {
    parts.push('=== News Headlines ===\n' + newsText.value);
  }
  if (parts.length === 0) {
    parts.push('No research data available — base estimate on market price and base rates.');
  }

  return {
    ticker: market.ticker,
    query,
    summary: parts.join('\n\n'),
  };
}

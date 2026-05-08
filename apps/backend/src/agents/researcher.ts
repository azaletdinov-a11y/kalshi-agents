import { KalshiMarketRaw } from '../lib/kalshi';
import { searchTavily } from '../lib/tavily';
import { searchNews } from '../lib/news';

export interface ResearchResult {
  ticker: string;
  query: string;
  summary: string;
}

function buildQuery(market: KalshiMarketRaw): string {
  const year = new Date().getFullYear();
  const cleaned = market.title
    // Remove prediction market boilerplate
    .replace(/\b(will|when|officially|worldwide|globally|announced?)\b/gi, '')
    // Remove future date constraints — we want current-state news
    .replace(/\b(before|by|end of|at least|more than|above|below)\b/gi, '')
    .replace(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2},?\s+\d{4}\b/gi, '')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, '')
    .replace(/\?$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Append year so search engines surface recent coverage
  return `${cleaned} ${year}`.slice(0, 120);
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

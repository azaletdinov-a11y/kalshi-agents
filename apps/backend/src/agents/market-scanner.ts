import { getOpenEvents, getMarketsForEvent, getMarketsBySeriesTicker, parsePrice, KalshiMarketRaw } from '../lib/kalshi';
import { db } from '../db/client';

const MIN_VOLUME = 10;
const MIN_DAYS_TO_CLOSE = 1;
const MAX_DAYS_TO_CLOSE = 90;
const MIN_PRICE = 5;
const MAX_PRICE = 95;

const CATEGORY_RULES: Array<{ prefixes: string[]; category: string }> = [
  { prefixes: ['KXBTC', 'KXETH', 'KXSOL', 'KXBNB', 'KXXRP', 'KXDOGE', 'KXADA'], category: 'Crypto' },
  { prefixes: ['KXFEDRATE', 'KXCPI', 'KXUNRATE', 'KXGDP', 'KXPCE', 'KXHPI', 'KXJOBS'], category: 'Economics' },
  { prefixes: ['INXD', 'INXU', 'KXSPX', 'KXNQ', 'KXDJI', 'KXIPO', 'KXFREDDIE', 'KXFANNIE'], category: 'Finance' },
  { prefixes: ['USPRES', 'USSENATE', 'USHOUSE', 'USGOV', 'KXELECTION', 'KXPOLITICS', 'KXVOTE', 'KXUKGOV', 'KXEUGOV'], category: 'Politics' },
  { prefixes: ['KXWARMING', 'KXERUPT', 'KXHURRICANE', 'KXQUAKE', 'KXCLIMATE'], category: 'Climate' },
  { prefixes: ['KXELON', 'KXMARS', 'KXAGICO', 'KXAI', 'KXSPACE'], category: 'Technology' },
  { prefixes: ['KXMEDIA', 'KXALBUM', 'KXMARRIAGE', 'KXMOVIE', 'KXSHOW', 'KXOSCAR', 'KXGRAMMYS'], category: 'Entertainment' },
];

export function inferCategory(ticker: string): string {
  for (const rule of CATEGORY_RULES) {
    if (rule.prefixes.some((p) => ticker.startsWith(p))) return rule.category;
  }
  return 'Other';
}

// Known liquid series to query directly — financial, economic, crypto, political
const PRIORITY_SERIES = [
  'KXBTCUSD', 'KXETHUSD', 'KXSOLUSD', 'KXBNBUSD', 'KXXRPUSD',
  'KXFEDRATE', 'KXCPI', 'KXUNRATE', 'KXGDP', 'KXPCE',
  'INXD', 'INXU', 'KXSPXCLOSE', 'KXNQ100',
  'USPRESIDENTIAL', 'USSENATE', 'USHOUSE', 'USGOV',
  'KXELECTION', 'KXPOLITICS',
];

// Event ticker prefixes for sports/entertainment — skip entire events
const BLOCKED_EVENT_PREFIXES = [
  'KXMVE', 'KXMLB', 'KXMNBA', 'KXMNFL', 'KXMNHL', 'KXMSO',
  'KXNBA', 'KXNFL', 'KXMLB', 'KXNHL', 'KXSOC', 'KXTEN',
  'KXGOLF', 'KXNASCAR', 'KXMMA', 'KXBOXING', 'KXOLY', 'KXWWE',
  'KXNBAAST', 'KXNBAPTS', 'KXNBAREB', 'KXNBATOTAL',
];

function isGoodMarket(m: KalshiMarketRaw, now: number): boolean {
  if (!m.close_time) return false;
  if (m.mve_collection_ticker) return false;

  const daysToClose = (new Date(m.close_time).getTime() - now) / (1000 * 60 * 60 * 24);
  const volume = parseFloat(m.volume_fp ?? '0');
  const yesAsk = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
  const hasLiquidity = parseFloat(m.yes_ask_dollars ?? '0') > 0 || parseFloat(m.no_bid_dollars ?? '0') > 0;

  return (
    volume >= MIN_VOLUME &&
    daysToClose >= MIN_DAYS_TO_CLOSE &&
    daysToClose <= MAX_DAYS_TO_CLOSE &&
    yesAsk >= MIN_PRICE &&
    yesAsk <= MAX_PRICE &&
    hasLiquidity
  );
}

export async function scanMarkets(): Promise<KalshiMarketRaw[]> {
  const now = Date.now();
  const allMarkets: KalshiMarketRaw[] = [];
  const seenTickers = new Set<string>();

  function addMarkets(markets: KalshiMarketRaw[]) {
    for (const m of markets) {
      if (!seenTickers.has(m.ticker) && isGoodMarket(m, now)) {
        seenTickers.add(m.ticker);
        allMarkets.push(m);
      }
    }
  }

  // 1. Targeted queries for known liquid series (financial, crypto, economic, political)
  console.log('[Scanner] Querying priority series...');
  for (const series of PRIORITY_SERIES) {
    const markets = await getMarketsBySeriesTicker(series);
    if (markets.length > 0) {
      console.log(`[Scanner] Series ${series}: ${markets.length} markets`);
      addMarkets(markets);
    }
  }

  // 2. Event-based scan for everything else (novelty, IPO, entertainment futures)
  console.log('[Scanner] Fetching open events from Kalshi...');
  const allEvents = await getOpenEvents(2000);

  const goodEvents = allEvents.filter(
    (e) => !BLOCKED_EVENT_PREFIXES.some((p) => e.event_ticker.startsWith(p))
  ).slice(0, 400);
  console.log(`[Scanner] ${allEvents.length} events → ${goodEvents.length} selected for market fetch`);

  for (const event of goodEvents) {
    const markets = await getMarketsForEvent(event.event_ticker);
    addMarkets(markets);
  }

  allMarkets.sort((a, b) => parseFloat(b.volume_24h_fp ?? '0') - parseFloat(a.volume_24h_fp ?? '0'));

  const candidates = allMarkets.slice(0, 30);
  console.log(`[Scanner] ${allMarkets.length} qualifying markets → ${candidates.length} candidates`);
  candidates.forEach((m) => console.log(`[Scanner]  · ${m.ticker}: ${m.title}`));

  for (const m of candidates) {
    const yesAsk = parsePrice(m.yes_ask_dollars) || (100 - parsePrice(m.no_bid_dollars));
    const yesBid = parsePrice(m.yes_bid_dollars);
    const price = yesBid > 0 ? Math.round((yesBid + yesAsk) / 2) : yesAsk;
    const volume = Math.round(parseFloat(m.volume_fp ?? '0'));
    const volume24h = Math.round(parseFloat(m.volume_24h_fp ?? '0'));

    await db.query(
      `INSERT INTO markets (ticker, title, category, yes_price, volume, volume_24h, close_time, scanned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (ticker) DO UPDATE SET
         yes_price = EXCLUDED.yes_price, volume = EXCLUDED.volume,
         volume_24h = EXCLUDED.volume_24h, scanned_at = NOW()`,
      [m.ticker, m.title, m.category ?? inferCategory(m.ticker), price, volume, volume24h, m.close_time]
    );
  }

  return candidates;
}

import axios from 'axios';

// Kalshi REST API v2
// Auth: API key as Bearer token — adjust if you use RSA-based credentials
const client = axios.create({
  baseURL: 'https://trading-api.kalshi.com/trade-api/v2',
  headers: {
    Authorization: `Bearer ${process.env.KALSHI_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

export interface KalshiMarketRaw {
  ticker: string;
  title: string;
  category: string;
  status: string;
  yes_bid: number;
  yes_ask: number;
  no_bid: number;
  no_ask: number;
  last_price: number;
  volume: number;
  volume_24h: number;
  close_time: string;
  open_interest: number;
  liquidity: number;
}

export async function getOpenMarkets(maxMarkets = 200): Promise<KalshiMarketRaw[]> {
  const markets: KalshiMarketRaw[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string | number> = {
      status: 'open',
      limit: Math.min(maxMarkets - markets.length, 200),
    };
    if (cursor) params.cursor = cursor;

    const res = await client.get('/markets', { params });
    const data = res.data;
    markets.push(...(data.markets ?? []));
    cursor = data.cursor;

    if (!cursor || markets.length >= maxMarkets) break;
  } while (true);

  return markets.slice(0, maxMarkets);
}

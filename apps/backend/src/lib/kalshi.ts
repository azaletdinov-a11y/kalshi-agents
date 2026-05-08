import axios from 'axios';
import crypto from 'crypto';

const BASE_PATH = '/trade-api/v2';

function sign(method: string, path: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const message = `${timestamp}${method.toUpperCase()}${path}`;
  const privateKey = (process.env.KALSHI_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(message);
  const signature = signer.sign(privateKey, 'base64');
  return {
    'KALSHI-ACCESS-KEY': process.env.KALSHI_KEY_ID ?? '',
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

const client = axios.create({
  baseURL: `https://api.elections.kalshi.com${BASE_PATH}`,
});

client.interceptors.request.use((config) => {
  const path = `${BASE_PATH}${config.url ?? ''}`;
  Object.assign(config.headers, sign(config.method?.toUpperCase() ?? 'GET', path));
  return config;
});

// All dollar fields are strings in "0.0000" format (0–1 range = 0%–100%)
export interface KalshiMarketRaw {
  ticker: string;
  title: string;
  category?: string;
  status: string;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  no_bid_dollars?: string;
  no_ask_dollars?: string;
  volume_fp?: string;
  volume_24h_fp?: string;
  close_time: string;
  open_interest_fp?: string;
  liquidity_dollars?: string;
  mve_collection_ticker?: string; // present on all multi-leg parlay markets
}

export function parsePrice(dollarStr?: string): number {
  return Math.round(parseFloat(dollarStr ?? '0') * 100);
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

    const res = await client.get('/markets', { params }).catch((err) => {
      if (axios.isAxiosError(err) && err.response) {
        console.error('[Kalshi] Error', err.response.status, JSON.stringify(err.response.data));
      }
      throw err;
    });

    const data = res.data;
    markets.push(...(data.markets ?? []));
    cursor = data.cursor;

    if (!cursor || markets.length >= maxMarkets) break;
  } while (true);

  return markets.slice(0, maxMarkets);
}

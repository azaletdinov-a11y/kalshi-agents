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
  const method = config.method?.toUpperCase() ?? 'GET';
  Object.assign(config.headers, sign(method, path));
  return config;
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

    const res = await client.get('/markets', { params }).catch((err) => {
      if (axios.isAxiosError(err) && err.response) {
        console.error('[Kalshi] Auth error', err.response.status, JSON.stringify(err.response.data));
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

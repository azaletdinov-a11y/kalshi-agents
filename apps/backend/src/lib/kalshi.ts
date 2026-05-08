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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await client.get(path, { params });
      return res.data as T;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 429) {
        const wait = 2000 * (attempt + 1);
        console.log(`[Kalshi] Rate limited, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (axios.isAxiosError(err) && err.response) {
        console.error('[Kalshi] Error', err.response.status, JSON.stringify(err.response.data));
      }
      throw err;
    }
  }
  throw new Error('[Kalshi] Max retries exceeded');
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category?: string;
  status: string;
  markets?: KalshiMarketRaw[];
}

export async function getOpenEvents(maxEvents = 1000): Promise<KalshiEvent[]> {
  const events: KalshiEvent[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    const params: Record<string, string | number> = {
      status: 'open',
      limit: Math.min(200, maxEvents - events.length),
    };
    if (cursor) params.cursor = cursor;
    if (page > 0) await sleep(800);
    page++;

    const data = await apiGet<{ events: KalshiEvent[]; cursor?: string }>('/events', params);
    const batch = data.events ?? [];
    events.push(...batch);
    cursor = data.cursor;
    console.log(`[Kalshi] Events page ${page}: +${batch.length} (total ${events.length})`);

    if (!cursor || events.length >= maxEvents) break;
  } while (true);

  return events;
}

export async function getMarketsForEvent(eventTicker: string): Promise<KalshiMarketRaw[]> {
  await sleep(400);
  const data = await apiGet<{ markets: KalshiMarketRaw[] }>('/markets', {
    event_ticker: eventTicker,
    status: 'open',
    limit: 200,
  });
  return data.markets ?? [];
}

// Kept for backward compat but no longer used by the scanner
export async function getOpenMarkets(maxMarkets = 200): Promise<KalshiMarketRaw[]> {
  const markets: KalshiMarketRaw[] = [];
  let cursor: string | undefined;
  let page = 0;

  do {
    const params: Record<string, string | number> = { status: 'open', limit: 200 };
    if (cursor) params.cursor = cursor;
    if (page > 0) await sleep(1200);
    page++;

    const data = await apiGet<{ markets: KalshiMarketRaw[]; cursor?: string }>('/markets', params);
    const batch = data.markets ?? [];
    markets.push(...batch);
    cursor = data.cursor;

    if (!cursor || markets.length >= maxMarkets) break;
  } while (true);

  return markets.slice(0, maxMarkets);
}

import axios from 'axios';
import crypto from 'crypto';

const BASE_PATH = '/trade-api/v2';

function sign(method: string, path: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const message = `${timestamp}${method.toUpperCase()}${path}`;
  const privateKey = (process.env.KALSHI_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const signature = crypto.sign('SHA256', Buffer.from(message), {
    key: privateKey,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
  }).toString('base64');
  return {
    'KALSHI-ACCESS-KEY': process.env.KALSHI_KEY_ID ?? '',
    'KALSHI-ACCESS-SIGNATURE': signature,
    'KALSHI-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

function makeClient(host: string) {
  const c = axios.create({ baseURL: `${host}${BASE_PATH}` });
  c.interceptors.request.use((config) => {
    const path = `${BASE_PATH}${config.url ?? ''}`;
    Object.assign(config.headers, sign(config.method?.toUpperCase() ?? 'GET', path));
    return config;
  });
  return c;
}

const client = makeClient('https://api.elections.kalshi.com');
// Portfolio endpoints also on the elections host (only DNS that resolves from Railway)
const portfolioClient = makeClient('https://api.elections.kalshi.com');

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

async function clientGet<T>(c: ReturnType<typeof makeClient>, path: string, params: Record<string, string | number> = {}): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await c.get(path, { params });
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
        const detail = JSON.stringify(err.response.data);
        throw new Error(`HTTP ${err.response.status}: ${detail}`);
      }
      throw err;
    }
  }
  throw new Error('[Kalshi] Max retries exceeded');
}

async function apiGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  return clientGet<T>(client, path, params);
}

async function portfolioGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  return clientGet<T>(portfolioClient, path, params);
}

export interface KalshiEvent {
  event_ticker: string;
  title: string;
  category?: string;
  status: string;
  markets?: KalshiMarketRaw[];
}

export async function getOpenEvents(maxEvents = 2000): Promise<KalshiEvent[]> {
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

export interface KalshiMarketResolved extends KalshiMarketRaw {
  result: string; // "yes" | "no" | "" when unresolved
}

export async function getMarket(ticker: string): Promise<KalshiMarketResolved> {
  const data = await apiGet<{ market: KalshiMarketResolved }>(`/markets/${ticker}`);
  return data.market;
}

export interface KalshiFill {
  fill_id: string;
  trade_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count_fp: string;
  yes_price_dollars: string;
  no_price_dollars: string;
  created_time: string;
}

export async function getPortfolioBalance(): Promise<number> {
  const data = await portfolioGet<Record<string, unknown>>('/portfolio/balance');
  console.log('[Kalshi] Balance raw response:', JSON.stringify(data));
  const raw = (data.balance ?? data.available_balance ?? data.portfolio_value ?? 0) as string | number;
  return Math.round(parseFloat(String(raw)) * 100) / 100;
}

export async function getMyFills(maxFills = 2000): Promise<KalshiFill[]> {
  const fills: KalshiFill[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string | number> = { limit: Math.min(100, maxFills - fills.length) };
    if (cursor) params.cursor = cursor;
    if (fills.length > 0) await sleep(400);

    const data = await portfolioGet<{ fills: KalshiFill[]; cursor?: string }>('/portfolio/fills', params);
    fills.push(...(data.fills ?? []));
    cursor = data.cursor;

    if (!cursor || fills.length >= maxFills) break;
  } while (true);

  return fills;
}

export interface KalshiOrder {
  order_id: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  type: 'limit' | 'market';
  status: string; // 'resting' | 'canceled' | 'executed' | 'pending'
  yes_price_dollars: string;
  no_price_dollars: string;
  count: number;           // original order size in contracts
  remaining_count: number; // unfilled contracts
  filled_count: number;    // filled contracts so far
  created_time: string;
  close_time?: string;
}

export async function getMyOrders(status?: string, maxOrders = 2000): Promise<KalshiOrder[]> {
  const orders: KalshiOrder[] = [];
  let cursor: string | undefined;

  do {
    const params: Record<string, string | number> = { limit: Math.min(100, maxOrders - orders.length) };
    if (status) params.status = status;
    if (cursor) params.cursor = cursor;
    if (orders.length > 0) await sleep(400);

    const data = await portfolioGet<{ orders: KalshiOrder[]; cursor?: string }>('/portfolio/orders', params);
    orders.push(...(data.orders ?? []));
    cursor = data.cursor;

    if (!cursor || orders.length >= maxOrders) break;
  } while (true);

  return orders;
}

export async function getMarketsBySeriesTicker(seriesTicker: string): Promise<KalshiMarketRaw[]> {
  try {
    const data = await apiGet<{ markets: KalshiMarketRaw[] }>('/markets', {
      series_ticker: seriesTicker,
      status: 'open',
      limit: 200,
    });
    return data.markets ?? [];
  } catch {
    return [];
  }
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

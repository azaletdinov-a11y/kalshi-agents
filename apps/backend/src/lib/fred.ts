import axios from 'axios';

const BASE = 'https://api.stlouisfed.org/fred';

interface FredSeries {
  id: string;
  label: string;
  unit: string;
  frequency: 'monthly' | 'quarterly' | 'daily';
  units?: string; // FRED units transform: 'pch' = percent change, 'pc1' = pct change from year ago, etc.
}

// Kalshi ticker prefix → FRED series
const SERIES_MAP: Array<{ prefix: string; series: FredSeries }> = [
  {
    prefix: 'KXCPI',
    series: { id: 'CPIAUCSL', label: 'CPI Month-over-Month % Change', unit: '%', frequency: 'monthly', units: 'pch' },
  },
  {
    prefix: 'KXFEDRATE',
    series: { id: 'DFEDTARU', label: 'Fed Funds Upper Target Rate', unit: '%', frequency: 'daily' },
  },
  {
    prefix: 'KXUNRATE',
    series: { id: 'UNRATE', label: 'Unemployment Rate', unit: '%', frequency: 'monthly' },
  },
  {
    prefix: 'KXGDP',
    series: { id: 'A191RL1Q225SBEA', label: 'Real GDP Growth (QoQ %)', unit: '%', frequency: 'quarterly' },
  },
  {
    prefix: 'KXPCE',
    series: { id: 'PCEPIILFE', label: 'Core PCE Month-over-Month % Change', unit: '%', frequency: 'monthly', units: 'pch' },
  },
  {
    prefix: 'INXD',
    series: { id: 'SP500', label: 'S&P 500 Index', unit: '', frequency: 'daily' },
  },
  {
    prefix: 'INXU',
    series: { id: 'SP500', label: 'S&P 500 Index', unit: '', frequency: 'daily' },
  },
  {
    prefix: 'KXSPX',
    series: { id: 'SP500', label: 'S&P 500 Index', unit: '', frequency: 'daily' },
  },
];

function findSeries(ticker: string): FredSeries | null {
  const match = SERIES_MAP.find(({ prefix }) => ticker.startsWith(prefix));
  return match?.series ?? null;
}

export async function fetchFredData(ticker: string): Promise<string | null> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) return null;

  const series = findSeries(ticker);
  if (!series) return null;

  try {
    const limit = series.frequency === 'daily' ? 30 : series.frequency === 'quarterly' ? 8 : 13;

    const params: Record<string, string | number> = {
      series_id: series.id,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit,
    };
    if (series.units) params.units = series.units;

    const res = await axios.get(`${BASE}/series/observations`, { params, timeout: 5000 });

    const observations: Array<{ date: string; value: string }> = (res.data.observations ?? [])
      .filter((o: { date: string; value: string }) => o.value !== '.'); // FRED uses '.' for missing

    if (observations.length === 0) return null;

    // Show last 6 readings
    const recent = observations.slice(0, 6);
    const lines = recent.map((o) => `  ${o.date}: ${o.value}${series.unit}`).join('\n');

    // Compute recent average for context
    const nums = recent.map((o) => parseFloat(o.value)).filter((n) => !isNaN(n));
    const avg = nums.length > 0
      ? (nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2)
      : null;

    // Detect trend (last vs previous)
    const trend = nums.length >= 2
      ? nums[0] > nums[1] ? '↑ accelerating' : nums[0] < nums[1] ? '↓ decelerating' : '→ flat'
      : '';

    const lines2 = [
      `=== FRED: ${series.label} (${series.id}) ===`,
      `Recent readings (newest first):`,
      lines,
      avg ? `Recent average: ${avg}${series.unit}  ${trend}` : '',
      `Source: Federal Reserve Economic Data (fred.stlouisfed.org)`,
    ].filter(Boolean).join('\n');

    console.log(`[FRED] Fetched ${series.id} for ${ticker}: latest=${observations[0].value}${series.unit}`);
    return lines2;
  } catch (err) {
    console.warn(`[FRED] Failed to fetch ${series.id}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export function isEconomicTicker(ticker: string): boolean {
  return SERIES_MAP.some(({ prefix }) => ticker.startsWith(prefix));
}

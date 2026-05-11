import axios from 'axios';
import type { WhaleAlert } from '../agents/whale-hunter';

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? '';
const ALERT_EMAIL   = process.env.ALERT_EMAIL ?? '';
const FROM_EMAIL    = process.env.ALERT_FROM_EMAIL ?? 'Whale Hunter <onboarding@resend.dev>';

export async function sendWhaleAlertEmail(
  alert: WhaleAlert,
  signals: string[]
): Promise<void> {
  if (!RESEND_API_KEY || !ALERT_EMAIL) return; // silently skip if not configured

  const signalBadges = signals
    .map((s) => `<span style="background:#92400e;color:#fde68a;padding:2px 8px;border-radius:12px;font-size:12px;margin-right:4px">${s}</span>`)
    .join('');

  const priceDir = alert.price_delta > 0 ? '▲' : alert.price_delta < 0 ? '▼' : '';
  const priceColor = alert.price_delta > 0 ? '#34d399' : alert.price_delta < 0 ? '#f87171' : '#94a3b8';

  const aiBlock = alert.rec_side
    ? `<tr>
         <td style="padding:6px 0;color:#94a3b8">AI Rec</td>
         <td style="padding:6px 0;color:#a5b4fc;font-weight:600">
           ${alert.rec_side.toUpperCase()} — ${alert.rec_edge}% edge (${alert.rec_confidence})
         </td>
       </tr>`
    : '';

  const momentumBlock = alert.momentum_move != null
    ? `<tr>
         <td style="padding:6px 0;color:#94a3b8">Momentum</td>
         <td style="padding:6px 0;color:#fb923c;font-weight:600">
           ${alert.momentum_move > 0 ? '+' : ''}${alert.momentum_move}¢ cumulative (3+ intervals)
         </td>
       </tr>`
    : '';

  const kalshiUrl = `https://kalshi.com/markets/${alert.ticker.split('-')[0]}#${alert.ticker}`;

  const html = `
    <div style="font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px;max-width:520px;border-radius:12px">
      <div style="margin-bottom:16px">
        <span style="font-size:22px">🐋</span>
        <span style="font-size:18px;font-weight:700;margin-left:8px">Whale Alert</span>
      </div>

      <div style="font-size:15px;font-weight:600;margin-bottom:4px">${alert.title}</div>
      <div style="font-size:12px;color:#64748b;margin-bottom:16px">${alert.ticker} · ${alert.category}</div>

      <div style="margin-bottom:16px">${signalBadges}</div>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr>
          <td style="padding:6px 0;color:#94a3b8">Price</td>
          <td style="padding:6px 0;font-weight:600">
            ${alert.yes_price}¢
            <span style="color:${priceColor};margin-left:8px">${priceDir}${Math.abs(alert.price_delta)}¢</span>
          </td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#94a3b8">Volume spike</td>
          <td style="padding:6px 0;color:#fbbf24;font-weight:600">
            +${alert.vol_delta.toLocaleString()} contracts (~$${alert.vol_delta_usd.toLocaleString()})
            ${alert.spike_ratio != null ? `<span style="color:#f97316;margin-left:6px">${alert.spike_ratio}× baseline</span>` : ''}
          </td>
        </tr>
        ${aiBlock}
        ${momentumBlock}
      </table>

      <div style="margin-top:20px">
        <a href="${kalshiUrl}"
           style="background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
          View on Kalshi →
        </a>
      </div>
    </div>
  `;

  await axios.post(
    'https://api.resend.com/emails',
    {
      from:    FROM_EMAIL,
      to:      [ALERT_EMAIL],
      subject: `🐋 Whale Alert: ${alert.ticker} (${signals.join('+')})`,
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 8000,
    }
  );

  console.log(`[Email] Whale alert sent for ${alert.ticker}`);
}

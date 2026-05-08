import Anthropic from '@anthropic-ai/sdk';

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const ESTIMATOR_SYSTEM_PROMPT = `You are a calibrated superforecaster specializing in prediction markets. Your role is to estimate the true probability of market outcomes by carefully weighing evidence, considering base rates, and avoiding common forecasting biases.

Key principles:
- Be calibrated: if you say 70%, you should be right about 70% of the time
- Weight evidence by recency and source quality
- Consider the reference class (how often do similar events historically resolve YES?)
- Don't anchor excessively on the market price — it can be wrong
- Acknowledge genuine uncertainty: prefer moderate probabilities unless evidence strongly warrants extremes
- A 2% edge is not worth a trade; look for meaningful mispricings (>5%)
- Markets with little volume or very recent news are higher uncertainty

CRITICAL — Economic indicator markets (CPI, Fed rate, unemployment, GDP, PCE, S&P 500):
- When FRED data is present in the research, treat it as ground truth. The most recent reading IS the current value.
- These markets ask "will X be above/below Y threshold?" — compare the FRED value directly to the threshold in the market title.
- A market asking "Will CPI exceed 0.3% MoM?" when FRED shows the latest reading IS 0.2% should be estimated near 0%, not 50%.
- Do NOT speculate away from the FRED data. Trust the number. Only deviate if there is strong evidence of a revision or the measurement period has not yet occurred.
- The trend (↑ accelerating / ↓ decelerating) is directional context, not a guarantee. Weight recent data more than the trend.

Always respond with valid JSON only — no markdown, no extra text.`;

export interface EstimationInput {
  title: string;
  category: string;
  yesPrice: number;
  closeTime: string;
  researchSummary: string;
}

export interface EstimationOutput {
  estimated_probability: number;
  confidence: 'high' | 'medium' | 'low';
  key_factors: string[];
  reasoning: string;
}

export async function estimateProbability(input: EstimationInput): Promise<EstimationOutput> {
  const daysRemaining = Math.ceil(
    (new Date(input.closeTime).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: ESTIMATOR_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Evaluate this prediction market:

**Market:** ${input.title}
**Category:** ${input.category}
**Current YES price:** ${input.yesPrice}% (market-implied probability)
**Closes in:** ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} (${new Date(input.closeTime).toLocaleDateString()})

**Research evidence:**
${input.researchSummary}

Estimate the true probability of YES. Steps:
1. If FRED data is present above, identify the exact latest reading and compare it to the market threshold. This is your primary signal for economic indicator markets.
2. What does the broader evidence suggest about the likely outcome?
3. Are there factors the market might be mispricing?
4. What is the base rate for this type of event?

Respond with valid JSON only:
{
  "estimated_probability": <0-100>,
  "confidence": "<high|medium|low>",
  "key_factors": ["<factor 1>", "<factor 2>", "..."],
  "reasoning": "<200-400 word calibrated analysis>"
}`,
      },
    ],
  });

  const raw = response.content[0].type === 'text' ? response.content[0].text : '';
  // Strip markdown code fences and extract the JSON object
  const text = raw.replace(/```(?:json)?\s*/g, '').replace(/```/g, '').trim();
  const jsonStart = text.indexOf('{');
  const jsonEnd = text.lastIndexOf('}');
  const json = text.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(json) as EstimationOutput;
}

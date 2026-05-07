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

Estimate the true probability of YES. Consider:
1. What does the evidence suggest about the likely outcome?
2. Are there factors the market might be mispricing?
3. What is the base rate for this type of event?

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

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return JSON.parse(text) as EstimationOutput;
}

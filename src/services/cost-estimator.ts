/**
 * Cost Estimator Service
 *
 * Provides USD cost estimates for model calls based on a pricing table.
 * Covers common OpenCode-compatible models (Anthropic, OpenAI, Google).
 */

interface ModelPricing {
  input: number
  output: number
}

const PRICING_TABLE: Array<{ prefix: string; pricing: ModelPricing }> = [
  { prefix: "claude-opus-4", pricing: { input: 15.0, output: 75.0 } },
  { prefix: "claude-opus", pricing: { input: 15.0, output: 75.0 } },
  { prefix: "claude-sonnet-4", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-sonnet-3-5", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-sonnet-3", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-sonnet", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-haiku-4", pricing: { input: 0.8, output: 4.0 } },
  { prefix: "claude-haiku-3-5", pricing: { input: 0.8, output: 4.0 } },
  { prefix: "claude-haiku", pricing: { input: 0.25, output: 1.25 } },
  { prefix: "claude-3-opus", pricing: { input: 15.0, output: 75.0 } },
  { prefix: "claude-3-5-sonnet", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-3-sonnet", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "claude-3-haiku", pricing: { input: 0.25, output: 1.25 } },
  { prefix: "claude", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "gpt-5.4-mini", pricing: { input: 0.15, output: 0.60 } },
  { prefix: "gpt-5-mini", pricing: { input: 0.15, output: 0.60 } },
  { prefix: "gpt-4.1", pricing: { input: 2.0, output: 8.0 } },
  { prefix: "gpt-4o-mini", pricing: { input: 0.15, output: 0.60 } },
  { prefix: "gpt-4o", pricing: { input: 2.5, output: 10.0 } },
  { prefix: "gpt-4-turbo", pricing: { input: 10.0, output: 30.0 } },
  { prefix: "gpt-4", pricing: { input: 30.0, output: 60.0 } },
  { prefix: "gpt-3.5", pricing: { input: 0.5, output: 1.5 } },
  { prefix: "gpt-5", pricing: { input: 10.0, output: 30.0 } },
  { prefix: "o3-mini", pricing: { input: 1.1, output: 4.4 } },
  { prefix: "o3", pricing: { input: 10.0, output: 40.0 } },
  { prefix: "o1-mini", pricing: { input: 1.1, output: 4.4 } },
  { prefix: "o1", pricing: { input: 15.0, output: 60.0 } },
  { prefix: "gemini-2.0-flash", pricing: { input: 0.10, output: 0.40 } },
  { prefix: "gemini-2.5-flash", pricing: { input: 0.15, output: 0.60 } },
  { prefix: "gemini-2.5-pro", pricing: { input: 1.25, output: 5.0 } },
  { prefix: "gemini-1.5-flash", pricing: { input: 0.075, output: 0.30 } },
  { prefix: "gemini-1.5-pro", pricing: { input: 1.25, output: 5.0 } },
  { prefix: "gemini", pricing: { input: 0.10, output: 0.40 } },
  { prefix: "github-copilot/sonnet", pricing: { input: 3.0, output: 15.0 } },
  { prefix: "github-copilot/haiku", pricing: { input: 0.25, output: 1.25 } },
  { prefix: "github-copilot/gpt-4", pricing: { input: 2.5, output: 10.0 } },
  { prefix: "github-copilot", pricing: { input: 3.0, output: 15.0 } },
]

const FALLBACK_PRICING: ModelPricing = { input: 3.0, output: 15.0 }

function estimateTokensFromChars(charCount: number): number {
  return charCount <= 0 ? 0 : Math.ceil(charCount / 4)
}

export function getModelPricing(model: string): ModelPricing {
  if (!model) return FALLBACK_PRICING
  const lower = model.toLowerCase()
  for (const entry of PRICING_TABLE) {
    if (lower.startsWith(entry.prefix.toLowerCase())) return entry.pricing
  }
  return FALLBACK_PRICING
}

export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getModelPricing(model)
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

export function estimateCostFromChars(
  model: string,
  inputChars: number,
  outputChars: number,
): number {
  return estimateCostUSD(model, estimateTokensFromChars(inputChars), estimateTokensFromChars(outputChars))
}

/** Conservative per-invocation allowance, shared by drafts, audits and images.
 * Rates: developers.cloudflare.com/workers-ai/platform/pricing/ (2026-09-12).
 * This is a Scout guard, not an account-wide billing limit.
 */
export class ScoutBudget {
  used = 0
  constructor(readonly limit: number) {}
  reserve(neurons: number) {
    if (this.used + neurons > this.limit) throw new Error('scout_budget_exhausted')
    this.used += neurons
  }
  text(messages: { role: string; content: string }[], outputTokens: number) {
    // UTF-8 bytes bound byte-level input tokens; leave room for chat framing.
    const inputBound = messages.reduce((n, m) => n + new TextEncoder().encode(m.content).length, 256)
    const reserved = inputBound * 0.026668 + outputTokens * 0.204805
    this.reserve(reserved)
    return (result: unknown) => {
      if (!result || typeof result !== 'object' || !('usage' in result)) return
      const u = result.usage
      if (!u || typeof u !== 'object' || !('prompt_tokens' in u) || !('completion_tokens' in u)) return
      const input = u.prompt_tokens, output = u.completion_tokens
      if (typeof input !== 'number' || typeof output !== 'number' || !Number.isInteger(input) || !Number.isInteger(output) || input < 0 || output < 0) return
      // Missing usage or failed requests keep the entire reservation.
      const actual = input * 0.026668 + output * 0.204805
      this.used += actual - reserved
    }
  }
}
export const SCOUT_LIMITS = { max_fetches_per_run: 24, max_articles_per_run: 8, runs_per_day: 4, neurons_per_run: 2000, manual_runs_per_day: 2, manual_neurons_per_run: 1000, manual_neurons_per_day: 2000 } as const

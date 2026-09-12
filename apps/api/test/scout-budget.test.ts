import { describe, it, expect, vi } from 'vitest'
import { ScoutBudget } from '../src/scout-budget'
import { draftSource, type Source } from '../src/scout-cloudflare'
describe('Scout inference allowance', () => {
  it('refuses a call before inference starts when the reservation cannot fit', async () => {
    const ai = {run:vi.fn()} as unknown as Ai
    await expect(draftSource(ai,{text:'x'.repeat(8000)} as Source,new ScoutBudget(10))).rejects.toThrow('scout_budget_exhausted')
    expect(ai.run).not.toHaveBeenCalled()
  })
  it('settles from measured token usage and retains reservations when usage is absent', () => {
    const budget = new ScoutBudget(1000)
    const settle = budget.text([{role:'user',content:'hello'}],100)
    const before = budget.used
    settle({response:'no usage'})
    expect(budget.used).toBe(before)
    settle({usage:{prompt_tokens:10,completion_tokens:5}})
    expect(budget.used).toBeCloseTo(10*0.026668+5*0.204805)
    expect(()=>budget.reserve(1000)).toThrow('scout_budget_exhausted')
  })
  it('does not refund failed calls or malformed usage', () => {
    const budget = new ScoutBudget(1000)
    const settle = budget.text([{role:'user',content:'test'}],100)
    const before=budget.used
    settle({usage:{prompt_tokens:-100,completion_tokens:1}})
    expect(budget.used).toBe(before)
    settle({usage:{prompt_tokens:NaN,completion_tokens:1}})
    expect(budget.used).toBe(before)
  })
})

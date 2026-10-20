import { selectModel, type Candidate } from '../select-model'

const candidate = (model: string, overrides: Partial<Candidate> = {}): Candidate => ({
  model,
  local: false,
  gatesPassed: true,
  firstPass: 0.99,
  afterRepair: 1,
  judge: 4,
  costUsd: 5,
  p95LatencyMs: 20_000,
  ...overrides,
})

describe('selectModel', () => {
  it('ranks by judge score, then cost', () => {
    const result = selectModel([
      candidate('anthropic:claude-sonnet-5-5', { judge: 4.2, costUsd: 9 }),
      candidate('openai:gpt-6.1-sol', { judge: 4.2, costUsd: 6 }),
      candidate('google:gemini-4-argon', { judge: 4.6, costUsd: 12 }),
      candidate('openai:gpt-6-luna', { judge: null, costUsd: 1 }),
    ])
    expect(result.ranked).toEqual(['google:gemini-4-argon', 'openai:gpt-6.1-sol', 'anthropic:claude-sonnet-5-5', 'openai:gpt-6-luna'])
    expect(result.selected).toBe('google:gemini-4-argon')
    expect(result.rejected).toEqual([])
  })

  it('requires 98% first-pass grounding, whatever the judge says', () => {
    const result = selectModel([
      candidate('anthropic:claude-sonnet-5-5', { firstPass: 0.979, judge: 5 }),
      candidate('openai:gpt-6.1-sol', { firstPass: 0.98, judge: 3 }),
    ])
    expect(result.selected).toBe('openai:gpt-6.1-sol')
    expect(result.rejected).toEqual([{ model: 'anthropic:claude-sonnet-5-5', reasons: ['first-pass grounding 97.9% is under 98.0%'] }])
  })

  it('rejects a p95 latency of 60 s or more, and failed deterministic gates', () => {
    const result = selectModel([
      candidate('anthropic:claude-sonnet-5-5', { p95LatencyMs: 60_000 }),
      candidate('openai:gpt-6.1-sol', { gatesPassed: false }),
    ])
    expect(result.selected).toBeNull()
    expect(result.rejected.map((r) => r.reasons)).toEqual([['p95 latency 60.0 s is not under 60 s'], ['deterministic gates failed']])
  })

  it('offers a local model as a preset at 95% first-pass and 100% after repair', () => {
    const result = selectModel([
      candidate('openai-compatible:qwen3.6:27b', { local: true, firstPass: 0.95, afterRepair: 1, judge: 5 }),
      candidate('openai-compatible:gemma4:26b', { local: true, firstPass: 0.97, afterRepair: 0.99 }),
      candidate('anthropic:claude-sonnet-5-5'),
    ])
    expect(result.localPresets).toEqual(['openai-compatible:qwen3.6:27b'])
    // Under 98% it is a preset, never the default
    expect(result.selected).toBe('anthropic:claude-sonnet-5-5')
  })
})

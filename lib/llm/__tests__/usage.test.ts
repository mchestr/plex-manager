/**
 * Tests for lib/llm/usage.ts - one LLMUsage row per billed attempt
 */

import { mockReset } from 'jest-mock-extended'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildLLMUsage } from '@/__tests__/helpers/factories'
import { recordUsage } from '@/lib/llm/usage'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

const usage = { inputTokens: 3000, cachedInputTokens: 1024, outputTokens: 900, reasoningTokens: 300 }

describe('recordUsage', () => {
  it('writes every column, including the served model, cache and reasoning tokens and the outcome', async () => {
    prismaMock.lLMUsage.create.mockResolvedValue(buildLLMUsage())

    await recordUsage({
      attribution: {
        userId: 'user-1',
        wrappedId: 'wrapped-1',
        generationId: 'gen-1',
        promptVersion: 'rewind-2026.1',
        factsHash: 'abc123',
      },
      provider: 'openai',
      modelId: 'gpt-6-luna-2026-09-22',
      usage,
      cost: 0.0005,
      outcome: 'length',
      prompt: 'prompt',
      response: '{"partial',
    })

    expect(prismaMock.lLMUsage.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        wrappedId: 'wrapped-1',
        generationId: 'gen-1',
        chatConversationId: null,
        promptVersion: 'rewind-2026.1',
        factsHash: 'abc123',
        provider: 'openai',
        model: 'gpt-6-luna-2026-09-22',
        prompt: 'prompt',
        response: '{"partial',
        promptTokens: 3000,
        completionTokens: 900,
        totalTokens: 3900,
        cachedInputTokens: 1024,
        reasoningTokens: 300,
        cost: 0.0005,
        outcome: 'length',
      },
    })
  })

  it('stores no text and null attribution by default', async () => {
    prismaMock.lLMUsage.create.mockResolvedValue(buildLLMUsage())

    await recordUsage({ attribution: { userId: 'user-1' }, provider: 'anthropic', modelId: 'claude-sonnet-5-5', usage, cost: 0, outcome: 'ok' })

    expect(prismaMock.lLMUsage.create.mock.calls[0][0].data).toMatchObject({
      wrappedId: null,
      generationId: null,
      promptVersion: null,
      factsHash: null,
      prompt: null,
      response: null,
      outcome: 'ok',
    })
  })

  it('logs and swallows a failed write', async () => {
    prismaMock.lLMUsage.create.mockRejectedValue(new Error('db down'))

    await expect(
      recordUsage({ attribution: { userId: 'user-1' }, provider: 'openai', modelId: 'gpt-4o', usage, cost: 0, outcome: 'ok' })
    ).resolves.toBeUndefined()
  })
})

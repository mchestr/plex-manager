/**
 * @jest-environment node
 */

/**
 * `effectiveRewindLlmMode` (P7.12): `Config.llmDisabled` forces template copy,
 * and the copy step then makes no model call.
 */

import { loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { fixtureMember } from '@/evals/rewind/__tests__/member-stats'
import { FIXTURE_USER_ID } from '@/evals/rewind/__tests__/stats-inputs'
import { effectiveRewindLlmMode } from '@/lib/wrapped/config'
import { buildIssue, type Issue } from '@/lib/wrapped/pipeline/build-issue'
import { runCopyStep } from '@/lib/wrapped/pipeline/copy-step'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

describe('effectiveRewindLlmMode', () => {
  it.each(['standard', 'economy', 'off'])('llmDisabled forces off over %s', (rewindLlmMode) => {
    expect(effectiveRewindLlmMode({ llmDisabled: true, rewindLlmMode })).toBe('off')
  })

  it('keeps the stored mode while AI features are on, and reads an unknown value as standard', () => {
    expect(effectiveRewindLlmMode({ llmDisabled: false, rewindLlmMode: 'economy' })).toBe('economy')
    expect(effectiveRewindLlmMode({ llmDisabled: false, rewindLlmMode: 'off' })).toBe('off')
    expect(effectiveRewindLlmMode({ llmDisabled: false, rewindLlmMode: 'turbo' })).toBe('standard')
  })
})

describe('the copy step under llmDisabled', () => {
  let issue: Issue

  beforeAll(async () => {
    const heavy = loadFixtures().find((f) => f.id === 'heavy')!
    const member = await fixtureMember(heavy)
    issue = buildIssue({
      userId: FIXTURE_USER_ID,
      year: 2026,
      stats: member.stats,
      member: { name: 'Mike', nthRewind: 1, serial: 'K7Q4' },
      window: { ...member.ctx.window, year: 2026, finalCut: false },
      locale: 'en-US',
      counts: null,
      medians: null,
      disabledPages: [],
    })
  })

  it.each(['standard', 'economy'])('writes template copy with no call when the stored mode is %s', async (rewindLlmMode) => {
    const generate = jest.fn()
    const result = await runCopyStep({
      userId: FIXTURE_USER_ID,
      year: 2026,
      edition: issue.edition,
      facts: issue.facts,
      factsHash: issue.factsHash,
      selected: issue.pages.map((p) => p.type),
      archetype: issue.archetype,
      policy: 'default',
      promptVersion: 'rewind-2026.1',
      previous: null,
      llm: {
        disabled: false,
        mode: effectiveRewindLlmMode({ llmDisabled: true, rewindLlmMode }),
        provider: { provider: 'anthropic', model: 'claude-sonnet-5-5' },
        budgetReached: false,
      },
      call: {
        generate,
        consume: jest.fn(async () => ({ ok: true as const })),
        signal: new AbortController().signal,
        attribution: { userId: FIXTURE_USER_ID },
      },
    })

    expect(generate).not.toHaveBeenCalled()
    expect(result).toMatchObject({ source: 'template', model: null, trail: { path: 'template', reason: 'MODE_OFF', calls: 0 } })
  })
})

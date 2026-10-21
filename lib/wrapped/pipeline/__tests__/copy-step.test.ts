/**
 * @jest-environment node
 */

/**
 * The copy step (design 8.5, 8.7) on the heavy fixture, with the real
 * `generateStructured` over the AI SDK's mock language model.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { MockLanguageModelV4 } from 'ai/test'

import { loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { fixtureMember } from '@/evals/rewind/__tests__/member-stats'
import { FIXTURE_USER_ID } from '@/evals/rewind/__tests__/stats-inputs'
import type { LLMProvider } from '@/lib/generated/prisma/client'
import { generateStructured } from '@/lib/llm/generate-structured'
import { lookupModel } from '@/lib/llm/models'
import { getLanguageModel } from '@/lib/llm/registry'
import type { RewindCopyV3Wire } from '@/lib/wrapped/copy/schema'
import { copyLocals, slotTemplate } from '@/lib/wrapped/copy/templates'
import { buildIssue, type Issue } from '@/lib/wrapped/pipeline/build-issue'
import type { GenerateFn } from '@/lib/wrapped/pipeline/copy-llm'
import { runCopyStep, type CopyInput, type PreviousCopy } from '@/lib/wrapped/pipeline/copy-step'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/llm/registry', () => ({ getLanguageModel: jest.fn(), LLMConfigError: class extends Error {} }))
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

type Reply = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>

const HEAVY = loadFixtures().find((f) => f.id === 'heavy')!
const RECORDING = JSON.parse(
  readFileSync(path.join(__dirname, '..', '..', '..', '..', 'evals', 'rewind', 'recordings', 'hand', 'heavy.json'), 'utf8')
) as { calls: Array<{ output: unknown }> }
/** The heavy recording's copy with its deck.clock fixed, so every slot passes. */
const GOOD: RewindCopyV3Wire = JSON.parse(JSON.stringify(RECORDING.calls[0].output))
GOOD.decks.clock = '{{fact:hours.afterDarkShare}} of it started after dark.'

const ROW: LLMProvider = {
  id: 'row-1', provider: 'anthropic', purpose: 'wrapped', apiKey: 'key', model: 'claude-sonnet-5-5', temperature: null,
  maxTokens: null, baseUrl: null, effort: null, isActive: true, createdAt: new Date(0), updatedAt: new Date(0),
}

function reply(text: string, unified: Reply['finishReason']['unified'] = 'stop'): Reply {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified, raw: unified },
    usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 50, text: 50, reasoning: 0 } },
    warnings: [],
    response: { id: 'r', modelId: 'claude-sonnet-5-5', timestamp: new Date(0) },
  }
}

/** Answers the calls in order and records the model each one asked for. */
function answer(...replies: Reply[]) {
  const asked: Array<string | undefined> = []
  let next = 0
  const model = new MockLanguageModelV4({ doGenerate: async () => replies[next++] ?? reply('{}') })
  jest.mocked(getLanguageModel).mockImplementation(async (_purpose, override) => {
    asked.push(override?.model)
    return { model, info: lookupModel('anthropic', override?.model ?? ROW.model), row: ROW }
  })
  return { asked, calls: () => next }
}

let issue: Issue

beforeAll(async () => {
  const member = await fixtureMember(HEAVY)
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

beforeEach(() => jest.clearAllMocks())

function input(overrides: Partial<CopyInput> = {}, llm: Partial<CopyInput['llm']> = {}): CopyInput {
  return {
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
    llm: { disabled: false, mode: 'standard', provider: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, budgetReached: false, ...llm },
    call: {
      generate: generateStructured,
      consume: jest.fn(async () => ({ ok: true as const })),
      signal: new AbortController().signal,
      attribution: { userId: FIXTURE_USER_ID },
      styleGuide: null,
    },
    ...overrides,
  }
}

const templateOf = (id: Parameters<typeof slotTemplate>[0]) => slotTemplate(id, { facts: issue.facts, userId: FIXTURE_USER_ID })

describe('runCopyStep', () => {
  it('writes every slot from one call when grounding passes', async () => {
    const model = answer(reply(JSON.stringify(GOOD)))

    const result = await runCopyStep(input())

    expect(model.calls()).toBe(1)
    expect(result).toMatchObject({ source: 'llm', model: 'anthropic:claude-sonnet-5-5', copy: { decks: { clock: GOOD.decks.clock } } })
    expect(Object.keys(result.slotHashes)).toContain('deck.clock')
  })

  it('reuses the stored copy with no call when factsHash, prompt and model match', async () => {
    const model = answer()
    const previous: PreviousCopy = {
      factsHash: issue.factsHash, promptVersion: 'rewind-2026.1', model: 'anthropic:claude-sonnet-5-5', copy: GOOD, copySource: 'llm', slotHashes: {},
    }

    const result = await runCopyStep(input({ previous }))

    expect(model.calls()).toBe(0)
    expect(result).toMatchObject({ copy: GOOD, source: 'llm', trail: { path: 'reused' } })
    // A different model is not a match
    await runCopyStep(input({ previous: { ...previous, model: 'anthropic:claude-opus-5-5' } }))
    expect(model.calls()).toBe(1)
  })

  it('no-llm keeps the slots whose dependency hash held and templates the rest', async () => {
    answer(reply(JSON.stringify(GOOD)))
    const first = await runCopyStep(input())
    const previous: PreviousCopy = {
      factsHash: 'older', promptVersion: 'rewind-2026.1', model: first.model, copy: first.copy!, copySource: 'llm',
      slotHashes: { ...first.slotHashes, 'deck.topShows': 'changed' },
    }
    const model = answer()

    const result = await runCopyStep(input({ policy: 'no-llm', previous }))

    expect(model.calls()).toBe(0)
    expect(result.copy?.decks.clock).toBe(GOOD.decks.clock)
    expect(result.copy?.decks.topShows).toBe(templateOf('deck.topShows'))
    expect(result.source).toBe('mixed')
  })

  it('repairs only the failing slots in one call on the budget model, and a slot that still fails falls back alone', async () => {
    const bad = { ...GOOD, decks: { ...GOOD.decks, clock: 'Most of it after dark.', calendar: 'You watched on 3 days.' } }
    const model = answer(
      reply(JSON.stringify(bad)),
      reply(JSON.stringify({ deck_clock: '{{fact:hours.afterDarkShare}} of it started after dark.', deck_calendar: 'Three days.' }))
    )

    const base = input()
    const prompts: string[] = []
    const generate: GenerateFn = (call) => {
      prompts.push(call.prompt)
      return generateStructured(call)
    }

    const result = await runCopyStep({ ...base, call: { ...base.call, generate } })

    expect(model.calls()).toBe(2)
    expect(model.asked).toEqual([undefined, 'claude-haiku-5-5'])
    const repairPrompt = prompts[1]
    expect(repairPrompt).toContain('- deck.clock:')
    expect(repairPrompt).toContain('- deck.calendar:')
    expect(repairPrompt).not.toContain('- deck.topShows:')
    expect(result.trail.repaired).toEqual(['deck.clock'])
    expect(result.trail.fallbacks).toEqual(['deck.calendar'])
    expect(result.copy?.decks.clock).toBe('{{fact:hours.afterDarkShare}} of it started after dark.')
    expect(result.copy?.decks.calendar).toBe(templateOf('deck.calendar'))
    expect(result.copy?.decks.topShows).toBe(GOOD.decks.topShows)
    expect(result.source).toBe('mixed')
  })

  it.each([
    ['TRUNCATED', reply('{"decks": {', 'length')],
    ['SCHEMA', reply('{"decks": "not an object"}')],
  ])('makes every slot a template on %s', async (code, first) => {
    const model = answer(first)

    const result = await runCopyStep(input())

    expect(model.calls()).toBe(1)
    expect(result).toMatchObject({ source: 'template', model: null, trail: { reason: code } })
    expect(result.copy?.decks.clock).toBe(templateOf('deck.clock'))
  })

  it('makes no call once the season budget is reached', async () => {
    const model = answer()
    const result = await runCopyStep(input({}, { budgetReached: true }))
    expect(model.calls()).toBe(0)
    expect(result).toMatchObject({ source: 'template', trail: { reason: 'BUDGET_REACHED' } })
  })

  it('writes with the budget model in economy mode', async () => {
    const model = answer(reply(JSON.stringify(GOOD)))
    const result = await runCopyStep(input({}, { mode: 'economy' }))
    expect(model.asked).toEqual(['claude-haiku-5-5'])
    expect(result.model).toBe('anthropic:claude-haiku-5-5')
  })

  it('lets llmDisabled override the standard mode, and needs a provider', async () => {
    const model = answer(reply(JSON.stringify(GOOD)))
    await expect(runCopyStep(input({}, { disabled: true }))).resolves.toMatchObject({ source: 'template', trail: { reason: 'LLM_DISABLED' } })
    await expect(runCopyStep(input({}, { mode: 'off' }))).resolves.toMatchObject({ trail: { reason: 'MODE_OFF' } })
    await expect(runCopyStep(input({}, { provider: null }))).resolves.toMatchObject({ trail: { reason: 'NO_PROVIDER' } })
    expect(model.calls()).toBe(0)
  })

  it('stores no copy for the pocket edition and the postcard', async () => {
    const model = answer()
    await expect(runCopyStep(input({ edition: 'pocket' }))).resolves.toMatchObject({ copy: null, source: 'template', trail: { calls: 0 } })
    expect(model.calls()).toBe(0)
  })

  it('waits for an rw:llm point before calling', async () => {
    answer(reply(JSON.stringify(GOOD)))
    const consume = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, retryAfterSec: 0 })
      .mockResolvedValue({ ok: true })
    const base = input()

    await runCopyStep({ ...base, call: { ...base.call, consume } })

    expect(consume).toHaveBeenCalledTimes(2)
    expect(consume).toHaveBeenCalledWith('anthropic')
  })
})

describe("copyPolicy 'changed-slots' (the final cut, P8.5)", () => {
  const KEPT_CLOCK = 'Kept from the season: {{fact:hours.afterDarkShare}} of it started after dark.'
  const final = () => ({ ...issue.facts, 'window.finalCut': { value: 1, display: '1', unit: 'count' as const } })

  async function seasonCopy(): Promise<PreviousCopy> {
    answer(reply(JSON.stringify(GOOD)))
    const first = await runCopyStep(input())
    return {
      factsHash: 'season', promptVersion: 'rewind-2026.1', model: first.model, copySource: 'llm',
      copy: { ...first.copy!, decks: { ...first.copy!.decks, clock: KEPT_CLOCK } },
      slotHashes: first.slotHashes,
    }
  }

  it('makes no call and keeps every slot when no dependency changed', async () => {
    const previous = await seasonCopy()
    const model = answer()

    const result = await runCopyStep(input({ policy: 'changed-slots', previous, facts: final(), factsHash: 'final' }))

    expect(model.calls()).toBe(0)
    expect(result).toMatchObject({ source: 'llm', model: previous.model, trail: { path: 'changed-slots', calls: 0 } })
    expect(result.copy?.decks.clock).toBe(KEPT_CLOCK)
  })

  it('sends only the changed slots to the model and keeps the rest', async () => {
    const previous = await seasonCopy()
    const model = answer(reply(JSON.stringify(GOOD)))
    const prompts: string[] = []
    const base = input({ policy: 'changed-slots', previous: { ...previous, slotHashes: { ...previous.slotHashes, 'deck.topShows': 'changed' } }, facts: final(), factsHash: 'final' })
    const generate: GenerateFn = (call) => {
      prompts.push(call.prompt)
      return generateStructured(call)
    }

    const result = await runCopyStep({ ...base, call: { ...base.call, generate } })

    expect(model.calls()).toBe(1)
    expect(prompts[0]).toContain('deck.topShows')
    expect(prompts[0]).not.toContain('deck.clock')
    expect(result.copy?.decks.topShows).toBe(GOOD.decks.topShows)
    expect(result.copy?.decks.clock).toBe(KEPT_CLOCK)
    expect(result.copy?.archetype.posterLineId).toBe(previous.copy.archetype.posterLineId)
    expect(Object.keys(result.slotHashes)).toEqual(Object.keys(previous.slotHashes))
  })

  it('templates only the changed slots once the season budget is reached', async () => {
    const previous = await seasonCopy()
    const model = answer()

    const result = await runCopyStep(
      input({ policy: 'changed-slots', previous: { ...previous, slotHashes: { ...previous.slotHashes, 'deck.topShows': 'changed' } }, facts: final() }, { budgetReached: true })
    )

    expect(model.calls()).toBe(0)
    expect(result).toMatchObject({ source: 'mixed', trail: { path: 'changed-slots', reason: 'BUDGET_REACHED' } })
    expect(result.copy?.decks.topShows).toBe(slotTemplate('deck.topShows', { facts: final(), userId: FIXTURE_USER_ID, locals: copyLocals({ year: 2026 }) }))
    expect(result.copy?.decks.clock).toBe(KEPT_CLOCK)
  })

  it('templates a kept text with window words again for the full year', async () => {
    const previous = await seasonCopy()
    const soFar = 'That is {{fact:time.perDay}} a day so far.'
    answer()

    const result = await runCopyStep(
      input({ policy: 'changed-slots', previous: { ...previous, copy: { ...previous.copy, decks: { ...previous.copy.decks, number: soFar } } }, facts: final() })
    )

    const template = slotTemplate('deck.number', { facts: final(), userId: FIXTURE_USER_ID, locals: copyLocals({ year: 2026 }) })
    expect(result.copy?.decks.number).toBe(template)
    expect(template).not.toContain('so far')
  })

  it('writes every slot, as the default policy does, for a member with no stored copy', async () => {
    const model = answer(reply(JSON.stringify(GOOD)))

    const result = await runCopyStep(input({ policy: 'changed-slots', previous: null, facts: final() }))

    expect(model.calls()).toBe(1)
    expect(result).toMatchObject({ source: 'llm', trail: { path: 'llm' } })
  })
})

/**
 * @jest-environment node
 */

import { MockLanguageModelV4 } from 'ai/test'

import type { StructuredDeps } from '@/lib/llm/generate-structured'
import { lookupModel } from '@/lib/llm/models'

import { evalRow, readRecording, replayDeps } from '../harness'
import type { ModelRef } from '../model-ref'
import { evalResults, type EvalResults } from '../results-schema'
import { runEval, type EvalIO, type EvalOptions } from '../run-eval'
import { loadFixtures } from './load-fixtures'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const fixtures = loadFixtures().filter((f) => f.id === 'heavy' || f.id === 'light')

/** The judge: a mock model that always answers with the same scores. */
function judgeDeps(ref: ModelRef, events: string[]): StructuredDeps {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: JSON.stringify({ voice: 4, specificity: 4, warmth: 5, restraint: 4, faithfulness: 5, notes: 'Fine.' }) }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: { inputTokens: { total: 3000, noCache: 3000, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 100, text: 100, reasoning: 0 } },
      warnings: [],
      response: { id: 'judge', modelId: ref.id, timestamp: new Date(0) },
    }),
  })
  return {
    resolve: async () => {
      events.push(`call:${ref.id}`)
      return { model, info: lookupModel(ref.provider, ref.id), row: evalRow(ref) }
    },
    record: async () => {},
  }
}

function setup() {
  const events: string[] = []
  const written: Array<{ fileName: string; results: EvalResults }> = []
  const io = {
    log: jest.fn((line: string) => void events.push(`log:${line}`)),
    confirm: jest.fn(async (): Promise<boolean> => {
      events.push('confirm')
      return true
    }),
    now: () => new Date('2026-11-18T09:00:00Z'),
    // The "live" generator answers with heavy's hand recording, the judge with fixed scores
    liveDeps: jest.fn((ref: ModelRef) => {
      if (ref.provider !== 'anthropic') return judgeDeps(ref, events)
      const { deps } = replayDeps(readRecording('hand', 'heavy'), ref)
      return { ...deps, resolve: async (purpose, override) => (events.push(`call:${override.model ?? ref.id}`), deps.resolve(purpose, override)) }
    }) as EvalIO['liveDeps'],
    writeResults: jest.fn(async (fileName: string, results: EvalResults) => void written.push({ fileName, results })),
    writeRecording: jest.fn(async () => {}),
    saveRun: jest.fn(async () => {}),
  } satisfies EvalIO
  return { io, events, written }
}

const options = (overrides: Partial<EvalOptions> = {}): EvalOptions => ({
  model: 'anthropic:claude-sonnet-5-5',
  record: false,
  yes: false,
  allowUnpriced: false,
  ...overrides,
})

describe('runEval', () => {
  it('prints the estimate before any model call, then asks to confirm', async () => {
    const { io, events } = setup()
    await runEval(options({ judge: 'openai:gpt-6-astra' }), fixtures, io)

    const estimate = events.findIndex((e) => e.startsWith('log:Estimated cost:'))
    const confirm = events.indexOf('confirm')
    const firstCall = events.findIndex((e) => e.startsWith('call:'))
    expect(estimate).toBeGreaterThanOrEqual(0)
    expect(estimate).toBeLessThan(confirm)
    expect(confirm).toBeLessThan(firstCall)
    // 1 of the 2 fixtures calls the model: the generation estimate plus $0.05 for the judge
    expect(events[estimate]).toMatch(/1 x 4400 in \/ 1500 out tokens.*\+ \$0\.05 judge/)
  })

  it('makes no call when the confirmation is declined', async () => {
    const { io, events } = setup()
    io.confirm.mockResolvedValueOnce(false)
    await expect(runEval(options(), fixtures, io)).resolves.toBeNull()
    expect(events.some((e) => e.startsWith('call:'))).toBe(false)
    expect(io.writeResults).not.toHaveBeenCalled()
  })

  it('skips the confirmation with --yes', async () => {
    const { io, events } = setup()
    await runEval(options({ yes: true }), fixtures, io)
    expect(io.confirm).not.toHaveBeenCalled()
    expect(events.filter((e) => e.startsWith('call:'))).toEqual(['call:claude-sonnet-5-5', 'call:claude-haiku-5-5'])
  })

  it('refuses a judge from the generator family', async () => {
    const { io } = setup()
    await expect(runEval(options({ judge: 'anthropic:claude-opus-5-5' }), fixtures, io)).rejects.toThrow(/same family/)
    await expect(runEval(options({ model: 'ollama:gemma4:26b', allowUnpriced: true, judge: 'google:gemini-4-argon' }), fixtures, io)).rejects.toThrow(
      /same family/
    )
    expect(io.log).not.toHaveBeenCalled()
  })

  it('refuses an unpriced model unless allowed', async () => {
    const { io } = setup()
    await expect(runEval(options({ model: 'ollama:qwen3.6:27b' }), fixtures, io)).rejects.toThrow(/--allow-unpriced/)
  })

  it('writes a results file that validates, with advisory judge scores, and a RewindEvalRun row', async () => {
    const { io, written } = setup()
    const results = await runEval(options({ yes: true, judge: 'openai:gpt-6-astra', record: true }), fixtures, io)

    expect(written).toHaveLength(1)
    expect(written[0].fileName).toBe('2026-11-18-anthropic-claude-sonnet-5-5.json')
    expect(evalResults.safeParse(JSON.parse(JSON.stringify(written[0].results))).success).toBe(true)
    expect(results).toMatchObject({
      model: 'anthropic:claude-sonnet-5-5',
      source: 'live',
      judge: 'openai:gpt-6-astra',
      judgeMean: 4.4,
      rates: { firstPass: 12 / 13, afterRepair: 1 },
      gates: { passed: true },
    })
    expect(results!.fixtures.find((f) => f.id === 'light')).toMatchObject({ calls: 0, judge: null })
    expect(results!.cost.judgeUsd).toBeGreaterThan(0)
    expect(io.saveRun).toHaveBeenCalledWith(expect.objectContaining({ model: 'anthropic:claude-sonnet-5-5', fixtures: ['heavy', 'light'], results }))
    expect(io.writeRecording).toHaveBeenCalledWith(
      'anthropic-claude-sonnet-5-5',
      expect.objectContaining({ fixture: 'heavy', model: 'anthropic:claude-sonnet-5-5', calls: [expect.objectContaining({ kind: 'copy' }), expect.objectContaining({ kind: 'repair' })] })
    )
  })

  it('replays a recording set offline without asking, at no cost', async () => {
    const { io } = setup()
    const results = await runEval(options({ model: undefined, replay: 'hand' }), fixtures, io)
    expect(io.confirm).not.toHaveBeenCalled()
    expect(io.liveDeps).not.toHaveBeenCalled()
    expect(results).toMatchObject({ model: 'replay:hand', source: 'replay', recordings: 'hand', cost: { totalUsd: 0 } })
  })
})

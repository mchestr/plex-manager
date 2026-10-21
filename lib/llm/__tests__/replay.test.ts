/**
 * @jest-environment node
 *
 * `replay:selected` (P7.11): the selected model's recordings answer the model
 * calls through the real `generateStructured`, with no network and no usage
 * row. The recordings of the "selected" model here are the hand set.
 */

import { readRecording } from '@/evals/rewind/harness'
import { selectedReplay, replayGenerate } from '@/lib/llm/replay'
import { recordUsage } from '@/lib/llm/usage'
import { RewindCopyV3Wire } from '@/lib/wrapped/copy/schema'

const SELECTED = 'anthropic:claude-sonnet-5-5'
const SET = 'anthropic-claude-sonnet-5-5'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))
jest.mock('@/evals/rewind/harness', () => {
  const actual = jest.requireActual('@/evals/rewind/harness')
  return {
    ...actual,
    recordingSets: () => [...actual.recordingSets(), 'anthropic-claude-sonnet-5-5'],
    readRecording: (set: string, fixtureId: string) => actual.readRecording(set === 'anthropic-claude-sonnet-5-5' ? 'hand' : set, fixtureId),
  }
})

const realFetch = global.fetch
beforeAll(() => {
  global.fetch = jest.fn(async () => {
    throw new Error('A replay must not touch the network')
  })
})
afterAll(() => {
  global.fetch = realFetch
})

describe('selectedReplay', () => {
  it('finds nothing to replay while selected.json names no model', () => {
    expect(selectedReplay()).toBeNull()
    expect(selectedReplay(() => JSON.stringify({ model: null }))).toBeNull()
  })

  it('finds nothing when the selected model has no recording set', () => {
    expect(selectedReplay(() => JSON.stringify({ model: 'openai:gpt-9' }))).toBeNull()
  })

  it('names the selected model and its recording set', () => {
    expect(selectedReplay(() => JSON.stringify({ model: SELECTED }))).toEqual({ model: { provider: 'anthropic', id: 'claude-sonnet-5-5' }, set: SET })
  })
})

describe('replayGenerate', () => {
  it('returns the recorded output, with fetch stubbed to throw and no usage written', async () => {
    const source = selectedReplay(() => JSON.stringify({ model: SELECTED }))
    if (!source) throw new Error('expected a replay source')
    const generate = replayGenerate(source, 'median')
    const result = await generate({ purpose: 'wrapped', schema: RewindCopyV3Wire, system: 'system', prompt: 'prompt', attribution: { userId: 'fixture' } })

    const recorded = readRecording('hand', 'median').calls[0]
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.output).toEqual(RewindCopyV3Wire.parse(recorded.output))
    expect(result.value.modelId).toBe('claude-sonnet-5-5')
    expect(global.fetch).not.toHaveBeenCalled()
    expect(recordUsage).not.toHaveBeenCalled()
  })
})

/**
 * @jest-environment node
 */

/**
 * The regeneration a hide or unhide enqueues (P7.7): the job waits out a held
 * lock instead of skipping, runs once more when a hide lands mid-run, and its
 * `no-llm` copy keeps every slot whose identity facts held while the hidden
 * No. 1 leaves the lists and the totals stay as they were.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { DelayedError, type Job } from 'bullmq'
import { mockReset } from 'jest-mock-extended'

import { loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { fixtureMember } from '@/evals/rewind/__tests__/member-stats'
import { FIXTURE_USER_ID } from '@/evals/rewind/__tests__/stats-inputs'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { processRewindGenerateUser } from '@/lib/queue/jobs/rewind'
import { acquireGenerationLock } from '@/lib/locks/generation-lock'
import type { RewindGenerateUserPayload } from '@/lib/queue/types'
import { enqueueRewindGeneration } from '@/lib/rewind/enqueue-generation'
import { COPY_SLOTS, slotDependencyHash } from '@/lib/wrapped/copy/slots'
import type { RewindCopyV3Wire } from '@/lib/wrapped/copy/schema'
import { buildIssue, type Issue } from '@/lib/wrapped/pipeline/build-issue'
import { textSlots, wireText } from '@/lib/wrapped/pipeline/copy-draft'
import { runCopyStep, type CopyInput } from '@/lib/wrapped/pipeline/copy-step'
import { generateUserRewind } from '@/lib/wrapped/pipeline/generate-user'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/queue/connection', () => ({ getRedisConnection: jest.fn(() => ({ fake: 'redis' })) }))
jest.mock('@/lib/locks/generation-lock', () => ({ acquireGenerationLock: jest.fn() }))
jest.mock('@/lib/rewind/enqueue-generation', () => ({ enqueueRewindGeneration: jest.fn() }))
jest.mock('@/lib/wrapped/pipeline/generate-user', () => ({ generateUserRewind: jest.fn() }))
jest.mock('@/lib/llm/registry', () => ({ getLanguageModel: jest.fn(), LLMConfigError: class extends Error {} }))
jest.mock('@/lib/llm/usage', () => ({ recordUsage: jest.fn() }))
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('@/lib/instrumentation/shutdown', () => ({ shutdownSignal: new AbortController().signal }))

const generate = jest.mocked(generateUserRewind)
const acquire = jest.mocked(acquireGenerationLock)
const release = jest.fn(async () => true)

type FakeJob = Job<RewindGenerateUserPayload> & { updateData: jest.Mock; moveToDelayed: jest.Mock }

function exclusionJob(lockWaits?: number): FakeJob {
  return {
    id: 'gen-1',
    token: 'worker-token',
    data: { generationId: 'gen-1', userId: 'user-1', year: 2026, exclusion: true, ...(lockWaits !== undefined && { lockWaits }) },
    attemptsMade: 0,
    opts: { attempts: 3 },
    updateData: jest.fn(async () => undefined),
    moveToDelayed: jest.fn(async () => undefined),
  } as unknown as FakeJob
}

describe('the exclusion run', () => {
  beforeEach(() => {
    mockReset(prismaMock)
    jest.clearAllMocks()
    prismaMock.rewindGeneration.findUnique.mockResolvedValue({ wrappedId: 'wrapped-1', status: 'queued', kind: 'member', copyPolicy: 'no-llm' } as never)
    prismaMock.lLMUsage.aggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { cost: null } } as never)
    acquire.mockResolvedValue({ release })
    generate.mockResolvedValue({ status: 'completed' } as never)
  })

  it('waits 30 s for a held lock instead of skipping', async () => {
    acquire.mockResolvedValue(null)
    const job = exclusionJob()
    const before = Date.now()

    await expect(processRewindGenerateUser(job)).rejects.toBeInstanceOf(DelayedError)

    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ lockWaits: 1 }))
    const [until, token] = job.moveToDelayed.mock.calls[0]
    expect(until).toBeGreaterThanOrEqual(before + 30_000)
    expect(token).toBe('worker-token')
    expect(prismaMock.rewindGeneration.update).not.toHaveBeenCalled()
    expect(generate).not.toHaveBeenCalled()
  })

  it('ends as skipped once it has waited 10 times', async () => {
    acquire.mockResolvedValue(null)

    await expect(processRewindGenerateUser(exclusionJob(10))).resolves.toEqual({ status: 'skipped' })

    expect(prismaMock.rewindGeneration.update).toHaveBeenCalledWith({
      where: { id: 'gen-1' },
      data: expect.objectContaining({ status: 'skipped', error: { code: 'LOCKED' } }),
    })
  })

  it('runs no-llm and enqueues one more run when a hide landed mid-run', async () => {
    prismaMock.rewindPrefs.findUnique.mockResolvedValueOnce({ exclusionsVersion: 3 } as never).mockResolvedValueOnce({ exclusionsVersion: 4 } as never)

    await expect(processRewindGenerateUser(exclusionJob())).resolves.toEqual({ status: 'completed' })

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ copyPolicy: 'no-llm', kind: 'member' }))
    expect(enqueueRewindGeneration).toHaveBeenCalledTimes(1)
    expect(enqueueRewindGeneration).toHaveBeenCalledWith({ userId: 'user-1', year: 2026, kind: 'member', exclusion: { followUp: true } })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('does not run again when no hide landed', async () => {
    prismaMock.rewindPrefs.findUnique.mockResolvedValue({ exclusionsVersion: 3 } as never)

    await processRewindGenerateUser(exclusionJob())

    expect(enqueueRewindGeneration).not.toHaveBeenCalled()
  })
})

describe('hiding the No. 1 series', () => {
  const HEAVY = loadFixtures().find((f) => f.id === 'heavy')!
  const RECORDING = JSON.parse(
    readFileSync(path.join(__dirname, '..', '..', '..', '..', 'evals', 'rewind', 'recordings', 'hand', 'heavy.json'), 'utf8')
  ) as { calls: Array<{ output: RewindCopyV3Wire }> }

  async function issueFor(hiddenRatingKeys: string[]): Promise<Issue> {
    const member = await fixtureMember({ ...HEAVY, member: { ...HEAVY.member, hiddenRatingKeys } })
    return buildIssue({
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
  }

  const hashes = (issue: Issue) => Object.fromEntries(textSlots(issue.pages.map((p) => p.type)).map((id) => [id, slotDependencyHash(COPY_SLOTS[id], issue.facts)]))

  function copyInput(issue: Issue, overrides: Partial<CopyInput>): CopyInput {
    return {
      userId: FIXTURE_USER_ID,
      year: 2026,
      edition: issue.edition,
      facts: issue.facts,
      factsHash: issue.factsHash,
      selected: issue.pages.map((p) => p.type),
      archetype: issue.archetype,
      policy: 'no-llm',
      promptVersion: 'rewind-2026.1',
      previous: null,
      llm: { disabled: false, mode: 'standard', provider: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, budgetReached: false },
      call: {
        generate: jest.fn(),
        consume: jest.fn(async () => ({ ok: true as const })),
        signal: new AbortController().signal,
        attribution: { userId: FIXTURE_USER_ID },
      },
      ...overrides,
    }
  }

  it('makes no LLM call, re-templates only the slots whose identity facts changed, and keeps the totals', async () => {
    const before = await issueFor([])
    const no1 = before.facts['series[1].title']!
    const keyOfNo1 = (before.pages.find((p) => p.type === 'top-shows')!.data as { rows: Array<{ key: string }> }).rows[0].key.split(':')[1]
    const after = await issueFor([keyOfNo1])

    const stored = RECORDING.calls[0].output
    const previous = { factsHash: before.factsHash, promptVersion: 'rewind-2026.1', model: 'anthropic:claude-sonnet-5-5', copy: stored, copySource: 'llm' as const, slotHashes: hashes(before) }
    const input = copyInput(after, { previous })
    const result = await runCopyStep(input)
    const templates = await runCopyStep(copyInput(after, {}))

    expect(input.call.generate).not.toHaveBeenCalled()
    expect(result.trail).toMatchObject({ path: 'no-llm', calls: 0 })
    expect(after.facts['series[1].title']!.display).not.toBe(no1.display)
    expect(after.facts['time.totalHours']).toEqual(before.facts['time.totalHours'])

    const afterHashes = hashes(after)
    const changed = Object.keys(afterHashes).filter((id) => afterHashes[id] !== previous.slotHashes[id])
    expect(changed).toContain('deck.topShows')
    expect(changed.length).toBeLessThan(Object.keys(afterHashes).length)
    for (const id of textSlots(input.selected)) {
      const expected = changed.includes(id) ? wireText(templates.copy!, id) : wireText(stored, id)
      expect([id, wireText(result.copy!, id)]).toEqual([id, expected])
    }
  })
})

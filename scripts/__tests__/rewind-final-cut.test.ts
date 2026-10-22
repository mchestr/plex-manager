/**
 * @jest-environment node
 */

/**
 * The final cut's dry-run script (P8.5): its arguments, a plan that writes
 * nothing and calls no model, and the refusals of --apply.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { withDecember, type DecemberExtension } from '@/evals/rewind/december'
import { readRecording, replayDeps, runFixture } from '@/evals/rewind/harness'
import { FIXTURE_DIR, loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { storedIssueOf } from '@/lib/wrapped/pipeline/final-cut'
import { generateUserRewind, type GenerateUserResult } from '@/lib/wrapped/pipeline/generate-user'
import { dryRunMember, main, parseFinalCutArgs, type FinalCutDeps, type PlanMember } from '@/scripts/rewind-final-cut'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))
jest.mock('@/lib/wrapped/pipeline/generate-user', () => ({
  ...jest.requireActual('@/lib/wrapped/pipeline/generate-user'),
  generateUserRewind: jest.fn(jest.requireActual('@/lib/wrapped/pipeline/generate-user').generateUserRewind),
}))

const MODEL = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const
const OPENS = new Date('2027-01-01T08:30:00Z')

let member: PlanMember
let finalResult: GenerateUserResult

beforeAll(async () => {
  const heavy = loadFixtures().find((f) => f.id === 'heavy')!
  const season = await runFixture(heavy, MODEL, replayDeps(readRecording('hand', 'heavy'), MODEL).deps)
  if (season.result.status !== 'completed') throw new Error('season not completed')
  const data = season.result.data
  member = { userId: 'member-1', season: storedIssueOf(data) }
  const december = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'december', 'heavy.json'), 'utf8')) as DecemberExtension
  const none = { fixture: 'heavy', promptVersion: 'rewind-2026.1', calls: [] }
  finalResult = (
    await runFixture(withDecember(heavy, december), MODEL, replayDeps(none, MODEL).deps, {
      copyPolicy: 'no-llm',
      previous: { factsHash: data.factsHash, promptVersion: 'rewind-2026.1', model: data.copyMeta.model, copy: data.copy!, copySource: data.copySource, slotHashes: data.copyMeta.slotHashes, issue: storedIssueOf(data) },
    })
  ).result
}, 60_000)

function deps(overrides: Partial<FinalCutDeps> = {}) {
  const lines: string[] = []
  const all: FinalCutDeps = {
    loadMembers: jest.fn(async () => [member, { userId: 'late', season: null }]),
    dryRun: jest.fn(async (m: PlanMember) => (m.userId === 'late' ? { status: 'skipped' as const, reason: 'JOINED_LATE' as const } : finalResult)),
    estimateCall: jest.fn(async () => 0.004),
    enqueue: jest.fn(async () => ({ jobId: 'final-1', alreadyQueued: false })),
    opensAt: jest.fn(async () => OPENS),
    staging: () => false,
    now: () => Date.parse('2026-12-11T12:00:00Z'),
    print: (line: string) => lines.push(line),
    ...overrides,
  }
  return { deps: all, lines }
}

describe('parseFinalCutArgs', () => {
  it('needs a year and defaults through to 31 December', () => {
    expect(parseFinalCutArgs(['--year=2026'])).toEqual({ ok: true, args: { year: 2026, through: '2026-12-31', withLlm: false, apply: false } })
    expect(parseFinalCutArgs([])).toMatchObject({ ok: false, help: false })
  })

  it('takes a December day as through, and refuses anything else', () => {
    expect(parseFinalCutArgs(['--year=2026', '--through=2026-12-10'])).toMatchObject({ ok: true, args: { through: '2026-12-10' } })
    expect(parseFinalCutArgs(['--year=2026', '--through=2026-11-30'])).toMatchObject({ ok: false })
    expect(parseFinalCutArgs(['--year=2026', '--through=2027-12-10'])).toMatchObject({ ok: false })
  })

  it('refuses --apply without --with-llm, and unknown flags', () => {
    expect(parseFinalCutArgs(['--year=2026', '--apply'])).toMatchObject({ ok: false, error: expect.stringContaining('--with-llm') })
    expect(parseFinalCutArgs(['--year=2026', '--aply'])).toMatchObject({ ok: false })
  })
})

describe('the plan', () => {
  it('writes nothing and calls no model: it prints the re-call share, the reasons, the cost and the validator', async () => {
    const { deps: d, lines } = deps()

    expect(await main(['--year=2026', '--through=2026-12-10'], d)).toBe(0)

    expect(d.enqueue).not.toHaveBeenCalled()
    expect(d.dryRun).toHaveBeenCalledWith(member, { year: 2026, through: '2026-12-10', withLlm: false, apply: false })
    const text = lines.join('\n')
    expect(text).toContain('Nothing is written')
    expect(text).toMatch(/^0 of 1 keep all copy, 1 re-call \(.*identity-changed: series\[1\]\.title/m)
    expect(text).toContain('Re-call share: 100.0%')
    expect(text).toContain('Estimated model cost: $0.004.')
    expect(text).toContain('Validator: zero failures.')
    expect(text).toContain('Skipped: JOINED_LATE 1.')
    expect(text).not.toContain('Severance')
  })

  it('runs each member through the pipeline in dry-run mode, with the full-year window', async () => {
    jest.mocked(generateUserRewind).mockResolvedValueOnce({ status: 'skipped', reason: 'NOT_ENTITLED' })

    await dryRunMember(member, { year: 2026, through: '2026-12-10', withLlm: false, apply: false })

    expect(generateUserRewind).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'dry-run', copyPolicy: 'no-llm', finalCut: true, through: '2026-12-10', kind: 'final-cut' })
    )
  })
})

describe('--apply', () => {
  const APPLY = ['--year=2026', '--through=2026-12-10', '--with-llm', '--apply']

  it('refuses an early through without REWIND_STAGING', async () => {
    const { deps: d, lines } = deps()

    expect(await main(APPLY, d)).toBe(1)
    expect(d.enqueue).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('REWIND_STAGING=1')
  })

  it('enqueues REWIND_FINAL_CUT on staging', async () => {
    const { deps: d } = deps({ staging: () => true })

    expect(await main(APPLY, d)).toBe(0)
    expect(d.enqueue).toHaveBeenCalledWith({ year: 2026, through: '2026-12-10', withLlm: true, apply: true })
  })

  it('refuses the real final cut before 00:30 on 1 January in the westernmost zone', async () => {
    const { deps: d, lines } = deps({ staging: () => true })

    expect(await main(['--year=2026', '--with-llm', '--apply'], d)).toBe(1)
    expect(d.enqueue).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain(OPENS.toISOString())
  })
})

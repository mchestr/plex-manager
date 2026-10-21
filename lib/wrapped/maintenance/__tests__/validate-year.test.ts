/**
 * @jest-environment node
 */

/**
 * The read-only validator (P8.5) on pipeline output: the heavy fixture's
 * season issue (on its hand recording) and its final cut (with its
 * December), then one broken copy of them per failure code.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { withDecember, type DecemberExtension } from '@/evals/rewind/december'
import { readRecording, replayDeps, runFixture } from '@/evals/rewind/harness'
import { FIXTURE_DIR, loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { shareContext, shareOptions } from '@/lib/wrapped/data/__tests__/share-fixture'
import type { RewindDataV3 } from '@/lib/wrapped/data/schema-v3'
import { toShareSafe } from '@/lib/wrapped/data/share-safe'
import {
  formatYearReport,
  validateShare,
  validateStoredRow,
  validateYear,
  type MemberRow,
} from '@/lib/wrapped/maintenance/validate-year'
import { storedIssueOf } from '@/lib/wrapped/pipeline/final-cut'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MODEL = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const
const USER = 'fixture-user'
const FINAL_CUT_AT = new Date('2027-01-01T08:40:00Z')

let season: RewindDataV3
let finalCut: RewindDataV3

beforeAll(async () => {
  const heavy = loadFixtures().find((f) => f.id === 'heavy')!
  const first = await runFixture(heavy, MODEL, replayDeps(readRecording('hand', 'heavy'), MODEL).deps)
  if (first.result.status !== 'completed') throw new Error('season not completed')
  season = first.result.data

  const december = JSON.parse(readFileSync(path.join(FIXTURE_DIR, 'december', 'heavy.json'), 'utf8')) as DecemberExtension
  const failing = { fixture: 'heavy', promptVersion: 'rewind-2026.1', calls: Array.from({ length: 10 }, () => ({ kind: 'copy' as const, finishReason: 'error' as const })) }
  const second = await runFixture(withDecember(heavy, december), MODEL, replayDeps(failing, MODEL).deps, {
    copyPolicy: 'changed-slots',
    previous: {
      factsHash: season.factsHash,
      promptVersion: season.copyMeta.promptVersion,
      model: season.copyMeta.model,
      copy: season.copy!,
      copySource: season.copySource,
      slotHashes: season.copyMeta.slotHashes,
      issue: storedIssueOf(season),
    },
  })
  if (second.result.status !== 'completed') throw new Error('final cut not completed')
  finalCut = second.result.data
}, 60_000)

const row = (data: unknown, finalCutAt: Date | null = null) => ({
  id: 'wrapped-1',
  userId: USER,
  status: 'completed',
  data: JSON.stringify(data),
  finalCutAt,
})

const codes = (data: unknown, finalCut = false, finalCutAt: Date | null = null) =>
  validateStoredRow(row(data, finalCutAt), { year: 2026, finalCut })

/** The fact id of the first token in any deck. */
function deckToken(data: RewindDataV3): keyof RewindDataV3['facts'] {
  for (const text of Object.values(data.copy!.decks)) {
    const match = text?.match(/\{\{fact:([^}]+)\}\}/)
    if (match) return match[1] as keyof RewindDataV3['facts']
  }
  throw new Error('no deck with a token')
}

describe('validateStoredRow', () => {
  it('passes a valid season v3 row', () => {
    expect(season.copy).not.toBeNull()
    expect(codes(season)).toEqual([])
  })

  it('passes a valid final-cut row with --final-cut, and fails the season row there', () => {
    expect(codes(finalCut, true, FINAL_CUT_AT)).toEqual([])
    expect(codes(season, true, null)).toEqual(['NOT_FINAL_CUT', 'FINAL_CUT_AT_MISSING'])
  })

  it('fails a final-cut row without finalCutAt, and one whose window is not the final cut', () => {
    expect(codes(finalCut, true, null)).toEqual(['FINAL_CUT_AT_MISSING'])
    expect(codes({ ...finalCut, window: { ...finalCut.window, finalCut: false } }, true, FINAL_CUT_AT)).toContain('NOT_FINAL_CUT')
  })

  it('fails a page that does not pass its schema', () => {
    const pages = season.pages.map((page, i) => (i === 1 ? { ...page, data: { broken: true } } : page))
    expect(codes({ ...season, pages })).toEqual(['PAGE_SCHEMA'])
  })

  it('fails a kept slot that renders over maxChars with the stored displays', () => {
    const fact = deckToken(season)
    const facts = { ...season.facts, [fact]: { ...season.facts[fact]!, display: 'x'.repeat(200) } }
    expect(codes({ ...season, facts })).toContain('SLOT_TOO_LONG')
  })

  it('fails a token whose only page was not selected', () => {
    const pages = season.pages.filter((page) => page.type !== 'requests')
    const decks = { ...season.copy!.decks, number: `${season.copy!.decks.number} {{fact:requests.approved}}` }
    expect(codes({ ...season, pages, copy: { ...season.copy!, decks } })).toContain('SLOT_TOKEN')
  })

  it('fails a stale slot hash and a facts hash that does not match', () => {
    const slotHashes = { ...season.copyMeta.slotHashes, 'deck.clock': 'stale' }
    expect(codes({ ...season, copyMeta: { ...season.copyMeta, slotHashes } })).toEqual(['SLOT_HASH_STALE'])
    expect(codes({ ...season, factsHash: 'f'.repeat(64) })).toEqual(['FACTS_HASH_MISMATCH'])
  })

  it('fails rows that are not v3 or do not parse', () => {
    expect(validateStoredRow({ ...row(season), data: '{"version":2,"statistics":{}}' }, { year: 2026, finalCut: false })).toEqual(['NOT_V3'])
    expect(validateStoredRow({ ...row(season), data: 'not json' }, { year: 2026, finalCut: false })).toEqual(['UNPARSABLE'])
  })
})

describe('validateShare', () => {
  it('passes a projection of the stored issue', () => {
    expect(validateShare({ shareId: 's1', wrappedId: 'w1', project: () => toShareSafe(season, shareOptions(), shareContext()) })).toBeNull()
  })

  it('fails a projection with a key outside the allow-list, such as an email', () => {
    const projection = { ...toShareSafe(season, shareOptions(), shareContext()), email: 'member@example.com' }
    expect(validateShare({ shareId: 's1', wrappedId: 'w1', project: () => projection })).toBe('SHARE_KEYS')
  })

  it('fails a share whose projection throws', () => {
    expect(validateShare({ shareId: 's1', wrappedId: 'w1', project: () => { throw new Error('bad options') } })).toBe('SHARE_PROJECTION')
  })
})

describe('validateYear and its report', () => {
  const members = (): MemberRow[] => [
    { userId: USER, wrapped: { id: 'w-ok', status: 'completed', data: JSON.stringify(season), finalCutAt: null }, latest: { status: 'completed', code: null } },
    { userId: 'u2', wrapped: { id: 'w-bad', status: 'completed', data: JSON.stringify({ ...season, factsHash: 'x' }), finalCutAt: null }, latest: null },
    { userId: 'u3', wrapped: null, latest: { status: 'skipped', code: 'NOT_ENTITLED' } },
    { userId: 'u4', wrapped: { id: 'w-failed', status: 'failed', data: '{}', finalCutAt: null }, latest: { status: 'failed', code: 'UPSTREAM_ERROR' } },
  ]

  it('counts failures by code and skips by reason', () => {
    const report = validateYear(members(), [{ shareId: 'share-1', wrappedId: 'w-ok', project: () => ({ email: 'x' }) }], { year: 2026, finalCut: false })
    expect(report).toMatchObject({
      checked: 2,
      passed: 1,
      failures: { FACTS_HASH_MISMATCH: 1, NOT_COMPLETED: 1, SHARE_KEYS: 1 },
      skipped: { NOT_ENTITLED: 1 },
      shares: { checked: 1, failed: 1 },
    })
  })

  it('prints counts and ids, never a title or a name', () => {
    const report = validateYear(members(), [], { year: 2026, finalCut: false })
    const text = formatYearReport(report, { year: 2026, finalCut: false }).join('\n')
    expect(text).toContain('FACTS_HASH_MISMATCH')
    expect(text).toContain('NOT_ENTITLED')
    const titles = Object.values(season.facts)
      .filter((fact) => fact?.unit === 'title' || fact?.unit === 'name')
      .map((fact) => fact!.display)
    expect(titles.length).toBeGreaterThan(0)
    for (const title of titles) expect(text).not.toContain(title)
    expect(text).not.toContain('Mike')
  })

  it('reports zero failures for a clean year', () => {
    const report = validateYear(members().slice(0, 1), [], { year: 2026, finalCut: false })
    expect(formatYearReport(report, { year: 2026, finalCut: false })).toContain('Failures: none.')
  })
})

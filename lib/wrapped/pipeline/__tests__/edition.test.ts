/**
 * @jest-environment node
 */

import { loadFixtures } from '@/evals/rewind/__tests__/load-fixtures'
import { fixtureInputs } from '@/evals/rewind/__tests__/member-stats'
import { fixtureContext, readRecording, replayDeps, runFixture } from '@/evals/rewind/harness'
import { fixtureIssue } from '@/lib/rewind/__tests__/helpers/fixture-issue'
import { pagesForCut } from '@/lib/rewind/editions'
import { pageDeck } from '@/lib/rewind/pages/deck'
import { editionOf, selectIssuePages } from '@/lib/wrapped/pipeline/edition'
import { generateUserRewind } from '@/lib/wrapped/pipeline/generate-user'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const MODEL = { provider: 'anthropic', id: 'claude-sonnet-5-5' } as const
const fixtures = loadFixtures()
const byId = (id: string) => fixtures.find((f) => f.id === id)!

/** The fixture through the pipeline, its model answering from `recordings/hand`; `calls` counts the model calls. */
async function run(id: string) {
  const { deps, next } = replayDeps(readRecording('hand', id), MODEL)
  const { result } = await runFixture(byId(id), MODEL, deps)
  return { result, calls: next() }
}

const stats = (minutes: number, plays: number) => ({ totals: { totalMinutes: minutes }, plays }) as Parameters<typeof editionOf>[0]

describe('editionOf (FR-5)', () => {
  it('gives the postcard under 30 minutes or with 0 plays', () => {
    expect(editionOf(stats(29, 3), [])).toBe('postcard')
    expect(editionOf(stats(600, 0), [])).toBe('postcard')
    expect(editionOf(stats(30, 3), [])).toBe('pocket')
  })

  it('gives the pocket edition under 5 hours, at 4.9 hours, and the full issue at 5', () => {
    expect(editionOf(stats(294, 40), [])).toBe('pocket')
    expect(editionOf(stats(300, 40), [])).toBe('full')
  })

  it('gives the pocket edition at 9 plays and the full issue at 10', () => {
    expect(editionOf(stats(900, 9), [])).toBe('pocket')
    expect(editionOf(stats(900, 10), [])).toBe('full')
  })

  it('gives the pocket edition with 9 eligible pages and the full issue with 10', () => {
    expect(editionOf(stats(900, 40), [3, 4, 5, 6, 7, 8, 9, 11, 12])).toBe('pocket')
    expect(editionOf(stats(900, 40), [3, 4, 5, 6, 7, 8, 9, 11])).toBe('full')
  })
})

describe('selectIssuePages', () => {
  it('stores the selected pages with their data and drops disabled ones, never the fixed pages', async () => {
    const issue = await fixtureIssue('heavy')
    const ctx = { userId: 'u1', stats: issue.stats, archetype: issue.archetype?.id ?? null }
    const all = selectIssuePages('full', issue.facts, { ...ctx, disabledPages: [] })
    expect(all.map((p) => p.type)).toEqual(issue.pages.map((p) => p.type))
    expect(all.find((p) => p.type === 'number')?.data).not.toBeNull()

    const pages = selectIssuePages('full', issue.facts, { ...ctx, disabledPages: ['bookends', 'cover', 'centrefold'] }).map((p) => p.type)
    expect(pages).not.toContain('bookends')
    expect(pages).toEqual(expect.arrayContaining(['cover', 'centrefold', 'back-cover']))
  })

  it('gives the pocket edition its six pages, with the habit page by the streak rule', async () => {
    const issue = await fixtureIssue('heavy')
    const ctx = { userId: 'u1', stats: issue.stats, archetype: issue.archetype?.id ?? null, disabledPages: [] }
    const pages = selectIssuePages('pocket', issue.facts, ctx)
    expect(pages.map((p) => p.type)).toEqual(['cover', 'number', 'short-list', 'calendar', 'centrefold', 'back-cover'])
    expect(pages.every((p) => p.data !== undefined && p.data !== null)).toBe(true)
    const light = await fixtureIssue('light')
    expect(selectIssuePages('pocket', light.facts, { ...ctx, stats: light.stats }).map((p) => p.type)).toEqual([
      'cover',
      'number',
      'short-list',
      'calendar',
      'centrefold',
      'back-cover',
    ])
  })

  it('gives the postcard its own page', async () => {
    const issue = await fixtureIssue('light')
    const pages = selectIssuePages('postcard', issue.facts, { userId: 'u1', stats: issue.stats, archetype: null, disabledPages: [] })
    expect(pages).toEqual([{ type: 'postcard', data: { titles: [] } }])
  })
})

describe('the short editions never call a model (RWP-19)', () => {
  it.each(['postcard', 'light'])('%s: zero calls, template copy', async (id) => {
    const { result, calls } = await run(id)
    expect(calls).toBe(0)
    expect(result).toMatchObject({ status: 'completed', data: { copy: null, copySource: 'template', copyMeta: { model: null } } })
  })

  it('gives a full issue a pocket cut that keeps its model copy', async () => {
    const { result } = await run('heavy')
    if (result.status !== 'completed') throw new Error('not completed')
    const { data } = result
    expect(data.copySource).not.toBe('template')
    const pocket = pagesForCut(data, 'pocket')
    expect(pocket.map((p) => p.type)).toContain('number')
    // The deck is read off the issue's copy, which the cut leaves alone
    expect(pageDeck({ copy: data.copy, userId: 'u1' }, data.facts, 'number')).toBe(data.copy?.decks.number)
  })

  it('skips a member who joined on 1 October with JOINED_LATE, before any call', async () => {
    const fixture = byId('heavy')
    const inputs = await fixtureInputs(fixture)
    const generate = jest.fn()
    const ctx = fixtureContext(fixture, inputs, MODEL)
    const result = await generateUserRewind(
      {
        userId: ctx.userId,
        year: ctx.year,
        kind: 'admin',
        mode: 'dry-run',
        copyPolicy: 'default',
        signal: new AbortController().signal,
        // No lifetime pass: the account's creation decides
        source: async () => ({ events: inputs.events, sources: { ...inputs.sources, lifetime: null } }),
      },
      {
        loadContext: async () => ({ ...ctx, member: { ...ctx.member, createdAt: new Date('2026-10-01T05:00:00Z') } }),
        checkEligibility: async () => ({ ok: true }),
        generate,
      }
    )
    expect(result).toEqual({ status: 'skipped', reason: 'JOINED_LATE' })
    expect(generate).not.toHaveBeenCalled()
  })
})

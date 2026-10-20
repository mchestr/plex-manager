import { fixtureIssue } from '@/lib/rewind/__tests__/helpers/fixture-issue'
import { editionOf, selectIssuePages } from '@/lib/wrapped/pipeline/edition'

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

  it('gives the pocket edition its six pages, with the clock or else the calendar', async () => {
    const issue = await fixtureIssue('heavy')
    const ctx = { userId: 'u1', stats: issue.stats, archetype: issue.archetype?.id ?? null, disabledPages: [] }
    expect(selectIssuePages('pocket', issue.facts, ctx).map((p) => p.type)).toEqual(['cover', 'number', 'short-list', 'clock', 'centrefold', 'back-cover'])
    const light = await fixtureIssue('light')
    const types = selectIssuePages('pocket', light.facts, { ...ctx, stats: light.stats }).map((p) => p.type)
    expect(types).toHaveLength(types.includes('short-list') ? 6 : 5)
  })

  it('gives the postcard its cover alone', async () => {
    const issue = await fixtureIssue('light')
    const pages = selectIssuePages('postcard', issue.facts, { userId: 'u1', stats: issue.stats, archetype: null, disabledPages: [] })
    expect(pages.map((p) => p.type)).toEqual(['cover'])
  })
})

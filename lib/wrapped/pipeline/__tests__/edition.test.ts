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
  it('keeps every eligible page in issue order and drops disabled ones, never the fixed pages', () => {
    const pages = selectIssuePages('full', [4, 17], ['bookends', 'cover', 'centrefold']).map((p) => p.type)
    expect(pages).toEqual([
      'cover', 'number', 'top-shows', 'top-films', 'taste', 'people', 'clock', 'calendar', 'race', 'records', 'setup',
      'requests', 'standing', 'centrefold', 'back-cover',
    ])
  })

  it('gives the pocket edition its six pages, with the clock or else the calendar', () => {
    expect(selectIssuePages('pocket', [], []).map((p) => p.type)).toEqual(['cover', 'number', 'short-list', 'clock', 'centrefold', 'back-cover'])
    expect(selectIssuePages('pocket', [9], []).map((p) => p.type)).toContain('calendar')
  })

  it('gives the postcard one page, and every page null data until P5.5', () => {
    expect(selectIssuePages('postcard', [], [])).toEqual([{ type: 'cover', data: null }])
  })
})

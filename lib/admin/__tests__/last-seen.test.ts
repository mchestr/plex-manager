import {
  INACTIVE_STAT_DAYS,
  lastSeenRank,
  lastSeenState,
  matchesSeen,
  SEEN_FILTER_LABELS,
  SEEN_FILTERS,
  type SeenFilter,
} from '@/lib/admin/last-seen'

const NOW = Date.parse('2026-10-31T12:00:00Z')
const DAY = 86_400_000
const READ = new Date(NOW - DAY)

/** A member whose newest play started `days` days before NOW, found by the last read. */
const seen = (days: number) => ({ lastSeenAt: new Date(NOW - days * DAY), lastSeenReadAt: READ })
const NEVER = { lastSeenAt: null, lastSeenReadAt: READ }
const UNKNOWN = { lastSeenAt: null, lastSeenReadAt: null }

const matching = (user: { lastSeenAt: Date | null; lastSeenReadAt: Date | null }) =>
  SEEN_FILTERS.filter((value) => matchesSeen(user, value, NOW))

describe('lastSeenState', () => {
  it('reads a play as seen, a read with no play as never, and no read as unknown', () => {
    expect(lastSeenState(seen(3))).toBe('seen')
    expect(lastSeenState(NEVER)).toBe('never')
    expect(lastSeenState(UNKNOWN)).toBe('unknown')
  })

  it('keeps a stored play when the latest read missed the member', () => {
    expect(lastSeenState({ lastSeenAt: new Date(NOW - 400 * DAY), lastSeenReadAt: null })).toBe('seen')
  })
})

describe('matchesSeen', () => {
  it('lists everyone under all', () => {
    for (const user of [seen(1), seen(500), NEVER, UNKNOWN]) expect(matchesSeen(user, 'all', NOW)).toBe(true)
  })

  it.each([
    [0, ['all', 'recent']],
    [29.9, ['all', 'recent']],
    [30, ['all']],
    [89.9, ['all']],
    [90, ['all', 'inactive90']],
    [179.9, ['all', 'inactive90']],
    [180, ['all', 'inactive90', 'inactive180']],
    [900, ['all', 'inactive90', 'inactive180']],
  ])('places a play %s days ago under %j', (days, expected) => {
    expect(matching(seen(days))).toEqual(expected)
  })

  it('counts a play dated after now (a clock ahead of the server) as recent', () => {
    expect(matching(seen(-1))).toEqual(['all', 'recent'])
  })

  it('places a member with no play under never or unknown only, never under the inactive filters', () => {
    expect(matching(NEVER)).toEqual(['all', 'never'])
    expect(matching(UNKNOWN)).toEqual(['all', 'unknown'])
  })

  it('measures the age from the now it is given', () => {
    const user = seen(10)
    expect(matchesSeen(user, 'inactive180', NOW)).toBe(false)
    expect(matchesSeen(user, 'inactive180', NOW + 170 * DAY)).toBe(true)
  })
})

describe('the seen filter options', () => {
  it('starts with All, then words every other value', () => {
    expect(SEEN_FILTERS.map((value: SeenFilter) => SEEN_FILTER_LABELS[value])).toEqual([
      'All',
      'Seen in the last 30 days',
      'Not seen in 90 days',
      'Not seen in 180 days',
      'Never seen',
      'Unknown',
    ])
  })

  it('counts 180 days for the Members tile, the inactive180 filter', () => {
    expect(INACTIVE_STAT_DAYS).toBe(180)
    expect(matchesSeen(seen(INACTIVE_STAT_DAYS), 'inactive180', NOW)).toBe(true)
  })
})

describe('lastSeenRank', () => {
  it('ranks a play first, then never, then unknown, whatever the play date', () => {
    expect([UNKNOWN, NEVER, seen(900), seen(1)].map(lastSeenRank)).toEqual([2, 1, 0, 0])
  })
})

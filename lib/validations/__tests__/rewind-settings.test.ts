import { rewindSettingsSchema, unknownEntries, type RewindSettingsInput } from '@/lib/validations/rewind-settings'

const valid: RewindSettingsInput = {
  rewindEnabled: true,
  rewindAudience: 'admins',
  rewindSeasonOpens: '12-01',
  rewindSeasonCloses: '01-31',
  rewindLlmMode: 'standard',
  rewindLlmBudgetUsd: 10,
  rewindPublicLinks: true,
  rewindPublicCounts: false,
  rewindShowServerNameOnCards: true,
  rewindAllowArtOnCards: true,
  rewindExcludedSectionIds: [],
  rewindExcludedContentRatings: [],
  rewindIncludeManagedUsers: false,
  rewindDisabledPages: [],
  rewindNotifyChannels: ['discord', 'banner'],
}

const parse = (overrides: Partial<RewindSettingsInput>) => rewindSettingsSchema.safeParse({ ...valid, ...overrides })

describe('rewindSettingsSchema', () => {
  it('accepts a season that wraps the year, 12-01 to 01-31', () => {
    expect(parse({}).success).toBe(true)
  })

  it('refuses a month-day that does not exist, and accepts 29 February', () => {
    expect(parse({ rewindSeasonCloses: '02-30' }).success).toBe(false)
    expect(parse({ rewindSeasonOpens: '13-01' }).success).toBe(false)
    expect(parse({ rewindSeasonOpens: '12-1' }).success).toBe(false)
    expect(parse({ rewindSeasonCloses: '02-29' }).success).toBe(true)
  })

  it('refuses a season that opens and closes on the same day', () => {
    expect(parse({ rewindSeasonOpens: '12-01', rewindSeasonCloses: '12-01' }).success).toBe(false)
  })

  it('refuses a core page in the disabled list', () => {
    expect(parse({ rewindDisabledPages: ['cover'] }).success).toBe(false)
    expect(parse({ rewindDisabledPages: ['top-shows'] }).success).toBe(false)
    expect(parse({ rewindDisabledPages: ['people', 'next-year.picks'] }).success).toBe(true)
  })

  it('takes a budget from 0 to 1,000 with at most 2 decimals', () => {
    expect(parse({ rewindLlmBudgetUsd: -1 }).success).toBe(false)
    expect(parse({ rewindLlmBudgetUsd: 1000.01 }).success).toBe(false)
    expect(parse({ rewindLlmBudgetUsd: 5.555 }).success).toBe(false)
    expect(parse({ rewindLlmBudgetUsd: 0 }).success).toBe(true)
    expect(parse({ rewindLlmBudgetUsd: 4.35 }).success).toBe(true)
    expect(parse({ rewindLlmBudgetUsd: 1000 }).success).toBe(true)
  })

  it('limits the audience, mode and channels to the known values', () => {
    expect(parse({ rewindAudience: 'members' as 'all' }).success).toBe(false)
    expect(parse({ rewindLlmMode: 'turbo' as 'off' }).success).toBe(false)
    expect(parse({ rewindNotifyChannels: ['email' as 'banner'] }).success).toBe(false)
  })

  it('de-duplicates and orders the lists', () => {
    const result = parse({
      rewindDisabledPages: ['standing', 'people', 'people'],
      rewindNotifyChannels: ['banner', 'discord'],
      rewindExcludedSectionIds: ['7', '12', '7'],
      rewindExcludedContentRatings: [' TV-MA ', 'R'],
    })
    expect(result.success && result.data).toMatchObject({
      rewindDisabledPages: ['people', 'standing'],
      rewindNotifyChannels: ['discord', 'banner'],
      rewindExcludedSectionIds: ['12', '7'],
      rewindExcludedContentRatings: ['R', 'TV-MA'],
    })
  })

  it('refuses a library id that is not a section number', () => {
    expect(parse({ rewindExcludedSectionIds: ['movies'] }).success).toBe(false)
  })
})

describe('unknownEntries', () => {
  it('allows known entries and entries already stored', () => {
    expect(unknownEntries(['1', '2', '9'], ['1'], ['2'])).toEqual(['9'])
  })
})

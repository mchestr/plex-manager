import { affiliateSettingsSchema } from '@/lib/validations/affiliates'

const valid = { enabled: true, tiers: [{ overHours: 50, invites: 1 }], cap: 10, libraryIds: [1, 2] }

describe('affiliateSettingsSchema', () => {
  it('accepts the settings, and a null cap as no cap', () => {
    expect(affiliateSettingsSchema.parse(valid)).toEqual(valid)
    expect(affiliateSettingsSchema.parse({ ...valid, cap: null }).cap).toBeNull()
    expect(affiliateSettingsSchema.parse({ ...valid, cap: 0 }).cap).toBe(0)
  })

  it.each([
    ['a cap above 1000', { cap: 1001 }],
    ['a negative cap', { cap: -1 }],
    ['a fractional cap', { cap: 2.5 }],
    ['more than 100 libraries', { libraryIds: Array.from({ length: 101 }, (_, i) => i) }],
    ['no tiers', { tiers: [] }],
    ['tiers that do not rise', { tiers: [{ overHours: 50, invites: 1 }, { overHours: 50, invites: 2 }] }],
    ['a tier with 11 invites', { tiers: [{ overHours: 50, invites: 11 }] }],
  ])('refuses %s', (_label, patch) => {
    expect(affiliateSettingsSchema.safeParse({ ...valid, ...patch }).success).toBe(false)
  })

  it('refuses the switch on without libraries, on the library field', () => {
    const parsed = affiliateSettingsSchema.safeParse({ ...valid, libraryIds: [] })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.path).toEqual(['libraryIds'])
  })

  it('accepts an empty library list while the switch is off', () => {
    expect(affiliateSettingsSchema.safeParse({ ...valid, enabled: false, libraryIds: [] }).success).toBe(true)
  })
})

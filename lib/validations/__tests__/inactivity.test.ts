/**
 * The inactivity settings schemas: the threshold, and the warning emails'
 * leads (whole days of 1 or more, each once, at most five, saved largest
 * first).
 */

import { inactivitySettingsSchema, inactivityWarningsSchema, MAX_LEAD_DAYS, MAX_WARNING_LEADS } from '@/lib/validations/inactivity'

describe('inactivitySettingsSchema', () => {
  it.each([30, 180, 3650])('takes a threshold of %p days', (thresholdDays) => {
    expect(inactivitySettingsSchema.safeParse({ enabled: true, thresholdDays }).success).toBe(true)
  })

  it.each([29, 3651, 90.5])('refuses a threshold of %p days', (thresholdDays) => {
    expect(inactivitySettingsSchema.safeParse({ enabled: true, thresholdDays }).success).toBe(false)
  })
})

describe('inactivityWarningsSchema', () => {
  const parse = (warningDays: unknown) => inactivityWarningsSchema.safeParse({ warningsEnabled: true, warningDays })

  it('sorts the leads largest first', () => {
    expect(parse([1, 30, 7])).toEqual({ success: true, data: { warningsEnabled: true, warningDays: [30, 7, 1] } })
  })

  it(`takes one to ${MAX_WARNING_LEADS} leads`, () => {
    expect(parse([1]).success).toBe(true)
    expect(parse([1, 2, 3, 4]).success).toBe(true)
    expect(parse([MAX_LEAD_DAYS, 1]).success).toBe(true)
  })

  it.each([
    ['no lead', []],
    ['five leads', [1, 2, 3, 4, 5]],
    ['a lead of zero', [0]],
    ['a negative lead', [-1]],
    ['a part day', [1.5]],
    ['a repeat', [7, 7, 1]],
    ['a lead above 90 days', [MAX_LEAD_DAYS + 1]],
    ['text', ['30']],
  ])('refuses %s', (_case, warningDays) => {
    expect(parse(warningDays).success).toBe(false)
  })

  it('names the repeat', () => {
    const result = parse([7, 7])
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Use each number of days once')
  })
})

import { nextSendWindow } from '@/lib/wrapped/notify/window'

const BERLIN = 'Europe/Berlin'
const at = (iso: string) => new Date(iso)

describe('nextSendWindow', () => {
  it('moves 21:30 in Berlin to 09:00 the next day', () => {
    // 21:30 CET on 1 December is 20:30 UTC
    expect(nextSendWindow(at('2026-12-01T20:30:00Z'), BERLIN).toISOString()).toBe('2026-12-02T08:00:00.000Z')
  })

  it('moves 08:59 to 09:00 the same day', () => {
    expect(nextSendWindow(at('2026-12-01T07:59:00Z'), BERLIN).toISOString()).toBe('2026-12-01T08:00:00.000Z')
  })

  it('sends at once at 12:00', () => {
    const noon = at('2026-12-01T11:00:00Z')
    expect(nextSendWindow(noon, BERLIN)).toBe(noon)
  })

  it('sends at once at 19:59 and waits from 20:00', () => {
    const late = at('2026-12-01T18:59:00Z')
    expect(nextSendWindow(late, BERLIN)).toBe(late)
    expect(nextSendWindow(at('2026-12-01T19:00:00Z'), BERLIN).toISOString()).toBe('2026-12-02T08:00:00.000Z')
  })

  it('lands on 09:00 local across the autumn DST change', () => {
    // 22:00 CEST on Saturday 24 October; clocks go back overnight, so 09:00 CET is 08:00 UTC
    expect(nextSendWindow(at('2026-10-24T20:00:00Z'), BERLIN).toISOString()).toBe('2026-10-25T08:00:00.000Z')
  })

  it('lands on 09:00 local across the spring DST change', () => {
    // 23:00 CET on Saturday 28 March; clocks go forward overnight, so 09:00 CEST is 07:00 UTC
    expect(nextSendWindow(at('2026-03-28T22:00:00Z'), BERLIN).toISOString()).toBe('2026-03-29T07:00:00.000Z')
  })

  it('rolls over the end of the year', () => {
    expect(nextSendWindow(at('2026-12-31T22:00:00Z'), BERLIN).toISOString()).toBe('2027-01-01T08:00:00.000Z')
  })
})

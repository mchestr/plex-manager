/**
 * @jest-environment node
 */

/**
 * The season-open script (P8.2): the read-only schedule, and the staging
 * rehearsal, which refuses without REWIND_STAGING=1, enqueues the Prepare at
 * once with audience all, waits for it, then switches the audience.
 */

import { main, parseSeasonOpenArgs, type SeasonOpenDeps } from '@/scripts/rewind-season-open'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

function deps(overrides: Partial<SeasonOpenDeps> = {}) {
  const lines: string[] = []
  let clock = 0
  const d: SeasonOpenDeps = {
    schedule: async () => ({
      prepareAt: new Date('2026-12-01T08:15:00Z'),
      switchAt: new Date('2026-12-01T14:00:00Z'),
      serverZone: 'America/Chicago',
      autoOpen: true,
      audience: 'admins',
      enabled: true,
    }),
    staging: () => true,
    enqueuePrepare: jest.fn(async () => 'rehearse-1'),
    jobState: jest.fn(async () => 'completed'),
    readiness: jest.fn(async () => ({ state: 'ready' as const, ready: 40 })),
    open: jest.fn(async () => ({ switched: true, notified: 38 })),
    now: () => clock,
    sleep: jest.fn(async (ms: number) => {
      clock += ms
    }),
    print: (line) => lines.push(line),
    ...overrides,
  }
  return { d, lines }
}

describe('parseSeasonOpenArgs', () => {
  it('needs a year and one mode at most', () => {
    expect(parseSeasonOpenArgs(['--year=2026'])).toEqual({ ok: true, year: 2026, mode: 'status' })
    expect(parseSeasonOpenArgs(['--year=2026', '--rehearse'])).toEqual({ ok: true, year: 2026, mode: 'rehearse' })
    expect(parseSeasonOpenArgs(['--rehearse'])).toMatchObject({ ok: false })
    expect(parseSeasonOpenArgs(['--year=2026', '--rehearse', '--switch-only'])).toMatchObject({ ok: false })
  })
})

describe('main', () => {
  it('prints the schedule without writing', async () => {
    const { d, lines } = deps()
    expect(await main(['--year=2026'], d)).toBe(0)
    expect(lines.join('\n')).toContain('data through 2026-11-30')
    expect(lines.join('\n')).toContain('08:00 in America/Chicago')
    expect(d.enqueuePrepare).not.toHaveBeenCalled()
    expect(d.open).not.toHaveBeenCalled()
  })

  it('refuses the rehearsal off staging', async () => {
    const { d, lines } = deps({ staging: () => false })
    expect(await main(['--year=2026', '--rehearse'], d)).toBe(1)
    expect(lines[0]).toContain('REWIND_STAGING=1')
    expect(d.enqueuePrepare).not.toHaveBeenCalled()
  })

  it('enqueues the Prepare with audience all, waits for it, then switches and prints the timings', async () => {
    const states = ['active', 'waiting-children', 'completed']
    const { d, lines } = deps({ jobState: jest.fn(async () => states.shift() ?? 'completed') })

    expect(await main(['--year=2026', '--rehearse'], d)).toBe(0)
    expect(d.enqueuePrepare).toHaveBeenCalledWith({ year: 2026, through: '2026-11-30', audience: 'all', triggeredBy: 'admin' })
    expect(d.sleep).toHaveBeenCalledTimes(2)
    expect(lines).toContain('Prepare and generation finished in 1.0 min.')
    expect(lines.at(-1)).toBe('Audience switched to everyone at +1.0 min; 38 ready notifications enqueued.')
  })

  it('stops before the switch when a member failed, and --switch-only switches after Retry failed', async () => {
    const failing = deps({ readiness: jest.fn(async () => ({ state: 'failures' as const, failed: 1 })) })
    expect(await main(['--year=2026', '--rehearse'], failing.d)).toBe(1)
    expect(failing.d.open).not.toHaveBeenCalled()
    expect(failing.lines.at(-1)).toContain('--switch-only')

    const after = deps()
    expect(await main(['--year=2026', '--switch-only'], after.d)).toBe(0)
    expect(after.d.enqueuePrepare).not.toHaveBeenCalled()
    expect(after.d.open).toHaveBeenCalledWith(2026)
  })
})

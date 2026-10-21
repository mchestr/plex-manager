/**
 * @jest-environment node
 */

/**
 * The validator's CLI (P8.5): its arguments and exit codes over injected
 * rows. The checks themselves are lib/wrapped/maintenance/__tests__/validate-year.test.ts.
 */

import { main, parseValidateArgs } from '@/scripts/rewind-validate'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/wrapped/data/share-context', () => ({ loadShareContext: jest.fn() }))

describe('parseValidateArgs', () => {
  it('needs a year, and takes --final-cut', () => {
    expect(parseValidateArgs(['--year=2026'])).toEqual({ ok: true, options: { year: 2026, finalCut: false } })
    expect(parseValidateArgs(['--year=2026', '--final-cut'])).toEqual({ ok: true, options: { year: 2026, finalCut: true } })
    expect(parseValidateArgs([])).toMatchObject({ ok: false, help: false })
    expect(parseValidateArgs(['--year=2026', '--apply'])).toMatchObject({ ok: false, help: false })
    expect(parseValidateArgs(['--help'])).toEqual({ ok: false, help: true })
  })
})

describe('main', () => {
  it('exits 0 with zero failures, 1 with any, and 2 for bad arguments', async () => {
    const lines: string[] = []
    const print = (line: string) => lines.push(line)
    const skippedOnly = { loadMembers: async () => [{ userId: 'u1', wrapped: null, latest: { status: 'skipped', code: 'NOT_ENTITLED' } }], loadShares: async () => [], print }
    const failing = { loadMembers: async () => [{ userId: 'u2', wrapped: null, latest: null }], loadShares: async () => [], print }

    expect((await main(['--year=2026'], skippedOnly)).code).toBe(0)
    expect(lines).toContain('Failures: none.')
    expect((await main(['--year=2026'], failing)).code).toBe(1)
    expect((await main(['--year=twenty'], failing)).code).toBe(2)
  })
})

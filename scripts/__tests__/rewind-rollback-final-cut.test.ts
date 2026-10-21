/**
 * @jest-environment node
 */

/**
 * The bulk roll back of the final cut (P8.5): a dry run by default, --apply
 * with an admin, and a second --apply that changes nothing.
 */

import { main, parseRollbackArgs, type RollbackDeps } from '@/scripts/rewind-rollback-final-cut'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/queue/connection', () => ({ getRedisConnection: jest.fn() }))
jest.mock('@/lib/rewind/generation-guards', () => ({ hasActiveGeneration: jest.fn() }))
jest.mock('@/lib/rewind/rollback', () => ({ rollbackStoredRewind: jest.fn() }))

/** Members whose latest completed generation is the final cut; a roll back adds an admin one. */
function world(finalCuts: string[]) {
  const latest = new Set(finalCuts)
  const lines: string[] = []
  const deps: RollbackDeps = {
    findFinalCuts: jest.fn(async () => [...latest]),
    isAdmin: jest.fn(async (userId: string) => userId === 'admin-1'),
    rollback: jest.fn(async (userId: string) => {
      latest.delete(userId)
      return 'rolled-back' as const
    }),
    print: (line: string) => lines.push(line),
  }
  return { deps, lines }
}

describe('parseRollbackArgs', () => {
  it('is a dry run without --apply, and --apply needs --admin', () => {
    expect(parseRollbackArgs(['--year=2026'])).toEqual({ ok: true, year: 2026, apply: false, adminId: null })
    expect(parseRollbackArgs(['--year=2026', '--apply'])).toMatchObject({ ok: false, error: expect.stringContaining('--admin') })
    expect(parseRollbackArgs(['--year=2026', '--apply', '--admin=admin-1'])).toEqual({ ok: true, year: 2026, apply: true, adminId: 'admin-1' })
    expect(parseRollbackArgs(['--apply'])).toMatchObject({ ok: false })
  })
})

describe('main', () => {
  it('counts the final cuts in a dry run and rolls nothing back', async () => {
    const { deps, lines } = world(['u1', 'u2'])

    expect(await main(['--year=2026'], deps)).toBe(0)
    expect(deps.rollback).not.toHaveBeenCalled()
    expect(lines[0]).toContain('2 final cuts of 2026 would roll back')
  })

  it('rolls each final cut back once, and a second --apply changes nothing', async () => {
    const { deps, lines } = world(['u1', 'u2'])
    const argv = ['--year=2026', '--apply', '--admin=admin-1']

    expect(await main(argv, deps)).toBe(0)
    expect(await main(argv, deps)).toBe(0)

    expect(deps.rollback).toHaveBeenCalledTimes(2)
    expect(deps.rollback).toHaveBeenCalledWith('u1', 2026, 'admin-1')
    expect(lines).toEqual([
      'Rolled back 2 of 2; skipped 0 generating, 0 without a season issue, 0 unreadable.',
      'Rolled back 0 of 0; skipped 0 generating, 0 without a season issue, 0 unreadable.',
    ])
  })

  it('refuses an --admin who is not an admin', async () => {
    const { deps } = world(['u1'])

    expect(await main(['--year=2026', '--apply', '--admin=member-1'], deps)).toBe(1)
    expect(deps.rollback).not.toHaveBeenCalled()
  })
})

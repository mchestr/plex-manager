/**
 * @jest-environment node
 */

import { seasonPrepareAt } from '@/lib/rewind/season-runs'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('JSDoc Documentation Examples', () => {
  it('seasonPrepareAt: 00:15 on the opening day in the westernmost zone', () => {
    expect(seasonPrepareAt(2026, '12-01', ['America/Chicago', 'America/Los_Angeles']).toISOString()).toBe('2026-12-01T08:15:00.000Z')
  })
})

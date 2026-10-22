/**
 * @jest-environment node
 */

import { shareFormats } from '@/lib/rewind/page-meta'
import { seasonPrepareAt } from '@/lib/rewind/season-runs'

jest.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('JSDoc Documentation Examples', () => {
  it('seasonPrepareAt: 00:15 on the opening day in the westernmost zone', () => {
    expect(seasonPrepareAt(2026, '12-01', ['America/Chicago', 'America/Los_Angeles']).toISOString()).toBe('2026-12-01T08:15:00.000Z')
  })

  it('shareFormats: a card page names its card, Setup offers none', () => {
    expect(shareFormats('top-shows')).toBe('Story card, 1080 by 1920')
    expect(shareFormats('setup')).toBeNull()
  })
})

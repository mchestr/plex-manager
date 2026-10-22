/**
 * @jest-environment node
 *
 * markAnnouncementsSeen (P10.22, UI-25): a session is required, the date is
 * validated, and the seen date only moves forward and never past now.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'

import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { markAnnouncementsSeen } from '@/actions/announcements-seen'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
})

describe('markAnnouncementsSeen', () => {
  it('needs a session', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(markAnnouncementsSeen({ through: '2026-11-02T12:00:00.000Z' })).resolves.toMatchObject({
      success: false,
      code: 'UNAUTHENTICATED',
    })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it.each(['yesterday', '2026-11-02', ''])('refuses %p as a date', async (through) => {
    await expect(markAnnouncementsSeen({ through })).resolves.toMatchObject({ success: false, code: 'VALIDATION' })
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('moves the seen date forward only', async () => {
    await expect(markAnnouncementsSeen({ through: '2026-01-02T12:00:00.000Z' })).resolves.toEqual({
      success: true,
      data: null,
    })

    const seen = new Date('2026-01-02T12:00:00.000Z')
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'member-1', OR: [{ announcementsSeenAt: null }, { announcementsSeenAt: { lt: seen } }] },
      data: { announcementsSeenAt: seen },
    })
  })

  it('never stores a date later than now', async () => {
    const before = Date.now()
    await markAnnouncementsSeen({ through: '2999-01-01T00:00:00.000Z' })

    const stored = prismaMock.user.updateMany.mock.calls[0][0].data.announcementsSeenAt as Date
    expect(stored.getTime()).toBeGreaterThanOrEqual(before)
    expect(stored.getTime()).toBeLessThanOrEqual(Date.now())
  })
})

/**
 * @jest-environment node
 *
 * notifyWhenRewindReady (P7.14): "Notify me" turns on RewindPrefs.notify for
 * the member's own year only.
 */

import { mockReset } from 'jest-mock-extended'
import { getServerSession } from 'next-auth'
import { revalidatePath } from 'next/cache'

import { buildPlexWrapped } from '@/__tests__/helpers/factories'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { notifyWhenRewindReady } from '@/actions/rewind-notify'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('next/cache', () => ({ revalidatePath: jest.fn() }))

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: 'member-1', isAdmin: false } })
})

describe('notifyWhenRewindReady', () => {
  it('turns notify on for the member’s own year', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue(buildPlexWrapped({ id: 'wrapped-1', userId: 'member-1', year: 2026, status: 'generating' }))

    const result = await notifyWhenRewindReady({ year: 2026 })

    expect(result).toEqual({ success: true, data: { notify: true } })
    expect(prismaMock.plexWrapped.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_year: { userId: 'member-1', year: 2026 } } }))
    expect(prismaMock.rewindPrefs.upsert).toHaveBeenCalledWith({
      where: { userId_year: { userId: 'member-1', year: 2026 } },
      create: { userId: 'member-1', year: 2026, notify: true },
      update: { notify: true },
    })
    expect(revalidatePath).toHaveBeenCalledWith('/account')
  })

  it('refuses a year with no Rewind of theirs', async () => {
    prismaMock.plexWrapped.findUnique.mockResolvedValue(null)

    const result = await notifyWhenRewindReady({ year: 2025 })

    expect(result).toMatchObject({ success: false, code: 'NOT_FOUND' })
    expect(prismaMock.rewindPrefs.upsert).not.toHaveBeenCalled()
  })

  it('refuses a signed-out caller', async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    const result = await notifyWhenRewindReady({ year: 2026 })

    expect(result).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    expect(prismaMock.rewindPrefs.upsert).not.toHaveBeenCalled()
  })
})

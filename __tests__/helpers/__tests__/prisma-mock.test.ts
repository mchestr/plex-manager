import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildUser } from '@/__tests__/helpers/factories'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

import { prisma } from '@/lib/prisma'

describe('prismaMock', () => {
  beforeEach(() => mockReset(prismaMock))

  it('replaces the prisma export from @/lib/prisma', () => {
    expect(prisma).toBe(prismaMock)
  })

  it('returns a factory user from a typed findUnique mock', async () => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: 'u-42', isAdmin: true }))

    const user = await prisma.user.findUnique({ where: { id: 'u-42' } })

    expect(user).toMatchObject({ id: 'u-42', isAdmin: true, email: 'test@example.com' })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u-42' } })
  })

  it('starts each test with no recorded calls or stubbed values (part 1)', async () => {
    prismaMock.user.count.mockResolvedValue(7)
    await prisma.user.count()
    expect(prismaMock.user.count).toHaveBeenCalledTimes(1)
  })

  it('starts each test with no recorded calls or stubbed values (part 2)', async () => {
    expect(prismaMock.user.count).not.toHaveBeenCalled()
    expect(await prisma.user.count()).toBeUndefined()
  })
})

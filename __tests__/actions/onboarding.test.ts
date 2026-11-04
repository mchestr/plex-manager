
import { completeOnboarding, getOnboardingStatus } from '@/actions/onboarding'
import { getServerSession } from 'next-auth'
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({ authOptions: {} }))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
  }),
}))

describe('Onboarding Actions', () => {
  const mockPrisma = prismaMock
  const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
  })

  describe('getOnboardingStatus', () => {
    it('should return status when authenticated', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: false },
        primaryAuthService: 'plex'
      } as any)

      const result = await getOnboardingStatus()

      expect(result).toMatchObject({ success: true, data: { isComplete: false, service: 'plex' } })
    })

    it('refuses an unauthenticated caller with a code', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await getOnboardingStatus()

      expect(result).toMatchObject({ success: false, code: 'UNAUTHENTICATED' })
    })

    it('refuses an unknown service', async () => {
      const result = await getOnboardingStatus({ service: 'emby' as 'plex' })

      expect(result).toMatchObject({ success: false, code: 'VALIDATION' })
    })
  })

  describe('completeOnboarding', () => {
    it('should mark user as complete for plex service', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: false }
      } as any)

      const result = await completeOnboarding({ service: 'plex' })

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: { plex: true } },
      })
    })

    it('should fail if unauthenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await completeOnboarding({ service: 'plex' })

      expect(result.success).toBe(false)
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })
})


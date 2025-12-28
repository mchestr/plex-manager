
import { completeOnboarding, getOnboardingInfo, getOnboardingStatus } from '@/actions/onboarding'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    overseerr: {
      findFirst: jest.fn(),
    },
    discordIntegration: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
  }),
}))

describe('Onboarding Actions', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>
  const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getOnboardingInfo', () => {
    it('should return publicUrl when available', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue({
        publicUrl: 'https://requests.example.com',
        url: 'http://internal:5055',
      } as any)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('https://requests.example.com')
    })

    it('should construct internal URL when publicUrl is missing', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue({
        publicUrl: null,
        url: 'http://localhost:5055',
      } as any)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('http://localhost:5055')
    })

    it('should return null when no overseerr configured', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue(null)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBeNull()
    })
  })

  describe('getOnboardingStatus', () => {
    it('should return status when authenticated', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: false, jellyfin: false },
        primaryAuthService: 'plex'
      } as any)

      const result = await getOnboardingStatus()

      expect(result.isComplete).toBe(false)
    })

    it('should assume complete if unauthenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await getOnboardingStatus()

      expect(result.isComplete).toBe(true)
    })
  })

  describe('completeOnboarding', () => {
    it('should mark user as complete for plex service', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: false, jellyfin: false }
      } as any)

      const result = await completeOnboarding('plex')

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: { plex: true, jellyfin: false } },
      })
    })

    it('should mark user as complete for jellyfin service', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: false, jellyfin: false }
      } as any)

      const result = await completeOnboarding('jellyfin')

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: { plex: false, jellyfin: true } },
      })
    })

    it('should preserve existing service completion status', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingStatus: { plex: true, jellyfin: false }
      } as any)

      const result = await completeOnboarding('jellyfin')

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: { plex: true, jellyfin: true } },
      })
    })

    it('should fail if unauthenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await completeOnboarding('plex')

      expect(result.success).toBe(false)
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })
})


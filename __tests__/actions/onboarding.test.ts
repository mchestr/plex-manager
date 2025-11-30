
import { completeOnboarding, getOnboardingInfo, getOnboardingStatus } from '@/actions/onboarding'
import { prisma } from '@/lib/prisma'
import { getActiveOverseerrService, getDiscordService } from '@/lib/services/service-helpers'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActiveOverseerrService: jest.fn(),
  getDiscordService: jest.fn(),
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

const mockGetActiveOverseerrService = getActiveOverseerrService as jest.MockedFunction<typeof getActiveOverseerrService>
const mockGetDiscordService = getDiscordService as jest.MockedFunction<typeof getDiscordService>

describe('Onboarding Actions', () => {
  const mockPrisma = prisma as jest.Mocked<typeof prisma>
  const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('getOnboardingInfo', () => {
    it('should return publicUrl when available', async () => {
      mockGetActiveOverseerrService.mockResolvedValue({
        id: 'overseerr-1',
        name: 'Overseerr',
        publicUrl: 'https://requests.example.com',
        url: 'http://internal:5055',
        isActive: true,
        config: { apiKey: 'test-key' },
      } as any)
      mockGetDiscordService.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('https://requests.example.com')
    })

    it('should construct internal URL when publicUrl is missing', async () => {
      mockGetActiveOverseerrService.mockResolvedValue({
        id: 'overseerr-1',
        name: 'Overseerr',
        publicUrl: null,
        url: 'http://localhost:5055',
        isActive: true,
        config: { apiKey: 'test-key' },
      } as any)
      mockGetDiscordService.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('http://localhost:5055')
    })

    it('should return null when no overseerr configured', async () => {
      mockGetActiveOverseerrService.mockResolvedValue(null)
      mockGetDiscordService.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBeNull()
    })
  })

  describe('getOnboardingStatus', () => {
    it('should return status when authenticated', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)
      mockPrisma.user.findUnique.mockResolvedValue({ onboardingCompleted: false } as any)

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
    it('should mark user as complete', async () => {
      mockGetServerSession.mockResolvedValue({ user: { id: 'user-1' } } as any)

      const result = await completeOnboarding()

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingCompleted: true },
      })
    })

    it('should fail if unauthenticated', async () => {
      mockGetServerSession.mockResolvedValue(null)

      const result = await completeOnboarding()

      expect(result.success).toBe(false)
      expect(mockPrisma.user.update).not.toHaveBeenCalled()
    })
  })
})


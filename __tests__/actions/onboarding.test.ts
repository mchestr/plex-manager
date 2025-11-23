
import { completeOnboarding, getOnboardingInfo, getOnboardingStatus } from '@/actions/onboarding'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    overseerr: {
      findFirst: jest.fn(),
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
        protocol: 'http',
        hostname: 'internal',
        port: 5055,
      } as any)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('https://requests.example.com')
    })

    it('should construct internal URL when publicUrl is missing', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue({
        publicUrl: null,
        protocol: 'http',
        hostname: 'localhost',
        port: 5055,
      } as any)

      const result = await getOnboardingInfo()

      expect(result.overseerrUrl).toBe('http://localhost:5055')
    })

    it('should return null when no overseerr configured', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue(null)

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


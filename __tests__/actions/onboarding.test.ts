
import { completeOnboarding, getOnboardingInfo, getOnboardingStatus } from '@/actions/onboarding'
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

  describe('getOnboardingInfo', () => {
    it('should return publicUrl when available', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue({
        publicUrl: 'https://requests.example.com',
        url: 'http://internal:5055',
      } as any)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result).toMatchObject({ success: true, data: { overseerrUrl: 'https://requests.example.com' } })
    })

    it('never returns the internal URL when publicUrl is missing', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue({
        publicUrl: null,
        url: 'http://localhost:5055',
      } as any)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result).toMatchObject({ success: true, data: { overseerrUrl: null } })
      expect(JSON.stringify(result)).not.toContain('localhost')
    })

    it('should return null when no overseerr configured', async () => {
      mockPrisma.overseerr.findFirst.mockResolvedValue(null)
      mockPrisma.discordIntegration.findUnique.mockResolvedValue(null)

      const result = await getOnboardingInfo()

      expect(result).toMatchObject({ success: true, data: { overseerrUrl: null } })
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
        onboardingStatus: { plex: false, jellyfin: false }
      } as any)

      const result = await completeOnboarding({ service: 'plex' })

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

      const result = await completeOnboarding({ service: 'jellyfin' })

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

      const result = await completeOnboarding({ service: 'jellyfin' })

      expect(result.success).toBe(true)
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { onboardingStatus: { plex: true, jellyfin: true } },
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


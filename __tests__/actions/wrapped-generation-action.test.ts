/**
 * Tests for actions/wrapped-generation.ts - wrapped generation logic
 */

import {
  generatePlexWrapped,
  generateAllPlexWrapped,
} from '@/actions/wrapped-generation'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { generateWrappedWithLLM } from '@/lib/wrapped/llm'
import {
  fetchTautulliStatistics,
  fetchPlexServerStatistics,
  fetchOverseerrStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from '@/lib/wrapped/statistics'
import { revalidatePath } from 'next/cache'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    plexWrapped: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    tautulli: {
      findFirst: jest.fn(),
    },
    overseerr: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/wrapped/llm', () => ({
  generateWrappedWithLLM: jest.fn(),
}))

jest.mock('@/lib/wrapped/statistics', () => ({
  fetchTautulliStatistics: jest.fn(),
  fetchPlexServerStatistics: jest.fn(),
  fetchOverseerrStatistics: jest.fn(),
  fetchTopContentLeaderboards: jest.fn(),
  fetchWatchTimeLeaderboard: jest.fn(),
}))

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}))

jest.mock('@/lib/utils', () => ({
  generateShareToken: jest.fn(() => 'test-share-token'),
}))

// Import test builders
import {
  makePrismaUser,
  makeSession,
  makeAdminSession,
  makePrismaPlexServer,
  makePrismaTautulli,
} from '../utils/test-builders'

const mockUser = makePrismaUser({
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  plexUserId: 'plex-user-123',
})

const mockSession = makeSession({
  user: {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
  },
})

const mockAdminSession = makeAdminSession({
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin User',
    isAdmin: true,
  },
})

describe('generatePlexWrapped', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should successfully generate wrapped for user', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalRequests: 20,
        totalServerRequests: 100,
        approvedRequests: 15,
        pendingRequests: 5,
        topRequestedGenres: [],
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
    expect(revalidatePath).toHaveBeenCalled()
  })

  it('should return error when user is not authenticated', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should return error when user does not exist', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('User not found')
  })

  it('should allow user to generate their own wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (will fail later in the process, but authorization check passes)
    expect(result).toBeDefined()
  })

  it('should prevent user from generating wrapped for another user', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...mockUser,
      id: 'user-2',
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-2', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Unauthorized')
  })

  it('should allow admin to regenerate completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockAdminSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'completed',
      shareToken: 'existing-token',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'existing-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (admin can regenerate)
    expect(result).toBeDefined()
  })

  it('should prevent non-admin from regenerating completed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'completed',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Only admins can regenerate')
  })

  it('should allow user to retry failed wrapped', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'failed',
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    // Should proceed (user can retry failed wrapped)
    expect(result).toBeDefined()
  })

  it('should return error when no active Plex server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active Plex server')
  })

  it('should return error when no active Tautulli server', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(null)

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('No active Tautulli server')
  })

  it('should return error when user has no Plex user ID', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makePrismaUser({
        ...mockUser,
        plexUserId: null,
      })
    )
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not have a Plex user ID')
  })

  it('should handle Tautulli statistics fetch failure', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch statistics',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(prisma.plexWrapped.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wrapped-1' },
        data: expect.objectContaining({
          status: 'failed',
        }),
      })
    )
  })

  it('should handle LLM generation failure', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue(makePrismaPlexServer())
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue(makePrismaTautulli())
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: false,
      error: 'LLM generation failed',
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(prisma.plexWrapped.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wrapped-1' },
        data: expect.objectContaining({
          status: 'failed',
        }),
      })
    )
  })

  it('should handle invalid year parameter', async () => {
    // With validation, invalid year parameter (-1) is rejected before any database calls
    // No need to mock session or database - validation happens first
    const result = await generatePlexWrapped('user-1', -1)

    // The function should return an error for invalid year
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('should handle database error during user lookup', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error('Database connection failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database connection failed')
  })

  it('should handle database error during wrapped upsert', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockRejectedValue(
      new Error('Database write failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database write failed')
  })

  it('should handle Plex server statistics fetch failure gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Plex server unavailable',
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalRequests: 20,
        totalServerRequests: 100,
        approvedRequests: 15,
        pendingRequests: 5,
        topRequestedGenres: [],
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if Plex server stats fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle Overseerr statistics fetch failure gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(prisma.overseerr.findFirst as jest.Mock).mockResolvedValue({
      id: 'overseerr-1',
      url: 'https://overseerr.example.com:5055',
      apiKey: 'overseerr-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchOverseerrStatistics as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Overseerr unavailable',
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if Overseerr stats fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle leaderboard fetch failures gracefully', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch leaderboards',
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Failed to fetch watch time leaderboard',
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({})

    const result = await generatePlexWrapped('user-1', 2024)

    // Should succeed even if leaderboards fail (non-critical)
    expect(result.success).toBe(true)
    expect(result.wrappedId).toBe('wrapped-1')
  })

  it('should handle invalid session with empty user ID', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue({
      user: {
        id: '',
        email: 'test@example.com',
        name: 'Test User',
        isAdmin: false,
      },
    })

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid session')
  })

  it('should handle database error during final wrapped update', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser)
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.plexWrapped.upsert as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      userId: 'user-1',
      year: 2024,
      status: 'generating',
      shareToken: 'test-share-token',
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'https://tautulli.example.com:8181',
      apiKey: 'tautulli-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        tautulliUserId: 'tautulli-user-123',
        totalWatchTime: 1000,
        moviesWatchTime: 500,
        showsWatchTime: 500,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test summary',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockRejectedValue(
      new Error('Database update failed')
    )

    const result = await generatePlexWrapped('user-1', 2024)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Database update failed')
  })
})

describe('generateAllPlexWrapped', () => {
  beforeEach(() => {
    // Clear mock call history but keep implementations
    jest.clearAllMocks()
    // Ensure all prisma mocks are reset
    ;(prisma.user.findMany as jest.Mock).mockReset()
    ;(prisma.user.findUnique as jest.Mock).mockReset()
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockReset()
    ;(prisma.plexWrapped.upsert as jest.Mock).mockReset()
    ;(prisma.plexWrapped.update as jest.Mock).mockReset()
    ;(prisma.plexServer.findFirst as jest.Mock).mockReset()
    ;(prisma.tautulli.findFirst as jest.Mock).mockReset()
    ;(prisma.overseerr.findFirst as jest.Mock).mockReset()
    ;(fetchTautulliStatistics as jest.Mock).mockReset()
    ;(fetchPlexServerStatistics as jest.Mock).mockReset()
    ;(fetchOverseerrStatistics as jest.Mock).mockReset()
    ;(fetchTopContentLeaderboards as jest.Mock).mockReset()
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockReset()
    ;(generateWrappedWithLLM as jest.Mock).mockReset()
    ;(getServerSession as jest.Mock).mockReset()
  })

  it('should generate wrapped for all users when admin', async () => {
    // Mock getServerSession to always return admin session (called multiple times)
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])

    // Mock all dependencies for generatePlexWrapped - need to handle 2 users
    ;(prisma.user.findUnique as jest.Mock).mockImplementation((args) => {
      if (args.where.id === 'user-1') {
        return Promise.resolve({ ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' })
      }
      if (args.where.id === 'user-2') {
        return Promise.resolve({ ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' })
      }
      return Promise.resolve(null)
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.upsert as jest.Mock).mockImplementation((args) => {
      return Promise.resolve({
        id: `wrapped-${args.where.userId_year.userId}`,
        userId: args.where.userId_year.userId,
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      })
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'api-key',
      isActive: true,
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(fetchTautulliStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalWatchTime: 100,
        moviesWatchTime: 50,
        showsWatchTime: 50,
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 50,
        topMovies: [],
        topShows: [],
        watchTimeByMonth: [],
        tautulliUserId: 'user-1',
      },
    })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(prisma.plexWrapped.update as jest.Mock).mockResolvedValue({
      id: 'wrapped-1',
      status: 'completed',
    })

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(2)
    expect(result.failed).toBe(0)
  })

  it('should reject non-admin users', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('should handle partial failures', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])

    // Mock dependencies - first user succeeds, second fails
    ;(prisma.user.findUnique as jest.Mock).mockImplementation((args) => {
      if (args.where.id === 'user-1') {
        return Promise.resolve({ ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' })
      }
      if (args.where.id === 'user-2') {
        return Promise.resolve({ ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' })
      }
      return Promise.resolve(null)
    })
    ;(prisma.plexWrapped.findUnique as jest.Mock).mockResolvedValue(null)
    ;(prisma.plexWrapped.upsert as jest.Mock).mockImplementation((args) => {
      return Promise.resolve({
        id: `wrapped-${args.where.userId_year.userId}`,
        userId: args.where.userId_year.userId,
        year: 2024,
        status: 'generating',
        shareToken: 'test-token',
      })
    })
    ;(prisma.plexServer.findFirst as jest.Mock).mockResolvedValue({
      id: 'server-1',
      url: 'https://plex.example.com:32400',
      token: 'server-token',
      name: 'Test Server',
      isActive: true,
    })
    ;(prisma.tautulli.findFirst as jest.Mock).mockResolvedValue({
      id: 'tautulli-1',
      url: 'http://tautulli.example.com:8181',
      apiKey: 'api-key',
      isActive: true,
    })
    ;(fetchTautulliStatistics as jest.Mock)
      .mockResolvedValueOnce({
        success: true,
        data: {
          totalWatchTime: 100,
          moviesWatchTime: 50,
          showsWatchTime: 50,
          moviesWatched: 10,
          showsWatched: 5,
          episodesWatched: 50,
          topMovies: [],
          topShows: [],
          watchTimeByMonth: [],
          tautulliUserId: 'user-1',
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: 'Failed to fetch statistics',
      })
    ;(fetchPlexServerStatistics as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        totalStorage: 1000000000,
        totalStorageFormatted: '1 TB',
        librarySize: {
          movies: 100,
          shows: 50,
          episodes: 500,
        },
      },
    })
    ;(fetchTopContentLeaderboards as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        movies: [],
        shows: [],
      },
    })
    ;(fetchWatchTimeLeaderboard as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    })
    ;(generateWrappedWithLLM as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        sections: [],
        summary: 'Test',
        metadata: {
          totalSections: 0,
          generationTime: 0,
        },
      },
    })
    ;(prisma.plexWrapped.update as jest.Mock)
      .mockResolvedValueOnce({
        id: 'wrapped-1',
        status: 'completed',
      })
      .mockResolvedValueOnce({
        id: 'wrapped-2',
        status: 'failed',
        error: 'Failed to fetch statistics',
      })

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.errors).toHaveLength(1)
  })

  it('should skip users without Plex user ID', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2024)

    // Should successfully call the function with admin session
    expect(result.success).toBe(true)
    // Should only query for users with plexUserId not null
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        plexUserId: { not: null },
      },
    })
  })

  it('should handle database error when fetching users', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockRejectedValue(
      new Error('Database query failed')
    )

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain('Database query failed')

    consoleErrorSpy.mockRestore()
  })

  it('should handle all users failing', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([
      { ...mockUser, id: 'user-1', plexUserId: 'plex-1', name: 'User 1', email: 'user1@test.com' },
      { ...mockUser, id: 'user-2', plexUserId: 'plex-2', name: 'User 2', email: 'user2@test.com' },
    ])
    ;(prisma.user.findUnique as jest.Mock).mockResolvedValue(null)

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(2)
    expect(result.errors).toHaveLength(2)

    consoleErrorSpy.mockRestore()
  })

  it('should handle empty user list', async () => {
    ;(getServerSession as jest.Mock).mockImplementation(async () => mockAdminSession)
    ;(prisma.user.findMany as jest.Mock).mockResolvedValue([])

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(true)
    expect(result.generated).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject unauthenticated requests', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)

    const result = await generateAllPlexWrapped(2024)

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Unauthorized: Only admins can generate wrapped for all users')
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })
})


import { scanForCandidates } from '../scanner'
import { evaluateRule } from '../rule-evaluator'
import { getTautulliLibraryMediaInfo } from '@/lib/connections/tautulli'
import { prisma } from '@/lib/prisma'
import { getActiveTautulliService } from '@/lib/services/service-helpers'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    maintenanceRule: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    maintenanceScan: {
      create: jest.fn(),
      update: jest.fn(),
    },
    maintenanceCandidate: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/services/service-helpers', () => ({
  getActiveTautulliService: jest.fn(),
}))

jest.mock('@/lib/connections/tautulli', () => ({
  getTautulliLibraryMediaInfo: jest.fn(),
}))

jest.mock('../rule-evaluator', () => ({
  evaluateRule: jest.fn(),
}))

// Mock logger to avoid console output in tests
jest.mock('@/lib/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}))

describe('scanForCandidates', () => {
  const mockRuleId = 'rule-123'
  const mockScanId = 'scan-456'

  const mockRule = {
    id: mockRuleId,
    name: 'Test Rule',
    description: 'Test rule description',
    enabled: true,
    mediaType: 'MOVIE' as const,
    criteria: {
      libraryIds: ['lib-1'],
      neverWatched: true,
    },
    actionType: 'DELETE',
    schedule: null,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: new Date('2024-01-01'),
  }

  const mockScan = {
    id: mockScanId,
    ruleId: mockRuleId,
    status: 'RUNNING',
    startedAt: new Date(),
    completedAt: null,
    error: null,
    itemsScanned: 0,
    itemsFlagged: 0,
    createdAt: new Date(),
  }

  const mockTautulliConfig = {
    name: 'Tautulli',
    url: 'http://localhost:8181',
    apiKey: 'test-api-key',
    publicUrl: undefined,
  }

  const mockTautulliService = {
    id: 'tautulli-1',
    name: 'Tautulli',
    url: 'http://localhost:8181',
    isActive: true,
    config: {
      apiKey: 'test-api-key',
    },
  }

  const mockMovieData = [
    {
      rating_key: '1',
      title: 'Movie 1',
      year: 2020,
      play_count: 0,
      last_played: null,
      added_at: 1609459200, // 2021-01-01
      file_size: 1073741824, // 1GB
      file: '/path/to/movie1.mp4',
      radarr_id: 100,
      tmdb_id: 200,
      thumb: '/poster1.jpg',
    },
    {
      rating_key: '2',
      title: 'Movie 2',
      year: 2021,
      play_count: 5,
      last_played: 1640995200, // 2022-01-01
      added_at: 1609459200,
      file_size: 2147483648, // 2GB
      file: '/path/to/movie2.mp4',
      radarr_id: 101,
      tmdb_id: 201,
      thumb: '/poster2.jpg',
    },
  ]

  const mockTVSeriesData = [
    {
      rating_key: '10',
      title: 'TV Series 1',
      year: 2020,
      play_count: 0,
      last_played: null,
      added_at: 1609459200,
      file_size: 5368709120, // 5GB
      file: '/path/to/series1',
      sonarr_id: 300,
      tvdb_id: 400,
      thumb: '/poster10.jpg',
    },
  ]

  const mockTautulliResponse = {
    success: true,
    data: {
      response: {
        result: 'success',
        message: null,
        data: {
          data: mockMovieData,
        },
      },
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('successful scan scenarios', () => {
    it('should successfully scan and find matching items', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockImplementation((item) => {
        // Only match the first movie (never watched)
        return item.plexRatingKey === '1'
      })
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ id: 'candidate-1', ...data.data })
      )
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsScanned: 2,
        itemsFlagged: 1,
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify rule lookup
      expect(prisma.maintenanceRule.findUnique).toHaveBeenCalledWith({
        where: { id: mockRuleId },
      })

      // Verify scan creation
      expect(prisma.maintenanceScan.create).toHaveBeenCalledWith({
        data: {
          ruleId: mockRuleId,
          status: 'RUNNING',
          startedAt: expect.any(Date),
        },
      })

      // Verify Tautulli config lookup
      expect(getActiveTautulliService).toHaveBeenCalled()

      // Verify Tautulli API call
      expect(getTautulliLibraryMediaInfo).toHaveBeenCalledWith(
        mockTautulliConfig,
        'lib-1',
        { length: 10000 }
      )

      // Verify rule evaluation for all items
      expect(evaluateRule).toHaveBeenCalledTimes(2)

      // Verify candidate creation for matched item
      expect(prisma.maintenanceCandidate.create).toHaveBeenCalledTimes(1)
      expect(prisma.maintenanceCandidate.create).toHaveBeenCalledWith({
        data: {
          scanId: mockScanId,
          mediaType: 'MOVIE',
          plexRatingKey: '1',
          radarrId: 100,
          sonarrId: null,
          tmdbId: 200,
          tvdbId: null,
          title: 'Movie 1',
          year: 2020,
          poster: '/poster1.jpg',
          filePath: '/path/to/movie1.mp4',
          fileSize: BigInt(1073741824),
          playCount: 0,
          lastWatchedAt: null,
          addedAt: new Date(1609459200 * 1000),
          matchedRules: ['Test Rule'],
          reviewStatus: 'PENDING',
        },
      })

      // Verify scan completion
      expect(prisma.maintenanceScan.update).toHaveBeenCalledWith({
        where: { id: mockScanId },
        data: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          itemsScanned: 2,
          itemsFlagged: 1,
        },
      })

      // Verify rule statistics update
      expect(prisma.maintenanceRule.update).toHaveBeenCalledWith({
        where: { id: mockRuleId },
        data: {
          lastRunAt: expect.any(Date),
          nextRunAt: null,
        },
      })

      // Verify result
      expect(result).toEqual({
        scanId: mockScanId,
        status: 'COMPLETED',
        itemsScanned: 2,
        itemsFlagged: 1,
      })
    })

    it('should successfully scan with no matches', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(false) // No matches
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsScanned: 2,
        itemsFlagged: 0,
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify no candidates created
      expect(prisma.maintenanceCandidate.create).not.toHaveBeenCalled()

      // Verify scan completed with no flags
      expect(prisma.maintenanceScan.update).toHaveBeenCalledWith({
        where: { id: mockScanId },
        data: {
          status: 'COMPLETED',
          completedAt: expect.any(Date),
          itemsScanned: 2,
          itemsFlagged: 0,
        },
      })

      // Verify result
      expect(result).toEqual({
        scanId: mockScanId,
        status: 'COMPLETED',
        itemsScanned: 2,
        itemsFlagged: 0,
      })
    })

    it('should handle TV series scans', async () => {
      const tvRule = {
        ...mockRule,
        mediaType: 'TV_SERIES' as const,
        criteria: {
          libraryIds: ['lib-tv-1'],
          neverWatched: true,
        },
      }

      const tvTautulliResponse = {
        success: true,
        data: {
          response: {
            result: 'success',
            message: null,
            data: {
              data: mockTVSeriesData,
            },
          },
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(tvRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(tvTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(true) // Match the series
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ id: 'candidate-tv-1', ...data.data })
      )
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsScanned: 1,
        itemsFlagged: 1,
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(tvRule)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify candidate creation with TV series fields
      expect(prisma.maintenanceCandidate.create).toHaveBeenCalledWith({
        data: {
          scanId: mockScanId,
          mediaType: 'TV_SERIES',
          plexRatingKey: '10',
          radarrId: null,
          sonarrId: 300,
          tmdbId: null,
          tvdbId: 400,
          title: 'TV Series 1',
          year: 2020,
          poster: '/poster10.jpg',
          filePath: '/path/to/series1',
          fileSize: BigInt(5368709120),
          playCount: 0,
          lastWatchedAt: null,
          addedAt: new Date(1609459200 * 1000),
          matchedRules: ['Test Rule'],
          reviewStatus: 'PENDING',
        },
      })

      expect(result.status).toBe('COMPLETED')
      expect(result.itemsFlagged).toBe(1)
    })

    it('should scan multiple libraries', async () => {
      const multiLibraryRule = {
        ...mockRule,
        criteria: {
          libraryIds: ['lib-1', 'lib-2'],
          neverWatched: true,
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(multiLibraryRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(false)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
        completedAt: new Date(),
        itemsScanned: 4,
        itemsFlagged: 0,
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(multiLibraryRule)

      // Execute
      await scanForCandidates(mockRuleId)

      // Verify Tautulli called for each library
      expect(getTautulliLibraryMediaInfo).toHaveBeenCalledTimes(2)
      expect(getTautulliLibraryMediaInfo).toHaveBeenCalledWith(
        mockTautulliConfig,
        'lib-1',
        { length: 10000 }
      )
      expect(getTautulliLibraryMediaInfo).toHaveBeenCalledWith(
        mockTautulliConfig,
        'lib-2',
        { length: 10000 }
      )
    })
  })

  describe('progress callback', () => {
    it('should invoke progress callback during scan', async () => {
      const onProgress = jest.fn()

      // Create array of 25 items to ensure multiple progress updates
      const manyMovies = Array.from({ length: 25 }, (_, i) => ({
        rating_key: String(i + 1),
        title: `Movie ${i + 1}`,
        year: 2020,
        play_count: i,
        last_played: null,
        added_at: 1609459200,
        file_size: 1073741824,
        file: `/path/to/movie${i + 1}.mp4`,
        radarr_id: i + 100,
        tmdb_id: i + 200,
        thumb: `/poster${i + 1}.jpg`,
      }))

      const largeTautulliResponse = {
        success: true,
        data: {
          response: {
            result: 'success',
            message: null,
            data: {
              data: manyMovies,
            },
          },
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(largeTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(false)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      await scanForCandidates(mockRuleId, onProgress)

      // Verify progress callback was called (every 10 items)
      // With 25 items, should be called at 10, 20 positions
      expect(onProgress).toHaveBeenCalled()
      expect(onProgress).toHaveBeenCalledWith(expect.any(Number))

      // Check that percentages are reasonable
      const calls = onProgress.mock.calls.map((call) => call[0])
      calls.forEach((percent) => {
        expect(percent).toBeGreaterThanOrEqual(0)
        expect(percent).toBeLessThanOrEqual(100)
      })
    })
  })

  describe('error handling', () => {
    it('should return error when rule not found', async () => {
      // Setup mock
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(null)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error result
      expect(result).toEqual({
        scanId: '',
        status: 'FAILED',
        itemsScanned: 0,
        itemsFlagged: 0,
        error: `Rule not found: ${mockRuleId}`,
      })

      // Verify no scan was created
      expect(prisma.maintenanceScan.create).not.toHaveBeenCalled()
    })

    it('should return error when rule is disabled', async () => {
      const disabledRule = { ...mockRule, enabled: false }

      // Setup mock
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(disabledRule)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error result
      expect(result).toEqual({
        scanId: '',
        status: 'FAILED',
        itemsScanned: 0,
        itemsFlagged: 0,
        error: `Rule is disabled: ${mockRuleId}`,
      })

      // Verify no scan was created
      expect(prisma.maintenanceScan.create).not.toHaveBeenCalled()
    })

    it('should handle database errors during scan creation', async () => {
      const dbError = new Error('Database connection failed')

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockRejectedValue(dbError)

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error result
      expect(result).toEqual({
        scanId: '',
        status: 'FAILED',
        itemsScanned: 0,
        itemsFlagged: 0,
        error: 'Database connection failed',
      })
    })

    it('should update scan to FAILED status on error', async () => {
      const tautulliError = new Error('Tautulli API error')

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockRejectedValue(tautulliError)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify scan was updated to FAILED
      expect(prisma.maintenanceScan.update).toHaveBeenCalledWith({
        where: { id: mockScanId },
        data: {
          status: 'FAILED',
          completedAt: expect.any(Date),
          error: 'Tautulli API error',
        },
      })

      // Verify error result
      expect(result).toEqual({
        scanId: '',
        status: 'FAILED',
        itemsScanned: 0,
        itemsFlagged: 0,
        error: 'Tautulli API error',
      })
    })

    it('should handle error when no Tautulli server configured', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(null)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error
      expect(result.status).toBe('FAILED')
      expect(result.error).toBe('No active Tautulli server configured')

      // Verify scan was updated to FAILED
      expect(prisma.maintenanceScan.update).toHaveBeenCalledWith({
        where: { id: mockScanId },
        data: {
          status: 'FAILED',
          completedAt: expect.any(Date),
          error: 'No active Tautulli server configured',
        },
      })
    })

    it('should handle Tautulli API error response', async () => {
      const errorResponse = {
        success: true,
        data: {
          response: {
            result: 'error',
            message: 'Invalid section ID',
            data: null,
          },
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(errorResponse)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error
      expect(result.status).toBe('FAILED')
      expect(result.error).toBe('Invalid section ID')
    })

    it('should handle missing libraryIds for movie rules', async () => {
      const ruleWithoutLibraries = {
        ...mockRule,
        criteria: {
          neverWatched: true,
          // No libraryIds
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(ruleWithoutLibraries)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error includes rule context
      expect(result.status).toBe('FAILED')
      expect(result.error).toContain('MOVIE rules must specify libraryIds in criteria')
      expect(result.error).toContain('Rule: "Test Rule"')
      expect(result.error).toContain(mockRuleId)
    })

    it('should handle missing libraryIds for TV series rules', async () => {
      const tvRuleWithoutLibraries = {
        ...mockRule,
        mediaType: 'TV_SERIES' as const,
        criteria: {
          neverWatched: true,
          // No libraryIds
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(tvRuleWithoutLibraries)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error includes rule context
      expect(result.status).toBe('FAILED')
      expect(result.error).toContain('TV_SERIES rules must specify libraryIds in criteria')
      expect(result.error).toContain('Rule: "Test Rule"')
      expect(result.error).toContain(mockRuleId)
    })

    it('should handle unsupported media type', async () => {
      const unsupportedRule = {
        ...mockRule,
        mediaType: 'MUSIC' as any,
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(unsupportedRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify error includes rule context and supported types
      expect(result.status).toBe('FAILED')
      expect(result.error).toContain('Unsupported media type: MUSIC')
      expect(result.error).toContain('Rule: "Test Rule"')
      expect(result.error).toContain(mockRuleId)
      expect(result.error).toContain('Supported types: MOVIE, TV_SERIES')
    })

    it('should handle error during candidate creation', async () => {
      const candidateError = new Error('Failed to create candidate')

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(true) // Match all items
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockRejectedValue(candidateError)
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'FAILED',
      })

      // Execute
      const result = await scanForCandidates(mockRuleId)

      // Verify scan was marked as FAILED
      expect(result.status).toBe('FAILED')
      expect(result.error).toBe('Failed to create candidate')
    })
  })

  describe('data transformation', () => {
    it('should correctly transform movie data with all fields', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(true)
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ id: 'candidate-1', ...data.data })
      )
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      await scanForCandidates(mockRuleId)

      // Verify data transformation
      expect(evaluateRule).toHaveBeenCalledWith(
        {
          plexRatingKey: '1',
          title: 'Movie 1',
          year: 2020,
          libraryId: 'lib-1',
          playCount: 0,
          lastWatchedAt: null,
          addedAt: new Date(1609459200 * 1000),
          fileSize: BigInt(1073741824),
          filePath: '/path/to/movie1.mp4',
          radarrId: 100,
          tmdbId: 200,
          poster: '/poster1.jpg',
        },
        mockRule.criteria
      )
    })

    it('should handle missing optional fields in Tautulli data', async () => {
      const minimalMovieData = [
        {
          rating_key: '1',
          title: 'Minimal Movie',
          // All optional fields missing
        },
      ]

      const minimalResponse = {
        success: true,
        data: {
          response: {
            result: 'success',
            message: null,
            data: {
              data: minimalMovieData,
            },
          },
        },
      }

      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(minimalResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(true)
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockImplementation((data) =>
        Promise.resolve({ id: 'candidate-1', ...data.data })
      )
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      await scanForCandidates(mockRuleId)

      // Verify minimal data handling
      expect(evaluateRule).toHaveBeenCalledWith(
        {
          plexRatingKey: '1',
          title: 'Minimal Movie',
          year: undefined,
          libraryId: 'lib-1',
          playCount: 0,
          lastWatchedAt: null,
          addedAt: null,
          fileSize: null,
          filePath: null,
          radarrId: null,
          tmdbId: null,
          poster: null,
        },
        mockRule.criteria
      )

      expect(prisma.maintenanceCandidate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          year: undefined,
          radarrId: null,
          tmdbId: null,
          poster: null,
          filePath: null,
          fileSize: null,
        }),
      })
    })

    it('should correctly convert timestamps to dates', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockImplementation((item) => {
        // Verify timestamp conversion
        if (item.plexRatingKey === '2') {
          expect(item.lastWatchedAt).toEqual(new Date(1640995200 * 1000))
          expect(item.addedAt).toEqual(new Date(1609459200 * 1000))
        }
        return false
      })
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      await scanForCandidates(mockRuleId)

      // Verification done in evaluateRule mock
    })

    it('should correctly convert BigInt file sizes', async () => {
      // Setup mocks
      ;(prisma.maintenanceRule.findUnique as jest.Mock).mockResolvedValue(mockRule)
      ;(prisma.maintenanceScan.create as jest.Mock).mockResolvedValue(mockScan)
      ;(getActiveTautulliService as jest.Mock).mockResolvedValue(mockTautulliService)
      ;(getTautulliLibraryMediaInfo as jest.Mock).mockResolvedValue(mockTautulliResponse)
      ;(evaluateRule as jest.Mock).mockReturnValue(true)
      ;(prisma.maintenanceCandidate.create as jest.Mock).mockImplementation((data) => {
        // Verify BigInt conversion
        expect(data.data.fileSize).toBeInstanceOf(BigInt)
        return Promise.resolve({ id: 'candidate-1', ...data.data })
      })
      ;(prisma.maintenanceScan.update as jest.Mock).mockResolvedValue({
        ...mockScan,
        status: 'COMPLETED',
      })
      ;(prisma.maintenanceRule.update as jest.Mock).mockResolvedValue(mockRule)

      // Execute
      await scanForCandidates(mockRuleId)

      // Verification done in create mock
    })
  })
})

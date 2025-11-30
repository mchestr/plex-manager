/**
 * Tests for actions/user-queries.ts - getUserActivityTimeline
 *
 * Tests cover:
 * - Fetching and merging Discord command logs and media marks
 * - Pagination of combined results
 * - Sorting by timestamp (most recent first)
 * - Error handling
 */

import { getUserActivityTimeline } from '@/actions/user-queries'
import { requireAdmin } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import {
  makePrismaDiscordCommandLog,
  makePrismaUserMediaMark,
} from '@/__tests__/utils/test-builders'

// Mock dependencies
jest.mock('@/lib/admin', () => ({
  requireAdmin: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    discordCommandLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    userMediaMark: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

const mockRequireAdmin = requireAdmin as jest.MockedFunction<typeof requireAdmin>
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('getUserActivityTimeline', () => {
  const userId = 'user-123'

  beforeEach(() => {
    jest.clearAllMocks()
    mockRequireAdmin.mockResolvedValue(undefined)
  })

  describe('admin access', () => {
    it('should require admin access', async () => {
      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(0)
      mockPrisma.userMediaMark.count.mockResolvedValue(0)

      await getUserActivityTimeline(userId)

      expect(mockRequireAdmin).toHaveBeenCalled()
    })
  })

  describe('fetching activities', () => {
    it('should fetch both Discord commands and media marks', async () => {
      const discordLog = makePrismaDiscordCommandLog({ userId })
      const mediaMark = makePrismaUserMediaMark({ userId })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([discordLog])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([mediaMark])
      mockPrisma.discordCommandLog.count.mockResolvedValue(1)
      mockPrisma.userMediaMark.count.mockResolvedValue(1)

      const result = await getUserActivityTimeline(userId)

      expect(result).not.toBeNull()
      expect(result!.items).toHaveLength(2)
      expect(result!.total).toBe(2)
    })

    it('should return empty timeline when no activities exist', async () => {
      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(0)
      mockPrisma.userMediaMark.count.mockResolvedValue(0)

      const result = await getUserActivityTimeline(userId)

      expect(result).not.toBeNull()
      expect(result!.items).toHaveLength(0)
      expect(result!.total).toBe(0)
    })

    it('should only return Discord commands when no media marks exist', async () => {
      const discordLog = makePrismaDiscordCommandLog({ userId })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([discordLog])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(1)
      mockPrisma.userMediaMark.count.mockResolvedValue(0)

      const result = await getUserActivityTimeline(userId)

      expect(result!.items).toHaveLength(1)
      expect(result!.items[0].type).toBe('discord_command')
    })

    it('should only return media marks when no Discord commands exist', async () => {
      const mediaMark = makePrismaUserMediaMark({ userId })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([mediaMark])
      mockPrisma.discordCommandLog.count.mockResolvedValue(0)
      mockPrisma.userMediaMark.count.mockResolvedValue(1)

      const result = await getUserActivityTimeline(userId)

      expect(result!.items).toHaveLength(1)
      expect(result!.items[0].type).toBe('media_mark')
    })
  })

  describe('sorting', () => {
    it('should sort activities by timestamp descending (most recent first)', async () => {
      const olderDiscordLog = makePrismaDiscordCommandLog({
        id: 'discord-1',
        userId,
        createdAt: new Date('2024-01-01T10:00:00Z'),
      })
      const newerMediaMark = makePrismaUserMediaMark({
        id: 'mark-1',
        userId,
        markedAt: new Date('2024-01-15T10:00:00Z'),
      })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([olderDiscordLog])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([newerMediaMark])
      mockPrisma.discordCommandLog.count.mockResolvedValue(1)
      mockPrisma.userMediaMark.count.mockResolvedValue(1)

      const result = await getUserActivityTimeline(userId)

      expect(result!.items[0].id).toBe('mark-1') // Newer item first
      expect(result!.items[1].id).toBe('discord-1') // Older item second
    })
  })

  describe('transformation', () => {
    it('should transform Discord command logs correctly', async () => {
      const discordLog = makePrismaDiscordCommandLog({
        id: 'discord-123',
        userId,
        commandType: 'MEDIA_MARK',
        commandName: '!finished',
        commandArgs: 'Breaking Bad',
        status: 'SUCCESS',
        responseTimeMs: 150,
        channelType: 'support-channel',
        createdAt: new Date('2024-01-15T10:00:00Z'),
      })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([discordLog])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(1)
      mockPrisma.userMediaMark.count.mockResolvedValue(0)

      const result = await getUserActivityTimeline(userId)
      const item = result!.items[0]

      expect(item.type).toBe('discord_command')
      if (item.type === 'discord_command') {
        expect(item.id).toBe('discord-123')
        expect(item.commandType).toBe('MEDIA_MARK')
        expect(item.commandName).toBe('!finished')
        expect(item.commandArgs).toBe('Breaking Bad')
        expect(item.status).toBe('SUCCESS')
        expect(item.responseTimeMs).toBe(150)
        expect(item.channelType).toBe('support-channel')
      }
    })

    it('should transform media marks correctly', async () => {
      const mediaMark = makePrismaUserMediaMark({
        id: 'mark-456',
        userId,
        markType: 'KEEP_FOREVER',
        mediaType: 'TV_SERIES',
        title: 'Breaking Bad',
        year: 2008,
        seasonNumber: 1,
        episodeNumber: 5,
        parentTitle: 'Breaking Bad',
        markedVia: 'web',
        markedAt: new Date('2024-01-15T09:00:00Z'),
      })

      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([mediaMark])
      mockPrisma.discordCommandLog.count.mockResolvedValue(0)
      mockPrisma.userMediaMark.count.mockResolvedValue(1)

      const result = await getUserActivityTimeline(userId)
      const item = result!.items[0]

      expect(item.type).toBe('media_mark')
      if (item.type === 'media_mark') {
        expect(item.id).toBe('mark-456')
        expect(item.markType).toBe('KEEP_FOREVER')
        expect(item.mediaType).toBe('TV_SERIES')
        expect(item.title).toBe('Breaking Bad')
        expect(item.year).toBe(2008)
        expect(item.seasonNumber).toBe(1)
        expect(item.episodeNumber).toBe(5)
        expect(item.parentTitle).toBe('Breaking Bad')
        expect(item.markedVia).toBe('web')
      }
    })
  })

  describe('pagination', () => {
    it('should use default page size of 10', async () => {
      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(0)
      mockPrisma.userMediaMark.count.mockResolvedValue(0)

      const result = await getUserActivityTimeline(userId)

      expect(result!.pageSize).toBe(10)
      expect(result!.page).toBe(1)
    })

    it('should respect custom page and pageSize options', async () => {
      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(25)
      mockPrisma.userMediaMark.count.mockResolvedValue(10)

      const result = await getUserActivityTimeline(userId, { page: 2, pageSize: 5 })

      expect(result!.page).toBe(2)
      expect(result!.pageSize).toBe(5)
      expect(result!.total).toBe(35)
      expect(result!.totalPages).toBe(7) // 35 / 5 = 7 pages
    })

    it('should calculate totalPages correctly', async () => {
      mockPrisma.discordCommandLog.findMany.mockResolvedValue([])
      mockPrisma.userMediaMark.findMany.mockResolvedValue([])
      mockPrisma.discordCommandLog.count.mockResolvedValue(15)
      mockPrisma.userMediaMark.count.mockResolvedValue(8)

      const result = await getUserActivityTimeline(userId, { pageSize: 10 })

      expect(result!.total).toBe(23)
      expect(result!.totalPages).toBe(3) // Math.ceil(23 / 10) = 3
    })
  })

  describe('error handling', () => {
    it('should return null on database error', async () => {
      mockPrisma.discordCommandLog.findMany.mockRejectedValue(new Error('Database error'))

      const result = await getUserActivityTimeline(userId)

      expect(result).toBeNull()
    })
  })
})

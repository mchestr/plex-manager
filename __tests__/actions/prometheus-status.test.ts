/**
 * Tests for actions/prometheus-status.ts - Prometheus status fetching
 */

import { getPrometheusStatus } from '@/actions/prometheus-status'
import { queryPrometheusRange } from '@/lib/connections/prometheus'
import { prisma } from '@/lib/prisma'

// Mock dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    prometheus: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock('@/lib/connections/prometheus', () => ({
  queryPrometheusRange: jest.fn(),
}))

jest.mock('next/cache', () => ({
  unstable_cache: jest.fn((fn) => fn),
}))

jest.mock('@/lib/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockQueryPrometheusRange = queryPrometheusRange as jest.MockedFunction<typeof queryPrometheusRange>

describe('Prometheus Status Actions', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset date mocks
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-01-15T12:00:00Z'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getPrometheusStatus', () => {
    it('should return not configured when no Prometheus config exists', async () => {
      mockPrisma.prometheus.findFirst.mockResolvedValue(null)

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(false)
      expect(result.serviceName).toBe('')
      expect(result.segments).toEqual([])
      expect(result.overallStatus).toBe('unknown')
    })

    it('should return unknown segments when Prometheus query fails', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)
      mockQueryPrometheusRange.mockResolvedValue({
        success: false,
        error: 'Connection timeout',
      })

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      expect(result.serviceName).toBe('Plex Server')
      expect(result.overallStatus).toBe('unknown')
      // Should have 169 segments (7 days * 24 hours + 1)
      expect(result.segments.length).toBeGreaterThan(0)
      expect(result.segments.every(s => s.status === 'unknown')).toBe(true)
    })

    it('should calculate operational status when uptime is >= 95%', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)

      // Create mock data with all hours having data (100% uptime)
      const now = new Date('2024-01-15T12:00:00Z')
      const endTime = Math.floor(now.getTime() / 1000)
      const startTime = endTime - 7 * 24 * 60 * 60
      const values: [number, string][] = []

      let currentTime = Math.floor(startTime / 3600) * 3600
      const endHour = Math.floor(endTime / 3600) * 3600
      while (currentTime <= endHour) {
        values.push([currentTime, '1'])
        currentTime += 3600
      }

      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [{
            metric: { job: 'plex' },
            values,
          }],
        },
      })

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      expect(result.serviceName).toBe('Plex Server')
      expect(result.overallStatus).toBe('operational')
      expect(result.segments.filter(s => s.status === 'up').length).toBeGreaterThan(0)
    })

    it('should calculate issues status when uptime is between 50% and 95%', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)

      // Create mock data with ~70% uptime in last 24 hours
      // New logic: only considers known data points, so we need to include explicit down values
      const now = new Date('2024-01-15T12:00:00Z')
      const endTime = Math.floor(now.getTime() / 1000)
      const values: [number, string][] = []

      // Add data for all 24 hours: 17 up (value=1), 7 down (value=0)
      const last24HoursStart = endTime - 24 * 3600
      let currentTime = Math.floor(last24HoursStart / 3600) * 3600
      let count = 0
      while (currentTime <= Math.floor(endTime / 3600) * 3600) {
        // First 17 hours: up, last 7 hours: down
        const value = count < 17 ? '1' : '0'
        values.push([currentTime, value])
        currentTime += 3600
        count++
      }

      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [{
            metric: { job: 'plex' },
            values,
          }],
        },
      })

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      expect(result.overallStatus).toBe('issues')
    })

    it('should calculate down status when uptime is below 50%', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)

      // Create mock data with ~30% uptime in last 24 hours
      // New logic: only considers known data points, so we need to include explicit down values
      const now = new Date('2024-01-15T12:00:00Z')
      const endTime = Math.floor(now.getTime() / 1000)
      const values: [number, string][] = []

      // Add data for all 24 hours: 7 up (value=1), 17 down (value=0)
      const last24HoursStart = endTime - 24 * 3600
      let currentTime = Math.floor(last24HoursStart / 3600) * 3600
      let count = 0
      while (currentTime <= Math.floor(endTime / 3600) * 3600) {
        // First 7 hours: up, rest: down
        const value = count < 7 ? '1' : '0'
        values.push([currentTime, value])
        currentTime += 3600
        count++
      }

      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [{
            metric: { job: 'plex' },
            values,
          }],
        },
      })

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      expect(result.overallStatus).toBe('down')
    })

    it('should handle errors gracefully and return isConfigured true with unknown status', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValueOnce(mockPrometheus)
      mockQueryPrometheusRange.mockRejectedValue(new Error('Network error'))

      // Mock the second findFirst call in error handler
      mockPrisma.prometheus.findFirst.mockResolvedValueOnce(mockPrometheus)

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      expect(result.serviceName).toBe('Plex Server')
      expect(result.overallStatus).toBe('unknown')
      expect(result.segments.every(s => s.status === 'unknown')).toBe(true)
    })

    it('should handle error when both Prometheus query and name lookup fail', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValueOnce(mockPrometheus)
      mockQueryPrometheusRange.mockRejectedValue(new Error('Network error'))

      // Mock the second findFirst call in error handler to also fail
      mockPrisma.prometheus.findFirst.mockRejectedValueOnce(new Error('Database error'))

      const result = await getPrometheusStatus()

      // When name lookup also fails, isConfigured should be false
      expect(result.isConfigured).toBe(false)
      expect(result.serviceName).toBe('')
      expect(result.overallStatus).toBe('unknown')
    })

    it('should generate correct number of hourly segments for 7 days', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)

      // Create mock data with all hours having data
      const now = new Date('2024-01-15T12:00:00Z')
      const endTime = Math.floor(now.getTime() / 1000)
      const startTime = endTime - 7 * 24 * 60 * 60
      const values: [number, string][] = []

      let currentTime = Math.floor(startTime / 3600) * 3600
      const endHour = Math.floor(endTime / 3600) * 3600
      while (currentTime <= endHour) {
        values.push([currentTime, '1'])
        currentTime += 3600
      }

      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [{
            metric: { job: 'plex' },
            values,
          }],
        },
      })

      const result = await getPrometheusStatus()

      // 7 days * 24 hours = 168 hours, plus current hour = 169 segments
      // (accounting for the hour boundary calculation)
      expect(result.segments.length).toBeGreaterThanOrEqual(168)
      expect(result.segments.length).toBeLessThanOrEqual(170)
    })

    it('should call queryPrometheusRange with correct parameters', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)
      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [],
        },
      })

      await getPrometheusStatus()

      expect(mockQueryPrometheusRange).toHaveBeenCalledWith(
        {
          name: 'Plex Server',
          url: 'http://prometheus:9090',
          query: 'up{job="plex"}',
        },
        expect.any(Number), // startTime
        expect.any(Number), // endTime
        '1h' // step
      )
    })

    it('should handle empty result from Prometheus', async () => {
      const mockPrometheus = {
        id: '1',
        name: 'Plex Server',
        url: 'http://prometheus:9090',
        query: 'up{job="plex"}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      mockPrisma.prometheus.findFirst.mockResolvedValue(mockPrometheus)
      mockQueryPrometheusRange.mockResolvedValue({
        success: true,
        data: {
          resultType: 'matrix',
          result: [],
        },
      })

      const result = await getPrometheusStatus()

      expect(result.isConfigured).toBe(true)
      // New logic: All segments should be unknown (not down) when no data returned
      expect(result.segments.every(s => s.status === 'unknown')).toBe(true)
      // Overall status should be unknown when no known data
      expect(result.overallStatus).toBe('unknown')
    })
  })
})

/**
 * Unit tests for the maintenance rule scheduler module
 */

// Mock the queue module directly
const mockUpsertJobScheduler = jest.fn()
const mockRemoveJobScheduler = jest.fn()
const mockGetJobSchedulers = jest.fn()

jest.mock("../queue", () => ({
  maintenanceQueue: {
    upsertJobScheduler: (...args: unknown[]) => mockUpsertJobScheduler(...args),
    removeJobScheduler: (...args: unknown[]) => mockRemoveJobScheduler(...args),
    getJobSchedulers: (...args: unknown[]) => mockGetJobSchedulers(...args),
  },
}))

// Mock Prisma
const mockFindMany = jest.fn()
jest.mock("@/lib/prisma", () => ({
  prisma: {
    maintenanceRule: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}))

// Mock logger
const mockLoggerInfo = jest.fn()
const mockLoggerError = jest.fn()
const mockLoggerDebug = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => mockLoggerInfo(...args),
    debug: (...args: unknown[]) => mockLoggerDebug(...args),
    error: (...args: unknown[]) => mockLoggerError(...args),
    warn: jest.fn(),
  }),
}))

import {
  syncRuleSchedule,
  removeRuleSchedule,
  syncAllRuleSchedules,
  getActiveSchedulers,
} from "../scheduler"

describe("scheduler", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpsertJobScheduler.mockResolvedValue(undefined)
    mockRemoveJobScheduler.mockResolvedValue(true)
    mockGetJobSchedulers.mockResolvedValue([])
  })

  describe("syncRuleSchedule", () => {
    it("should create job scheduler when rule is enabled with schedule", async () => {
      await syncRuleSchedule("rule-123", "0 2 * * *", true)

      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "maintenance-rule-rule-123",
        {
          pattern: "0 2 * * *",
          immediately: false,
        },
        {
          name: "scheduled-scan",
          data: { ruleId: "rule-123", manualTrigger: false },
        }
      )
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Job scheduler created/updated",
        expect.objectContaining({ ruleId: "rule-123", schedule: "0 2 * * *" })
      )
    })

    it("should update existing job scheduler with new cron pattern", async () => {
      await syncRuleSchedule("rule-123", "0 3 * * *", true)

      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "maintenance-rule-rule-123",
        expect.objectContaining({ pattern: "0 3 * * *" }),
        expect.any(Object)
      )
    })

    it("should remove job scheduler when rule is disabled", async () => {
      await syncRuleSchedule("rule-123", "0 2 * * *", false)

      expect(mockUpsertJobScheduler).not.toHaveBeenCalled()
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("maintenance-rule-rule-123")
    })

    it("should remove job scheduler when schedule is null", async () => {
      await syncRuleSchedule("rule-123", null, true)

      expect(mockUpsertJobScheduler).not.toHaveBeenCalled()
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("maintenance-rule-rule-123")
    })

    it("should remove job scheduler when schedule is undefined", async () => {
      await syncRuleSchedule("rule-123", undefined, true)

      expect(mockUpsertJobScheduler).not.toHaveBeenCalled()
      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("maintenance-rule-rule-123")
    })

    it("should throw error when queue operation fails", async () => {
      const error = new Error("Redis connection failed")
      mockUpsertJobScheduler.mockRejectedValueOnce(error)

      await expect(syncRuleSchedule("rule-123", "0 2 * * *", true)).rejects.toThrow(
        "Redis connection failed"
      )

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to sync rule schedule",
        expect.objectContaining({ ruleId: "rule-123", error })
      )
    })
  })

  describe("removeRuleSchedule", () => {
    it("should remove scheduler by rule ID", async () => {
      await removeRuleSchedule("rule-456")

      expect(mockRemoveJobScheduler).toHaveBeenCalledWith("maintenance-rule-rule-456")
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        "Job scheduler removed",
        expect.objectContaining({ ruleId: "rule-456" })
      )
    })

    it("should handle non-existent scheduler gracefully", async () => {
      mockRemoveJobScheduler.mockResolvedValueOnce(false)

      await removeRuleSchedule("rule-nonexistent")

      expect(mockRemoveJobScheduler).toHaveBeenCalled()
      // Should not log info when scheduler didn't exist
      expect(mockLoggerInfo).not.toHaveBeenCalledWith(
        "Job scheduler removed",
        expect.anything()
      )
    })

    it("should log debug when removal fails", async () => {
      const error = new Error("Redis error")
      mockRemoveJobScheduler.mockRejectedValueOnce(error)

      // Should not throw
      await removeRuleSchedule("rule-123")

      expect(mockLoggerDebug).toHaveBeenCalledWith(
        "Failed to remove job scheduler (may not exist)",
        expect.objectContaining({ ruleId: "rule-123", error })
      )
    })
  })

  describe("syncAllRuleSchedules", () => {
    it("should sync all enabled rules with schedules", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "rule-1", name: "Rule 1", schedule: "0 1 * * *", enabled: true },
        { id: "rule-2", name: "Rule 2", schedule: "0 2 * * *", enabled: true },
      ])

      await syncAllRuleSchedules()

      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(2)
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "maintenance-rule-rule-1",
        expect.objectContaining({ pattern: "0 1 * * *" }),
        expect.any(Object)
      )
      expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
        "maintenance-rule-rule-2",
        expect.objectContaining({ pattern: "0 2 * * *" }),
        expect.any(Object)
      )
    })

    it("should handle empty rule list", async () => {
      mockFindMany.mockResolvedValueOnce([])

      await syncAllRuleSchedules()

      expect(mockUpsertJobScheduler).not.toHaveBeenCalled()
      expect(mockLoggerInfo).toHaveBeenCalledWith("Syncing 0 rule schedules with BullMQ")
      expect(mockLoggerInfo).toHaveBeenCalledWith("Rule schedule sync complete", {
        successCount: 0,
        failCount: 0,
      })
    })

    it("should continue syncing other rules if one fails", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: "rule-1", name: "Rule 1", schedule: "0 1 * * *", enabled: true },
        { id: "rule-2", name: "Rule 2", schedule: "0 2 * * *", enabled: true },
        { id: "rule-3", name: "Rule 3", schedule: "0 3 * * *", enabled: true },
      ])

      // Make second rule fail
      mockUpsertJobScheduler
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Failed"))
        .mockResolvedValueOnce(undefined)

      await syncAllRuleSchedules()

      // Should still sync all 3 rules
      expect(mockUpsertJobScheduler).toHaveBeenCalledTimes(3)
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to sync rule schedule",
        expect.objectContaining({ ruleId: "rule-2", ruleName: "Rule 2" })
      )
    })

    it("should throw error when database query fails", async () => {
      const error = new Error("Database connection failed")
      mockFindMany.mockRejectedValueOnce(error)

      await expect(syncAllRuleSchedules()).rejects.toThrow("Database connection failed")

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to sync all rule schedules",
        expect.objectContaining({ error })
      )
    })
  })

  describe("getActiveSchedulers", () => {
    it("should return all active maintenance rule schedulers", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([
        { id: "maintenance-rule-rule-1", pattern: "0 1 * * *", next: 1700000000000 },
        { id: "maintenance-rule-rule-2", pattern: "0 2 * * *", next: 1700001000000 },
      ])

      const result = await getActiveSchedulers()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        id: "maintenance-rule-rule-1",
        ruleId: "rule-1",
        pattern: "0 1 * * *",
        next: new Date(1700000000000),
      })
      expect(result[1]).toEqual({
        id: "maintenance-rule-rule-2",
        ruleId: "rule-2",
        pattern: "0 2 * * *",
        next: new Date(1700001000000),
      })
    })

    it("should filter out non-maintenance schedulers", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([
        { id: "maintenance-rule-rule-1", pattern: "0 1 * * *", next: 1700000000000 },
        { id: "other-scheduler", pattern: "0 5 * * *", next: 1700005000000 },
        { id: "cleanup-job", pattern: "0 0 * * *", next: 1700010000000 },
      ])

      const result = await getActiveSchedulers()

      expect(result).toHaveLength(1)
      expect(result[0].ruleId).toBe("rule-1")
    })

    it("should handle empty scheduler list", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([])

      const result = await getActiveSchedulers()

      expect(result).toEqual([])
    })

    it("should return empty array on error", async () => {
      mockGetJobSchedulers.mockRejectedValueOnce(new Error("Redis error"))

      const result = await getActiveSchedulers()

      expect(result).toEqual([])
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Failed to get active schedulers",
        expect.objectContaining({ error: expect.any(Error) })
      )
    })

    it("should handle null next times", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([
        { id: "maintenance-rule-rule-1", pattern: "0 1 * * *", next: null },
      ])

      const result = await getActiveSchedulers()

      expect(result[0].next).toBeNull()
    })

    it("should handle undefined pattern", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([
        { id: "maintenance-rule-rule-1", pattern: undefined, next: 1700000000000 },
      ])

      const result = await getActiveSchedulers()

      expect(result[0].pattern).toBeNull()
    })

    it("should filter out schedulers with null or undefined id", async () => {
      mockGetJobSchedulers.mockResolvedValueOnce([
        { id: "maintenance-rule-rule-1", pattern: "0 1 * * *", next: 1700000000000 },
        { id: null, pattern: "0 2 * * *", next: 1700001000000 },
        { id: undefined, pattern: "0 3 * * *", next: 1700002000000 },
      ])

      const result = await getActiveSchedulers()

      expect(result).toHaveLength(1)
      expect(result[0].ruleId).toBe("rule-1")
    })
  })
})

import { Job } from "bullmq"

// Store processor functions for testing
let maintenanceProcessor: ((job: Job) => Promise<unknown>) | null = null
let deletionProcessor: ((job: Job) => Promise<unknown>) | null = null
let workerOnCalls: Array<[string, () => void]> = []

// Mock Redis connection before importing worker
jest.mock("ioredis", () => {
  return jest.fn().mockImplementation(() => ({
    quit: jest.fn().mockResolvedValue(undefined),
  }))
})

// Mock BullMQ Worker and Queue
jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((queueName: string, processor: (job: Job) => Promise<unknown>) => {
    if (queueName === "maintenance") {
      maintenanceProcessor = processor
    } else if (queueName === "deletion") {
      deletionProcessor = processor
    }
    return {
      close: jest.fn().mockResolvedValue(undefined),
      on: jest.fn().mockImplementation((event: string, handler: () => void) => {
        workerOnCalls.push([event, handler])
      }),
    }
  }),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: "test-job" }),
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(true),
    getJobSchedulers: jest.fn().mockResolvedValue([]),
  })),
  Job: jest.fn(),
}))

// Mock scanner and deleter
const mockScanForCandidates = jest.fn()
const mockExecuteDeletions = jest.fn()

jest.mock("../scanner", () => ({
  scanForCandidates: (...args: unknown[]) => mockScanForCandidates(...args),
}))

jest.mock("../deleter", () => ({
  executeDeletions: (...args: unknown[]) => mockExecuteDeletions(...args),
}))

// Mock scheduler
jest.mock("../scheduler", () => ({
  syncAllRuleSchedules: jest.fn().mockResolvedValue(undefined),
  syncRuleSchedule: jest.fn().mockResolvedValue(undefined),
  removeRuleSchedule: jest.fn().mockResolvedValue(undefined),
}))

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  }),
}))

describe("maintenance worker", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    maintenanceProcessor = null
    deletionProcessor = null
    workerOnCalls = []
  })

  describe("worker initialization", () => {
    it("should create maintenance and deletion workers with correct configuration", async () => {
      jest.resetModules()
      const { Worker } = await import("bullmq")

      // Import the worker module to trigger Worker creation
      await import("../worker")

      // Verify workers were created with correct queue names
      expect(Worker).toHaveBeenCalledTimes(2)
      expect(Worker).toHaveBeenCalledWith(
        "maintenance",
        expect.any(Function),
        expect.objectContaining({
          concurrency: 2,
          limiter: {
            max: 10,
            duration: 60000,
          },
        })
      )
      expect(Worker).toHaveBeenCalledWith(
        "deletion",
        expect.any(Function),
        expect.objectContaining({
          concurrency: 1,
        })
      )

      // Verify event handlers were registered (4 total: completed + failed for each worker)
      const events = workerOnCalls.map(([event]) => event)
      expect(events).toContain("completed")
      expect(events).toContain("failed")
      expect(workerOnCalls.length).toBe(4)
    })
  })

  describe("maintenance processor", () => {
    beforeEach(async () => {
      // Reset module to reinitialize workers
      jest.resetModules()
      await import("../worker")
    })

    it("should call scanForCandidates with correct parameters", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          ruleId: "rule-456",
          manualTrigger: true,
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      mockScanForCandidates.mockResolvedValue({
        scanId: "scan-789",
        status: "COMPLETED",
        itemsScanned: 100,
        itemsFlagged: 5,
      })

      expect(maintenanceProcessor).not.toBeNull()
      const result = await maintenanceProcessor!(mockJob)

      expect(mockScanForCandidates).toHaveBeenCalledWith(
        "rule-456",
        expect.any(Function)
      )
      expect(result).toEqual({ candidatesFound: 5 })
    })

    it("should update job progress during scan", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          ruleId: "rule-456",
          manualTrigger: false,
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      mockScanForCandidates.mockImplementation(async (_ruleId, onProgress) => {
        // Simulate progress callbacks
        if (onProgress) {
          onProgress(25)
          onProgress(50)
          onProgress(75)
          onProgress(100)
        }
        return {
          scanId: "scan-789",
          status: "COMPLETED",
          itemsScanned: 100,
          itemsFlagged: 5,
        }
      })

      expect(maintenanceProcessor).not.toBeNull()
      await maintenanceProcessor!(mockJob)

      // Initial progress + final 100% + progress callbacks should trigger updateProgress
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10)
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100)
    })

    it("should throw error when scan fails", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          ruleId: "rule-456",
          manualTrigger: false,
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      const scanError = new Error("Scan failed")
      mockScanForCandidates.mockRejectedValue(scanError)

      expect(maintenanceProcessor).not.toBeNull()
      await expect(maintenanceProcessor!(mockJob)).rejects.toThrow("Scan failed")
    })
  })

  describe("deletion processor", () => {
    beforeEach(async () => {
      // Reset module to reinitialize workers
      jest.resetModules()
      await import("../worker")
    })

    it("should call executeDeletions with correct parameters", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          candidateIds: ["candidate-1", "candidate-2"],
          deleteFiles: true,
          userId: "user-456",
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      mockExecuteDeletions.mockResolvedValue({
        success: 2,
        failed: 0,
        errors: [],
      })

      expect(deletionProcessor).not.toBeNull()
      const result = await deletionProcessor!(mockJob)

      expect(mockExecuteDeletions).toHaveBeenCalledWith(
        ["candidate-1", "candidate-2"],
        true,
        "user-456",
        expect.any(Function)
      )
      expect(result).toEqual({
        deletedCount: 2,
        failedCount: 0,
        errors: [],
      })
    })

    it("should update job progress during deletion", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          candidateIds: ["candidate-1"],
          deleteFiles: false,
          userId: "user-456",
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      mockExecuteDeletions.mockImplementation(
        async (_ids, _deleteFiles, _userId, onProgress) => {
          // Simulate progress callbacks
          if (onProgress) {
            onProgress(50)
            onProgress(100)
          }
          return {
            success: 1,
            failed: 0,
            errors: [],
          }
        }
      )

      expect(deletionProcessor).not.toBeNull()
      await deletionProcessor!(mockJob)

      // Initial progress + final 100%
      expect(mockJob.updateProgress).toHaveBeenCalledWith(10)
      expect(mockJob.updateProgress).toHaveBeenCalledWith(100)
    })

    it("should return partial results when some deletions fail", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          candidateIds: ["candidate-1", "candidate-2", "candidate-3"],
          deleteFiles: true,
          userId: "user-456",
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      mockExecuteDeletions.mockResolvedValue({
        success: 2,
        failed: 1,
        errors: ["Failed to delete candidate-3"],
      })

      expect(deletionProcessor).not.toBeNull()
      const result = await deletionProcessor!(mockJob)

      expect(result).toEqual({
        deletedCount: 2,
        failedCount: 1,
        errors: ["Failed to delete candidate-3"],
      })
    })

    it("should throw error when deletion completely fails", async () => {
      const mockJob = {
        id: "job-123",
        data: {
          candidateIds: ["candidate-1"],
          deleteFiles: true,
          userId: "user-456",
        },
        updateProgress: jest.fn().mockResolvedValue(undefined),
      } as unknown as Job

      const deletionError = new Error("Database connection failed")
      mockExecuteDeletions.mockRejectedValue(deletionError)

      expect(deletionProcessor).not.toBeNull()
      await expect(deletionProcessor!(mockJob)).rejects.toThrow(
        "Database connection failed"
      )
    })
  })
})

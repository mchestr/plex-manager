/**
 * Tests for audit logging functionality
 * Tests security event logging for critical operations
 */

// Mock logger utilities
jest.mock("@/lib/utils/logger", () => {
  const mockLoggerInstance = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }
  return {
    createLogger: jest.fn(() => mockLoggerInstance),
  }
})

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { asTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { AuditEventType, logAuditEvent, recordAuditEvent } from "@/lib/security/audit-log"
import * as logger from "@/lib/utils/logger"

/** Lets the fire-and-forget write settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("Audit Logging", () => {
  let mockLogger: { info: jest.Mock; error: jest.Mock; warn: jest.Mock; debug: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    // Get the mock logger instance from createLogger
    const createLoggerMock = logger.createLogger as jest.Mock
    mockLogger = createLoggerMock()
  })

  describe("logAuditEvent", () => {
    it("should log admin privilege granted event", () => {
      logAuditEvent(AuditEventType.ADMIN_PRIVILEGE_GRANTED, "admin-id", {
        targetUserId: "user-id",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: ADMIN_PRIVILEGE_GRANTED",
        expect.objectContaining({
          type: AuditEventType.ADMIN_PRIVILEGE_GRANTED,
          userId: "admin-id",
          targetUserId: "user-id",
        })
      )
    })

    it("should log admin privilege revoked event", () => {
      logAuditEvent(AuditEventType.ADMIN_PRIVILEGE_REVOKED, "admin-id", {
        targetUserId: "user-id",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: ADMIN_PRIVILEGE_REVOKED",
        expect.objectContaining({
          type: AuditEventType.ADMIN_PRIVILEGE_REVOKED,
          userId: "admin-id",
          targetUserId: "user-id",
        })
      )
    })

    it("should log a config changed event", () => {
      logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, "admin-id", {
        setting: "llmDisabled",
        oldValue: false,
        newValue: true,
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: DISCORD_INTEGRATION_CONFIG_CHANGED",
        expect.objectContaining({
          type: AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED,
          userId: "admin-id",
          details: {
            setting: "llmDisabled",
            oldValue: false,
            newValue: true,
          },
        })
      )
    })

    it("should log user created event", () => {
      logAuditEvent(AuditEventType.USER_CREATED, "system", {
        targetUserId: "new-user-id",
        email: "newuser@example.com",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: USER_CREATED",
        expect.objectContaining({
          type: AuditEventType.USER_CREATED,
          userId: "system",
          targetUserId: "new-user-id",
          details: { email: "newuser@example.com" },
        })
      )
    })

    it("should log an updated event", () => {
      logAuditEvent(AuditEventType.ANNOUNCEMENT_UPDATED, "admin-id", {
        targetUserId: "user-id",
        changes: ["name", "email"],
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: ANNOUNCEMENT_UPDATED",
        expect.objectContaining({
          type: AuditEventType.ANNOUNCEMENT_UPDATED,
          userId: "admin-id",
          targetUserId: "user-id",
          details: { changes: ["name", "email"] },
        })
      )
    })

    it("should handle events without details", () => {
      logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, "admin-id")

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: DISCORD_INTEGRATION_CONFIG_CHANGED",
        expect.objectContaining({
          type: AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED,
          userId: "admin-id",
          targetUserId: undefined,
          details: undefined,
        })
      )
    })

    it("should handle events without targetUserId", () => {
      logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, "admin-id", {
        setting: "llmDisabled",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: DISCORD_INTEGRATION_CONFIG_CHANGED",
        expect.objectContaining({
          type: AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED,
          userId: "admin-id",
          targetUserId: undefined,
          details: { setting: "llmDisabled" },
        })
      )
    })

    it("should exclude targetUserId from details object", () => {
      logAuditEvent(AuditEventType.ANNOUNCEMENT_UPDATED, "admin-id", {
        targetUserId: "user-id",
        field: "email",
        value: "newemail@example.com",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: ANNOUNCEMENT_UPDATED",
        expect.objectContaining({
          targetUserId: "user-id",
          details: {
            field: "email",
            value: "newemail@example.com",
          },
        })
      )
    })

    it("should handle complex details objects", () => {
      const complexDetails = {
        targetUserId: "user-id",
        changes: {
          before: { name: "Old Name", email: "old@example.com" },
          after: { name: "New Name", email: "new@example.com" },
        },
        metadata: {
          ip: "192.168.1.1",
          userAgent: "Test Browser",
        },
      }

      logAuditEvent(AuditEventType.ANNOUNCEMENT_UPDATED, "admin-id", complexDetails)

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: ANNOUNCEMENT_UPDATED",
        expect.objectContaining({
          type: AuditEventType.ANNOUNCEMENT_UPDATED,
          userId: "admin-id",
          targetUserId: "user-id",
          details: {
            changes: complexDetails.changes,
            metadata: complexDetails.metadata,
          },
        })
      )
    })

    it("should include all custom fields in details", () => {
      logAuditEvent(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED, "admin-id", {
        setting: "llmDisabled",
        oldValue: false,
        newValue: true,
        reason: "Cost reduction",
        timestamp: "2024-01-01T00:00:00Z",
      })

      expect(mockLogger.info).toHaveBeenCalledWith(
        "Audit event: DISCORD_INTEGRATION_CONFIG_CHANGED",
        expect.objectContaining({
          details: {
            setting: "llmDisabled",
            oldValue: false,
            newValue: true,
            reason: "Cost reduction",
            timestamp: "2024-01-01T00:00:00Z",
          },
        })
      )
    })
  })

  describe("AuditEventType enum", () => {
    it("should have all expected event types", () => {
      expect(AuditEventType.ADMIN_PRIVILEGE_GRANTED).toBe(
        "ADMIN_PRIVILEGE_GRANTED"
      )
      expect(AuditEventType.ADMIN_PRIVILEGE_REVOKED).toBe(
        "ADMIN_PRIVILEGE_REVOKED"
      )
      expect(AuditEventType.USER_CREATED).toBe("USER_CREATED")
      expect(AuditEventType.DISCORD_INTEGRATION_CONFIG_CHANGED).toBe(
        "DISCORD_INTEGRATION_CONFIG_CHANGED"
      )
    })
  })
})

describe("persisted audit rows (SEC-55)", () => {
  let mockLogger: { info: jest.Mock; error: jest.Mock }

  beforeEach(() => {
    jest.clearAllMocks()
    mockReset(prismaMock)
    mockLogger = (logger.createLogger as jest.Mock)()
  })

  it("writes a row with sanitised details and the target user", async () => {
    logAuditEvent(AuditEventType.CONFIG_CHANGED, "admin-1", {
      targetUserId: "user-9",
      section: "tautulli",
      apiKey: "super-secret-key",
      note: "sent to http://x.lan/api?apikey=leaked-value",
    })
    await flush()

    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
    const { data } = prismaMock.auditLog.create.mock.calls[0][0]
    expect(data).toMatchObject({ type: "CONFIG_CHANGED", actorUserId: "admin-1", targetUserId: "user-9" })
    expect(data.details).toMatchObject({ section: "tautulli", apiKey: "[REDACTED]" })
    expect(JSON.stringify(data.details)).not.toContain("super-secret-key")
    expect(JSON.stringify(data.details)).not.toContain("leaked-value")
    expect(JSON.stringify(data.details)).not.toContain("targetUserId")
  })

  it("stores no details when the event has none", async () => {
    logAuditEvent(AuditEventType.USER_CREATED, "system")
    await flush()

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: { type: "USER_CREATED", actorUserId: "system", targetUserId: null, details: undefined },
    })
  })

  it("never throws when the database write fails, and logs audit.persist_failed", async () => {
    prismaMock.auditLog.create.mockRejectedValue(new Error("Can't reach database server"))

    expect(() => logAuditEvent(AuditEventType.CONFIG_CHANGED, "admin-1", { section: "llm" })).not.toThrow()
    await flush()

    expect(mockLogger.info).toHaveBeenCalledWith("Audit event: CONFIG_CHANGED", expect.anything())
    expect(mockLogger.error).toHaveBeenCalledWith("audit.persist_failed", expect.any(Error), { type: "CONFIG_CHANGED" })
  })

  it("recordAuditEvent awaits the write", async () => {
    let finishWrite: () => void = () => undefined
    prismaMock.auditLog.create.mockReturnValue(
      new Promise<void>((resolve) => {
        finishWrite = resolve
      }) as never
    )

    let settled = false
    const pending = recordAuditEvent(AuditEventType.CONFIG_CHANGED, "admin-1", { section: "prompt" }).then(() => {
      settled = true
    })
    await flush()
    expect(settled).toBe(false)

    finishWrite()
    await pending
    expect(settled).toBe(true)
  })

  it("recordAuditEvent writes through a transaction client and throws when the write fails", async () => {
    const create = jest.fn().mockRejectedValue(new Error("serialization failure"))
    const tx = asTransactionClient({ auditLog: { create } })

    await expect(recordAuditEvent(AuditEventType.CONFIG_CHANGED, "admin-1", undefined, tx)).rejects.toThrow(
      "serialization failure"
    )
    expect(create).toHaveBeenCalledTimes(1)
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })
})

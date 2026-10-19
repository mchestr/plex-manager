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

import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import * as logger from "@/lib/utils/logger"

describe("Audit Logging", () => {
  let mockLogger: any

  beforeEach(() => {
    jest.clearAllMocks()
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

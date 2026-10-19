/**
 * Tests for security error handling utilities
 * Tests safe error creation and status code mapping
 */

import {
  ErrorCode,
  createSafeError,
  getStatusCode,
  logError,
} from "@/lib/security/error-handler"
import * as logger from "@/lib/utils/logger"

// Mock logger
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}))

describe("Error Handler", () => {
  const originalEnv = process.env.NODE_ENV

  beforeEach(() => {
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.replaceProperty(process.env, 'NODE_ENV', originalEnv)
  })

  describe("createSafeError", () => {
    it("should create error with code and message", () => {
      const error = createSafeError(
        ErrorCode.VALIDATION_ERROR,
        "Invalid input"
      )

      expect(error).toEqual({
        error: "Invalid input",
        code: ErrorCode.VALIDATION_ERROR,
      })
    })

    it("should not include details in production", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "production")

      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        new Error("Database connection failed")
      )

      expect(error).toEqual({
        error: "Something went wrong",
        code: ErrorCode.INTERNAL_ERROR,
      })
      expect(error.details).toBeUndefined()
    })

    it("should include error details in development", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "development")

      const internalError = new Error("Database connection failed")
      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        internalError
      )

      expect(error).toEqual({
        error: "Something went wrong",
        code: ErrorCode.INTERNAL_ERROR,
        details: "Database connection failed",
      })
    })

    it("should convert non-Error objects to string in development", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "development")

      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        { message: "Custom error object" }
      )

      expect(error.details).toBe("[object Object]")
    })

    it("should handle string errors in development", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "development")

      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        "String error message"
      )

      expect(error.details).toBe("String error message")
    })

    it("should handle null internal error", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "development")

      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        null
      )

      // null is falsy so details won't be included
      expect(error.details).toBeUndefined()
    })

    it("should handle undefined internal error", () => {
      jest.replaceProperty(process.env, 'NODE_ENV', "development")

      const error = createSafeError(
        ErrorCode.INTERNAL_ERROR,
        "Something went wrong",
        undefined
      )

      expect(error.details).toBeUndefined()
    })

    it("should create error for all error codes", () => {
      const codes = [
        ErrorCode.INTERNAL_ERROR,
        ErrorCode.UNAUTHORIZED,
        ErrorCode.NOT_FOUND,
        ErrorCode.VALIDATION_ERROR,
        ErrorCode.RATE_LIMIT_EXCEEDED,
        ErrorCode.FORBIDDEN,
      ]

      codes.forEach((code) => {
        const error = createSafeError(code, "Test message")
        expect(error.code).toBe(code)
        expect(error.error).toBe("Test message")
      })
    })
  })

  describe("getStatusCode", () => {
    it("should return 401 for UNAUTHORIZED", () => {
      expect(getStatusCode(ErrorCode.UNAUTHORIZED)).toBe(401)
    })

    it("should return 403 for FORBIDDEN", () => {
      expect(getStatusCode(ErrorCode.FORBIDDEN)).toBe(403)
    })

    it("should return 404 for NOT_FOUND", () => {
      expect(getStatusCode(ErrorCode.NOT_FOUND)).toBe(404)
    })

    it("should return 400 for VALIDATION_ERROR", () => {
      expect(getStatusCode(ErrorCode.VALIDATION_ERROR)).toBe(400)
    })

    it("should return 429 for RATE_LIMIT_EXCEEDED", () => {
      expect(getStatusCode(ErrorCode.RATE_LIMIT_EXCEEDED)).toBe(429)
    })

    it("should return 500 for INTERNAL_ERROR", () => {
      expect(getStatusCode(ErrorCode.INTERNAL_ERROR)).toBe(500)
    })

    it("should return 500 for unknown error codes", () => {
      // @ts-expect-error Testing invalid error code
      expect(getStatusCode("UNKNOWN_ERROR")).toBe(500)
    })
  })

  describe("logError", () => {
    it("should create logger with context", () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }
      ;(logger.createLogger as jest.Mock).mockReturnValue(mockLogger)

      logError("TEST_CONTEXT", new Error("Test error"))

      expect(logger.createLogger).toHaveBeenCalledWith("TEST_CONTEXT")
    })

    it("should log error with message", () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }
      ;(logger.createLogger as jest.Mock).mockReturnValue(mockLogger)

      const error = new Error("Test error")
      logError("API_ERROR", error)

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        error,
        undefined
      )
    })

    it("should log error with metadata", () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }
      ;(logger.createLogger as jest.Mock).mockReturnValue(mockLogger)

      const error = new Error("Test error")
      const metadata = { userId: "123", action: "update" }
      logError("API_ERROR", error, metadata)

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        error,
        metadata
      )
    })

    it("should handle non-Error objects", () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }
      ;(logger.createLogger as jest.Mock).mockReturnValue(mockLogger)

      logError("API_ERROR", "String error")

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        "String error",
        undefined
      )
    })

    it("should handle null errors", () => {
      const mockLogger = {
        error: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
      }
      ;(logger.createLogger as jest.Mock).mockReturnValue(mockLogger)

      logError("API_ERROR", null)

      expect(mockLogger.error).toHaveBeenCalledWith(
        "Error occurred",
        null,
        undefined
      )
    })
  })

  describe("ErrorCode enum", () => {
    it("should have all expected error codes", () => {
      expect(ErrorCode.INTERNAL_ERROR).toBe("INTERNAL_ERROR")
      expect(ErrorCode.UNAUTHORIZED).toBe("UNAUTHORIZED")
      expect(ErrorCode.NOT_FOUND).toBe("NOT_FOUND")
      expect(ErrorCode.VALIDATION_ERROR).toBe("VALIDATION_ERROR")
      expect(ErrorCode.RATE_LIMIT_EXCEEDED).toBe("RATE_LIMIT_EXCEEDED")
      expect(ErrorCode.FORBIDDEN).toBe("FORBIDDEN")
    })
  })
})


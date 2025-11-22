/**
 * Security-focused error handling utilities
 * Prevents information disclosure in error messages
 */

export enum ErrorCode {
  INTERNAL_ERROR = "INTERNAL_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  NOT_FOUND = "NOT_FOUND",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  FORBIDDEN = "FORBIDDEN",
}

export interface SafeError {
  error: string
  code: ErrorCode
  details?: string // Only in development
}

/**
 * Create a safe error response that doesn't leak sensitive information
 */
export function createSafeError(
  code: ErrorCode,
  userMessage: string,
  internalError?: unknown
): SafeError {
  const error: SafeError = {
    error: userMessage,
    code,
  }

  // Only include details in development
  if (process.env.NODE_ENV === "development" && internalError) {
    error.details = internalError instanceof Error
      ? internalError.message
      : String(internalError)
  }

  return error
}

import { createLogger } from "@/lib/utils/logger"

/**
 * Log error securely (detailed logging server-side only)
 */
export function logError(context: string, error: unknown, metadata?: Record<string, unknown>) {
  const logger = createLogger(context)
  logger.error("Error occurred", error, metadata)
}

/**
 * Get HTTP status code for error code
 */
export function getStatusCode(code: ErrorCode): number {
  switch (code) {
    case ErrorCode.UNAUTHORIZED:
      return 401
    case ErrorCode.FORBIDDEN:
      return 403
    case ErrorCode.NOT_FOUND:
      return 404
    case ErrorCode.VALIDATION_ERROR:
      return 400
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return 429
    case ErrorCode.INTERNAL_ERROR:
    default:
      return 500
  }
}


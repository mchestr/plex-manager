/**
 * Centralized logging utility
 * Provides consistent, secure logging across the application
 *
 * Features:
 * - Structured logging with context
 * - Automatic sanitization of sensitive data
 * - Log levels (debug, info, warn, error)
 * - Environment-aware (reduces verbosity in production)
 * - Client-safe logging (no sensitive data in browser)
 */

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogEntry {
  level: LogLevel
  context: string
  message: string
  metadata?: Record<string, unknown>
  timestamp: string
  environment: string
}

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  "token",
  "apiKey",
  "password",
  "secret",
  "authToken",
  "authorization",
  "cookie",
  "session",
  "email", // PII - only log in development
] as const

/**
 * Redact sensitive values from objects
 */
function sanitizeValue(value: unknown, isDevelopment: boolean): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === "string") {
    // Redact tokens, API keys, etc. (looks like long random strings)
    if (value.length > 32 && /^[A-Za-z0-9_-]+$/.test(value)) {
      return "[REDACTED]"
    }
    // Redact email addresses unless in development
    if (!isDevelopment && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "[REDACTED_EMAIL]"
    }
    return value
  }

  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, isDevelopment))
    }

    const sanitized: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) {
      const lowerKey = key.toLowerCase()
      const isSensitive = SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))

      if (isSensitive && !isDevelopment) {
        sanitized[key] = "[REDACTED]"
      } else {
        sanitized[key] = sanitizeValue(val, isDevelopment)
      }
    }
    return sanitized
  }

  return value
}

/**
 * Sanitize URLs to remove tokens and sensitive query params
 */
function sanitizeUrl(url: string, isDevelopment: boolean): string {
  if (isDevelopment) {
    return url
  }

  try {
    const urlObj = new URL(url)
    // Remove common token params
    const sensitiveParams = ["token", "apiKey", "key", "auth", "password", "secret"]
    sensitiveParams.forEach((param) => {
      if (urlObj.searchParams.has(param)) {
        urlObj.searchParams.set(param, "[REDACTED]")
      }
    })
    return urlObj.toString()
  } catch {
    // If URL parsing fails, return as-is but truncate if suspicious
    if (url.includes("token=") || url.includes("apiKey=")) {
      return url.split("?")[0] + "?[REDACTED_PARAMS]"
    }
    return url
  }
}

/**
 * Format log entry for output
 */
function formatLogEntry(entry: LogEntry): string {
  const metadataStr = entry.metadata
    ? ` ${JSON.stringify(sanitizeValue(entry.metadata, entry.environment === "development"))}`
    : ""

  return `[${entry.level.toUpperCase()}] [${entry.context}] ${entry.message}${metadataStr}`
}

/**
 * Check if log level should be output
 */
function shouldLog(level: LogLevel, isDevelopment: boolean): boolean {
  // In production, skip debug logs
  if (!isDevelopment && level === "debug") {
    return false
  }
  return true
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string) {
  const isDevelopment = process.env.NODE_ENV === "development"
  const isClient = typeof window !== "undefined"

  return {
    /**
     * Debug logs - only in development
     */
    debug(message: string, metadata?: Record<string, unknown>) {
      if (!shouldLog("debug", isDevelopment)) return

      const entry: LogEntry = {
        level: "debug",
        context,
        message,
        metadata: metadata ? sanitizeValue(metadata, isDevelopment) as Record<string, unknown> : undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      }

      // Only log debug on server-side or in development
      if (!isClient || isDevelopment) {
        console.debug(formatLogEntry(entry))
      }
    },

    /**
     * Info logs - general information
     */
    info(message: string, metadata?: Record<string, unknown>) {
      if (!shouldLog("info", isDevelopment)) return

      const entry: LogEntry = {
        level: "info",
        context,
        message,
        metadata: metadata ? sanitizeValue(metadata, isDevelopment) as Record<string, unknown> : undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      }

      console.log(formatLogEntry(entry))
    },

    /**
     * Warning logs - non-critical issues
     */
    warn(message: string, metadata?: Record<string, unknown>) {
      const entry: LogEntry = {
        level: "warn",
        context,
        message,
        metadata: metadata ? sanitizeValue(metadata, isDevelopment) as Record<string, unknown> : undefined,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      }

      console.warn(formatLogEntry(entry))
    },

    /**
     * Error logs - errors that need attention
     */
    error(message: string, error?: unknown, metadata?: Record<string, unknown>) {
      const errorMetadata: Record<string, unknown> = {
        ...metadata,
      }

      if (error instanceof Error) {
        errorMetadata.errorMessage = error.message
        errorMetadata.errorName = error.name
        // Only include stack traces in development or server-side
        if (isDevelopment || !isClient) {
          errorMetadata.stack = error.stack
        }
      } else if (error !== undefined) {
        errorMetadata.error = String(error)
      }

      const entry: LogEntry = {
        level: "error",
        context,
        message,
        metadata: sanitizeValue(errorMetadata, isDevelopment) as Record<string, unknown>,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || "unknown",
      }

      console.error(formatLogEntry(entry))
    },
  }
}

/**
 * Sanitize URL for logging (standalone utility)
 */
export function sanitizeUrlForLogging(url: string): string {
  const isDevelopment = process.env.NODE_ENV === "development"
  return sanitizeUrl(url, isDevelopment)
}

/**
 * Sanitize object for logging (standalone utility)
 */
export function sanitizeForLogging(data: unknown): unknown {
  const isDevelopment = process.env.NODE_ENV === "development"
  return sanitizeValue(data, isDevelopment)
}


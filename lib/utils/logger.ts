/**
 * Production-ready logging utility using Winston
 * Provides structured JSON logging with context, sanitization, and request tracking
 *
 * Features:
 * - Structured JSON logging (production) with pretty printing (development)
 * - Automatic sanitization of sensitive data
 * - Request ID tracking via AsyncLocalStorage
 * - Log levels with environment-aware filtering
 * - Performance metrics and timing
 * - Child loggers for context isolation
 * - Client-safe logging (no sensitive data in browser)
 */

import type { AsyncLocalStorage } from "async_hooks"
import type * as Winston from "winston"

// --- Types ---

export interface LogMetadata extends Record<string, unknown> {
  requestId?: string
  userId?: string
  error?: unknown
  err?: unknown
  duration?: number
  label?: string
  [key: string]: unknown
}

export interface Logger {
  debug(message: string, metadata?: LogMetadata): void
  info(message: string, metadata?: LogMetadata): void
  warn(message: string, metadata?: LogMetadata): void
  error(message: string, error?: unknown, metadata?: LogMetadata): void
  child(bindings: LogMetadata): Logger
  time<T>(label: string, fn: () => Promise<T>): Promise<T>
  timeSync<T>(label: string, fn: () => T): T
}

interface RequestContextType {
  requestId: string
  userId?: string
}

// --- Environment Checks ---

// Only import Winston and Chalk on server-side to avoid bundling Node.js modules in client
// Also exclude from Edge Runtime which doesn't support Node.js APIs
const isServer = typeof window === "undefined"
// Detect Edge Runtime: Next.js sets NEXT_RUNTIME=edge for middleware
// Also check for absence of Node.js APIs that Winston needs
const isEdgeRuntime =
  (typeof process !== "undefined" && process.env.NEXT_RUNTIME === "edge") ||
  (typeof process !== "undefined" && typeof process.nextTick === "undefined")
const canUseWinston = isServer && !isEdgeRuntime

// --- Server-Side Modules ---

// Use explicit types for server modules to avoid 'any'
let winston: typeof Winston | null = null
let chalk: any = null // Chalk types are hard to import conditionally without esModuleInterop issues in some setups, keeping any for now or could use a simplified interface

if (canUseWinston) {
  try {
    winston = require("winston")
    chalk = require("chalk")
  } catch {
    // Ignore if modules can't be loaded
  }
}

// --- Request Context ---

/**
 * Request context storage for tracking request IDs across async operations
 * Only available on server-side (Node.js)
 */
let requestContext: AsyncLocalStorage<RequestContextType> | null = null

function createAsyncLocalStorage() {
  // Only import AsyncLocalStorage on server-side
  if (typeof window === "undefined") {
    try {
      const { AsyncLocalStorage } = require("async_hooks")
      return new AsyncLocalStorage()
    } catch {
      return null
    }
  }
  return null
}

// Initialize request context only on server-side (not Edge Runtime)
if (canUseWinston) {
  requestContext = createAsyncLocalStorage()
}

// --- Sanitization ---

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
  "apikey",
  "access_token",
  "refresh_token",
  "credentials",
] as const

/**
 * Redact sensitive values from objects
 */
function sanitizeValue(value: unknown, isDevelopment: boolean): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === "string") {
    // Don't redact UUIDs (used for requestIds)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(value)) {
      return value
    }
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
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase()
      const isSensitive = SENSITIVE_FIELDS.some((field) =>
        lowerKey.includes(field.toLowerCase())
      )

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
function sanitizeUrl(url: string | undefined, isDevelopment: boolean): string {
  if (!url) {
    return ""
  }

  if (isDevelopment) {
    return url
  }

  try {
    const urlObj = new URL(url)
    // Remove common token params
    const sensitiveParams = ["token", "apiKey", "key", "auth", "password", "secret", "apikey"]
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

// --- Helper Functions ---

/**
 * Get log level from environment variable or default based on NODE_ENV
 */
function getLogLevel(): string {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  if (
    envLevel &&
    ["error", "warn", "info", "verbose", "debug", "silly"].includes(envLevel)
  ) {
    return envLevel
  }

  // Default levels based on environment
  if (process.env.NODE_ENV === "production") {
    return "info"
  }
  return "debug"
}

/**
 * Create Winston logger instance (server-side only, not Edge Runtime)
 */
function createWinstonLogger(): Winston.Logger | null {
  if (!winston || !canUseWinston) {
    return null
  }

  const isDevelopment = process.env.NODE_ENV === "development"
  const isClient = typeof window !== "undefined"

  // Custom format to sanitize sensitive data
  const sanitizeFormat = winston.format((info: Winston.Logform.TransformableInfo) => {
    const isDev = process.env.NODE_ENV === "development"
    if (info.metadata) {
      info.metadata = sanitizeValue(info.metadata, isDev) as Record<string, unknown>
    }
    return info
  })

  // Base format for all logs
  const baseFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DDTHH:mm:ss.SSSZ" }),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),
    winston.format.json()
  )

  // Development format with Chalk for pretty printing (single-line, compact)
  const developmentFormat = winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    sanitizeFormat(),
    winston.format.printf((info: Winston.Logform.TransformableInfo) => {
      if (!chalk) return JSON.stringify(info)

      const { timestamp, level, message, context, metadata, ...rest } = info as Record<string, unknown>

      // Get log level (lowercase for consistency)
      const logLevel = (level || "").toString().toLowerCase()

      // Color code log levels
      let levelColor: (text: string) => string
      let levelSymbol: string

      switch (logLevel) {
        case "error":
          levelColor = chalk.red.bold
          levelSymbol = "✖"
          break
        case "warn":
          levelColor = chalk.yellow.bold
          levelSymbol = "⚠"
          break
        case "info":
          levelColor = chalk.blue.bold
          levelSymbol = "ℹ"
          break
        case "debug":
          levelColor = chalk.gray.bold
          levelSymbol = "→"
          break
        case "verbose":
          levelColor = chalk.cyan.bold
          levelSymbol = "•"
          break
        default:
          levelColor = chalk.white.bold
          levelSymbol = "•"
      }

      // Format timestamp
      const timestampStr = chalk.gray(String(timestamp || ""))

      // Format context
      const contextStr = context
        ? chalk.magenta.bold(`[${context}]`)
        : ""

      // Format message
      const messageStr = logLevel === "error"
        ? chalk.red(String(message || ""))
        : chalk.white(String(message || ""))

      // Format metadata - combine metadata object and rest properties
      const allMetadata: Record<string, unknown> = {}
      if (metadata && typeof metadata === "object") {
        Object.assign(allMetadata, metadata)
      }
      if (rest && typeof rest === "object") {
        Object.assign(allMetadata, rest)
      }

      // Remove Winston internal fields
      delete allMetadata.timestamp
      delete allMetadata.level
      delete allMetadata.message
      delete allMetadata.context
      delete allMetadata.service
      delete allMetadata.env

      // Build compact, single-line metadata string
      let metaStr = ""
      const metaEntries = Object.entries(allMetadata)
      if (metaEntries.length > 0) {
        const segments: string[] = []

        for (const [key, value] of metaEntries) {
          let valueStr: string

          if (key === "requestId") {
            valueStr = chalk.cyan(String(value))
          } else if (key === "userId") {
            valueStr = chalk.green(String(value))
          } else if (key === "err" || key === "error") {
            // Error objects get special formatting
            if (typeof value === "object" && value !== null) {
              const serialized = JSON.stringify(value)
              // Truncate very large error payloads
              const truncated =
                serialized.length > 300 ? serialized.slice(0, 297) + "..." : serialized
              valueStr = chalk.red(truncated.replace(/\s+/g, " "))
            } else {
              const text = String(value)
              const truncated = text.length > 300 ? text.slice(0, 297) + "..." : text
              valueStr = chalk.red(truncated.replace(/\s+/g, " "))
            }
          } else if (typeof value === "object" && value !== null) {
            const serialized = JSON.stringify(value)
            const truncated =
              serialized.length > 200 ? serialized.slice(0, 197) + "..." : serialized
            valueStr = chalk.white(truncated.replace(/\s+/g, " "))
          } else {
            const text = String(value)
            const truncated = text.length > 120 ? text.slice(0, 117) + "..." : text
            valueStr = chalk.white(truncated.replace(/\s+/g, " "))
          }

          const keyStr = chalk.gray(key)
          segments.push(`${keyStr}=${valueStr}`)
        }

        metaStr = chalk.gray(" | ") + segments.join(chalk.gray(" "))
      }

      // Build the formatted log line (single line on stdout)
      const parts = [
        timestampStr,
        levelColor(`${levelSymbol} ${logLevel.toUpperCase().padEnd(5)}`),
        contextStr,
        messageStr,
      ].filter(Boolean)

      return parts.join(" ") + metaStr
    })
  )

  // @ts-ignore - Typescript doesn't like the conditional return of createLogger when winston is defined as nullable
  return winston.createLogger({
    level: getLogLevel(),
    format: isDevelopment && !isClient ? developmentFormat : baseFormat,
    defaultMeta: {
      service: "plex-wrapped",
      env: process.env.NODE_ENV || "unknown",
    },
    transports: [
      new winston.transports.Console({
        stderrLevels: ["error"],
      }),
    ],
    // Don't exit on handled exceptions
    exitOnError: false,
  })
}

// Create logger instance only on server-side (not Edge Runtime)
const baseLogger = canUseWinston ? createWinstonLogger() : null

// --- Public API ---

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  if (typeof window === "undefined") {
    try {
      const { randomUUID } = require("crypto")
      return randomUUID()
    } catch {
      // fallback
    }
  }
  // Fallback for client-side (shouldn't be used, but provide a fallback)
  return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Get current request context
 */
function getRequestContext(): RequestContextType | undefined {
  if (!requestContext) return undefined
  return requestContext.getStore()
}

/**
 * Run a function within a request context
 * Only works on server-side (Node.js)
 * Supports both sync and async functions
 */
export function runWithRequestContext<T>(
  requestId: string,
  userId: string | undefined,
  fn: () => T | Promise<T>
): T | Promise<T> {
  if (!requestContext) {
    // Client-side or Edge Runtime fallback: just run the function
    return fn()
  }
  return requestContext.run({ requestId, userId }, fn)
}

/**
 * Set user ID in current request context
 * Only works on server-side (Node.js)
 */
export function setRequestUserId(userId: string): void {
  if (!requestContext) return
  const context = requestContext.getStore()
  if (context) {
    context.userId = userId
  }
}

/**
 * Sanitize URL for logging (standalone utility)
 */
export function sanitizeUrlForLogging(url: string): string {
  const isDev = process.env.NODE_ENV === "development"
  return sanitizeUrl(url, isDev)
}

/**
 * Sanitize object for logging (standalone utility)
 */
export function sanitizeForLogging(data: unknown): unknown {
  const isDev = process.env.NODE_ENV === "development"
  return sanitizeValue(data, isDev)
}

/**
 * Get the base logger instance (for advanced use cases)
 * Returns null on client-side
 */
export function getBaseLogger() {
  return baseLogger
}

/**
 * Create a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  const isDevelopment = process.env.NODE_ENV === "development"
  const isClient = typeof window !== "undefined"

  // Use Winston logger on server-side, console on client-side
  const childLogger = baseLogger ? baseLogger.child({ context }) : null

  // Client-safe logger implementation
  const clientLogger = {
    debug: (msg: string, meta?: LogMetadata) => {
      if (!isDevelopment) return
      const ctx = getRequestContext()
      const logData = { ...meta, ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }) }
      console.debug(`[${context}]`, msg, logData)
    },
    info: (msg: string, meta?: LogMetadata) => {
      const ctx = getRequestContext()
      const logData = { ...meta, ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }) }
      console.log(`[${context}]`, msg, logData)
    },
    warn: (msg: string, meta?: LogMetadata) => {
      const ctx = getRequestContext()
      const logData = { ...meta, ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }) }
      console.warn(`[${context}]`, msg, logData)
    },
    error: (msg: string, err?: unknown, meta?: LogMetadata) => {
      const ctx = getRequestContext()
      const errorMeta: LogMetadata = { ...meta }
      if (err instanceof Error) {
        errorMeta.err = { message: err.message, name: err.name, ...(isDevelopment && { stack: err.stack }) }
      } else if (err !== undefined) {
        errorMeta.error = String(err)
      }
      const logData = { ...errorMeta, ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }) }
      console.error(`[${context}]`, msg, logData)
    },
  }

  return {
    /**
     * Debug logs - detailed information for debugging
     */
    debug(message: string, metadata?: LogMetadata) {
      if (isClient && !isDevelopment) return

      const ctx = getRequestContext()
      const logData: LogMetadata = {
        ...metadata,
        ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }),
      }

      if (childLogger) {
        childLogger.debug(message, { metadata: logData })
      } else {
        clientLogger.debug(message, metadata)
      }
    },

    /**
     * Info logs - general information
     */
    info(message: string, metadata?: LogMetadata) {
      const ctx = getRequestContext()
      const logData: LogMetadata = {
        ...metadata,
        ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }),
      }

      if (childLogger) {
        childLogger.info(message, { metadata: logData })
      } else {
        clientLogger.info(message, metadata)
      }
    },

    /**
     * Warning logs - non-critical issues
     */
    warn(message: string, metadata?: LogMetadata) {
      const ctx = getRequestContext()
      const logData: LogMetadata = {
        ...metadata,
        ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }),
      }

      if (childLogger) {
        childLogger.warn(message, { metadata: logData })
      } else {
        clientLogger.warn(message, metadata)
      }
    },

    /**
     * Error logs - errors that need attention
     */
    error(message: string, error?: unknown, metadata?: LogMetadata) {
      const ctx = getRequestContext()
      const errorMetadata: LogMetadata = {
        ...metadata,
      }

      if (error instanceof Error) {
        errorMetadata.err = {
          message: error.message,
          name: error.name,
          ...(isDevelopment && { stack: error.stack }),
        }
      } else if (error !== undefined) {
        errorMetadata.error = String(error)
      }

      const logData: LogMetadata = {
        ...errorMetadata,
        ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }),
      }

      if (childLogger) {
        childLogger.error(message, { metadata: logData })
      } else {
        clientLogger.error(message, error, metadata)
      }
    },

    /**
     * Create a child logger with additional context
     */
    child(bindings: LogMetadata) {
      // Helper to merge bindings for client logger
      // Note: We don't create a new Winston child here to avoid deep nesting issues,
      // instead we just return a wrapper that merges bindings

      const parent = this

      return {
        debug: (msg: string, meta?: LogMetadata) =>
          parent.debug(msg, { ...bindings, ...meta }),
        info: (msg: string, meta?: LogMetadata) =>
          parent.info(msg, { ...bindings, ...meta }),
        warn: (msg: string, meta?: LogMetadata) =>
          parent.warn(msg, { ...bindings, ...meta }),
        error: (msg: string, err?: unknown, meta?: LogMetadata) =>
          parent.error(msg, err, { ...bindings, ...meta }),
        child: (newBindings: LogMetadata) =>
          parent.child({ ...bindings, ...newBindings }),
        time: <T>(label: string, fn: () => Promise<T>) => parent.time(label, fn),
        timeSync: <T>(label: string, fn: () => T) => parent.timeSync(label, fn)
      }
    },

    /**
     * Time a function execution
     */
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = Date.now()
      try {
        const result = await fn()
        const duration = Date.now() - start
        this.debug(`${label} completed`, { duration, label })
        return result
      } catch (error) {
        const duration = Date.now() - start
        this.error(`${label} failed`, error, { duration, label })
        throw error
      }
    },

    /**
     * Time a synchronous function execution
     */
    timeSync<T>(label: string, fn: () => T): T {
      const start = Date.now()
      try {
        const result = fn()
        const duration = Date.now() - start
        this.debug(`${label} completed`, { duration, label })
        return result
      } catch (error) {
        const duration = Date.now() - start
        this.error(`${label} failed`, error, { duration, label })
        throw error
      }
    },
  }
}

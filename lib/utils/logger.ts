/**
 * The app's logger: `createLogger(context)` on winston in Node, on `console`
 * in the browser and the Edge runtime.
 *
 * - Production writes one JSON line per entry; development one colourised
 *   text line (winston's `format.colorize()`).
 * - Every message and metadata value goes through the redaction in
 *   `lib/utils/log-redaction.ts`, in every environment.
 * - Inside a request context (`lib/utils/log-context.ts`) each line carries
 *   `requestId` and `userId`.
 * - `LOG_LEVEL` picks the level (default `info` in production, else `debug`).
 *
 * @module lib/utils/logger
 */

import type * as Winston from "winston"

import { getLogContext } from "./log-context"
import { sanitizeText, sanitizeValue } from "./log-redaction"

type LogMetadata = Record<string, unknown>

export interface Logger {
  debug(message: string, metadata?: LogMetadata): void
  info(message: string, metadata?: LogMetadata): void
  warn(message: string, metadata?: LogMetadata): void
  error(message: string, error?: unknown, metadata?: LogMetadata): void
}

type Level = "debug" | "info" | "warn" | "error"

const LEVELS = ["error", "warn", "info", "verbose", "debug", "silly"]

const isServer = typeof window === "undefined"
const isEdgeRuntime =
  typeof process !== "undefined" && (process.env.NEXT_RUNTIME === "edge" || typeof process.nextTick === "undefined")

function loadWinston(): typeof Winston | null {
  if (!isServer || isEdgeRuntime) return null
  try {
    // Node only: a conditional require keeps winston out of the client and Edge bundles
    return require("winston") as typeof Winston
  } catch {
    return null
  }
}

function logLevel(): string {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase()
  if (envLevel && LEVELS.includes(envLevel)) return envLevel
  return process.env.NODE_ENV === "production" ? "info" : "debug"
}

/** Development's line: `time level [context] message {metadata}`. */
function developmentLine(info: Winston.Logform.TransformableInfo): string {
  const { timestamp, level, message, context, metadata } = info
  const meta = metadata && Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : ""
  return `${String(timestamp)} ${level} [${String(context)}] ${String(message)}${meta}`
}

function createWinstonLogger(winston: typeof Winston): Winston.Logger {
  const { format } = winston
  // Redact the message and metadata in every environment (lib/utils/log-redaction.ts)
  const redact = format((info) => {
    info.message = sanitizeText(String(info.message ?? ""))
    if (info.metadata) info.metadata = sanitizeValue(info.metadata)
    return info
  })
  const lines =
    process.env.NODE_ENV === "development"
      ? format.combine(format.timestamp({ format: "HH:mm:ss.SSS" }), redact(), format.colorize(), format.printf(developmentLine))
      : format.combine(format.timestamp(), redact(), format.json())

  return winston.createLogger({
    level: logLevel(),
    format: lines,
    defaultMeta: { service: "plex-wrapped", env: process.env.NODE_ENV || "unknown" },
    transports: [new winston.transports.Console({ stderrLevels: ["error"] })],
    exitOnError: false,
  })
}

const winstonModule = loadWinston()
const baseLogger = winstonModule ? createWinstonLogger(winstonModule) : null

/**
 * The winston instance, or null in the browser and the Edge runtime.
 *
 * @internal `__tests__/helpers/log-capture.ts` swaps its transport
 */
export function getBaseLogger(): Winston.Logger | null {
  return baseLogger
}

/** Masks credentials in a URL before it is logged (standalone use). */
export function sanitizeUrlForLogging(url: string): string {
  return sanitizeText(url)
}

/** The entry's metadata with the request context's ids, which win over the caller's. */
function withContext(metadata: LogMetadata | undefined): LogMetadata {
  const ctx = getLogContext()
  return { ...metadata, ...(ctx && { requestId: ctx.requestId, userId: ctx.userId }) }
}

const CONSOLE: Record<Level, (...args: unknown[]) => void> = {
  // The logger is the one place that writes to the console (no-console is off for this file)
  debug: (...args) => console.debug(...args),
  info: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
}

/** A logger whose lines carry `context`. */
export function createLogger(context: string): Logger {
  const child = baseLogger?.child({ context })
  // The console fallback prints debug lines in development only
  const quietDebug = process.env.NODE_ENV !== "development"

  const write = (level: Level, message: string, metadata: LogMetadata) => {
    if (child) {
      child[level](message, { metadata })
    } else if (level !== "debug" || !quietDebug) {
      CONSOLE[level](`[${context}]`, sanitizeText(message), sanitizeValue(metadata))
    }
  }

  return {
    debug: (message, metadata) => write("debug", message, withContext(metadata)),
    info: (message, metadata) => write("info", message, withContext(metadata)),
    warn: (message, metadata) => write("warn", message, withContext(metadata)),
    error(message, error, metadata) {
      // An Error keeps its stack, in every environment (sanitizeValue serialises it)
      const withError = error instanceof Error ? { ...metadata, err: error } : error !== undefined ? { ...metadata, error } : metadata
      write("error", message, withContext(withError))
    },
  }
}

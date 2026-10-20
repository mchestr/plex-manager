import { Writable } from "stream"

/** One JSON line the production logger wrote. */
export interface CapturedLine {
  level: string
  message: string
  context?: string
  metadata?: Record<string, unknown>
}

/**
 * Loads a fresh `@/lib/utils/logger` in production mode with its console
 * transport swapped for one that records each JSON line, so a test sees
 * exactly what `docker logs` would; NODE_ENV is restored once it has loaded.
 * Call it from a `@jest-environment node` suite (winston loads only without
 * `window`). `load` runs inside the same isolated registry, for modules that
 * should log through this logger.
 */
export function captureProductionLogs<T = undefined>(load?: () => T) {
  const nodeEnv = jest.replaceProperty(process.env, "NODE_ENV", "production")
  const lines: CapturedLine[] = []
  let loggerModule: typeof import("@/lib/utils/logger") | undefined
  let loaded: T | undefined

  jest.isolateModules(() => {
    loggerModule = require("@/lib/utils/logger") as typeof import("@/lib/utils/logger")
    const winston = require("winston") as typeof import("winston")
    const base = loggerModule.getBaseLogger()
    if (!base) throw new Error("The production logger did not load winston")
    base.clear()
    base.add(
      new winston.transports.Stream({
        stream: new Writable({
          write(chunk: Buffer, _encoding, callback) {
            lines.push(JSON.parse(chunk.toString()) as CapturedLine)
            callback()
          },
        }),
      })
    )
    loaded = load?.()
  })
  // The logger reads NODE_ENV once, when it loads
  nodeEnv.restore()

  return { createLogger: loggerModule!.createLogger, lines, loaded: loaded as T }
}

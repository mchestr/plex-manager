/**
 * @jest-environment node
 */

/**
 * What the logger prints (BP-37, P11.4): development is one text line per
 * entry with no chalk, production one JSON line; inside a request context
 * every line carries `requestId` and `userId`.
 */

import { Writable } from "stream"

import { captureProductionLogs } from "@/__tests__/helpers/log-capture"

// chalk is not a dependency; the development format must not need it
jest.mock("chalk", () => {
  throw new Error("Cannot find module 'chalk'")
}, { virtual: true })

/** Loads the logger with NODE_ENV=development and records each formatted line. */
function captureDevelopmentLines() {
  const nodeEnv = jest.replaceProperty(process.env, "NODE_ENV", "development")
  const lines: string[] = []
  let logger: typeof import("@/lib/utils/logger") | undefined
  jest.isolateModules(() => {
    logger = require("@/lib/utils/logger") as typeof import("@/lib/utils/logger")
    const winston = require("winston") as typeof import("winston")
    const base = logger.getBaseLogger()!
    base.clear()
    base.add(
      new winston.transports.Stream({
        stream: new Writable({
          write(chunk: Buffer, _encoding, callback) {
            lines.push(chunk.toString())
            callback()
          },
        }),
      })
    )
  })
  nodeEnv.restore()
  return { createLogger: logger!.createLogger, lines }
}

describe("development output", () => {
  it("prints one colourised text line per entry, without chalk", () => {
    const { createLogger, lines } = captureDevelopmentLines()

    createLogger("dev-test").warn("Something odd", { attempt: 2, url: "/x?token=Sup3rSecretValue" })

    expect(lines).toHaveLength(1)
    const line = lines[0].trimEnd()
    expect(line.split("\n")).toHaveLength(1)
    expect(line).toContain("[dev-test] Something odd")
    expect(line).toContain('"attempt":2')
    expect(line).not.toContain("Sup3rSecretValue")
    expect(line).toContain("\u001b[") // winston's colorize on the level
    expect(() => JSON.parse(line)).toThrow()
  })

  it("keeps an error's stack on the same line", () => {
    const { createLogger, lines } = captureDevelopmentLines()

    createLogger("dev-test").error("Failed", new Error("boom"))

    expect(lines).toHaveLength(1)
    expect(lines[0].trimEnd().split("\n")).toHaveLength(1)
    expect(lines[0]).toContain("boom")
  })
})

describe("request context", () => {
  it("puts the context's requestId and userId on every production line", () => {
    const { createLogger, lines, loaded } = captureProductionLogs(
      () => require("@/lib/utils/log-context") as typeof import("@/lib/utils/log-context")
    )
    const logger = createLogger("ctx-test")

    loaded.runWithRequestContext("demo-1234abcd", "user-1", () => {
      logger.info("inside")
      logger.error("failed inside", new Error("x"))
    })
    logger.info("outside")

    expect(lines.map((line) => [line.message, line.metadata?.requestId, line.metadata?.userId])).toEqual([
      ["inside", "demo-1234abcd", "user-1"],
      ["failed inside", "demo-1234abcd", "user-1"],
      ["outside", undefined, undefined],
    ])
  })
})

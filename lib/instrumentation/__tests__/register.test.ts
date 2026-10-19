/**
 * @jest-environment node
 */

import { register } from "@/instrumentation"
// Loaded up front, so the timing below measures register() and not Jest's
// first transform of the module register() imports.
import "@/lib/env"
import { startNodeInstrumentation } from "@/lib/instrumentation/node"

// Next awaits register() before serving the first request, so the background
// start must never sit in front of its return (BP-13).

const mockError = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: mockError, warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))
jest.mock("@/lib/instrumentation/node", () => ({
  startNodeInstrumentation: jest.fn(() => new Promise(() => {})),
}))

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, NEXT_RUNTIME: "nodejs", NODE_ENV: "development" }
})

afterAll(() => {
  process.env = originalEnv
})

describe("register()", () => {
  it("resolves within 50 ms while the background start never settles", async () => {
    const started = Date.now()
    let resolved = false

    const pending = register().then(() => {
      resolved = true
    })
    await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 50))])

    expect(resolved).toBe(true)
    expect(Date.now() - started).toBeLessThan(50)
    // The dynamic import resolves after register() returns.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(startNodeInstrumentation).toHaveBeenCalledTimes(1)
  })

  it("logs a failed background start instead of rejecting", async () => {
    jest.mocked(startNodeInstrumentation).mockRejectedValueOnce(new Error("boom"))

    await expect(register()).resolves.toBeUndefined()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockError).toHaveBeenCalledWith("Background start failed", expect.any(Error))
  })
})

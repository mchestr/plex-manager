/**
 * @jest-environment node
 */

import { startNodeInstrumentation } from "@/lib/instrumentation/node"

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    warn: (...args: unknown[]) => mockWarn(...args),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  }),
}))

const env = process.env as Record<string, string | undefined>
const originalEnv = { ...process.env }

describe("startNodeInstrumentation: E2E test login warning", () => {
  beforeEach(() => {
    mockWarn.mockReset()
    // Keep the background workers out of these tests.
    env.ENABLE_QUEUE_WORKER = "false"
    env.ENABLE_DISCORD_BOT = "false"
    env.NODE_ENV = "development"
    delete env.REDIS_URL
    delete env.E2E_TEST_MODE
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("logs one warning at startup when E2E_TEST_MODE=true", async () => {
    env.E2E_TEST_MODE = "true"

    await startNodeInstrumentation()

    expect(mockWarn).toHaveBeenCalledTimes(1)
    expect(mockWarn).toHaveBeenCalledWith("E2E test login is enabled")
  })

  it("does not warn when the flag is unset", async () => {
    await startNodeInstrumentation()

    expect(mockWarn).not.toHaveBeenCalledWith("E2E test login is enabled")
  })

  it("does not warn in production, where test login stays off even with the flag", async () => {
    env.NODE_ENV = "production"
    env.E2E_TEST_MODE = "true"

    await startNodeInstrumentation()

    expect(mockWarn).not.toHaveBeenCalledWith("E2E test login is enabled")
  })
})

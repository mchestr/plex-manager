/**
 * @jest-environment node
 */

import type { register as Register } from "@/instrumentation"

// register() checks the environment before anything else starts (SEC-09).
// Each test loads a fresh copy, because getEnv() memoises outside NODE_ENV=test.

const mockError = jest.fn()
const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: mockError, warn: mockWarn, info: jest.fn(), debug: jest.fn() }),
}))
jest.mock("@/lib/instrumentation/node", () => ({ startNodeInstrumentation: jest.fn() }))

const PLACEHOLDER = "your-secret-key-here-generate-with-openssl-rand-base64-32"
const originalEnv = process.env

let exit: jest.SpyInstance
let register: typeof Register
let startNodeInstrumentation: jest.Mock

beforeEach(() => {
  process.env = {
    ...originalEnv,
    NEXT_RUNTIME: "nodejs",
    NODE_ENV: "production",
    NEXTAUTH_SECRET: PLACEHOLDER,
    NEXTAUTH_URL: "https://plex.example.com",
    NEXT_PUBLIC_APP_URL: "https://plex.example.com",
    PLEX_CLIENT_IDENTIFIER: "0123456789abcdef",
  }
  delete process.env.NEXT_PHASE
  exit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never)
  mockError.mockClear()
  mockWarn.mockClear()
  jest.resetModules()
  register = require("@/instrumentation").register
  startNodeInstrumentation = require("@/lib/instrumentation/node").startNodeInstrumentation
})

afterEach(() => {
  exit.mockRestore()
})

afterAll(() => {
  process.env = originalEnv
})

describe("register()", () => {
  it("exits with 1 on a placeholder secret in production, logging the name only", async () => {
    startNodeInstrumentation.mockImplementation(async () => {
      expect(exit).toHaveBeenCalledWith(1)
    })

    await register()

    expect(exit).toHaveBeenCalledWith(1)
    expect(mockError).toHaveBeenCalledWith(
      expect.stringMatching(/^env\.invalid NEXTAUTH_SECRET: known placeholder/),
      undefined,
      { variable: "NEXTAUTH_SECRET", code: "known_placeholder" }
    )
    expect(JSON.stringify([mockError.mock.calls, mockWarn.mock.calls])).not.toContain(PLACEHOLDER)
  })

  it("starts with a generated secret and https URLs", async () => {
    process.env.NEXTAUTH_SECRET = "q3V0Zm1sY2hQa2F6dGN2b0x1N2Q4c2Y5ZzBoMWkyajM="

    await register()

    expect(exit).not.toHaveBeenCalled()
    expect(mockError).not.toHaveBeenCalled()
    expect(startNodeInstrumentation).toHaveBeenCalled()
  })

  it("checks nothing during next build", async () => {
    process.env.NEXT_PHASE = "phase-production-build"

    await register()

    expect(exit).not.toHaveBeenCalled()
    expect(mockError).not.toHaveBeenCalled()
  })

  it("checks nothing outside production", async () => {
    process.env = { ...process.env, NODE_ENV: "development" }

    await register()

    expect(exit).not.toHaveBeenCalled()
  })
})

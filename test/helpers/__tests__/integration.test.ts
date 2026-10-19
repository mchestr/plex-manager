/**
 * @jest-environment node
 */

import {
  describePg,
  describeRedis,
  resolveTestDatabaseUrl,
  resolveTestRedisUrl,
} from "@/test/helpers/integration"

const TEST_URL = "postgresql://postgres:postgres@localhost:5432/plex_manager_test"
const REDIS_URL = "redis://localhost:6379/0"

describe("resolveTestDatabaseUrl", () => {
  it("returns the URL of a _test database", () => {
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: TEST_URL })).toBe(TEST_URL)
  })

  it("refuses a database whose name does not end in _test", () => {
    expect(() =>
      resolveTestDatabaseUrl({ TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/plex_wrapped" })
    ).toThrow(/must end in _test/)
  })

  it("skips locally when TEST_DATABASE_URL is unset", () => {
    expect(resolveTestDatabaseUrl({})).toBeNull()
  })

  it("fails under CI when TEST_DATABASE_URL is unset", () => {
    expect(() => resolveTestDatabaseUrl({ CI: "true" })).toThrow(/TEST_DATABASE_URL must be set in CI/)
  })
})

describe("resolveTestRedisUrl", () => {
  it("returns a redis:// URL", () => {
    expect(resolveTestRedisUrl({ TEST_REDIS_URL: REDIS_URL })).toBe(REDIS_URL)
  })

  it("refuses a URL that is not redis:// or rediss://", () => {
    expect(() => resolveTestRedisUrl({ TEST_REDIS_URL: "http://localhost:6379" })).toThrow(/redis:\/\//)
    expect(() => resolveTestRedisUrl({ TEST_REDIS_URL: "localhost:6379" })).toThrow(/redis:\/\//)
  })

  it("skips locally when TEST_REDIS_URL is unset", () => {
    expect(resolveTestRedisUrl({})).toBeNull()
  })

  it("fails under CI when TEST_REDIS_URL is unset", () => {
    expect(() => resolveTestRedisUrl({ CI: "true" })).toThrow(/TEST_REDIS_URL must be set in CI/)
  })
})

describe.each([
  ["describePg", describePg, "TEST_DATABASE_URL"],
  ["describeRedis", describeRedis, "TEST_REDIS_URL"],
] as const)("%s", (_name, describeGated, variable) => {
  let restore: () => void

  beforeEach(() => {
    const saved = { CI: process.env.CI, [variable]: process.env[variable] }
    delete process.env[variable]
    restore = () => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })

  afterEach(() => restore())

  it(`throws under CI=true when ${variable} is unset`, () => {
    process.env.CI = "true"
    expect(() => describeGated("gated", () => undefined)).toThrow(`${variable} must be set in CI`)
  })

  it(`skips without CI when ${variable} is unset`, () => {
    delete process.env.CI
    const skip = jest.spyOn(describe, "skip").mockImplementation(() => undefined)
    try {
      describeGated("gated", () => undefined)
      expect(skip).toHaveBeenCalledWith("gated", expect.any(Function))
    } finally {
      skip.mockRestore()
    }
  })
})

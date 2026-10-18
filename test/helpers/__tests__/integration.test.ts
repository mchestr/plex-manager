/**
 * @jest-environment node
 */

import { resolveTestDatabaseUrl } from "@/test/helpers/integration"

const TEST_URL = "postgresql://postgres:postgres@localhost:5432/plex_manager_test"

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

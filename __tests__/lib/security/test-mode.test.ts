/**
 * @jest-environment node
 */

import {
  assertSeedTarget,
  assertTestDatabaseUrl,
  isE2ETestMode,
  maskDatabaseUrl,
} from "@/lib/security/test-mode"

const TEST_URL = "postgresql://postgres:s3cret@localhost:5433/plex_manager_test"

describe("assertTestDatabaseUrl", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(assertTestDatabaseUrl(TEST_URL)).toBe(TEST_URL)
  })

  it("accepts a _test database with a schema query parameter", () => {
    const url = `${TEST_URL}?schema=public`
    expect(assertTestDatabaseUrl(url)).toBe(url)
  })

  it("accepts the postgres: protocol", () => {
    const url = "postgres://postgres:pw@127.0.0.1:5432/plex_manager_lane_a_test"
    expect(assertTestDatabaseUrl(url)).toBe(url)
  })

  it("decodes the database name before checking it", () => {
    const url = "postgresql://postgres:pw@localhost:5432/plex%5Fmanager%5Ftest"
    expect(assertTestDatabaseUrl(url)).toBe(url)
  })

  it.each([
    ["the development database", "postgresql://postgres:pw@localhost:5432/plex_wrapped?schema=public"],
    ["the old CI name test_db", "postgresql://postgres:pw@localhost:5432/test_db"],
    ["a name that only contains _test", "postgresql://postgres:pw@localhost:5432/plex_test_backup"],
    ["a URL with no database name", "postgresql://postgres:pw@localhost:5432/"],
  ])("rejects %s", (_label, url) => {
    expect(() => assertTestDatabaseUrl(url)).toThrow(/must end in _test/)
  })

  it("rejects an undefined URL", () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/no database URL is set/)
  })

  it("rejects an empty URL", () => {
    expect(() => assertTestDatabaseUrl("")).toThrow(/no database URL is set/)
  })

  it("rejects a mysql: URL even when the name ends in _test", () => {
    expect(() => assertTestDatabaseUrl("mysql://root:pw@localhost:3306/plex_manager_test")).toThrow(
      /not a postgres:\/\/ or postgresql:\/\/ URL/
    )
  })

  it("rejects a string that is not a URL", () => {
    expect(() => assertTestDatabaseUrl("plex_manager_test")).toThrow(/not a valid URL/)
  })

  it("masks the password in the error message", () => {
    let message = ""
    try {
      assertTestDatabaseUrl("postgresql://postgres:hunter2@db.example.com:5432/plex_wrapped")
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain('database "plex_wrapped"')
    expect(message).toContain("postgresql://postgres:***@db.example.com:5432/plex_wrapped")
    expect(message).not.toContain("hunter2")
  })
})

describe("maskDatabaseUrl", () => {
  it("masks the password of a parseable URL", () => {
    expect(maskDatabaseUrl(TEST_URL)).toBe("postgresql://postgres:***@localhost:5433/plex_manager_test")
  })

  it("leaves a URL without a password unchanged", () => {
    expect(maskDatabaseUrl("postgresql://localhost/plex_manager_test")).toBe(
      "postgresql://localhost/plex_manager_test"
    )
  })

  it("masks the password of a string the URL parser rejects", () => {
    expect(maskDatabaseUrl("postgresql://user:p@ss@[bad/db")).toBe("postgresql://user:***@[bad/db")
  })
})

describe("assertSeedTarget", () => {
  it.each(["localhost", "127.0.0.1", "[::1]", "db", "db-playwright"])(
    "accepts a non-test database on local host %s",
    (host) => {
      const target = assertSeedTarget(`postgresql://postgres:pw@${host}:5432/plex_wrapped`)
      expect(target.database).toBe("plex_wrapped")
      expect(target.host).toBe(host.replace(/[[\]]/g, ""))
    }
  )

  it("accepts a _test database on a remote host", () => {
    const target = assertSeedTarget("postgresql://postgres:pw@ci-db.internal:5432/plex_manager_test")
    expect(target).toMatchObject({ host: "ci-db.internal", database: "plex_manager_test" })
  })

  it("rejects a non-test database on a remote host", () => {
    expect(() =>
      assertSeedTarget("postgresql://postgres:hunter2@prod.example.com:5432/plex_wrapped")
    ).toThrow(/Refusing to seed database "plex_wrapped" on host "prod.example.com".*postgres:\*\*\*@/)
  })

  it("rejects a missing URL", () => {
    expect(() => assertSeedTarget(undefined)).toThrow(/no database URL is set/)
  })
})

describe("isE2ETestMode", () => {
  const env = process.env as Record<string, string | undefined>
  const originalNodeEnv = env.NODE_ENV
  const originalFlag = env.E2E_TEST_MODE

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv
    if (originalFlag === undefined) delete env.E2E_TEST_MODE
    else env.E2E_TEST_MODE = originalFlag
  })

  it("is false in production even with the flag set", () => {
    env.NODE_ENV = "production"
    env.E2E_TEST_MODE = "true"
    expect(isE2ETestMode()).toBe(false)
  })

  it("is false with NODE_ENV=test and no flag", () => {
    env.NODE_ENV = "test"
    delete env.E2E_TEST_MODE
    expect(isE2ETestMode()).toBe(false)
  })

  it("is false when the flag has a value other than true", () => {
    env.NODE_ENV = "test"
    env.E2E_TEST_MODE = "1"
    expect(isE2ETestMode()).toBe(false)
  })

  it("is true outside production with E2E_TEST_MODE=true", () => {
    env.NODE_ENV = "test"
    env.E2E_TEST_MODE = "true"
    expect(isE2ETestMode()).toBe(true)
  })
})

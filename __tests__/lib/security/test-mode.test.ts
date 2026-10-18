/**
 * @jest-environment node
 */

import {
  assertSeedTarget,
  assertTestDatabaseUrl,
  isE2ETestMode,
  maskDatabaseUrl,
  resolveSeedTarget,
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

  it("rejects a postgresql: URL without // even when its path ends in _test", () => {
    // The driver drops the first character of such a path, so it would connect to "test".
    expect(() => assertTestDatabaseUrl("postgresql:_test")).toThrow(
      /not a postgres:\/\/ or postgresql:\/\/ URL/
    )
  })

  it("accepts a _test database whatever ?host= points at", () => {
    const url = "postgresql://postgres:pw@localhost:5432/plex_manager_test?host=prod.example.com"
    expect(assertTestDatabaseUrl(url)).toBe(url)
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

  it("does not echo a password containing / when the URL cannot be parsed", () => {
    let message = ""
    try {
      assertTestDatabaseUrl("postgresql://postgres:hunter2/x@db.example.com:5432/plex_wrapped")
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain("not a valid URL")
    expect(message).toContain("postgresql://***@db.example.com:5432/plex_wrapped")
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

  it("masks a password query parameter, which the driver also reads", () => {
    expect(maskDatabaseUrl("postgresql://user@localhost/plex_wrapped?password=hunter2&schema=public")).toBe(
      "postgresql://user@localhost/plex_wrapped?password=***&schema=public"
    )
  })

  it("masks up to the last @ when the URL parser rejects the string", () => {
    expect(maskDatabaseUrl("postgresql://user:p@ss@[bad/db")).toBe("postgresql://***@[bad/db")
  })

  it("masks a password containing / when the URL parser rejects the string", () => {
    expect(maskDatabaseUrl("postgresql://postgres:hunter2/x@db.example.com:5432/plex_wrapped")).toBe(
      "postgresql://***@db.example.com:5432/plex_wrapped"
    )
  })

  it("masks the credentials and query of a URL without a host", () => {
    expect(maskDatabaseUrl("postgresql:user:hunter2@host/db?password=hunter2")).toBe(
      "postgresql:***@host/db?***"
    )
  })

  it("leaves a string without credentials unchanged", () => {
    expect(maskDatabaseUrl("plex_manager_test")).toBe("plex_manager_test")
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

  // pg-connection-string, which the driver uses, lets ?host= replace the URL's host.
  it("rejects a local URL whose ?host= points at a remote server", () => {
    expect(() =>
      assertSeedTarget("postgresql://postgres:pw@localhost:5432/plex_wrapped?host=prod.example.com")
    ).toThrow(/Refusing to seed database "plex_wrapped" on host "prod.example.com"/)
  })

  it("accepts a remote URL whose ?host= points at localhost, where the driver connects", () => {
    const target = assertSeedTarget("postgresql://postgres:pw@prod.example.com:5432/plex_wrapped?host=localhost")
    expect(target).toMatchObject({ host: "localhost", database: "plex_wrapped" })
  })

  it("accepts a local URL whose ?host= is localhost", () => {
    const target = assertSeedTarget("postgresql://postgres:pw@localhost:5432/plex_wrapped?host=localhost")
    expect(target).toMatchObject({ host: "localhost", database: "plex_wrapped" })
  })

  it("uses the last ?host=, as the driver does", () => {
    expect(() =>
      assertSeedTarget("postgresql://postgres:pw@localhost:5432/plex_wrapped?host=localhost&host=prod.example.com")
    ).toThrow(/on host "prod.example.com"/)
  })

  it("falls back to the URL's host when ?host= is empty, as the driver does", () => {
    const target = assertSeedTarget("postgresql://postgres:pw@localhost:5432/plex_wrapped?host=")
    expect(target.host).toBe("localhost")
  })

  it("rejects a non-test database on a unix socket (Cloud SQL style)", () => {
    expect(() =>
      assertSeedTarget("postgresql://postgres:pw@localhost/plex_wrapped?host=/cloudsql/proj:region:inst")
    ).toThrow(/on host "\/cloudsql\/proj:region:inst"/)
  })

  it("accepts a _test database behind a remote ?host= and reports that host", () => {
    const target = assertSeedTarget("postgresql://postgres:pw@localhost:5432/plex_manager_test?host=prod.example.com")
    expect(target).toMatchObject({ host: "prod.example.com", database: "plex_manager_test" })
  })

  it("decodes a percent-encoded host as the driver does", () => {
    expect(() => assertSeedTarget("postgresql://%2Fvar%2Frun%2Fpostgresql/plex_wrapped")).toThrow(
      /on host "\/var\/run\/postgresql"/
    )
    expect(assertSeedTarget("postgresql://local%68ost/plex_wrapped").host).toBe("localhost")
  })

  it("rejects a non-test database with an empty host, which the driver resolves from PGHOST", () => {
    expect(() => assertSeedTarget("postgresql:///plex_wrapped")).toThrow(/on host ""/)
  })
})

describe("resolveSeedTarget", () => {
  const LOCAL_DEV_URL = "postgresql://postgres:pw@localhost:5432/plex_wrapped"

  it("refuses without E2E_TEST_MODE before reading the URL", () => {
    expect(() => resolveSeedTarget({ NODE_ENV: "development", DATABASE_URL: "not a url" })).toThrow(
      /Refusing to seed: set E2E_TEST_MODE=true/
    )
  })

  it("refuses without E2E_TEST_MODE even for a local test database", () => {
    expect(() => resolveSeedTarget({ NODE_ENV: "test", DATABASE_URL: TEST_URL })).toThrow(
      /set E2E_TEST_MODE=true/
    )
  })

  it("refuses in production even with E2E_TEST_MODE=true", () => {
    expect(() =>
      resolveSeedTarget({ NODE_ENV: "production", E2E_TEST_MODE: "true", DATABASE_URL: TEST_URL })
    ).toThrow(/set E2E_TEST_MODE=true/)
  })

  it("refuses a remote non-test database with the flag set", () => {
    expect(() =>
      resolveSeedTarget({
        E2E_TEST_MODE: "true",
        DATABASE_URL: "postgresql://postgres:pw@prod.example.com:5432/plex_wrapped",
      })
    ).toThrow(/on host "prod.example.com"/)
  })

  it("refuses a ?host= override to a remote server with the flag set", () => {
    expect(() =>
      resolveSeedTarget({ E2E_TEST_MODE: "true", DATABASE_URL: `${LOCAL_DEV_URL}?host=prod.example.com` })
    ).toThrow(/on host "prod.example.com"/)
  })

  it("refuses a missing DATABASE_URL with the flag set", () => {
    expect(() => resolveSeedTarget({ E2E_TEST_MODE: "true" })).toThrow(/no database URL is set/)
  })

  it("returns the target for a local database with the flag set", () => {
    expect(resolveSeedTarget({ NODE_ENV: "development", E2E_TEST_MODE: "true", DATABASE_URL: LOCAL_DEV_URL })).toEqual({
      url: LOCAL_DEV_URL,
      host: "localhost",
      database: "plex_wrapped",
    })
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

  it("reads an explicit environment instead of process.env", () => {
    env.E2E_TEST_MODE = "true"
    expect(isE2ETestMode({ NODE_ENV: "development" })).toBe(false)
    expect(isE2ETestMode({ NODE_ENV: "development", E2E_TEST_MODE: "true" })).toBe(true)
  })
})

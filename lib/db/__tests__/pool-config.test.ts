/**
 * @jest-environment node
 */

import { PrismaPg } from "@prisma/adapter-pg"

import { poolConfigFor } from "@/lib/db/pool-config"

// Every process role gets an explicit pool size, connection wait and statement
// timeout, and lib/prisma.ts passes them to the pg adapter (BP-18).

jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: jest.fn() }))
jest.mock("@/lib/generated/prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $extends: jest.fn().mockReturnValue({}) })),
}))

const originalEnv = process.env

beforeEach(() => {
  process.env = { ...originalEnv, DATABASE_URL: "postgresql://u:p@localhost:5432/app_test" }
  for (const name of ["PROCESS_ROLE", "DB_POOL_MAX", "DB_CONNECTION_TIMEOUT_MS", "DB_STATEMENT_TIMEOUT_MS"]) {
    delete process.env[name]
  }
  jest.mocked(PrismaPg).mockClear()
  // lib/prisma.ts reuses a client cached on globalThis outside production.
  delete (globalThis as { prisma?: unknown }).prisma
})

afterAll(() => {
  process.env = originalEnv
})

function adapterConfig(): Record<string, unknown> {
  jest.isolateModules(() => {
    require("@/lib/prisma")
  })
  expect(PrismaPg).toHaveBeenCalledTimes(1)
  return jest.mocked(PrismaPg).mock.calls[0][0] as Record<string, unknown>
}

describe("poolConfigFor()", () => {
  it.each([
    ["web", 10, 15_000],
    ["worker", 5, 120_000],
    ["all", 12, 60_000],
  ] as const)("gives %s a pool of %i with a %i ms statement timeout", (role, max, statementTimeout) => {
    expect(poolConfigFor(role)).toEqual({
      max,
      statement_timeout: statementTimeout,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      application_name: `plex-manager-${role}`,
    })
  })

  it("matches its documented example", () => {
    expect(poolConfigFor("web")).toEqual({
      max: 10,
      statement_timeout: 15000,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000,
      application_name: "plex-manager-web",
    })
  })

  it("ignores an override that is not a positive integer", () => {
    process.env.DB_POOL_MAX = "zero"
    process.env.DB_STATEMENT_TIMEOUT_MS = "-5"

    expect(poolConfigFor("web")).toMatchObject({ max: 10, statement_timeout: 15_000 })
  })
})

describe("createPrismaClient()", () => {
  it("passes the all role's defaults to PrismaPg when PROCESS_ROLE is unset", () => {
    expect(adapterConfig()).toEqual({
      connectionString: "postgresql://u:p@localhost:5432/app_test",
      max: 12,
      statement_timeout: 60_000,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      application_name: "plex-manager-all",
    })
  })

  it("uses PROCESS_ROLE and the DB_* overrides", () => {
    process.env.PROCESS_ROLE = "worker"
    process.env.DB_POOL_MAX = "3"
    process.env.DB_CONNECTION_TIMEOUT_MS = "2500"
    process.env.DB_STATEMENT_TIMEOUT_MS = "90000"

    expect(adapterConfig()).toMatchObject({
      max: 3,
      connectionTimeoutMillis: 2500,
      statement_timeout: 90_000,
      application_name: "plex-manager-worker",
    })
  })

  it("falls back to all for an unknown PROCESS_ROLE", () => {
    process.env.PROCESS_ROLE = "scheduler"

    expect(adapterConfig()).toMatchObject({ max: 12, application_name: "plex-manager-all" })
  })
})

/**
 * @jest-environment node
 */

import { randomBytes } from "node:crypto"

import { PrismaPg } from "@prisma/adapter-pg"

import { checkProductionEnv, envSchema } from "@/lib/env"

// A `?schema=` in DATABASE_URL reaches the pg adapter, and a name Postgres
// would not take unquoted stops boot (P11.6, GAP-19).

jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: jest.fn() }))
jest.mock("@/lib/generated/prisma/client", () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({ $extends: jest.fn().mockReturnValue({}) })),
}))

const BASE = "postgresql://u:p@localhost:5432/app_test"
const originalEnv = process.env

beforeEach(() => {
  jest.mocked(PrismaPg).mockClear()
  // lib/prisma.ts reuses a client cached on globalThis outside production.
  delete (globalThis as { prisma?: unknown }).prisma
})

afterAll(() => {
  process.env = originalEnv
})

/** Loads lib/prisma.ts with `url` as DATABASE_URL and returns PrismaPg's two arguments. */
function adapterArgs(url: string): unknown[] {
  process.env = { ...originalEnv, DATABASE_URL: url }
  jest.isolateModules(() => {
    void require("@/lib/prisma").prisma.user
  })
  expect(PrismaPg).toHaveBeenCalledTimes(1)
  return jest.mocked(PrismaPg).mock.calls[0]
}

describe("createPrismaClient() and ?schema=", () => {
  it("passes ?schema=plex_manager to the adapter", () => {
    const [config, options] = adapterArgs(`${BASE}?schema=plex_manager`)
    expect(config).toEqual(expect.objectContaining({ connectionString: `${BASE}?schema=plex_manager` }))
    expect(options).toEqual({ schema: "plex_manager" })
  })

  it.each([
    ["no parameter", BASE],
    ["public", `${BASE}?schema=public`],
  ])("passes no option for %s", (_label, url) => {
    expect(adapterArgs(url)[1]).toBeUndefined()
  })

  it("refuses an invalid name", () => {
    process.env = { ...originalEnv, DATABASE_URL: `${BASE}?schema=bad-name` }
    expect(() =>
      jest.isolateModules(() => {
        void require("@/lib/prisma").prisma.user
      })
    ).toThrow("?schema= must be")
    expect(PrismaPg).not.toHaveBeenCalled()
  })
})

describe("checkProductionEnv and ?schema=", () => {
  const issues = (databaseUrl: string) =>
    checkProductionEnv(
      envSchema.parse({
        DATABASE_URL: databaseUrl,
        NEXTAUTH_SECRET: randomBytes(32).toString("base64"),
        PLEX_CLIENT_IDENTIFIER: "0123456789abcdef0123456789abcdef",
        ENCRYPTION_KEYS: `k1:${randomBytes(32).toString("base64")}`,
      })
    )

  it.each(["bad-name", "1schema", "", `a${"b".repeat(63)}`, 'x";drop'])("reports schema %p as an error", (schema) => {
    expect(issues(`${BASE}?schema=${encodeURIComponent(schema)}`)).toEqual([
      expect.objectContaining({ variable: "DATABASE_URL", code: "schema_invalid", severity: "error" }),
    ])
  })

  it.each([BASE, `${BASE}?schema=public`, `${BASE}?schema=plex_manager`, `${BASE}?schema=_A1`])("accepts %s", (url) => {
    expect(issues(url)).toEqual([])
  })
})

/**
 * @jest-environment node
 */

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"

// lib/prisma.ts builds its client on first use (P11.22): importing it needs
// no DATABASE_URL, the first property access builds one client, methods keep
// the real client as `this`, and development reuses the globalThis singleton.

jest.mock("@prisma/adapter-pg", () => ({ PrismaPg: jest.fn() }))
jest.mock("@/lib/generated/prisma/client", () => ({ PrismaClient: jest.fn() }))

const originalEnv = process.env

/** A stand-in for the extended client whose method reports its `this`. */
function fakeClient() {
  const extended = {
    user: { findUnique: jest.fn() },
    $transaction(this: unknown) {
      return this
    },
  }
  return extended
}

let extended: ReturnType<typeof fakeClient>

beforeEach(() => {
  process.env = { ...originalEnv, DATABASE_URL: "postgresql://u:p@localhost:5432/app_test" }
  delete (globalThis as { prisma?: unknown }).prisma
  extended = fakeClient()
  jest.mocked(PrismaPg).mockClear()
  jest.mocked(PrismaClient).mockReset().mockImplementation(() => ({ $extends: () => extended }) as unknown as PrismaClient)
})

afterAll(() => {
  process.env = originalEnv
})

function load(): typeof import("@/lib/prisma") {
  let loaded: typeof import("@/lib/prisma") | undefined
  jest.isolateModules(() => {
    loaded = require("@/lib/prisma")
  })
  return loaded!
}

describe("the lazy Prisma client", () => {
  it("imports without DATABASE_URL and builds nothing", () => {
    delete process.env.DATABASE_URL

    expect(() => load()).not.toThrow()
    expect(PrismaClient).not.toHaveBeenCalled()
  })

  it("throws on first use when DATABASE_URL is missing", () => {
    delete process.env.DATABASE_URL
    const { prisma } = load()

    expect(() => prisma.user).toThrow("DATABASE_URL environment variable is not defined")
  })

  it("builds one client on first access and reuses it", () => {
    const { prisma } = load()

    expect(prisma.user).toBe(extended.user)
    expect("user" in prisma).toBe(true)
    void prisma.user
    expect(PrismaClient).toHaveBeenCalledTimes(1)
    expect(PrismaPg).toHaveBeenCalledTimes(1)
  })

  it("binds methods to the real client", () => {
    const { prisma } = load()
    const run = prisma.$transaction as unknown as () => unknown

    expect(run()).toBe(extended)
  })

  it("keeps the development singleton on globalThis and reuses it after a reload", () => {
    void load().prisma.user
    expect((globalThis as { prisma?: unknown }).prisma).toBe(extended)

    void load().prisma.user
    expect(PrismaClient).toHaveBeenCalledTimes(1)
  })

  it("leaves globalThis alone in production", () => {
    jest.replaceProperty(process.env, "NODE_ENV", "production")
    void load().prisma.user

    expect((globalThis as { prisma?: unknown }).prisma).toBeUndefined()
  })
})

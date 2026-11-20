/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))

import { mockReset } from "jest-mock-extended"
import { ZodError } from "zod"

import { buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { buildConfig } from "@/__tests__/helpers/factories"
import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildOptions, buildRuntime } from "@/lib/cleanup/__tests__/helpers/builders"
import { CLEANUP_SETTINGS_ID, isLive, readCleanupSettingsRow, serverZone, today, writeOptions } from "@/lib/cleanup/settings"
import { DEFAULT_CLEANUP_OPTIONS } from "@/lib/validations/cleanup-options"

const ID = { id: "cleanup" }
const originalEnv = process.env

beforeEach(() => {
  mockReset(prismaMock)
  process.env = { ...originalEnv, TZ: "UTC" }
})

afterAll(() => {
  process.env = originalEnv
})

describe("readCleanupSettingsRow", () => {
  it("reads the one row and parses its options and runtime", async () => {
    const options = buildOptions({ budget: { items: 5 } })
    const runtime = buildRuntime()
    const pausedAt = new Date("2026-11-01T00:00:00.000Z")
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings({ enabled: true, pausedAt, options, runtime }))

    const row = await readCleanupSettingsRow()

    expect(prismaMock.cleanupSettings.findUnique).toHaveBeenCalledWith({ where: ID })
    expect(prismaMock.cleanupSettings.upsert).not.toHaveBeenCalled()
    expect(row).toMatchObject({ id: CLEANUP_SETTINGS_ID, enabled: true, pausedAt, runtime })
    expect(row.options.budget).toEqual({ items: 5, bytes: DEFAULT_CLEANUP_OPTIONS.budget.bytes })
    expect(CLEANUP_SETTINGS_ID).toBe("cleanup")
  })

  it("creates the row on the first read: off, not paused, no claims, every option at its default", async () => {
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(null)
    prismaMock.cleanupSettings.upsert.mockResolvedValue(buildCleanupSettings())

    const row = await readCleanupSettingsRow()

    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith({ where: ID, create: ID, update: {} })
    expect(row).toMatchObject({ enabled: false, pausedAt: null, runClaimAt: null, readClaimAt: null, collectionsClaimAt: null })
    expect(row.options).toEqual(DEFAULT_CLEANUP_OPTIONS)
    expect(row.runtime).toEqual({ collections: {}, notices: [] })
  })

  it("falls back to the defaults of a bad stored section, and keeps the others", async () => {
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(
      buildCleanupSettings({ options: { budget: { items: "many" }, members: { keepLimit: 7 } }, runtime: "broken" })
    )

    const row = await readCleanupSettingsRow()

    expect(row.options.budget).toEqual(DEFAULT_CLEANUP_OPTIONS.budget)
    expect(row.options.members.keepLimit).toBe(7)
    expect(row.runtime).toEqual({ collections: {}, notices: [] })
  })

  it("reads through the transaction client it is given", async () => {
    const tx = asAppTransactionClient(prismaMock)
    prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings())

    await readCleanupSettingsRow(tx)

    expect(prismaMock.cleanupSettings.findUnique).toHaveBeenCalledTimes(1)
  })
})

describe("isLive", () => {
  it.each([
    ["on and not paused", { enabled: true, pausedAt: null }, true],
    ["off", { enabled: false, pausedAt: null }, false],
    ["paused", { enabled: true, pausedAt: new Date() }, false],
    ["off and paused", { enabled: false, pausedAt: new Date() }, false],
  ])("%s", (_name, settings, expected) => {
    expect(isLive(settings)).toBe(expected)
  })
})

describe("writeOptions", () => {
  it("stores the checked options with the admin as updatedBy, and returns them", async () => {
    const values = buildOptions({ members: { keepLimit: 3 } })

    await expect(writeOptions(values, "admin-1")).resolves.toEqual(values)

    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith({
      where: ID,
      create: { ...ID, options: values, updatedBy: "admin-1" },
      update: { options: values, updatedBy: "admin-1" },
    })
  })

  it("refuses options that do not parse and writes nothing", async () => {
    const values = { ...DEFAULT_CLEANUP_OPTIONS, budget: { items: 0, bytes: 1 } }

    await expect(writeOptions(values, "admin-1")).rejects.toBeInstanceOf(ZodError)
    expect(prismaMock.cleanupSettings.upsert).not.toHaveBeenCalled()
  })

  it("writes through the transaction client it is given", async () => {
    await writeOptions(DEFAULT_CLEANUP_OPTIONS, "admin-2", asAppTransactionClient(prismaMock))

    expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { options: DEFAULT_CLEANUP_OPTIONS, updatedBy: "admin-2" } }))
  })
})

describe("serverZone", () => {
  it("reads the zone of the settings, each call", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "America/Chicago" }))

    await expect(serverZone()).resolves.toBe("America/Chicago")
    await expect(serverZone()).resolves.toBe("America/Chicago")
    expect(prismaMock.config.findUnique).toHaveBeenCalledTimes(2)
    expect(prismaMock.config.findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: { timezone: true } })
  })

  it("falls back to TZ for a missing or unknown zone, then to UTC", async () => {
    prismaMock.config.findUnique.mockResolvedValueOnce(buildConfig({ timezone: "Mars/Base" }))
    process.env.TZ = "Europe/Berlin"
    await expect(serverZone()).resolves.toBe("Europe/Berlin")

    prismaMock.config.findUnique.mockResolvedValueOnce(null)
    delete process.env.TZ
    await expect(serverZone()).resolves.toBe("UTC")
  })
})

describe("today", () => {
  it("gives the day key in the zone it is given, with no read", async () => {
    await expect(today(new Date("2026-12-31T23:30:00Z"), "Europe/Berlin")).resolves.toBe("2027-01-01")
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })

  it("reads the server zone without one", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "America/Los_Angeles" }))

    await expect(today(new Date("2026-11-08T05:00:00Z"))).resolves.toBe("2026-11-07")
  })

  it("uses the current time by default", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)

    await expect(today()).resolves.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

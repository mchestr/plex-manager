/**
 * @jest-environment node
 *
 * The app's format settings (P3.10): the server zone, `Config.locale`, the
 * `app-settings` cache tag and the fallback when the database is down.
 */

import { unstable_cache } from "next/cache"

import { prisma } from "@/lib/prisma"
import { APP_SETTINGS_TAG, getAppSettings, getFormat } from "@/lib/settings/app-settings"
import { serverZone } from "@/lib/utils/server-zone"

jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: () => unknown) => fn),
}))

// React's cache() only memoises inside a server request; tests call through.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }))

jest.mock("@/lib/prisma", () => ({
  prisma: { config: { findUnique: jest.fn() } },
}))

jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn() }))

const findUnique = prisma.config.findUnique as jest.Mock
const zone = serverZone as jest.Mock

describe("getAppSettings", () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    findUnique.mockReset()
    zone.mockReset()
  })

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it("caches under the app-settings tag for 60 seconds", () => {
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), [APP_SETTINGS_TAG], {
      tags: ["app-settings"],
      revalidate: 60,
    })
  })

  it("returns the server zone and the stored locale", async () => {
    zone.mockResolvedValue("Europe/Berlin")
    findUnique.mockResolvedValue({ locale: "de-DE" })

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "Europe/Berlin", locale: "de-DE" })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: { locale: true } })
  })

  it.each([
    ["no config row", null],
    ["an invalid stored locale", { locale: "not a locale!" }],
  ])("defaults the locale to en-US with %s", async (_label, row) => {
    zone.mockResolvedValue("UTC")
    findUnique.mockResolvedValue(row)

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "UTC", locale: "en-US" })
  })

  it("takes the zone from serverZone(), so it follows Config.timezone, then TZ, then UTC", async () => {
    zone.mockResolvedValue("America/Chicago")
    findUnique.mockResolvedValue({ locale: "en-US" })

    await expect(getAppSettings()).resolves.toMatchObject({ timeZone: "America/Chicago" })
    expect(zone).toHaveBeenCalled()
  })

  it("falls back to TZ and en-US when the database is unreachable", async () => {
    process.env.TZ = "US/Pacific"
    zone.mockRejectedValue(new Error("connection refused"))
    findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "America/Los_Angeles", locale: "en-US" })
  })

  it("binds the formatters to the settings", async () => {
    zone.mockResolvedValue("Europe/Berlin")
    findUnique.mockResolvedValue({ locale: "de-DE" })

    const f = await getFormat()
    expect(f.settings).toEqual({ timeZone: "Europe/Berlin", locale: "de-DE" })
    expect(f.number(1234)).toBe("1.234")
  })
})

/**
 * @jest-environment node
 *
 * The app's settings (P3.10, P3.9): the server zone, `Config.locale`, the
 * server name, the `app-settings` cache tag and the fallback when the database
 * is down.
 */

import { unstable_cache } from "next/cache"

import { prisma } from "@/lib/prisma"
import { APP_SETTINGS_TAG, getAppSettings, getFormat, getFormatSettings } from "@/lib/settings/app-settings"
import { serverZone } from "@/lib/utils/server-zone"

jest.mock("next/cache", () => ({
  unstable_cache: jest.fn((fn: () => unknown) => fn),
}))

// React's cache() only memoises inside a server request; tests call through.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: jest.fn() },
    plexServer: { findFirst: jest.fn() },
    jellyfinServer: { findFirst: jest.fn() },
  },
}))

jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn() }))

const findUnique = prisma.config.findUnique as jest.Mock
const findPlex = prisma.plexServer.findFirst as jest.Mock
const findJellyfin = prisma.jellyfinServer.findFirst as jest.Mock
const zone = serverZone as jest.Mock

describe("getAppSettings", () => {
  const originalTz = process.env.TZ

  beforeEach(() => {
    findUnique.mockReset()
    findPlex.mockReset().mockResolvedValue(null)
    findJellyfin.mockReset().mockResolvedValue(null)
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

  it("returns the server zone, the stored locale and the stored server name", async () => {
    zone.mockResolvedValue("Europe/Berlin")
    findUnique.mockResolvedValue({ locale: "de-DE", serverName: "Northfield Plex" })

    await expect(getAppSettings()).resolves.toEqual({
      timeZone: "Europe/Berlin",
      locale: "de-DE",
      serverName: "Northfield Plex",
    })
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: { locale: true, serverName: true } })
  })

  it.each([
    ["no config row", null],
    ["an invalid stored locale", { locale: "not a locale!", serverName: null }],
  ])("defaults the locale to en-US with %s", async (_label, row) => {
    zone.mockResolvedValue("UTC")
    findUnique.mockResolvedValue(row)

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "UTC", locale: "en-US", serverName: null })
  })

  it("takes the zone from serverZone(), so it follows Config.timezone, then TZ, then UTC", async () => {
    zone.mockResolvedValue("America/Chicago")
    findUnique.mockResolvedValue({ locale: "en-US", serverName: null })

    await expect(getAppSettings()).resolves.toMatchObject({ timeZone: "America/Chicago" })
    expect(zone).toHaveBeenCalled()
  })

  describe("server name", () => {
    beforeEach(() => zone.mockResolvedValue("UTC"))

    it("falls back to the newest active Plex server's name, reading only the name", async () => {
      findUnique.mockResolvedValue({ locale: "en-US", serverName: "  " })
      findPlex.mockResolvedValue({ name: "Basement Plex" })
      findJellyfin.mockResolvedValue({ name: "Attic Jellyfin" })

      await expect(getAppSettings()).resolves.toMatchObject({ serverName: "Basement Plex" })
      expect(findPlex).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { updatedAt: "desc" },
        select: { name: true },
      })
    })

    it("then to the active Jellyfin server's name", async () => {
      findUnique.mockResolvedValue(null)
      findJellyfin.mockResolvedValue({ name: "Attic Jellyfin" })

      await expect(getAppSettings()).resolves.toMatchObject({ serverName: "Attic Jellyfin" })
    })
  })

  it("falls back to TZ, en-US and no name when the database is unreachable", async () => {
    process.env.TZ = "US/Pacific"
    zone.mockRejectedValue(new Error("connection refused"))
    findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "America/Los_Angeles", locale: "en-US", serverName: null })
  })

  it("binds the formatters to the zone and locale alone", async () => {
    zone.mockResolvedValue("Europe/Berlin")
    findUnique.mockResolvedValue({ locale: "de-DE", serverName: "Northfield Plex" })

    await expect(getFormatSettings()).resolves.toEqual({ timeZone: "Europe/Berlin", locale: "de-DE" })
    const f = await getFormat()
    expect(f.settings).toEqual({ timeZone: "Europe/Berlin", locale: "de-DE" })
    expect(f.number(1234)).toBe("1.234")
  })
})

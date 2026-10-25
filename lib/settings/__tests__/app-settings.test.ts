/**
 * @jest-environment node
 *
 * The app's settings (P3.10, P3.9, P11.19): the server zone, `Config.locale`,
 * the server name, the `app-settings` cache tag, the reader outside a request
 * and the fallback when the database is down.
 */

import { getServerSession } from "next-auth"
import { cacheLife, cacheTag, updateTag } from "next/cache"

import { buildConfig } from "@/__tests__/helpers/factories"
import { updateServerTimeZone } from "@/actions/admin/admin-config"
import { prisma } from "@/lib/prisma"
import { APP_SETTINGS_TAG, getAppSettings, getFormat, getFormatSettings } from "@/lib/settings/app-settings"
import { serverZone } from "@/lib/utils/server-zone"

// The 'use cache' directive is inert under Jest; the tag and life calls are checked.
jest.mock("next/cache", () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
  updateTag: jest.fn(),
  revalidatePath: jest.fn(),
}))
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

// React's cache() only memoises inside a server request; tests call through.
jest.mock("react", () => ({ ...jest.requireActual("react"), cache: (fn: unknown) => fn }))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    config: { findUnique: jest.fn(), upsert: jest.fn() },
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

  it("caches under the app-settings tag for minutes", async () => {
    zone.mockResolvedValue("UTC")
    findUnique.mockResolvedValue(null)

    await getAppSettings()

    expect(cacheTag).toHaveBeenCalledWith(APP_SETTINGS_TAG)
    expect(cacheLife).toHaveBeenCalledWith("minutes")
  })

  it("reads the database directly where 'use cache' is unavailable (the bot, a job)", async () => {
    jest.mocked(cacheTag).mockImplementationOnce(() => {
      throw new Error('"use cache" cannot be used outside of App Router. Expected a WorkStore.')
    })
    zone.mockResolvedValue("UTC")
    findUnique.mockResolvedValue({ locale: "fr-FR", serverName: "Cellar", lightThemeEnabled: false })

    await expect(getAppSettings()).resolves.toMatchObject({ locale: "fr-FR", serverName: "Cellar" })
  })

  it("returns the server zone, the stored locale, server name and light-theme flag", async () => {
    zone.mockResolvedValue("Europe/Berlin")
    findUnique.mockResolvedValue({ locale: "de-DE", serverName: "Northfield Plex", lightThemeEnabled: true })

    await expect(getAppSettings()).resolves.toEqual({
      timeZone: "Europe/Berlin",
      locale: "de-DE",
      serverName: "Northfield Plex",
      lightThemeEnabled: true,
    })
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "config" },
      select: { locale: true, serverName: true, lightThemeEnabled: true },
    })
  })

  it.each([
    ["no config row", null],
    ["an invalid stored locale", { locale: "not a locale!", serverName: null }],
  ])("defaults the locale to en-US with %s", async (_label, row) => {
    zone.mockResolvedValue("UTC")
    findUnique.mockResolvedValue(row)

    await expect(getAppSettings()).resolves.toEqual({ timeZone: "UTC", locale: "en-US", serverName: null, lightThemeEnabled: false })
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

  it("falls back to TZ, en-US, no name and dark when the database is unreachable", async () => {
    process.env.TZ = "US/Pacific"
    zone.mockRejectedValue(new Error("connection refused"))
    findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(getAppSettings()).resolves.toEqual({
      timeZone: "America/Los_Angeles",
      locale: "en-US",
      serverName: null,
      lightThemeEnabled: false,
    })
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

describe("saving the server zone", () => {
  it("updates the app-settings tag, so the next request reads the new zone", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" })
    findUnique.mockResolvedValue({ timezone: "UTC" })
    jest.mocked(prisma.config.upsert).mockResolvedValue(buildConfig())

    await expect(updateServerTimeZone("Europe/Berlin")).resolves.toEqual({ success: true, data: { timezone: "Europe/Berlin" } })
    expect(updateTag).toHaveBeenCalledWith("app-settings")
  })
})

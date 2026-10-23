/**
 * The app's settings: the server zone, `Config.locale`, the server name and
 * the light-theme flag.
 *
 * Read once per request (React `cache()`) over a 60-second data cache tagged
 * `app-settings`; saving the zone, the locale or the flag calls
 * `updateTag("app-settings")`.
 *
 * @module lib/settings/app-settings
 */

import "server-only"

import { unstable_cache } from "next/cache"
import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { bindFormat, canonicalLocale, DEFAULT_LOCALE, type FormatSettings } from "@/lib/utils/format"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("app-settings")

export const APP_SETTINGS_TAG = "app-settings"

export interface AppSettings extends FormatSettings {
  /**
   * `Config.serverName`, else the active Plex server's name, else the active
   * Jellyfin server's; `null` when none is set. Read it through `serverName()`
   * in `lib/brand.ts`, which falls back to the product name.
   */
  serverName: string | null
  /** `Config.lightThemeEnabled`: members may pick the light theme (P10.10). */
  lightThemeEnabled: boolean
}

/** The most recently updated active row's name, never its token. */
const activeServer = { where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { name: true } } as const

const loadAppSettings = unstable_cache(
  async (): Promise<AppSettings> => {
    const [timeZone, config, plex, jellyfin] = await Promise.all([
      serverZone(),
      prisma.config.findUnique({ where: { id: "config" }, select: { locale: true, serverName: true, lightThemeEnabled: true } }),
      prisma.plexServer.findFirst(activeServer),
      prisma.jellyfinServer.findFirst(activeServer),
    ])
    const serverName = [config?.serverName, plex?.name, jellyfin?.name].map((name) => name?.trim()).find(Boolean)
    return {
      timeZone,
      locale: canonicalLocale(config?.locale),
      serverName: serverName ?? null,
      lightThemeEnabled: config?.lightThemeEnabled ?? false,
    }
  },
  [APP_SETTINGS_TAG],
  { tags: [APP_SETTINGS_TAG], revalidate: 60 },
)

/**
 * `{ timeZone, locale }` for every formatter in `lib/utils/format.ts`, the
 * server name for `lib/brand.ts` and the light-theme flag for
 * `lib/design/theme.ts`. The root layout reads it on every page, so a
 * database outage falls back to `TZ`, en-US, no name and dark instead of
 * failing the page.
 */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    return await loadAppSettings()
  } catch (error) {
    logger.warn("Falling back to default app settings", { error })
    return {
      timeZone: normalizeTimeZone(process.env.TZ) ?? "UTC",
      locale: DEFAULT_LOCALE,
      serverName: null,
      lightThemeEnabled: false,
    }
  }
})

/** The zone and locale alone, for the client's `FormatProvider` and the bound formatters. */
export async function getFormatSettings(): Promise<FormatSettings> {
  const { timeZone, locale } = await getAppSettings()
  return { timeZone, locale }
}

/** The formatters bound to the app settings, for Server Components. */
export async function getFormat() {
  return bindFormat(await getFormatSettings())
}

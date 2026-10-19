/**
 * The app's formatting settings: the server zone and `Config.locale`.
 *
 * Read once per request (React `cache()`) over a 60-second data cache tagged
 * `app-settings`; saving the zone or the locale calls `updateTag("app-settings")`.
 *
 * @module lib/settings/app-settings
 */

import "server-only"

import { unstable_cache } from "next/cache"
import { cache } from "react"

import { prisma } from "@/lib/prisma"
import { bindFormat, type FormatSettings } from "@/lib/utils/format"
import { createLogger } from "@/lib/utils/logger"
import { serverZone } from "@/lib/utils/server-zone"
import { normalizeTimeZone } from "@/lib/utils/zoned-time"

const logger = createLogger("app-settings")

export const APP_SETTINGS_TAG = "app-settings"

const DEFAULT_LOCALE = "en-US"

/** The stored locale when `Intl` accepts it, else en-US. */
function normalizeLocale(locale: string | null | undefined): string {
  if (!locale) return DEFAULT_LOCALE
  try {
    return Intl.getCanonicalLocales(locale)[0] ?? DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE
  }
}

const loadAppSettings = unstable_cache(
  async (): Promise<FormatSettings> => {
    const [timeZone, config] = await Promise.all([
      serverZone(),
      prisma.config.findUnique({ where: { id: "config" }, select: { locale: true } }),
    ])
    return { timeZone, locale: normalizeLocale(config?.locale) }
  },
  [APP_SETTINGS_TAG],
  { tags: [APP_SETTINGS_TAG], revalidate: 60 },
)

/**
 * `{ timeZone, locale }` for every formatter in `lib/utils/format.ts`. The
 * root layout reads it on every page, so a database outage falls back to
 * `TZ` and en-US instead of failing the page.
 */
export const getAppSettings = cache(async (): Promise<FormatSettings> => {
  try {
    return await loadAppSettings()
  } catch (error) {
    logger.warn("Falling back to default format settings", { error })
    return { timeZone: normalizeTimeZone(process.env.TZ) ?? "UTC", locale: DEFAULT_LOCALE }
  }
})

/** The formatters bound to the app settings, for Server Components. */
export async function getFormat() {
  return bindFormat(await getAppSettings())
}

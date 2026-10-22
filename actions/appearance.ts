"use server"

/**
 * The member's Appearance choice (P10.10, ui-design-system 4.1): Dark or
 * Light, kept in the `pm-theme` cookie that `resolveTheme()` reads. Refused
 * while `Config.lightThemeEnabled` is off, so the cookie is only ever set
 * behind the flag (and is ignored if the flag is later turned off).
 *
 * @module actions/appearance
 */

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { THEME_COOKIE } from "@/lib/design/theme"
import { usesSecureCookies } from "@/lib/env"
import { getAppSettings } from "@/lib/settings/app-settings"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Sets the theme cookie; the client then calls `router.refresh()`. */
export const setAppearance = memberAction({
  input: z.enum(["dark", "light"]),
  fallbackError: "Could not change the appearance",
  handler: async (theme) => {
    const { lightThemeEnabled } = await getAppSettings()
    if (!lightThemeEnabled) return fail("FORBIDDEN", "The light theme is not available")

    const jar = await cookies()
    jar.set(THEME_COOKIE, theme, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: usesSecureCookies(),
      maxAge: ONE_YEAR_SECONDS,
    })
    revalidatePath("/", "layout")
    return ok({ theme })
  },
})

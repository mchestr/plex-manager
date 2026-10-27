"use server"

/**
 * The member's Appearance choice (P10.10, ui-design-system 4.1): Dark or
 * Light, kept in the `pm-theme` cookie that `resolveTheme()` reads.
 *
 * @module actions/appearance
 */

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { memberAction } from "@/lib/actions/define-action"
import { ok } from "@/lib/actions/result"
import { THEME_COOKIE } from "@/lib/design/theme"
import { usesSecureCookies } from "@/lib/env"

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/** Sets the theme cookie; the client then calls `router.refresh()`. */
export const setAppearance = memberAction({
  input: z.enum(["dark", "light"]),
  fallbackError: "Could not change the appearance",
  handler: async (theme) => {
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

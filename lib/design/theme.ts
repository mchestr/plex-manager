/**
 * Theme resolution (ui-design-system 4.1 "Theme resolution", P10.10).
 *
 * The theme is decided on the server, so the first paint is already right
 * and there is no flash: `'dark'` unless the user's `pm-theme` cookie says
 * `light`. Every signed-in user can choose, and the cookie is the only input,
 * so the root layout adds no database read.
 *
 * | Cookie | Theme |
 * |---|---|
 * | `light` | light |
 * | `dark`, missing or garbage | dark |
 *
 * There is no "System" choice yet: it needs a pre-paint script, which can now
 * carry the CSP nonce from the `x-nonce` request header (P11.20).
 * Reading `cookies()` makes the caller dynamic; the root layout already is.
 *
 * @module lib/design/theme
 */

import "server-only"

import { cookies } from "next/headers"

import { themes, type ThemeName } from "@/lib/design/tokens"

export type Theme = ThemeName

/** The cookie that holds the member's choice, `dark` or `light`. */
export const THEME_COOKIE = "pm-theme"

/** The browser chrome colour of each theme: its `--background` in sRGB. */
export const THEME_COLOR: Record<Theme, string> = { light: themes.light.background.hex, dark: themes.dark.background.hex }

/** The theme for a raw cookie value: light only when it says `light`. @internal */
export function themeFor(cookie: string | undefined): Theme {
  return cookie === "light" ? "light" : "dark"
}

/** The request's theme, for the root layout and its Appearance picker. */
export async function resolveAppearance(): Promise<{ theme: Theme }> {
  const jar = await cookies()
  return { theme: themeFor(jar.get(THEME_COOKIE)?.value) }
}

/** The request's theme. */
export async function resolveTheme(): Promise<Theme> {
  return (await resolveAppearance()).theme
}

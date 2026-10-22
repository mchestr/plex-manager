/**
 * Theme resolution (ui-design-system 4.1 "Theme resolution", P10.10).
 *
 * The theme is decided on the server, so the first paint is already right
 * and there is no flash: `'dark'` unless `Config.lightThemeEnabled` is on and
 * the member's `pm-theme` cookie says `light`. The flag comes from the cached
 * `getAppSettings()`, so the root layout adds no database read.
 *
 * | Flag | Cookie | Theme |
 * |---|---|---|
 * | off | anything | dark |
 * | on | `light` | light |
 * | on | `dark`, missing or garbage | dark |
 *
 * There is no "System" choice until the nonce CSP can run a pre-paint script.
 * Reading `cookies()` makes the caller dynamic; the root layout already is.
 *
 * @module lib/design/theme
 */

import "server-only"

import { cookies } from "next/headers"

import { themes, type ThemeName } from "@/lib/design/tokens"
import { getAppSettings } from "@/lib/settings/app-settings"

export type Theme = ThemeName

/** The cookie that holds the member's choice, `dark` or `light`. */
export const THEME_COOKIE = "pm-theme"

/** The browser chrome colour of each theme: its `--background` in sRGB. */
export const THEME_COLOR: Record<Theme, string> = { light: themes.light.background.hex, dark: themes.dark.background.hex }

/** The theme for a flag and a raw cookie value: light only when both say so. @internal */
export function themeFor(lightThemeEnabled: boolean, cookie: string | undefined): Theme {
  return lightThemeEnabled && cookie === "light" ? "light" : "dark"
}

/** The flag and the request's theme, for the root layout and its Appearance picker. */
export async function resolveAppearance(): Promise<{ enabled: boolean; theme: Theme }> {
  const [{ lightThemeEnabled }, jar] = await Promise.all([getAppSettings(), cookies()])
  return { enabled: lightThemeEnabled, theme: themeFor(lightThemeEnabled, jar.get(THEME_COOKIE)?.value) }
}

/** The request's theme. */
export async function resolveTheme(): Promise<Theme> {
  return (await resolveAppearance()).theme
}

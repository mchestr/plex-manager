/**
 * @jest-environment node
 *
 * The theme resolver (P10.10, ui-design-system 4.1): dark unless the flag is
 * on and the `pm-theme` cookie says light.
 */

import { resolveAppearance, resolveTheme, THEME_COLOR, THEME_COOKIE, themeFor } from "@/lib/design/theme"
import { getAppSettings } from "@/lib/settings/app-settings"

let mockCookies: Record<string, string> = {}
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in mockCookies ? { name, value: mockCookies[name] } : undefined),
  }),
}))
jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))

const flag = (lightThemeEnabled: boolean) =>
  jest.mocked(getAppSettings).mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null, lightThemeEnabled })

beforeEach(() => {
  mockCookies = {}
})

describe("resolveTheme", () => {
  it("gives dark while the flag is off, even with a light cookie", async () => {
    flag(false)
    mockCookies = { [THEME_COOKIE]: "light" }

    await expect(resolveTheme()).resolves.toBe("dark")
  })

  it("gives light when the flag is on and the cookie says light", async () => {
    flag(true)
    mockCookies = { [THEME_COOKIE]: "light" }

    await expect(resolveTheme()).resolves.toBe("light")
    await expect(resolveAppearance()).resolves.toEqual({ enabled: true, theme: "light" })
  })

  it.each([
    ["missing", undefined],
    ["dark", "dark"],
    ["garbage", "LIGHT; drop table"],
    ["empty", ""],
  ])("gives dark for a %s cookie with the flag on", async (_label, value) => {
    flag(true)
    if (value !== undefined) mockCookies = { [THEME_COOKIE]: value }

    await expect(resolveTheme()).resolves.toBe("dark")
  })

  it("reads the cookie named pm-theme", () => {
    expect(THEME_COOKIE).toBe("pm-theme")
  })
})

describe("themeFor", () => {
  it("is light only when both the flag and the cookie say so", () => {
    expect(themeFor(true, "light")).toBe("light")
    expect(themeFor(false, "light")).toBe("dark")
    expect(themeFor(true, undefined)).toBe("dark")
  })
})

describe("THEME_COLOR", () => {
  it("is each theme's background, for the browser chrome", () => {
    expect(THEME_COLOR).toEqual({ light: "#f9fafb", dark: "#1a1c1e" })
  })
})

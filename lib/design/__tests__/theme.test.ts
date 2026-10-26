/**
 * @jest-environment node
 *
 * The theme resolver (P10.10, ui-design-system 4.1): dark unless the
 * `pm-theme` cookie says light.
 */

import { resolveAppearance, resolveTheme, THEME_COLOR, THEME_COOKIE, themeFor } from "@/lib/design/theme"

let mockCookies: Record<string, string> = {}
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name in mockCookies ? { name, value: mockCookies[name] } : undefined),
  }),
}))

beforeEach(() => {
  mockCookies = {}
})

describe("resolveTheme", () => {
  it("gives light when the cookie says light", async () => {
    mockCookies = { [THEME_COOKIE]: "light" }

    await expect(resolveTheme()).resolves.toBe("light")
    await expect(resolveAppearance()).resolves.toEqual({ theme: "light" })
  })

  it.each([
    ["missing", undefined],
    ["dark", "dark"],
    ["garbage", "LIGHT; drop table"],
    ["empty", ""],
  ])("gives dark for a %s cookie", async (_label, value) => {
    if (value !== undefined) mockCookies = { [THEME_COOKIE]: value }

    await expect(resolveTheme()).resolves.toBe("dark")
  })

  it("reads the cookie named pm-theme", () => {
    expect(THEME_COOKIE).toBe("pm-theme")
  })
})

describe("themeFor", () => {
  it("is light only when the cookie says light", () => {
    expect(themeFor("light")).toBe("light")
    expect(themeFor("dark")).toBe("dark")
    expect(themeFor(undefined)).toBe("dark")
  })
})

describe("THEME_COLOR", () => {
  it("is each theme's background, for the browser chrome", () => {
    expect(THEME_COLOR).toEqual({ light: "#f9fafb", dark: "#1a1c1e" })
  })
})

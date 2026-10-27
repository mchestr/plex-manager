/**
 * @jest-environment node
 *
 * The root metadata (P3.9): titles end in the server name, and the icons come
 * from the file-based routes, not a static `icons` field. The viewport (P3.2)
 * allows zoom, and its theme colour follows the resolved theme (P10.10).
 */

import { generateMetadata, generateViewport } from "@/app/layout"
import { getAppSettings } from "@/lib/settings/app-settings"

jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))
let mockThemeCookie: string | undefined
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "pm-theme" && mockThemeCookie ? { name, value: mockThemeCookie } : undefined),
  }),
}))
jest.mock("@/lib/providers", () => ({ Providers: () => null }))
jest.mock("@/app/fonts", () => ({ plexFontClassNames: "" }))
jest.mock("@/components/ui/flash-from-query", () => ({ FlashFromQuery: () => null }))

const settings = getAppSettings as jest.Mock
const originalEnv = process.env

afterEach(() => {
  process.env = originalEnv
})

describe("generateMetadata", () => {
  it("titles every page '{page} - {server name}'", async () => {
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: "Northfield Plex" })
    const metadata = await generateMetadata()

    expect(metadata.title).toEqual({ template: "%s - Northfield Plex", default: "Northfield Plex" })
    expect(metadata.icons).toBeUndefined()
  })

  it("falls back to the product name", async () => {
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null })
    const metadata = await generateMetadata()

    expect(metadata.title).toEqual({ template: "%s - Plex Manager", default: "Plex Manager" })
  })

  it("resolves the OG card against the public URL", async () => {
    // replaceProperty needs the key to exist, and CI sets no NEXT_PUBLIC_APP_URL.
    process.env = { ...originalEnv, NEXT_PUBLIC_APP_URL: "https://plex.example.com" }
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null })

    expect(String((await generateMetadata()).metadataBase)).toBe("https://plex.example.com/")
  })
})

describe("generateViewport", () => {
  const withCookie = (value: string | undefined) => {
    mockThemeCookie = value
  }

  it("keeps zoom available on the dark canvas colour (UI-11)", async () => {
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null })
    withCookie(undefined)
    const viewport = await generateViewport()

    expect(viewport).toEqual({ width: "device-width", initialScale: 1, themeColor: "#1a1c1e" })
    expect(viewport).not.toHaveProperty("maximumScale")
    expect(viewport).not.toHaveProperty("userScalable")
  })

  it("takes the light canvas colour when the member chose Light", async () => {
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null })
    withCookie("light")

    expect((await generateViewport()).themeColor).toBe("#f9fafb")
  })
})

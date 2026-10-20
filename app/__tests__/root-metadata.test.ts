/**
 * @jest-environment node
 *
 * The root metadata (P3.9): titles end in the server name, and the icons come
 * from the file-based routes, not a static `icons` field. The viewport (P3.2)
 * allows zoom.
 */

import { generateMetadata, viewport } from "@/app/layout"
import { getAppSettings } from "@/lib/settings/app-settings"

jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))
jest.mock("@/lib/providers", () => ({ Providers: () => null }))
jest.mock("@/app/fonts", () => ({ plexFontClassNames: "" }))
jest.mock("@/components/ui/flash-from-query", () => ({ FlashFromQuery: () => null }))

const settings = getAppSettings as jest.Mock

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
    jest.replaceProperty(process.env, "NEXT_PUBLIC_APP_URL", "https://plex.example.com")
    settings.mockResolvedValue({ timeZone: "UTC", locale: "en-US", serverName: null })

    expect(String((await generateMetadata()).metadataBase)).toBe("https://plex.example.com/")
  })

  it("keeps zoom available on the canvas colour (UI-11)", () => {
    expect(viewport).toEqual({ width: "device-width", initialScale: 1, themeColor: "#1a1c1e" })
    expect(viewport).not.toHaveProperty("maximumScale")
    expect(viewport).not.toHaveProperty("userScalable")
  })
})

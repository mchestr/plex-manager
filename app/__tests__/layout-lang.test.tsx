/**
 * @jest-environment node
 *
 * `<html lang>` follows `Config.locale` through `getAppSettings()`, in
 * canonical form, and falls back to en-US for a value `Intl` rejects (P11.17,
 * GAP-47).
 */

import type { ReactElement } from "react"
import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import RootLayout from "@/app/layout"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
// The data cache needs a Next request; here it is a plain call
jest.mock("next/cache", () => ({ unstable_cache: <T,>(fn: T) => fn }))
jest.mock("next/server", () => ({ connection: async () => undefined }))
jest.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
jest.mock("@/lib/providers", () => ({ Providers: () => null }))
jest.mock("@/app/fonts", () => ({ plexFontClassNames: "" }))
jest.mock("@/components/ui/flash-from-query", () => ({ FlashFromQuery: () => null }))

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.plexServer.findFirst.mockResolvedValue(null)
  prismaMock.jellyfinServer.findFirst.mockResolvedValue(null)
})

async function htmlLang(locale: string): Promise<unknown> {
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ locale, timezone: "Europe/London" }))
  const html = (await RootLayout({ children: null })) as ReactElement<{ lang?: string }>
  return html.props.lang
}

describe("<html lang>", () => {
  it("is Config.locale", async () => {
    await expect(htmlLang("en-GB")).resolves.toBe("en-GB")
  })

  it("is canonicalised", async () => {
    await expect(htmlLang("de-de")).resolves.toBe("de-DE")
  })

  it("falls back to en-US for an invalid value", async () => {
    await expect(htmlLang("not a locale")).resolves.toBe("en-US")
  })
})

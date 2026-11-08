/**
 * @jest-environment node
 */

import { serverName } from "@/lib/brand"
import { accentTokens } from "@/lib/branding/accent"
import { getBranding } from "@/lib/branding/settings"
import { themes } from "@/lib/design/tokens"
import { loadEmailContext } from "@/lib/email/context"
import type { EmailConfig } from "@/lib/email/env-rules"

jest.mock("@/lib/brand", () => ({ serverName: jest.fn() }))
jest.mock("@/lib/branding/settings", () => ({ getBranding: jest.fn() }))

const config: EmailConfig = {
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: { user: "u", pass: "p" },
  from: "noreply@example.com",
  replyTo: "help@example.com",
  postalAddress: "1 Main Street",
}

const savedAppUrl = process.env.NEXT_PUBLIC_APP_URL

beforeEach(() => {
  jest.mocked(serverName).mockResolvedValue("Northfield Plex")
  process.env.NEXT_PUBLIC_APP_URL = "https://plex.example.com/"
})

afterEach(() => {
  if (savedAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = savedAppUrl
})

describe("loadEmailContext", () => {
  it("reads the server name, the app link and the addresses, never the login", async () => {
    jest.mocked(getBranding).mockResolvedValue({ loginSubtitle: null, accentColor: "#2563eb", assets: {} })

    const context = await loadEmailContext(config)

    expect(context).toEqual({
      serverName: "Northfield Plex",
      appUrl: "https://plex.example.com",
      accent: { fill: accentTokens("#2563eb").light.primary, ink: accentTokens("#2563eb").light["primary-foreground"] },
      replyTo: "help@example.com",
      postalAddress: "1 Main Street",
    })
    expect(JSON.stringify(context)).not.toContain('"p"')
  })

  it("uses the default amber when no accent colour is saved", async () => {
    jest.mocked(getBranding).mockResolvedValue({ loginSubtitle: null, accentColor: null, assets: {} })

    const { accent } = await loadEmailContext(config)

    expect(accent.fill).toBe(accentTokens(themes.dark.primary.hex).light.primary)
  })
})

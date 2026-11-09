/**
 * @jest-environment node
 */

/**
 * The message of a warning email and of the test email: the dates in the
 * cycle's zone and the server locale, the days left on the send day, the
 * Discord come-back line, and the headers of each kind with the same
 * unsubscribe token as the body.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { loadEmailContext } from "@/lib/email/context"
import type { EmailConfig } from "@/lib/email/env-rules"
import { warningMessage, type WarningDates } from "@/lib/email/warning-email"
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"
import { getAppSettings } from "@/lib/settings/app-settings"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/email/context", () => ({ loadEmailContext: jest.fn() }))
jest.mock("@/lib/settings/app-settings", () => ({ getAppSettings: jest.fn() }))

const config: EmailConfig = {
  server: { host: "smtp.example.com", port: 587, secure: false },
  auth: null,
  from: "noreply@example.com",
  replyTo: null,
  postalAddress: null,
}

const recipient = { userId: "u1", name: "Sam", email: "member@example.com" }

/** 09:00 on September 28 in Toronto; the date starts at 00:00 on October 28 there. */
const dates = (patch: Partial<WarningDates> = {}): WarningDates => ({
  stage: "first",
  thresholdDays: 180,
  zone: "America/Toronto",
  removeAfter: new Date("2026-10-28T04:00:00Z"),
  cycleAt: new Date("2026-05-02T00:00:00Z"),
  now: new Date("2026-09-28T13:00:00Z"),
  ...patch,
})

function header(message: Awaited<ReturnType<typeof warningMessage>>, name: string): string | undefined {
  const value = (message.headers as Record<string, string | { value: string }>)[name]
  return typeof value === "object" ? value.value : value
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(loadEmailContext).mockResolvedValue({
    serverName: "Northfield Plex",
    appUrl: "https://plex.example.com",
    accent: { fill: "#b45309", ink: "#ffffff" },
    replyTo: null,
    postalAddress: null,
  })
  jest.mocked(getAppSettings).mockResolvedValue({ timeZone: "America/Toronto", locale: "en-US", serverName: "Northfield Plex" })
  prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
})

describe("warningMessage", () => {
  it("names the dates in the cycle's zone and the days left on the send day", async () => {
    const message = await warningMessage(config, recipient, dates())

    expect(message.subject).toBe("Keep your Northfield Plex access: watch something before October 28, 2026")
    expect(message.text).toContain("Nothing has played on your Northfield Plex account since May 1, 2026.")
    expect(message.text).toContain("That is 30 days from now.")
    expect(message.to).toEqual({ name: "", address: "member@example.com" })
    expect(message.from).toEqual({ name: "Northfield Plex", address: "noreply@example.com" })
  })

  it("writes the dates in the server locale, in a zone west of the server", async () => {
    jest.mocked(getAppSettings).mockResolvedValue({ timeZone: "America/Toronto", locale: "de-DE", serverName: null })
    const message = await warningMessage(config, recipient, dates({ zone: "Pacific/Honolulu", removeAfter: new Date("2026-10-28T10:00:00Z"), cycleAt: new Date("2026-05-01T05:00:00Z") }))

    expect(message.subject).toContain("28. Oktober 2026")
    expect(message.text).toContain("30. April 2026")
  })

  it("carries the unsubscribe headers and List-Id, with the body's token", async () => {
    const message = await warningMessage(config, recipient, dates({ stage: "last", now: new Date("2026-10-27T13:00:00Z") }))

    expect(header(message, "List-Id")).toBe('"Northfield Plex access reminders" <access-reminders.example.com>')
    expect(header(message, "List-Unsubscribe-Post")).toBe("List-Unsubscribe=One-Click")
    const oneClick = /^<https:\/\/plex\.example\.com\/api\/email\/unsubscribe\?token=([^>]+)>$/.exec(header(message, "List-Unsubscribe") ?? "")
    const page = /Stop these emails: https:\/\/plex\.example\.com\/email\/unsubscribe\?token=(\S+)/.exec(String(message.text))
    expect(oneClick?.[1]).toBe(page?.[1])
    expect(verifyUnsubscribeToken(decodeURIComponent(oneClick?.[1] ?? ""))).toBe("u1")
    expect(message.subject).toBe("Last reminder: your Northfield Plex access ends on or after October 28, 2026")
    expect(message.text).toContain("for a few minutes today.")
  })

  it("points to the Discord invite when one is set", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: " abc123 " } as never)

    const message = await warningMessage(config, recipient, dates())
    expect(message.text).toContain("Ask for a new invite in our Discord: https://discord.gg/abc123")
  })

  it("builds the test email with the unsubscribe headers and no List-Id", async () => {
    const message = await warningMessage(config, recipient, dates(), { test: true })

    expect(message.subject).toBe("[Test] Keep your Northfield Plex access: watch something before October 28, 2026")
    expect(String(message.text).startsWith("This is a test email from Northfield Plex. The dates are examples.")).toBe(true)
    expect(header(message, "List-Id")).toBeUndefined()
    expect(header(message, "List-Unsubscribe")).toMatch(/^<https:\/\/plex\.example\.com\/api\/email\/unsubscribe\?token=/)
  })
})

/**
 * @jest-environment node
 *
 * The unsubscribe links and headers (lib/email/unsubscribe.ts).
 */

import { accessReminderHeaders, accessRemindersListId, unsubscribeHeaders, unsubscribeLinks } from "@/lib/email/unsubscribe"
import { verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"

const APP = "https://plex.example.com"

const tokenOf = (url: string) => new URL(url).searchParams.get("token")

describe("unsubscribeLinks", () => {
  it("links the page and the one-click address with the member's token", () => {
    const links = unsubscribeLinks(APP, "member-1")

    expect(links.page).toMatch(/^https:\/\/plex\.example\.com\/email\/unsubscribe\?token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(links.oneClick).toMatch(/^https:\/\/plex\.example\.com\/api\/email\/unsubscribe\?token=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(verifyUnsubscribeToken(tokenOf(links.page))).toBe("member-1")
    expect(tokenOf(links.oneClick)).toBe(tokenOf(links.page))
  })
})

describe("unsubscribeHeaders", () => {
  it("names the one-click address and asks for an RFC 8058 POST", () => {
    expect(unsubscribeHeaders({ page: `${APP}/email/unsubscribe?token=a.b`, oneClick: `${APP}/api/email/unsubscribe?token=a.b` })).toEqual({
      "List-Unsubscribe": `<${APP}/api/email/unsubscribe?token=a.b>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    })
  })
})

describe("accessRemindersListId", () => {
  it("is the access-reminders id at the domain of EMAIL_FROM", () => {
    expect(accessRemindersListId("Northfield Plex", "noreply@Mail.Example.com")).toBe(
      '"Northfield Plex access reminders" <access-reminders.mail.example.com>'
    )
  })

  it("keeps only printable ASCII, with no quote or backslash, in the description", () => {
    expect(accessRemindersListId('Tom\'s "Plex"\\ ★\r\n  Club', "noreply@example.com")).toBe(
      '"Tom\'s Plex Club access reminders" <access-reminders.example.com>'
    )
  })

  it("takes the accents off letters instead of dropping them", () => {
    expect(accessRemindersListId("Café Plex de l'Été", "noreply@example.com")).toBe(
      '"Cafe Plex de l\'Ete access reminders" <access-reminders.example.com>'
    )
  })

  it("falls back to Access reminders when nothing of the name is left", () => {
    expect(accessRemindersListId("プレックス", "noreply@example.com")).toBe('"Access reminders" <access-reminders.example.com>')
  })
})

describe("accessReminderHeaders", () => {
  it("adds List-Id to the unsubscribe headers", () => {
    const links = unsubscribeLinks(APP, "member-1")

    expect(accessReminderHeaders({ serverName: "Northfield Plex" }, "noreply@example.com", links)).toEqual({
      ...unsubscribeHeaders(links),
      "List-Id": '"Northfield Plex access reminders" <access-reminders.example.com>',
    })
  })
})

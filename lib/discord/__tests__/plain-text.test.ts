/**
 * plainDiscordText: someone else's words, safe to put in a Discord message:
 * no formatting, no masked or bare links, no mentions, no bidi or zero-width
 * characters, one line, and a length cap.
 */

import { plainDiscordText } from "@/lib/discord/plain-text"

describe("plainDiscordText", () => {
  it("leaves ordinary words alone", () => {
    expect(plainDiscordText("The Office (US) S1E1: Pilot", 100)).toBe("The Office \\(US\\) S1E1\\: Pilot")
  })

  it("escapes formatting, so it shows as typed", () => {
    expect(plainDiscordText("**bold** _it_ ~~gone~~ `code` ||spoiler|| > quote # heading - item", 200)).toBe(
      "\\*\\*bold\\*\\* \\_it\\_ \\~\\~gone\\~\\~ \\`code\\` \\|\\|spoiler\\|\\| \\> quote \\# heading \\- item"
    )
  })

  it("defuses masked links, bare links and mentions", () => {
    expect(plainDiscordText("[Heat](https://evil.example)", 100)).toBe("\\[Heat\\]\\(https\\://evil.example\\)")
    expect(plainDiscordText("see https://evil.example now", 100)).toBe("see https\\://evil.example now")
    expect(plainDiscordText("@everyone <@123> <#456> <t:1:R>", 100)).toBe("\\@everyone \\<\\@123\\> \\<\\#456\\> \\<t\\:1\\:R\\>")
  })

  it("drops bidi and zero-width characters, and puts it on one line", () => {
    expect(plainDiscordText("Pla\u200by\u202e evil\u2066 \n\n next\tline", 100)).toBe("Play evil next line")
  })

  it("drops bidi and zero-width characters inside a masked link too", () => {
    expect(plainDiscordText("[He\u202eat](https://ev\u2066il.exa\u200bmple)", 100)).toBe("\\[Heat\\]\\(https\\://evil.example\\)")
  })

  it("cuts it to the cap, backslashes included, with an ellipsis and never half an escape", () => {
    expect(plainDiscordText("A very long title indeed", 10)).toBe("A very lo…")
    expect(plainDiscordText("a*b*c*d", 6)).toBe("a\\*b…")
    expect(plainDiscordText("a*b", 4)).toBe("a\\*b")
    expect(plainDiscordText("*".repeat(300), 120).length).toBeLessThanOrEqual(120)
    expect(plainDiscordText("   ", 10)).toBe("")
  })
})

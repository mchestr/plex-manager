import { cardFileName, cardUrl, confirmLine, privacyStatus } from "@/lib/rewind/share-sheet"

describe("share sheet wording and addresses (JSDoc examples)", () => {
  it("builds the owner card URL from the choices", () => {
    expect(cardUrl("wr1", "clock", { signed: true, includeArt: false, dailyDetail: false, cardFacts: [] })).toBe("/api/rewind/card/wr1/clock?signed=1&art=0&daily=0")
    expect(cardUrl("wr1", "centrefold", { signed: false, includeArt: true, dailyDetail: true, cardFacts: ["hours.peak", "counts.films"] })).toBe(
      "/api/rewind/card/wr1/centrefold?signed=0&art=1&daily=1&facts=hours.peak%2Ccounts.films"
    )
    expect(cardFileName(2026, "centrefold")).toBe("rewind-2026-centrefold.png")
  })

  it("names what a link will publish", () => {
    expect(confirmLine({ cards: 5, signed: false, expires: "31 January 2027" })).toBe(
      "Anyone with the link will see these 5 cards. Your name: hidden. Expires 31 January 2027."
    )
    expect(confirmLine({ cards: 1, signed: true, expires: null })).toBe("Anyone with the link will see this card. Your name: shown. No expiry.")
  })

  it("states the back cover's privacy line", () => {
    expect(privacyStatus({ link: false, signed: false, includeArt: false })).toBe("Public link off. Cards unsigned, no artwork.")
    expect(privacyStatus({ link: true, signed: true, includeArt: true })).toBe("Public link on. Cards signed, with artwork.")
  })
})

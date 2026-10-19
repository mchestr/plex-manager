import { withFlash } from "@/lib/ui/flash-codes"

describe("withFlash", () => {
  it("adds the code to a bare path", () => {
    expect(withFlash("/discord/link", "discord_linked")).toBe("/discord/link?flash=discord_linked")
  })

  it("keeps the existing query, including a literal question mark in a value", () => {
    expect(withFlash("/discord/link?x=a?b", "discord_failed")).toBe("/discord/link?x=a%3Fb&flash=discord_failed")
  })

  it("replaces a flash the path already carries", () => {
    expect(withFlash("/?flash=other", "discord_expired")).toBe("/?flash=discord_expired")
  })
})

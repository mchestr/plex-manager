import { affiliateInviteHeadline } from "@/lib/affiliates/copy"

describe("affiliateInviteHeadline", () => {
  it("names the affiliate", () => {
    expect(affiliateInviteHeadline("Sam", "Northfield Plex")).toBe("Sam invited you to Northfield Plex")
  })

  it("is the plain headline without a name", () => {
    expect(affiliateInviteHeadline(null, "Northfield Plex")).toBe("You're invited to Northfield Plex")
  })
})

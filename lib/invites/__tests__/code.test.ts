/** `generateInviteCode`: eight characters from the unambiguous set. */

import { generateInviteCode } from "@/lib/invites/code"

describe("generateInviteCode", () => {
  it("makes eight unambiguous characters", () => {
    for (let i = 0; i < 50; i++) expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  })

  it("does not repeat itself", () => {
    expect(new Set(Array.from({ length: 50 }, generateInviteCode)).size).toBe(50)
  })
})

jest.mock("server-only", () => ({}))

import { requestLimitFields } from "../discord-fields"
import type { MemberRequestLimits } from "../member-limits"
import { DEFAULT_TIERS, tierProgress } from "../tiers"

const limits = (hours: number, patch: Partial<MemberRequestLimits> = {}): MemberRequestLimits => ({
  hours,
  progress: tierProgress(hours, DEFAULT_TIERS),
  excluded: false,
  usage: { movie: { limit: 4, days: 7, used: 1, remaining: 3 }, tv: { limit: 0, days: 7, used: 2, remaining: null } },
  ...patch,
})

describe("requestLimitFields", () => {
  it("shows the tier, the requests left and the next tier", () => {
    expect(requestLimitFields(limits(37))).toEqual([
      { name: "🎟️ Request tier 2", value: "4 movies and 2 shows every 7 days" },
      { name: "📥 Requests left", value: "Movies: 3 of 4 left\nShows: unlimited", inline: true },
      { name: "⬆️ Next tier", value: "13 more hours for tier 3 (6 movies, 3 shows)", inline: true },
    ])
  })

  it("has no next tier at the top", () => {
    const names = requestLimitFields(limits(500)).map((field) => field.name)
    expect(names).toEqual(["🎟️ Request tier 5", "📥 Requests left"])
  })

  it("rounds the hours up and says unlimited for a limit of 0", () => {
    const fields = requestLimitFields(limits(199.2))
    expect(fields.at(-1)?.value).toBe("1 more hour for tier 5 (unlimited movies, unlimited shows)")
  })

  it("leaves the tier out for an excluded member but keeps what they have left", () => {
    expect(requestLimitFields(limits(37, { excluded: true })).map((field) => field.name)).toEqual(["📥 Requests left"])
  })

  it("leaves out what could not be read", () => {
    expect(requestLimitFields(limits(37, { usage: null, progress: null, hours: null }))).toEqual([])
  })
})

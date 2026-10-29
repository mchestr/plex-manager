/** The Affiliates page's counts, states and invite tree. */

import { affiliateState, buildInviteTree, countInvites, openInvites, type LabelledInviteFacts } from "@/lib/admin/affiliates/rows"

const NOW = new Date("2026-10-29T12:00:00Z")
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const invite = (id: string, facts: Partial<LabelledInviteFacts>): LabelledInviteFacts => ({
  id,
  code: `CODE${id}WXYZ`,
  label: null,
  expiresAt: days(1),
  cancelledAt: null,
  joinedAt: null,
  ...facts,
})

describe("countInvites", () => {
  const invites = [
    invite("open", { label: "For Ana" }),
    invite("joined-recently", { joinedAt: days(-3), expiresAt: days(-1) }),
    invite("joined-long-ago", { joinedAt: days(-90), expiresAt: days(-88) }),
    invite("expired-recently", { expiresAt: days(-5) }),
    invite("expired-long-ago", { expiresAt: days(-40) }),
    invite("cancelled", { cancelledAt: days(-2), expiresAt: days(-1) }),
  ]

  it("counts joins in the last 30 days plus open invites as used, and every join in total", () => {
    expect(countInvites(invites, NOW)).toEqual({ slotsUsed: 2, totalJoins: 2, expiredUnused: 1 })
  })

  it("lists only open invites, with the code's last 4 characters", () => {
    expect(openInvites(invites, NOW)).toEqual([{ id: "open", label: "For Ana", expiresAt: days(1), codeEnd: "WXYZ" }])
  })
})

describe("affiliateState", () => {
  it("pauses a paid affiliate before anything else", () => {
    expect(affiliateState(true, { invites: 0, source: "override" })).toBe("paid")
  })

  it("pauses an override of 0 but not a tier of 0", () => {
    expect(affiliateState(false, { invites: 0, source: "override" })).toBe("override_zero")
    expect(affiliateState(false, { invites: 0, source: "tier" })).toBe("active")
    expect(affiliateState(false, { invites: 2, source: "override" })).toBe("active")
  })
})

describe("buildInviteTree", () => {
  const names = new Map([
    ["sam", "Sam"],
    ["ana", "Ana"],
    ["bo", "Bo"],
    ["cy", "Cy"],
  ])

  it("nests an invitee who invited people, and shows a removed invitee without a name", () => {
    const tree = buildInviteTree(
      [
        { affiliateUserId: "sam", joinedUserId: "ana", joinedAt: days(-10) },
        { affiliateUserId: "sam", joinedUserId: null, joinedAt: days(-20) },
        { affiliateUserId: "ana", joinedUserId: "bo", joinedAt: days(-2) },
        { affiliateUserId: "cy", joinedUserId: null, joinedAt: days(-1) },
      ],
      names
    )

    expect(tree).toEqual([
      { userId: "cy", name: "Cy", joinedAt: null, children: [{ userId: null, name: null, joinedAt: days(-1), children: [] }] },
      {
        userId: "sam",
        name: "Sam",
        joinedAt: null,
        children: [
          { userId: null, name: null, joinedAt: days(-20), children: [] },
          { userId: "ana", name: "Ana", joinedAt: days(-10), children: [{ userId: "bo", name: "Bo", joinedAt: days(-2), children: [] }] },
        ],
      },
    ])
  })

  it("puts the joins of removed affiliates under one last root with no id", () => {
    const tree = buildInviteTree(
      [
        { affiliateUserId: null, joinedUserId: "ana", joinedAt: days(-5) },
        { affiliateUserId: null, joinedUserId: null, joinedAt: days(-6) },
        { affiliateUserId: "sam", joinedUserId: "bo", joinedAt: days(-2) },
      ],
      names
    )
    expect(tree.map((root) => root.userId)).toEqual(["sam", null])
    expect(tree[1]).toEqual({
      userId: null,
      name: null,
      joinedAt: null,
      children: [
        { userId: null, name: null, joinedAt: days(-6), children: [] },
        { userId: "ana", name: "Ana", joinedAt: days(-5), children: [] },
      ],
    })
  })

  it("is empty without joins", () => {
    expect(buildInviteTree([], names)).toEqual([])
  })
})

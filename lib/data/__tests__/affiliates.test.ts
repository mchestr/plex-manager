/**
 * The Affiliates page's loaders: `affiliates:read` for the first three tabs,
 * admins only for the open invites and the History tab, and the stored
 * watch hours, never a live read.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { authErrorKind } from "@/lib/auth-errors"
import { getAffiliateHistory } from "@/lib/data/affiliate-history"
import { getInviteTree, listAffiliateApplications, listAffiliates } from "@/lib/data/affiliates"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const session = jest.mocked(getServerSession)
const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const SUPPORT = { user: { id: "support-1", isAdmin: false, role: "support" }, expires: "" }
const MEMBER = { user: { id: "member-1", isAdmin: false }, expires: "" }

const NOW = new Date()
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000)

const user = (overrides: Record<string, unknown> = {}) => ({
  id: "sam",
  name: "Sam",
  email: "sam@example.com",
  createdAt: days(-400),
  watchHours: 250,
  watchHoursLast30Days: 10,
  watchHoursReadAt: days(-1),
  accessEndedAt: null,
  subscription: null,
  affiliateJoin: null,
  ...overrides,
})

beforeEach(() => {
  mockReset(prismaMock)
  session.mockResolvedValue(ADMIN)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null }))
})

async function refusal(load: () => Promise<unknown>) {
  return load().then(
    () => null,
    (error: Error) => authErrorKind(error)
  )
}

describe("who may read", () => {
  it("lets Support read the first three tabs and refuses a member", async () => {
    prismaMock.affiliateApplication.findMany.mockResolvedValue([])
    prismaMock.invite.findMany.mockResolvedValue([])
    prismaMock.user.findMany.mockResolvedValue([])
    session.mockResolvedValue(SUPPORT)
    await expect(listAffiliateApplications()).resolves.toEqual([])
    await expect(listAffiliates()).resolves.toEqual([])
    await expect(getInviteTree()).resolves.toEqual([])

    session.mockResolvedValue(MEMBER)
    await expect(refusal(listAffiliateApplications)).resolves.toBe("forbidden")
    await expect(refusal(listAffiliates)).resolves.toBe("forbidden")
    await expect(refusal(getInviteTree)).resolves.toBe("forbidden")
  })

  it("keeps the History tab for admins", async () => {
    session.mockResolvedValue(SUPPORT)
    await expect(refusal(getAffiliateHistory)).resolves.toBe("forbidden")
    expect(prismaMock.affiliateBlock.findMany).not.toHaveBeenCalled()
  })
})

describe("listAffiliateApplications", () => {
  it("returns pending rows with the stored hours and the flags", async () => {
    prismaMock.affiliateApplication.findMany.mockResolvedValue([
      { id: "app-1", appliedAt: days(-2), note: "I share with family", plexEmailShared: true, tierRaisedAt: null, user: user({ createdAt: days(-10), affiliateJoin: { id: "inv" } }) },
    ] as never)

    await expect(listAffiliateApplications()).resolves.toEqual([
      {
        id: "app-1",
        member: { id: "sam", name: "Sam", accessEndedAt: null },
        watchHours: 250,
        watchHoursReadAt: days(-1),
        memberSince: days(-10),
        appliedAt: days(-2),
        note: "I share with family",
        flags: ["new_member", "invited", "shared_email"],
      },
    ])
    expect(prismaMock.affiliateApplication.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "PENDING" }, orderBy: { appliedAt: "asc" } }))
  })
})

describe("listAffiliates", () => {
  const invites = [
    { id: "i1", code: "AAAA1234", label: "For Ana", expiresAt: days(1), cancelledAt: null, joinedAt: null },
    { id: "i2", code: "BBBB5678", label: null, expiresAt: days(-5), cancelledAt: null, joinedAt: days(-6) },
  ]

  beforeEach(() => {
    prismaMock.affiliateApplication.findMany.mockResolvedValue([
      { id: "app-z", plexEmailShared: false, tierRaisedAt: null, inviteOverride: null, user: user({ id: "zed", name: "Zed", affiliateInvites: invites }) },
      { id: "app-a", plexEmailShared: false, tierRaisedAt: null, inviteOverride: 0, user: user({ id: "amy", name: "Amy", subscription: { status: "ACTIVE" }, affiliateInvites: [] }) },
    ] as never)
  })

  it("computes the allowance, the counts and the state, sorted by name", async () => {
    const rows = await listAffiliates()
    expect(rows.map((row) => row.member.name)).toEqual(["Amy", "Zed"])
    expect(rows[0]).toMatchObject({ allowance: { invites: 0, source: "override" }, state: "paid", slotsUsed: 0 })
    expect(rows[1]).toMatchObject({ allowance: { invites: 2, source: "tier" }, state: "active", slotsUsed: 2, totalJoins: 1, expiredUnused: 0 })
  })

  it("shows admins the open invites by label, expiry and the code's last 4 characters only", async () => {
    const rows = await listAffiliates()
    expect(rows[1]!.openInvites).toEqual([{ id: "i1", label: "For Ana", expiresAt: days(1), codeEnd: "1234" }])
    expect(JSON.stringify(rows)).not.toContain("AAAA1234")
  })

  it("gives Support no open invites, so no labels", async () => {
    session.mockResolvedValue(SUPPORT)
    const rows = await listAffiliates()
    expect(rows.every((row) => row.openInvites === null)).toBe(true)
    expect(JSON.stringify(rows)).not.toContain("For Ana")
  })
})

describe("getInviteTree", () => {
  it("names each member and leaves a removed invitee unnamed", async () => {
    prismaMock.invite.findMany.mockResolvedValue([
      { affiliateUserId: "sam", joinedUserId: "ana", joinedAt: days(-3) },
      { affiliateUserId: "sam", joinedUserId: null, joinedAt: days(-9) },
    ] as never)
    prismaMock.user.findMany.mockResolvedValue([
      { id: "sam", name: null, email: "sam@example.com" },
      { id: "ana", name: "Ana", email: null },
    ] as never)

    await expect(getInviteTree()).resolves.toEqual([
      {
        userId: "sam",
        name: "sam@example.com",
        joinedAt: null,
        children: [
          { userId: null, name: null, joinedAt: days(-9), children: [] },
          { userId: "ana", name: "Ana", joinedAt: days(-3), children: [] },
        ],
      },
    ])
  })
})

describe("getAffiliateHistory", () => {
  it("returns past applications with their date, and blocks with a hash prefix and the admin's name", async () => {
    prismaMock.affiliateApplication.findMany.mockResolvedValue([
      { id: "a1", status: "REFUSED", reason: "Not yet", endCause: null, decidedAt: days(-3), endedAt: null, user: user() },
      { id: "a2", status: "ENDED", reason: null, endCause: "UNSHARED", decidedAt: days(-90), endedAt: days(-1), user: user({ accessEndedAt: days(-1) }) },
    ] as never)
    prismaMock.affiliateBlock.findMany.mockResolvedValue([
      { id: "b1", plexIdHash: "abcdef0123456789", createdAt: days(-2), createdBy: "admin-1" },
      { id: "b2", plexIdHash: "99999999ffffffff", createdAt: days(-4), createdBy: "gone" },
    ])
    prismaMock.user.findMany.mockResolvedValue([{ id: "admin-1", name: "Mike", email: null }] as never)

    const history = await getAffiliateHistory()
    expect(history.applications.map(({ id, at, member }) => ({ id, at, ended: member.accessEndedAt !== null }))).toEqual([
      { id: "a1", at: days(-3), ended: false },
      { id: "a2", at: days(-1), ended: true },
    ])
    expect(history.blocks).toEqual([
      { id: "b1", createdAt: days(-2), createdBy: "Mike", hashPrefix: "abcdef01" },
      { id: "b2", createdAt: days(-4), createdBy: "A removed admin", hashPrefix: "99999999" },
    ])
  })
})

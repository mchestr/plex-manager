/**
 * `getInvitesPageData`: the standing from stored values, and for an
 * affiliate the allowance line, the cap, the open invites and the joins.
 */

import { mockReset } from "jest-mock-extended"

import { buildAffiliateApplication, buildConfig, buildInvite, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { User } from "@/lib/generated/prisma/client"
import { getInvitesPageData } from "@/lib/member/invites"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const NOW = new Date("2026-10-29T12:00:00Z")
const DAY = 24 * 60 * 60 * 1000

const member = (overrides: Partial<User> = {}, status?: "ACTIVE" | "CANCELED") =>
  ({ ...buildUser({ name: "Sam", watchHours: 120, ...overrides }), subscription: status ? { status } : null }) as User

/** The four findMany reads of an affiliate's panel: held, server held, open, joined. */
function invites({ held = [], serverHeld = [], open = [], joined = [] }: Partial<Record<"held" | "serverHeld" | "open" | "joined", object[]>>) {
  prismaMock.invite.findMany.mockImplementation(((args: { where?: Record<string, unknown>; take?: number }) => {
    const where = args.where ?? {}
    if (args.take) return Promise.resolve(joined)
    if ("OR" in where) return Promise.resolve("affiliateUserId" in where ? held : serverHeld)
    return Promise.resolve(open)
  }) as never)
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.user.findUnique.mockResolvedValue(member())
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: null }))
  prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
  prismaMock.affiliateApplication.findFirst.mockResolvedValue(null)
  invites({})
})

describe("getInvitesPageData standing", () => {
  it("can apply above the first tier's hours, with the name the invite page shows", async () => {
    await expect(getInvitesPageData("user-1", NOW)).resolves.toEqual({ inviterName: "Sam", standing: { state: "can_apply", hours: 120 }, affiliate: null })
  })

  it("is below the bar at or under the first tier", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({ watchHours: 23 }))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ standing: { state: "below_bar", hours: 23, barHours: 50 } })
  })

  it("is paid for a paid member without an application", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({}, "ACTIVE"))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ standing: { state: "paid" } })
  })

  it("is pending with an open application", async () => {
    const appliedAt = new Date(NOW.getTime() - DAY)
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "PENDING", appliedAt }))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ standing: { state: "pending", appliedAt }, affiliate: null })
  })

  it("counts a refusal from its decision and a revoke from when it ended", async () => {
    const decidedAt = new Date(NOW.getTime() - 2 * DAY)
    prismaMock.affiliateApplication.findFirst.mockResolvedValueOnce(buildAffiliateApplication({ status: "REFUSED", reason: "Too new", decidedAt }))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({
      standing: { state: "refused", reason: "Too new", applyAgainAt: new Date(decidedAt.getTime() + 30 * DAY) },
    })

    const endedAt = new Date(NOW.getTime() - DAY)
    prismaMock.affiliateApplication.findFirst.mockResolvedValueOnce(
      buildAffiliateApplication({ status: "REVOKED", reason: null, decidedAt: new Date(NOW.getTime() - 90 * DAY), endedAt })
    )
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({
      standing: { state: "revoked", applyAgainAt: new Date(endedAt.getTime() + 30 * DAY) },
    })
  })

  it("names no one for an email-shaped name", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({ name: "sam@example.com" }))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ inviterName: null })
  })
})

describe("getInvitesPageData affiliate panel", () => {
  beforeEach(() => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", inviteOverride: null }))
  })

  it("shows the allowance from the stored hours, the free places and the next place back", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({ watchHours: 600 }))
    const joinedAt = new Date(NOW.getTime() - 20 * DAY)
    invites({ held: [buildInvite({ joinedAt })] })

    const data = await getInvitesPageData("user-1", NOW)

    expect(data.standing).toEqual({ state: "approved" })
    expect(data.affiliate).toMatchObject({ allowance: 3, free: 2, nextBackAt: new Date(joinedAt.getTime() + 30 * DAY), capReached: null })
    expect(prismaMock.invite.findMany).toHaveBeenCalledTimes(3)
  })

  it("is paused, with the panel, while paid", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({}, "ACTIVE"))
    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ standing: { state: "paused" }, affiliate: { allowance: 1 } })
  })

  it("reports the cap with when a join's place comes back", async () => {
    const joinedAt = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: 1 }))
    invites({ serverHeld: [buildInvite({ joinedAt, expiresAt: null })] })

    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({
      affiliate: { capReached: { backAt: new Date(joinedAt.getTime() + 30 * 24 * 60 * 60 * 1000) } },
    })
  })

  it("gives no cap date while only open invites hold the places", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: 1 }))
    invites({ serverHeld: [buildInvite({ joinedAt: null, expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000) })] })

    await expect(getInvitesPageData("user-1", NOW)).resolves.toMatchObject({ affiliate: { capReached: { backAt: null } } })
  })

  it("lists the open invites and the joins, never saying why someone left", async () => {
    const expiresAt = new Date(NOW.getTime() + DAY)
    const joinedAt = new Date(NOW.getTime() - 3 * DAY)
    invites({
      open: [{ id: "open-1", code: "ABCD2345", label: "Ana", expiresAt }],
      joined: [
        { id: "j-1", joinedAt, joinedUser: { name: " Ana ", disabledAt: null, accessEndedAt: null } },
        { id: "j-2", joinedAt, joinedUser: { name: "Bo", disabledAt: NOW, accessEndedAt: null } },
        { id: "j-3", joinedAt, joinedUser: { name: "Cy", disabledAt: null, accessEndedAt: NOW } },
        { id: "j-4", joinedAt, joinedUser: null },
      ],
    })

    const data = await getInvitesPageData("user-1", NOW)

    expect(data.affiliate?.open).toEqual([{ id: "open-1", code: "ABCD2345", label: "Ana", expiresAt }])
    expect(data.affiliate?.joined).toEqual([
      { id: "j-1", joinedAt, name: "Ana", status: "active" },
      { id: "j-2", joinedAt, name: "Bo", status: "left" },
      { id: "j-3", joinedAt, name: "Cy", status: "left" },
      { id: "j-4", joinedAt, name: null, status: "removed" },
    ])
  })
})

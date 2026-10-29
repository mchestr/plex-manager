/**
 * `makeAffiliateInvite` and `cancelOwnAffiliateInvite` with a mocked client:
 * the live checks first, then each re-check inside the transaction, the
 * invite it creates, and the retries on a taken code and a conflict. The
 * concurrency itself is covered on Postgres (`member-invites.pg.test.ts`).
 */

import { mockReset } from "jest-mock-extended"

import { buildAffiliateApplication, buildConfig, buildInvite, buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { cancelOwnAffiliateInvite, makeAffiliateInvite } from "@/lib/affiliates/member-invites"
import { readAffiliateSettings } from "@/lib/affiliates/settings"
import { readWatchHours } from "@/lib/affiliates/watch-hours"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActiveService } from "@/lib/data/active-service"
import { inSerializable } from "@/lib/db/serializable"
import { Prisma, type Subscription, type User } from "@/lib/generated/prisma/client"
import { generateInviteCode } from "@/lib/invites/code"
import type { PrismaTransactionClient } from "@/lib/prisma"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/affiliates/settings", () => ({ readAffiliateSettings: jest.fn() }))
jest.mock("@/lib/affiliates/watch-hours", () => ({ readWatchHours: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ checkUserServerAccess: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))
jest.mock("@/lib/invites/code", () => ({ generateInviteCode: jest.fn() }))
jest.mock("@/lib/db/serializable", () => ({
  ...jest.requireActual("@/lib/db/serializable"),
  inSerializable: jest.fn(),
}))

const NOW = new Date("2026-10-29T12:00:00Z")
const HOUR = 60 * 60 * 1000

const conflict = (code: string, meta: Record<string, unknown> = {}) =>
  new Prisma.PrismaClientKnownRequestError("conflict", { code, clientVersion: "7", meta })

const affiliate = (status?: Subscription["status"], overrides: Partial<User> = {}) =>
  ({ ...buildUser({ plexUserId: "42", ...overrides }), subscription: status ? { status } : null }) as User

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW, doNotFake: ["nextTick", "setImmediate"] })
  jest.mocked(inSerializable).mockImplementation((fn) => fn(prismaMock as unknown as PrismaTransactionClient))
  jest.mocked(readWatchHours).mockResolvedValue({ ok: true, allTime: 120, last30Days: 10 })
  jest.mocked(getActiveService).mockResolvedValue(buildPlexServer())
  jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "granted" })
  jest.mocked(readAffiliateSettings).mockResolvedValue({ on: true, librarySectionIds: [1, 3] })
  jest.mocked(generateInviteCode).mockReturnValue("ABCD2345")
  prismaMock.user.findUnique.mockResolvedValue(affiliate())
  prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", inviteOverride: null }))
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: null }))
  prismaMock.invite.findMany.mockResolvedValue([])
  prismaMock.invite.create.mockResolvedValue(buildInvite({ id: "inv-1", code: "ABCD2345" }))
})

afterEach(() => jest.useRealTimers())

const make = () => makeAffiliateInvite("user-1", "For Ana")

describe("makeAffiliateInvite", () => {
  it("creates a single-use 48-hour invite with the switch's libraries and the label", async () => {
    await expect(make()).resolves.toEqual({ ok: true, invite: { id: "inv-1", code: "ABCD2345", expiresAt: new Date(NOW.getTime() + 48 * HOUR) } })
    expect(prismaMock.invite.create).toHaveBeenCalledWith({
      data: {
        code: "ABCD2345",
        kind: "AFFILIATE",
        affiliateUserId: "user-1",
        label: "For Ana",
        maxUses: 1,
        expiresAt: new Date(NOW.getTime() + 48 * HOUR),
        librarySectionIds: "[1,3]",
        allowDownloads: false,
      },
      select: { id: true, code: true },
    })
  })

  it("refuses when Tautulli does not answer, before anything else", async () => {
    jest.mocked(readWatchHours).mockResolvedValue({ ok: false, code: "UNAVAILABLE" })
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code: "HOURS_UNAVAILABLE" } })
    expect(checkUserServerAccess).not.toHaveBeenCalled()
    expect(inSerializable).not.toHaveBeenCalled()
  })

  it.each([
    ["Plex does not answer", { status: "unknown", reason: "plex_unavailable" } as const, "PLEX_UNAVAILABLE"],
    ["the member lost their share", { status: "denied" } as const, "NO_ACCESS"],
  ])("refuses when %s", async (_label, share, code) => {
    jest.mocked(checkUserServerAccess).mockResolvedValue(share)
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code } })
    expect(inSerializable).not.toHaveBeenCalled()
  })

  it("refuses without an active server or a Plex id", async () => {
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(make()).resolves.toMatchObject({ refusal: { code: "PLEX_UNAVAILABLE" } })
    jest.mocked(readWatchHours).mockResolvedValue({ ok: false, code: "NO_PLEX_ID" })
    await expect(make()).resolves.toMatchObject({ refusal: { code: "NO_ACCESS" } })
  })

  it("refuses an account whose Plex id is gone since the hours were read", async () => {
    prismaMock.user.findUnique.mockResolvedValue(affiliate(undefined, { plexUserId: null }))
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code: "NO_ACCESS" } })
    expect(checkUserServerAccess).not.toHaveBeenCalled()
  })

  it("applies no cap without a config row", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    await expect(make()).resolves.toMatchObject({ ok: true })
    expect(prismaMock.invite.findMany).toHaveBeenCalledTimes(1)
  })

  it("re-checks the switch, the approval, the account and the subscription inside the transaction", async () => {
    jest.mocked(readAffiliateSettings).mockResolvedValueOnce({ on: false, librarySectionIds: [] })
    await expect(make()).resolves.toMatchObject({ refusal: { code: "SWITCH_OFF" } })

    prismaMock.affiliateApplication.findUnique.mockResolvedValueOnce(buildAffiliateApplication({ status: "PENDING" }))
    await expect(make()).resolves.toMatchObject({ refusal: { code: "NOT_AFFILIATE" } })

    prismaMock.user.findUnique.mockResolvedValueOnce(affiliate()).mockResolvedValueOnce(affiliate(undefined, { disabledAt: NOW }))
    await expect(make()).resolves.toMatchObject({ refusal: { code: "NO_ACCESS" } })

    prismaMock.user.findUnique.mockResolvedValueOnce(affiliate()).mockResolvedValueOnce(affiliate("PAST_DUE"))
    await expect(make()).resolves.toMatchObject({ refusal: { code: "PAUSED" } })
    expect(prismaMock.invite.create).not.toHaveBeenCalled()
  })

  it("refuses with no free place, naming when one comes back", async () => {
    const joinedAt = new Date("2026-10-20T12:00:00Z")
    prismaMock.invite.findMany.mockResolvedValue([buildInvite({ joinedAt })])
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code: "NO_PLACES", backAt: new Date("2026-11-19T12:00:00Z") } })
  })

  it("uses the override in place of the tier", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication({ status: "APPROVED", inviteOverride: 0 }))
    await expect(make()).resolves.toMatchObject({ refusal: { code: "NO_PLACES", backAt: null } })
  })

  it("counts every affiliate's held invites against the cap", async () => {
    const expiresAt = new Date(NOW.getTime() + 5 * HOUR)
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: 1 }))
    prismaMock.invite.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([buildInvite({ joinedAt: null, expiresAt })])
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code: "CAP", backAt: expiresAt } })
    expect(prismaMock.invite.findMany.mock.calls[1]?.[0]?.where).not.toHaveProperty("affiliateUserId")
  })

  it("makes the invite while the server is under its cap", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: 5 }))
    prismaMock.invite.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([buildInvite({ joinedAt: NOW })])
    await expect(make()).resolves.toMatchObject({ ok: true })
  })

  it("makes no affiliate invite under a cap of 0", async () => {
    prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null, affiliateServerCap: 0 }))
    await expect(make()).resolves.toMatchObject({ refusal: { code: "CAP" } })
  })

  it("retries with a new code when the code is taken", async () => {
    jest.mocked(generateInviteCode).mockReturnValueOnce("TAKEN234").mockReturnValueOnce("FRESH234")
    prismaMock.invite.create.mockRejectedValueOnce(conflict("P2002", { target: ["code"] }))
    await expect(make()).resolves.toMatchObject({ ok: true })
    expect(prismaMock.invite.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.invite.create.mock.calls[1]?.[0].data.code).toBe("FRESH234")
  })

  it("gives up on a taken code after three tries, and on another unique conflict at once", async () => {
    prismaMock.invite.create.mockRejectedValue(conflict("P2002", { target: ["code"] }))
    await expect(make()).rejects.toThrow("conflict")
    expect(prismaMock.invite.create).toHaveBeenCalledTimes(3)

    prismaMock.invite.create.mockReset()
    prismaMock.invite.create.mockRejectedValue(conflict("P2002", { target: ["joinedUserId"] }))
    await expect(make()).rejects.toThrow("conflict")
    expect(prismaMock.invite.create).toHaveBeenCalledTimes(1)
  })

  it("refuses as busy when the conflicts outlast the retries", async () => {
    jest.mocked(inSerializable).mockRejectedValue(conflict("P2034"))
    await expect(make()).resolves.toEqual({ ok: false, refusal: { code: "BUSY" } })
  })
})

describe("cancelOwnAffiliateInvite", () => {
  it("cancels only the affiliate's own unused, open invite, in one statement", async () => {
    prismaMock.invite.updateMany.mockResolvedValue({ count: 1 })
    await expect(cancelOwnAffiliateInvite("user-1", "inv-1")).resolves.toBe(true)
    expect(prismaMock.invite.updateMany).toHaveBeenCalledWith({
      where: { id: "inv-1", affiliateUserId: "user-1", kind: "AFFILIATE", useCount: 0, joinedAt: null, cancelledAt: null },
      data: { cancelledAt: NOW, label: null },
    })
  })

  it("is false when nothing matched", async () => {
    prismaMock.invite.updateMany.mockResolvedValue({ count: 0 })
    await expect(cancelOwnAffiliateInvite("user-1", "inv-1")).resolves.toBe(false)
  })
})

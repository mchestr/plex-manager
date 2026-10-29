/** `checkAffiliateEligibility`: every check, in order, and the approval's skips. */

import { mockReset } from "jest-mock-extended"

import { buildAffiliateApplication, buildConfig, buildPlexServer, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getAccessLevel } from "@/lib/access"
import { checkAffiliateEligibility } from "@/lib/affiliates/eligibility"
import { readAffiliateSettings } from "@/lib/affiliates/settings"
import { readWatchHours } from "@/lib/affiliates/watch-hours"
import { checkUserServerAccess } from "@/lib/connections/plex"
import { getActiveService } from "@/lib/data/active-service"
import type { Subscription, User } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/access", () => ({ getAccessLevel: jest.fn() }))
jest.mock("@/lib/affiliates/settings", () => ({ readAffiliateSettings: jest.fn() }))
jest.mock("@/lib/affiliates/watch-hours", () => ({ readWatchHours: jest.fn() }))
jest.mock("@/lib/connections/plex", () => ({ checkUserServerAccess: jest.fn() }))
jest.mock("@/lib/data/active-service", () => ({ getActiveService: jest.fn() }))

const member = (overrides: Partial<User> = {}, status?: Subscription["status"]) =>
  ({ ...buildUser({ plexUserId: "42", ...overrides }), subscription: status ? { status } : null }) as User

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(readAffiliateSettings).mockResolvedValue({ on: true, librarySectionIds: [1] })
  prismaMock.user.findUnique.mockResolvedValue(member())
  jest.mocked(getAccessLevel).mockResolvedValue("full")
  jest.mocked(getActiveService).mockResolvedValue(buildPlexServer())
  jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "granted" })
  jest.mocked(readWatchHours).mockResolvedValue({ ok: true, allTime: 120, last30Days: 10 })
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ affiliateTiers: null }))
  prismaMock.affiliateApplication.findUnique.mockResolvedValue(null)
  prismaMock.affiliateApplication.findFirst.mockResolvedValue(null)
})

const apply = () => checkAffiliateEligibility("user-1", { approving: false })
const approve = () => checkAffiliateEligibility("user-1", { approving: true })

describe("checkAffiliateEligibility", () => {
  it("passes an eligible member with their live hours", async () => {
    await expect(apply()).resolves.toEqual({ ok: true, paid: false, hours: 120 })
  })

  it("passes a paid member, marked paid (they are paused, not refused)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({}, "PAST_DUE"))
    await expect(approve()).resolves.toEqual({ ok: true, paid: true, hours: 120 })
    prismaMock.user.findUnique.mockResolvedValue(member({}, "CANCELED"))
    await expect(approve()).resolves.toMatchObject({ ok: true, paid: false })
  })

  it("refuses while the switch is off, except for an approval", async () => {
    jest.mocked(readAffiliateSettings).mockResolvedValue({ on: false, librarySectionIds: [] })
    await expect(apply()).resolves.toMatchObject({ ok: false, code: "SWITCH_OFF" })
    await expect(approve()).resolves.toMatchObject({ ok: true })
  })

  it("refuses a Jellyfin-only member and a disabled one", async () => {
    prismaMock.user.findUnique.mockResolvedValue(member({ plexUserId: null }))
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "NO_PLEX_ID", message: "This member has no Plex account." })
    prismaMock.user.findUnique.mockResolvedValue(member({ disabledAt: new Date() }))
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "DISABLED" })
  })

  it("refuses without full access or a current share, and fails closed when Plex does not answer", async () => {
    jest.mocked(getAccessLevel).mockResolvedValue("lapsed")
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "NO_ACCESS" })
    jest.mocked(getAccessLevel).mockResolvedValue("full")

    jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "denied" })
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "NO_ACCESS" })
    jest.mocked(checkUserServerAccess).mockResolvedValue({ status: "unknown", reason: "plex_unavailable" })
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "PLEX_UNAVAILABLE" })
    jest.mocked(getActiveService).mockResolvedValue(null)
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "PLEX_UNAVAILABLE" })
  })

  it("refuses at or under the first tier's hours, and when Tautulli does not answer", async () => {
    jest.mocked(readWatchHours).mockResolvedValue({ ok: true, allTime: 50, last30Days: 0 })
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "UNDER_BAR" })
    jest.mocked(readWatchHours).mockResolvedValue({ ok: false, code: "UNAVAILABLE" })
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "HOURS_UNAVAILABLE" })
    jest.mocked(readWatchHours).mockResolvedValue({ ok: false, code: "NO_PLEX_ID" })
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "NO_PLEX_ID" })
  })

  it("refuses a second open application, except for the approval of that one", async () => {
    prismaMock.affiliateApplication.findUnique.mockResolvedValue(buildAffiliateApplication())
    await expect(apply()).resolves.toMatchObject({ ok: false, code: "OPEN_APPLICATION" })
    await expect(approve()).resolves.toMatchObject({ ok: true })
  })

  it("refuses within 30 days of a refusal or a revoke", async () => {
    prismaMock.affiliateApplication.findFirst.mockResolvedValue(buildAffiliateApplication({ status: "REFUSED" }))
    await expect(approve()).resolves.toMatchObject({ ok: false, code: "WAIT" })
    const where = prismaMock.affiliateApplication.findFirst.mock.calls[0]![0]!.where
    expect(where).toEqual({
      userId: "user-1",
      OR: [
        { status: "REFUSED", decidedAt: { gt: expect.any(Date) } },
        { status: "REVOKED", endedAt: { gt: expect.any(Date) } },
      ],
    })
  })
})

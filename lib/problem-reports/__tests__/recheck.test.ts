/**
 * What a swap's, a removal's and a member's match fix's gates check again in
 * their transaction: a member's swap against the mode it was claimed under
 * and the limits, a member's match fix against the mode alone, and an
 * admin's tap against its 15 minutes and the admin still being one.
 */

import { mockReset } from "jest-mock-extended"

import { asAppTransactionClient, prismaMock } from "@/__tests__/helpers/prisma-mock"
import { APPROVAL_MS, recheckRun } from "@/lib/problem-reports/recheck"
import { readSwapLedger } from "@/lib/problem-reports/swap-ledger"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/problem-reports/swap-ledger", () => ({ readSwapLedger: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const SETTINGS = { automatic: "ON", automaticSince: new Date("2026-11-01T00:00:00Z"), weeklySwaps: 3, titleCooldownDays: 14, dailySwapCap: 10, breakerTrippedAt: null }
const LEDGER = { memberSwaps: [], titleRecent: 0, titleTwoMonths: 0, serverToday: 0 }
const MEMBER_RUN = {
  id: "report-1:2",
  action: "SWAP" as const,
  trigger: "automatic" as const,
  reporterId: "member-1",
  actorUserId: "member-1",
  titleKey: "plex://movie/heat",
  claimedAt: NOW.getTime() - 60_000,
  dryRun: false,
}
const ADMIN_RUN = { ...MEMBER_RUN, trigger: "web" as const, actorUserId: "admin-1" }
const TX = asAppTransactionClient(prismaMock)

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(readSwapLedger).mockReset().mockResolvedValue(LEDGER)
  prismaMock.problemReportSettings.findUnique.mockResolvedValue(SETTINGS as never)
  prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: false, isAdmin: true } as never)
})

describe("a member's swap", () => {
  it("passes within every limit, and leaves its own row out of the title's count before its grab", async () => {
    await expect(recheckRun(TX, MEMBER_RUN, NOW, "record")).resolves.toBeNull()
    expect(readSwapLedger).toHaveBeenLastCalledWith(TX, { reporterId: "member-1", titleKey: "plex://movie/heat", cooldownDays: 14 }, NOW)

    await expect(recheckRun(TX, MEMBER_RUN, NOW, "replace")).resolves.toBeNull()
    expect(readSwapLedger).toHaveBeenLastCalledWith(TX, { reporterId: "member-1", titleKey: "plex://movie/heat", cooldownDays: 14, excludeId: "report-1:2" }, NOW)
  })

  it.each([
    ["automatic swaps were turned off", { automatic: "OFF" }, {}],
    ["the mode changed after the member asked", { automaticSince: new Date(NOW.getTime() - 1000) }, {}],
    ["it was claimed in Dry run and the mode is On", {}, { dryRun: true }],
    ["it was claimed before claims were timed", {}, { claimedAt: undefined }],
  ])("stops when %s, so changing the mode never runs a backlog", async (_label, settings, run) => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...SETTINGS, ...settings } as never)

    await expect(recheckRun(TX, { ...MEMBER_RUN, ...run }, NOW, "record")).resolves.toBe("AUTO_CHANGED")
    expect(readSwapLedger).not.toHaveBeenCalled()
  })

  it("runs a dry run claimed in Dry run", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...SETTINGS, automatic: "DRY_RUN" } as never)

    await expect(recheckRun(TX, { ...MEMBER_RUN, dryRun: true }, NOW, "record")).resolves.toBeNull()
  })

  it.each([
    ["the server reached today's swaps", { serverToday: 10 }, "PAUSED"],
    ["the title was swapped in its cooldown", { titleRecent: 1 }, "TITLE_RECENT"],
    ["the member is out of swaps", { memberSwaps: [NOW, NOW, NOW] }, "OUT_OF_SWAPS"],
  ])("is refused when %s", async (_label, ledger, reason) => {
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, ...ledger })

    await expect(recheckRun(TX, MEMBER_RUN, NOW, "replace")).resolves.toBe(reason)
  })

  it("waits for the server admin once the member's swaps need approval", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: true } as never)

    await expect(recheckRun(TX, MEMBER_RUN, NOW, "replace")).resolves.toBe("NEEDS_APPROVAL")
  })
})

describe("an admin's tap", () => {
  it("holds for 15 minutes from the tap to the gate, while they're an admin", async () => {
    await expect(recheckRun(TX, { ...ADMIN_RUN, claimedAt: NOW.getTime() - APPROVAL_MS }, NOW, "record")).resolves.toBeNull()
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { isAdmin: true } })
    expect(readSwapLedger).not.toHaveBeenCalled()
  })

  it("expires after 15 minutes, or without a claim time, but not between the search and the grab", async () => {
    const late = { ...ADMIN_RUN, claimedAt: NOW.getTime() - APPROVAL_MS - 1 }
    await expect(recheckRun(TX, late, NOW, "record")).resolves.toBe("APPROVAL_EXPIRED")
    await expect(recheckRun(TX, { ...ADMIN_RUN, claimedAt: undefined }, NOW, "record")).resolves.toBe("APPROVAL_EXPIRED")
    await expect(recheckRun(TX, late, NOW, "replace")).resolves.toBeNull()
  })

  it("stops once the admin who tapped isn't an admin, at either gate", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ isAdmin: false } as never)

    await expect(recheckRun(TX, ADMIN_RUN, NOW, "record")).resolves.toBe("NOT_ADMIN")
    await expect(recheckRun(TX, { ...ADMIN_RUN, trigger: "mcp", action: "REMOVE_AND_SEARCH" }, NOW, "replace")).resolves.toBe("NOT_ADMIN")
  })
})

describe("a member's fix of the Plex match", () => {
  const MATCH_RUN = { ...MEMBER_RUN, action: "FIX_MATCH" as const }

  it("runs while members' swaps are still On as it was claimed, with no swap limits or approval", async () => {
    jest.mocked(readSwapLedger).mockResolvedValue({ ...LEDGER, memberSwaps: [NOW, NOW, NOW], serverToday: 10 })
    prismaMock.user.findUnique.mockResolvedValue({ swapsNeedApproval: true } as never)

    await expect(recheckRun(TX, MATCH_RUN, NOW, "record")).resolves.toBeNull()
    expect(readSwapLedger).not.toHaveBeenCalled()
  })

  it.each([
    ["members' swaps were turned off", { automatic: "OFF" }, {}],
    ["they're in Dry run now", { automatic: "DRY_RUN" }, {}],
    ["the mode changed after the member asked", { automaticSince: new Date(NOW.getTime() - 1000) }, {}],
    ["it was claimed before claims were timed", {}, { claimedAt: undefined }],
  ])("stops when %s, so changing the mode never runs a backlog", async (_label, settings, run) => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ ...SETTINGS, ...settings } as never)

    await expect(recheckRun(TX, { ...MATCH_RUN, ...run }, NOW, "record")).resolves.toBe("AUTO_CHANGED")
  })
})

it("checks nothing for an admin's match or refresh, or a member's other fixes", async () => {
  await expect(recheckRun(TX, { ...MEMBER_RUN, action: "BETTER_COPY" }, NOW, "record")).resolves.toBeNull()
  await expect(recheckRun(TX, { ...ADMIN_RUN, action: "FIX_MATCH", claimedAt: undefined }, NOW, "record")).resolves.toBeNull()
  await expect(recheckRun(TX, { ...MEMBER_RUN, action: "REFRESH", claimedAt: undefined }, NOW, "record")).resolves.toBeNull()
  expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.problemReportSettings.findUnique).not.toHaveBeenCalled()
})

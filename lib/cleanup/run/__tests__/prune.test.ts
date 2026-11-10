/**
 * @jest-environment node
 */

/**
 * Retention (TS 2.7, 8.3 step 11): the newest 30 runs, outcomes by kind, ended
 * protections after 30 days, and the expiry of Keeps and exclusions with
 * `endedAt` = their end.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { pruneCleanup } from "@/lib/cleanup/run/prune"

const now = new Date("2026-11-08T03:30:00.000Z")
const DAY = 86_400_000
const before = (days: number) => new Date(now.getTime() - days * DAY)

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.cleanupRun.findMany.mockResolvedValue([])
  prismaMock.cleanupOutcome.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.cleanupProtection.findMany.mockResolvedValue([])
  prismaMock.cleanupProtection.deleteMany.mockResolvedValue({ count: 0 })
})

describe("pruneCleanup", () => {
  it("deletes the runs beyond the newest 30", async () => {
    prismaMock.cleanupRun.findMany.mockResolvedValue([{ id: "run-31" }, { id: "run-32" }] as never)
    prismaMock.cleanupRun.deleteMany.mockResolvedValue({ count: 2 })

    await expect(pruneCleanup(now)).resolves.toEqual(expect.objectContaining({ runs: 2 }))

    expect(prismaMock.cleanupRun.findMany).toHaveBeenCalledWith({ orderBy: { startedAt: "desc" }, skip: 30, select: { id: true } })
    expect(prismaMock.cleanupRun.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["run-31", "run-32"] } } })
  })

  it("deletes no run while 30 or fewer exist", async () => {
    await expect(pruneCleanup(now)).resolves.toEqual(expect.objectContaining({ runs: 0 }))
    expect(prismaMock.cleanupRun.deleteMany).not.toHaveBeenCalled()
  })

  it("keeps deleted and failed outcomes 365 days, rescued and released ones 90 days", async () => {
    prismaMock.cleanupOutcome.deleteMany.mockResolvedValue({ count: 7 })
    await expect(pruneCleanup(now)).resolves.toEqual(expect.objectContaining({ outcomes: 7 }))
    expect(prismaMock.cleanupOutcome.deleteMany).toHaveBeenCalledWith({
      where: { OR: [
        { kind: "deleted", actedAt: { lt: before(365) } },
        { kind: "failed", actedAt: { lt: before(365) } },
        { kind: "rescued", actedAt: { lt: before(90) } },
        { kind: "released", actedAt: { lt: before(90) } },
      ] },
    })
  })

  it("ends each Keep and exclusion whose end has passed, with endedAt = its own end, then deletes ended rows after 30 days", async () => {
    const keepEnd = new Date("2026-11-07T00:00:00.000Z")
    const exclusionEnd = new Date("2026-11-08T03:30:00.000Z")
    prismaMock.cleanupProtection.findMany.mockResolvedValue([
      { id: "keep-1", kind: "memberKeep", expiresAt: keepEnd },
      { id: "exclude-1", kind: "adminExclude", expiresAt: exclusionEnd },
    ] as never)
    prismaMock.cleanupProtection.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    prismaMock.cleanupProtection.deleteMany.mockResolvedValue({ count: 3 })

    await expect(pruneCleanup(now)).resolves.toEqual({ runs: 0, outcomes: 0, protections: 3, expired: 1 })

    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { kind: { in: ["memberKeep", "adminExclude"] }, status: "active", expiresAt: { lte: now } },
      select: { id: true, kind: true, expiresAt: true },
    })
    expect(prismaMock.cleanupProtection.updateMany.mock.calls.map(([args]) => args)).toEqual([
      { where: { id: "keep-1", status: "active" }, data: { status: "ended", endedBy: "expired", endedAt: keepEnd, endedByUserId: null, activeKey: null } },
      { where: { id: "exclude-1", status: "active" }, data: { status: "ended", endedBy: "expired", endedAt: exclusionEnd, endedByUserId: null, activeKey: null } },
    ])
    expect(prismaMock.cleanupProtection.deleteMany).toHaveBeenCalledWith({ where: { status: "ended", endedAt: { lt: before(30) } } })
  })

  it("prunes at the current time by default", async () => {
    await expect(pruneCleanup()).resolves.toEqual({ runs: 0, outcomes: 0, protections: 0, expired: 0 })
  })
})

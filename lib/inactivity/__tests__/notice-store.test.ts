/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Toronto") }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  failStalledNotices,
  pendingNoticeIds,
  readNotices,
  readRemovalGate,
  warningRules,
  writeNotices,
  type NoticeWrite,
} from "@/lib/inactivity/notice-store"
import type { InactivityMember } from "@/lib/inactivity/rules"

const NOW = new Date("2026-11-11T07:17:00.000Z")
const CYCLE = new Date("2026-05-02T00:00:00.000Z")
const DATE = new Date("2026-12-11T05:00:00.000Z")

const member = (id: string, lastSeenAt = CYCLE): InactivityMember => ({
  id,
  plexUserId: id,
  isAdmin: false,
  role: null,
  inactivityExcluded: false,
  subscriptionStatus: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  lastSeenAt,
  lastSeenReadAt: null,
  accessEndedAt: null,
  accessRestoredAt: null,
  timezone: null,
})

const write = (patch: Partial<NoticeWrite> = {}): NoticeWrite => ({
  userId: "u1",
  cycleAt: CYCLE,
  leadDays: 30,
  removeAfter: DATE,
  zone: "America/Toronto",
  reviveId: null,
  status: "pending",
  code: null,
  ...patch,
})

const stored = (id: string, userId: string, cycleAt = CYCLE) => ({
  id,
  userId,
  cycleAt,
  leadDays: 30,
  removeAfter: DATE,
  status: "pending",
  attempts: 0,
  zone: "America/Toronto",
  handledAt: null,
})

beforeEach(() => mockReset(prismaMock))

describe("readNotices", () => {
  it("reads every row of the members, ids, dates and codes only", async () => {
    prismaMock.inactivityNotice.findMany.mockResolvedValue([stored("n1", "u1")] as never)

    await expect(readNotices(["u1", "u2"])).resolves.toEqual([stored("n1", "u1")])
    expect(prismaMock.inactivityNotice.findMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1", "u2"] } },
      select: { id: true, userId: true, cycleAt: true, leadDays: true, removeAfter: true, status: true, attempts: true, zone: true, handledAt: true },
    })
  })

  it("reads nothing for no members", async () => {
    await expect(readNotices([])).resolves.toEqual([])
    expect(prismaMock.inactivityNotice.findMany).not.toHaveBeenCalled()
  })
})

describe("warningRules", () => {
  it("is null while warnings are off, and carries the server zone while on", async () => {
    await expect(warningRules({ warningsEnabled: false, warningDays: [30, 7, 1] })).resolves.toBeNull()
    await expect(warningRules({ warningsEnabled: true, warningDays: [30, 7, 1] })).resolves.toEqual({ warningDays: [30, 7, 1], serverZone: "America/Toronto" })
  })
})

describe("readRemovalGate", () => {
  it("reads the rows once and gates each member on their own", async () => {
    const now = new Date("2026-12-20T07:17:00.000Z")
    prismaMock.inactivityNotice.findMany.mockResolvedValue([{ ...stored("n1", "u1"), status: "sent", handledAt: new Date("2026-11-11T14:00:00.000Z"), removeAfter: new Date("2026-12-25T05:00:00.000Z") }] as never)

    const gate = await readRemovalGate([member("u1"), member("u2")], { thresholdDays: 180, now, newestPlayAt: now, warnings: null })

    expect(gate(member("u1"))).toBe("date")
    expect(gate(member("u2"))).toBeNull()
    expect(prismaMock.inactivityNotice.findMany).toHaveBeenCalledTimes(1)
  })
})

describe("failStalledNotices", () => {
  it("fails rows left sending for over an hour, code stalled", async () => {
    prismaMock.inactivityNotice.updateMany.mockResolvedValue({ count: 2 })

    await expect(failStalledNotices(NOW)).resolves.toBe(2)
    expect(prismaMock.inactivityNotice.updateMany).toHaveBeenCalledWith({
      where: { status: "sending", updatedAt: { lt: new Date(NOW.getTime() - 60 * 60 * 1000) } },
      data: { status: "failed", code: "stalled" },
    })
  })
})

describe("writeNotices", () => {
  it("inserts new rows with the run id, skipping duplicates of the unique key", async () => {
    prismaMock.inactivityNotice.createMany.mockResolvedValue({ count: 1 })

    await expect(writeNotices([write(), write({ userId: "u2", status: "skipped", code: "email_unconfirmed" })], { runId: "run-1", now: NOW })).resolves.toBe(1)
    expect(prismaMock.inactivityNotice.createMany).toHaveBeenCalledWith({
      data: [
        { userId: "u1", cycleAt: CYCLE, leadDays: 30, removeAfter: DATE, zone: "America/Toronto", runId: "run-1", status: "pending", code: null, handledAt: null },
        { userId: "u2", cycleAt: CYCLE, leadDays: 30, removeAfter: DATE, zone: "America/Toronto", runId: "run-1", status: "skipped", code: "email_unconfirmed", handledAt: NOW },
      ],
      skipDuplicates: true,
    })
    expect(prismaMock.inactivityNotice.updateMany).not.toHaveBeenCalled()
  })

  it("revives a cancelled row, or a failed one with attempts left, by compare-and-set", async () => {
    prismaMock.inactivityNotice.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    await expect(writeNotices([write({ reviveId: "n1" }), write({ reviveId: "n2", status: "skipped", code: "email_unconfirmed" })], { runId: "run-2", now: NOW })).resolves.toBe(1)
    expect(prismaMock.inactivityNotice.createMany).not.toHaveBeenCalled()
    expect(prismaMock.inactivityNotice.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: "n1", OR: [{ status: "cancelled" }, { status: "failed", attempts: { lt: 9 } }] },
      data: { runId: "run-2", status: "pending", code: null, handledAt: null },
    })
    expect(prismaMock.inactivityNotice.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "n2", OR: [{ status: "cancelled" }, { status: "failed", attempts: { lt: 9 } }] },
      data: { runId: "run-2", status: "skipped", code: "email_unconfirmed", handledAt: NOW },
    })
  })

  it("writes nothing for no plans", async () => {
    await expect(writeNotices([], { runId: "run-1", now: NOW })).resolves.toBe(0)
    expect(prismaMock.inactivityNotice.createMany).not.toHaveBeenCalled()
  })
})

describe("pendingNoticeIds", () => {
  it("returns the pending rows of the current cycles only", async () => {
    prismaMock.inactivityNotice.findMany.mockResolvedValue([
      stored("n1", "u1"),
      stored("n2", "u1", new Date("2025-06-01T00:00:00.000Z")),
      stored("n3", "u2", new Date("2026-10-01T00:00:00.000Z")),
    ] as never)

    await expect(pendingNoticeIds([member("u1"), member("u2", new Date("2026-10-01T00:00:00.000Z"))])).resolves.toEqual(["n1", "n3"])
    expect(prismaMock.inactivityNotice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: { in: ["u1", "u2"] }, status: "pending" } }))
  })

  it("reads nothing for no members", async () => {
    await expect(pendingNoticeIds([])).resolves.toEqual([])
    expect(prismaMock.inactivityNotice.findMany).not.toHaveBeenCalled()
  })
})

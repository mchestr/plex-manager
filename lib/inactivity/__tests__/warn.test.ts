/**
 * @jest-environment node
 */

const mockInfo = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: (...args: unknown[]) => mockInfo(...args), warn: jest.fn(), error: jest.fn() }),
}))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { InactivityMember } from "@/lib/inactivity/rules"
import { runWarningStep, type WarningStepOptions } from "@/lib/inactivity/warn"

const NOW = new Date("2026-11-11T07:17:00.000Z")
const DAY = 86_400_000
const TORONTO = "America/Toronto"

const member = (id: string, patch: Partial<InactivityMember> = {}): InactivityMember => ({
  id,
  plexUserId: ` ${id}-plex `,
  isAdmin: false,
  role: null,
  inactivityExcluded: false,
  subscriptionStatus: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  lastSeenAt: new Date(NOW.getTime() - 300 * DAY),
  lastSeenReadAt: NOW,
  accessEndedAt: null,
  accessRestoredAt: null,
  timezone: TORONTO,
  ...patch,
})

const enqueue = jest.fn<Promise<void>, [string[]]>()

const options = (patch: Partial<WarningStepOptions> = {}): WarningStepOptions => ({
  runId: "run-1",
  members: [member("u1"), member("u2"), member("recent", { lastSeenAt: new Date(NOW.getTime() - DAY) })],
  sharedMembers: 40,
  settings: { thresholdDays: 180 },
  warnings: { warningDays: [30, 7, 1], serverZone: TORONTO },
  now: NOW,
  newestPlayAt: new Date(NOW.getTime() - 3600_000),
  plexEmails: new Map([
    ["u1-plex", "u1@example.com"],
    ["u2-plex", "u2-new@example.com"],
  ]),
  enqueueNotices: enqueue,
  ...patch,
})

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  enqueue.mockResolvedValue(undefined)
  prismaMock.inactivityNotice.updateMany.mockResolvedValue({ count: 0 })
  prismaMock.inactivityNotice.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
    { id: "n1", userId: "u1", cycleAt: new Date(NOW.getTime() - 300 * DAY), leadDays: 30, removeAfter: new Date("2026-12-11T05:00:00Z"), status: "pending", attempts: 0, zone: TORONTO, handledAt: null },
  ] as never)
  prismaMock.inactivityNotice.createMany.mockResolvedValue({ count: 2 })
  prismaMock.user.findMany.mockResolvedValue([
    { id: "u1", email: "U1@example.com" },
    { id: "u2", email: "u2@example.com" },
  ] as never)
})

describe("runWarningStep", () => {
  it("plans first warnings, skips an address plex.tv does not confirm, and enqueues the pending rows", async () => {
    await expect(runWarningStep(options())).resolves.toBe(2)

    expect(prismaMock.inactivityNotice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "failed", code: "stalled" } }))
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { id: { in: ["u1", "u2"] } }, select: { id: true, email: true } })
    const data = prismaMock.inactivityNotice.createMany.mock.calls[0][0]?.data as { userId: string; status: string; code: string | null; leadDays: number }[]
    expect(data.map(({ userId, status, code, leadDays }) => ({ userId, status, code, leadDays }))).toEqual([
      { userId: "u1", status: "pending", code: null, leadDays: 30 },
      { userId: "u2", status: "skipped", code: "email_unconfirmed", leadDays: 30 },
    ])
    expect(enqueue).toHaveBeenCalledWith(["n1"])
    expect(mockInfo).toHaveBeenCalledWith("inactivity.warnings_planned", { runId: "run-1", warned: 2, pending: 1 })
  })

  it("reads no address and enqueues nothing when nothing is due", async () => {
    prismaMock.inactivityNotice.findMany.mockReset().mockResolvedValue([])

    await expect(runWarningStep(options({ members: [member("recent", { lastSeenAt: new Date(NOW.getTime() - DAY) })] }))).resolves.toBe(0)
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
    expect(prismaMock.inactivityNotice.createMany).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("does nothing when the run stopped before the step", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(runWarningStep(options({ signal: controller.signal }))).resolves.toBe(0)
    expect(prismaMock.inactivityNotice.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.inactivityNotice.findMany).not.toHaveBeenCalled()
  })

  it("writes nothing when the run stops while it plans", async () => {
    const controller = new AbortController()
    prismaMock.inactivityNotice.findMany.mockReset().mockImplementation((async () => {
      controller.abort()
      return []
    }) as never)

    await expect(runWarningStep(options({ signal: controller.signal }))).resolves.toBe(0)
    expect(prismaMock.inactivityNotice.createMany).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
  })

  it("checks a member with no Plex email against nothing, so a stored address is unconfirmed", async () => {
    await runWarningStep(options({ members: [member("u1")], plexEmails: new Map() }))

    const data = prismaMock.inactivityNotice.createMany.mock.calls[0][0]?.data as { status: string }[]
    expect(data.map((row) => row.status)).toEqual(["skipped"])
  })
})

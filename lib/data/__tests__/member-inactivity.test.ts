/**
 * @jest-environment node
 */

/**
 * `getMemberInactivityEmails`: the admin check before any read, the newest
 * warning in any cycle, the removal date of the open cycle only (handled
 * rows only while warnings are off, none after the grace while on), whether
 * one address is on file, and the member's own switch.
 */

import { mockReset } from "jest-mock-extended"

import { buildInactivitySettings, buildUser } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getMemberInactivityEmails } from "@/lib/data/member-inactivity"
import { readInactivityMember } from "@/lib/inactivity/members"
import type { InactivityMember } from "@/lib/inactivity/rules"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/inactivity/members", () => ({ readInactivityMember: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Toronto") }))

const LAST_SEEN = new Date("2026-05-02T00:00:00.000Z")
// Nov 10, 07:00 in Toronto: the next run is Nov 11 at 02:17
const NOW = new Date("2026-11-10T12:00:00.000Z")

const member: InactivityMember = {
  id: "u1",
  plexUserId: "42",
  isAdmin: false,
  role: null,
  inactivityExcluded: false,
  subscriptionStatus: null,
  createdAt: new Date("2025-01-01T00:00:00.000Z"),
  lastSeenAt: LAST_SEEN,
  lastSeenReadAt: null,
  accessEndedAt: null,
  accessRestoredAt: null,
  timezone: null,
}

const notice = (patch: Record<string, unknown>) => ({
  id: "n1",
  userId: "u1",
  cycleAt: LAST_SEEN,
  leadDays: 30,
  removeAfter: new Date("2026-11-20T05:00:00.000Z"),
  status: "sent",
  code: null,
  attempts: 1,
  zone: "America/Toronto",
  handledAt: new Date("2026-10-21T13:00:00.000Z"),
  updatedAt: new Date("2026-10-21T13:00:00.000Z"),
  ...patch,
})

beforeAll(() => jest.useFakeTimers({ now: NOW }))
afterAll(() => jest.useRealTimers())

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(assertAdmin).mockResolvedValue({ user: { id: "admin-1", isAdmin: true }, expires: "" } as never)
  jest.mocked(readInactivityMember).mockResolvedValue(member)
  prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "u1", email: "member@example.com", inactivityEmailsOff: false }))
  prismaMock.inactivityNotice.findMany.mockResolvedValue([])
  prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings())
})

describe("getMemberInactivityEmails", () => {
  it("refuses a member before reading anything", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(Object.assign(new Error("Admin access required"), { digest: "PM_FORBIDDEN" }))

    await expect(getMemberInactivityEmails("u1")).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(readInactivityMember).not.toHaveBeenCalled()
    expect(prismaMock.inactivityNotice.findMany).not.toHaveBeenCalled()
  })

  it("says None before the first warning, with an address on file and the reminders on", async () => {
    await expect(getMemberInactivityEmails("u1")).resolves.toEqual({ last: null, removalDay: null, emailOnFile: true, remindersOn: true })
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { email: true, inactivityEmailsOff: true } })
  })

  it("shows the newest warning and the removal date of the open cycle", async () => {
    prismaMock.inactivityNotice.findMany.mockResolvedValue([
      notice({ id: "n1" }),
      notice({ id: "n2", leadDays: 7, status: "pending", handledAt: null, updatedAt: new Date("2026-11-13T07:17:00.000Z") }),
    ] as never)

    await expect(getMemberInactivityEmails("u1")).resolves.toEqual({
      last: { leadDays: 7, lastWarning: false, status: "pending", code: null, at: new Date("2026-11-13T07:17:00.000Z") },
      removalDay: "2026-11-20",
      emailOnFile: true,
      remindersOn: true,
    })
  })

  it("shows no removal date while warnings are off and the cycle has only an unhandled warning", async () => {
    prismaMock.inactivityNotice.findMany.mockResolvedValue([notice({ status: "pending", handledAt: null })] as never)

    await expect(getMemberInactivityEmails("u1")).resolves.toMatchObject({ last: { status: "pending" }, removalDay: null })
  })

  it("with warnings on, shows the date of an unhandled warning, but none once the date is more than 7 days old", async () => {
    prismaMock.inactivitySettings.findUnique.mockResolvedValue(buildInactivitySettings({ warningsEnabled: true }))
    prismaMock.inactivityNotice.findMany.mockResolvedValue([notice({ status: "pending", handledAt: null })] as never)
    await expect(getMemberInactivityEmails("u1")).resolves.toMatchObject({ removalDay: "2026-11-20" })

    // Nov 3: the next run, on Nov 11, is 8 days later and starts the warnings again
    prismaMock.inactivityNotice.findMany.mockResolvedValue([notice({ removeAfter: new Date("2026-11-03T05:00:00.000Z") })] as never)
    await expect(getMemberInactivityEmails("u1")).resolves.toMatchObject({ last: { status: "sent" }, removalDay: null })
  })

  it("keeps the newest warning of a closed cycle, without a removal date", async () => {
    prismaMock.inactivityNotice.findMany.mockResolvedValue([notice({ cycleAt: new Date("2026-01-01T00:00:00.000Z"), status: "cancelled", code: "cycle_changed" })] as never)

    await expect(getMemberInactivityEmails("u1")).resolves.toMatchObject({
      last: { status: "cancelled", code: "cycle_changed" },
      removalDay: null,
    })
  })

  it.each([
    ["no address", null],
    ["two addresses", "a@example.com, b@example.com"],
  ])("says no address is on file for %s", async (_case, email) => {
    prismaMock.user.findUnique.mockResolvedValue(buildUser({ id: "u1", email, inactivityEmailsOff: true }))

    await expect(getMemberInactivityEmails("u1")).resolves.toMatchObject({ emailOnFile: false, remindersOn: false })
  })

  it("is null without the member or without a Plex account", async () => {
    jest.mocked(readInactivityMember).mockResolvedValueOnce(null)
    await expect(getMemberInactivityEmails("u1")).resolves.toBeNull()

    jest.mocked(readInactivityMember).mockResolvedValueOnce({ ...member, plexUserId: null })
    await expect(getMemberInactivityEmails("u1")).resolves.toBeNull()

    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    await expect(getMemberInactivityEmails("u1")).resolves.toBeNull()
  })
})

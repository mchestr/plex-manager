/**
 * @jest-environment node
 */

/**
 * The admin Problem reports loaders: admin only, each filter's statuses and
 * order, the reporter counts, the detail page's timeline and Plex link, the
 * settings card, and the audited reads (the list once per filter, the detail
 * once per member whose words it shows).
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { assertAdmin } from "@/lib/admin"
import { getActivePlexServerConfig } from "@/lib/connections/plex-config"
import { getProblemBreaker, getProblemReport, getProblemReportSettingsView, listProblemReports } from "@/lib/data/problem-reports"
import { auditMemberListed, auditMemberRead } from "@/lib/security/audit-log"

jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({
  AuditEventType: jest.requireActual("@/lib/security/audit-log").AuditEventType,
  auditMemberListed: jest.fn(),
  auditMemberRead: jest.fn(),
}))
jest.mock("@/lib/connections/plex-config", () => ({ getActivePlexServerConfig: jest.fn() }))

const AT = new Date("2026-11-08T20:00:00.000Z")
const PAGE = { page: 1, pageSize: 25 }
const JANE = { id: "member-1", name: "Jane", email: "jane@example.com" }
const SAM = { id: "member-2", name: null, email: "sam@example.com" }
const ROW = {
  id: "report-1",
  problem: "wont_start",
  status: "WITH_ADMIN",
  title: "Heat",
  year: 1995,
  showTitle: null,
  seasonNumber: null,
  episodeNumber: null,
  createdAt: AT,
  updatedAt: AT,
  reporterId: JANE.id,
  reporter: JANE,
  events: [{ actorUserId: SAM.id }, { actorUserId: SAM.id }, { actorUserId: null }],
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(assertAdmin).mockReset().mockResolvedValue({ user: { id: "admin-1" } } as never)
  jest.mocked(auditMemberListed).mockReset().mockResolvedValue(undefined)
  jest.mocked(auditMemberRead).mockReset().mockResolvedValue(undefined)
  ;(prismaMock.problemReport.groupBy as jest.Mock).mockResolvedValue([
    { status: "WITH_ADMIN", _count: { _all: 2 } },
    { status: "FIXING", _count: { _all: 1 } },
  ])
})

describe("listProblemReports", () => {
  it("lists the reports with the server admin, oldest first, with how many others reported each", async () => {
    prismaMock.problemReport.findMany.mockResolvedValue([ROW] as never)

    const list = await listProblemReports("needs-you", PAGE)

    expect(list).toEqual({
      rows: [{ id: "report-1", title: "Heat (1995)", problem: "Won't start", reporter: { id: JANE.id, name: "Jane" }, others: 1, status: "WITH_ADMIN", createdAt: AT, updatedAt: AT }],
      counts: { "needs-you": 2, fixing: 1, fixed: 0, closed: 0 },
      total: 2,
    })
    expect(prismaMock.problemReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["WITH_ADMIN"] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 0, take: 25 })
    )
    expect(auditMemberListed).toHaveBeenCalledWith("problem-reports", "admin-1", { status: "needs-you" })
  })

  it("pages through fixed reports newest first", async () => {
    prismaMock.problemReport.findMany.mockResolvedValue([])

    await listProblemReports("fixed", { page: 3, pageSize: 50 })

    expect(prismaMock.problemReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["FIXED"] } }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: 100, take: 50 })
    )
  })

  it("names a member without a name by their email", async () => {
    prismaMock.problemReport.findMany.mockResolvedValue([{ ...ROW, reporterId: SAM.id, reporter: SAM, events: [] }] as never)

    expect((await listProblemReports("needs-you", PAGE)).rows[0].reporter).toEqual({ id: SAM.id, name: "sam@example.com" })
  })

  it("is for admins only", async () => {
    jest.mocked(assertAdmin).mockRejectedValue(new Error("PM_FORBIDDEN"))

    await expect(listProblemReports("needs-you", PAGE)).rejects.toThrow("PM_FORBIDDEN")
    expect(prismaMock.problemReport.findMany).not.toHaveBeenCalled()
  })
})

describe("getProblemReport", () => {
  const DETAIL = {
    ...ROW,
    mediaType: "MOVIE",
    plexRatingKey: "555",
    note: null,
    memberNote: null,
    adminNote: null,
    resolvedAt: null,
    activeKey: "plex://movie/heat",
    events: [
      { id: "e1", kind: "REPORTED", data: { problem: "wont_start" }, createdAt: AT, actor: JANE },
      { id: "e2", kind: "ALSO_REPORTED", data: { problem: "stops", note: "At 40 minutes" }, createdAt: AT, actor: SAM },
      { id: "e3", kind: "ALSO_REPORTED", data: {}, createdAt: AT, actor: { id: "admin-1", name: "Dana", email: null } },
    ],
  }

  it("reads the report with its timeline and its Plex link, and audits each member whose words it shows", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue(DETAIL as never)
    jest.mocked(getActivePlexServerConfig).mockResolvedValue({ machineIdentifier: "abc123" } as never)

    const report = await getProblemReport("report-1")

    expect(report).toMatchObject({
      id: "report-1",
      title: "Heat (1995)",
      problem: "Won't start",
      status: "WITH_ADMIN",
      open: true,
      reporter: { id: JANE.id, name: "Jane" },
      plexHref: "https://app.plex.tv/desktop/#!/server/abc123/details?key=%2Flibrary%2Fmetadata%2F555",
    })
    expect(report?.steps.map((step) => step.words)).toEqual(["Reported: Won't start", "Also reported: Stops or freezes partway", "Following"])
    expect(report?.steps[1].actor).toEqual({ id: SAM.id, name: "sam@example.com" })
    expect(auditMemberRead).toHaveBeenCalledTimes(2)
    expect(auditMemberRead).toHaveBeenCalledWith("problem-reports", JANE.id, "admin-1")
    expect(auditMemberRead).toHaveBeenCalledWith("problem-reports", SAM.id, "admin-1")
  })

  it("is null for a report that doesn't exist, with no Plex link without a server", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...DETAIL, activeKey: null, status: "CLOSED" } as never)
    jest.mocked(getActivePlexServerConfig).mockResolvedValue(null)

    expect(await getProblemReport("missing")).toBeNull()
    expect(await getProblemReport("report-1")).toMatchObject({ open: false, plexHref: null, fixes: null, running: null })
  })

  it("offers the fixes for the title, the problem's own first, and says what a running fix is doing", async () => {
    prismaMock.problemReport.findUnique
      .mockResolvedValueOnce({ ...DETAIL, problem: "missing_episodes", mediaType: "TV_SERIES" } as never)
      .mockResolvedValueOnce({ ...DETAIL } as never)
      .mockResolvedValueOnce({ ...DETAIL, problem: "blurry" } as never)
      .mockResolvedValueOnce({ ...DETAIL, status: "FIXING", action: "LOOK_FOR_MISSING" } as never)
      .mockResolvedValueOnce({ ...DETAIL, status: "FIXING", action: "BETTER_COPY" } as never)

    expect(await getProblemReport("report-1")).toMatchObject({ fixes: { suggested: "LOOK_FOR_MISSING", others: ["REFRESH"] }, running: null })
    expect(await getProblemReport("report-1")).toMatchObject({ fixes: { suggested: null, others: ["BETTER_COPY", "REFRESH"] } })
    expect(await getProblemReport("report-1")).toMatchObject({ fixes: { suggested: "BETTER_COPY", others: ["REFRESH"] } })
    expect(await getProblemReport("report-1")).toMatchObject({ fixes: null, running: "Looking for the episodes" })
    expect(await getProblemReport("report-1")).toMatchObject({ fixes: null, running: "Looking for a better copy" })
  })

  it("words a fix's steps on the timeline", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({
      ...DETAIL,
      events: [
        { id: "e1", kind: "FIX_STARTED", data: { action: "LOOK_FOR_MISSING", trigger: "automatic" }, createdAt: AT, actor: JANE },
        { id: "e2", kind: "TO_ADMIN", data: { reason: "NOT_FOUND", action: "LOOK_FOR_MISSING" }, createdAt: AT, actor: null },
        { id: "e3", kind: "FIX_STARTED", data: { action: "REFRESH", trigger: "mcp" }, createdAt: AT, actor: null },
        { id: "e4", kind: "FIXED", data: { reason: "fix", action: "LOOK_FOR_MISSING" }, createdAt: AT, actor: null },
        { id: "e5", kind: "TO_ADMIN", data: { reason: "made up" }, createdAt: AT, actor: null },
      ],
    } as never)

    expect((await getProblemReport("report-1"))?.steps.map((step) => step.words)).toEqual([
      "Started looking for the episodes for the member",
      "Sonarr didn't find the episodes within a day",
      "Asked Plex to refresh the details over MCP",
      "Fixed: the missing episodes are on the server",
      "Sent to the server admin",
    ])
  })
})

describe("getProblemBreaker", () => {
  it("is when the breaker tripped, or null", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValueOnce({ breakerTrippedAt: AT } as never).mockResolvedValueOnce(null)

    expect(await getProblemBreaker()).toEqual(AT)
    expect(await getProblemBreaker()).toBeNull()
    expect(assertAdmin).toHaveBeenCalled()
  })
})

describe("getProblemReportSettingsView", () => {
  it("reads the switch and the newest audited save", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ id: "problem-reports", breakerTrippedAt: null, enabled: true, updatedAt: AT, updatedBy: "admin-1" })
    prismaMock.auditLog.findFirst.mockResolvedValue({ id: "audit-1", actorUserId: "admin-1", createdAt: AT } as never)
    prismaMock.user.findUnique.mockResolvedValue({ name: "Dana", email: null } as never)

    expect(await getProblemReportSettingsView()).toEqual({ enabled: true, lastSaved: { at: AT, by: "Dana", eventId: "audit-1" } })
    expect(prismaMock.auditLog.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { type: "PROBLEM_REPORT_SETTINGS_CHANGED" } }))
  })

  it("is off, never saved, without a row", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue(null)
    prismaMock.auditLog.findFirst.mockResolvedValue(null)

    expect(await getProblemReportSettingsView()).toEqual({ enabled: false, lastSaved: null })
  })
})

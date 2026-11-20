/**
 * The ledger gate: a run's own row makes a repeat a no-op, the daily search
 * cap refuses, a tripped breaker is recorded, and a run that may act gets
 * its row and its PROBLEM_FIX_RUN audit row in the same transaction.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { endLedgerRow, gateAndRecord, ledgerId } from "@/lib/problem-reports/ledger"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/db/serializable", () => ({
  inSerializable: (fn: (tx: unknown) => Promise<unknown>) => fn(require("@/__tests__/helpers/prisma-mock").prismaMock),
}))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))

const NOW = new Date("2026-11-09T20:00:00Z")
const RUN = {
  reportId: "report-1",
  runToken: 2,
  reporterId: "member-1",
  actorUserId: "member-1",
  trigger: "automatic" as const,
  target: "sonarr:series:42",
  action: "LOOK_FOR_MISSING" as const,
  traits: { searches: true, replacesFile: false },
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.problemFixLedger.findUnique.mockResolvedValue(null)
  prismaMock.problemReportSettings.findUnique.mockResolvedValue({ breakerTrippedAt: null } as never)
  prismaMock.problemFixLedger.count.mockResolvedValue(0)
})

describe("gateAndRecord", () => {
  it("records the run and its audit row, then lets it act", async () => {
    await expect(gateAndRecord(RUN, NOW)).resolves.toBeNull()

    expect(prismaMock.problemFixLedger.count).toHaveBeenCalledWith({
      where: { action: { in: ["LOOK_FOR_MISSING"] }, startedAt: { gte: new Date("2026-11-08T20:00:00Z") } },
    })
    expect(prismaMock.problemFixLedger.create).toHaveBeenCalledWith({
      data: {
        id: "report-1:2",
        target: "sonarr:series:42",
        action: "LOOK_FOR_MISSING",
        trigger: "automatic",
        reporterId: "member-1",
        actorUserId: "member-1",
        reportId: "report-1",
        startedAt: NOW,
      },
    })
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.PROBLEM_FIX_RUN,
      "member-1",
      { targetUserId: "member-1", reportId: "report-1", action: "LOOK_FOR_MISSING", trigger: "automatic", askedBy: "member-1", approvedBy: null, dryRun: false },
      prismaMock
    )
  })

  it("names the admin who approved a run they started", async () => {
    await gateAndRecord({ ...RUN, trigger: "web", actorUserId: "admin-1", action: "REFRESH", traits: { searches: false, replacesFile: false } }, NOW)

    expect(recordAuditEvent).toHaveBeenCalledWith(AuditEventType.PROBLEM_FIX_RUN, "admin-1", expect.objectContaining({ askedBy: "admin-1", approvedBy: "admin-1", trigger: "web" }), prismaMock)
  })

  it("does nothing for a run whose row is there already", async () => {
    prismaMock.problemFixLedger.findUnique.mockResolvedValue({ id: "report-1:2" } as never)

    await expect(gateAndRecord(RUN, NOW)).resolves.toBe("ALREADY_RAN")
    expect(prismaMock.problemFixLedger.create).not.toHaveBeenCalled()
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it("refuses a search past the day's cap, without a row", async () => {
    prismaMock.problemFixLedger.count.mockResolvedValue(30)

    await expect(gateAndRecord(RUN, NOW)).resolves.toBe("SEARCH_CAP")
    expect(prismaMock.problemFixLedger.create).not.toHaveBeenCalled()
  })

  it("refuses a file replacement while the breaker is tripped", async () => {
    prismaMock.problemReportSettings.findUnique.mockResolvedValue({ breakerTrippedAt: NOW } as never)

    await expect(gateAndRecord({ ...RUN, traits: { searches: false, replacesFile: true } }, NOW)).resolves.toBe("BREAKER")
    expect(prismaMock.problemReportSettings.upsert).not.toHaveBeenCalled()
  })
})

describe("the ledger row", () => {
  it("is named for the report and the run", () => {
    expect(ledgerId("report-1", 3)).toBe("report-1:3")
  })

  it("ends with the outcome, once", async () => {
    await endLedgerRow("report-1", 2, "FIXED", NOW)

    expect(prismaMock.problemFixLedger.updateMany).toHaveBeenCalledWith({ where: { id: "report-1:2", endedAt: null }, data: { outcome: "FIXED", endedAt: NOW } })
  })
})

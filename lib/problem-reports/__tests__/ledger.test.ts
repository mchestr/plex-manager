/**
 * The ledger gate: a run's own row makes a repeat a no-op, the daily search
 * cap refuses, a tripped breaker is recorded, and a run that may act gets
 * its row and its PROBLEM_FIX_RUN audit row in the same transaction.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { queueBreakerAlert } from "@/lib/problem-reports/breaker-alert"
import { endLedgerRow, gateAndRecord, gateReplace, ledgerId } from "@/lib/problem-reports/ledger"
import { AuditEventType, recordAuditEvent } from "@/lib/security/audit-log"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/db/serializable", () => ({
  inSerializable: (fn: (tx: unknown) => Promise<unknown>) => fn(require("@/__tests__/helpers/prisma-mock").prismaMock),
}))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), recordAuditEvent: jest.fn() }))
jest.mock("@/lib/problem-reports/breaker-alert", () => ({ queueBreakerAlert: jest.fn() }))

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
      where: { action: { in: ["LOOK_FOR_MISSING", "BETTER_COPY", "SWAP", "REMOVE_AND_SEARCH"] }, startedAt: { gte: new Date("2026-11-08T20:00:00Z") } },
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
    expect(queueBreakerAlert).not.toHaveBeenCalled()
  })

  it("counts file replacements by when they began, from any fix, and trips the breaker past the hour's limit, alerting the admins", async () => {
    prismaMock.problemFixLedger.count.mockResolvedValueOnce(0).mockResolvedValueOnce(5).mockResolvedValueOnce(5)
    const removal = { ...RUN, action: "REMOVE_AND_SEARCH" as const, traits: { searches: true, replacesFile: true }, replaces: true }

    await expect(gateAndRecord(removal, NOW)).resolves.toBe("BREAKER")
    expect(prismaMock.problemFixLedger.count).toHaveBeenCalledWith({ where: { replacedAt: { gte: new Date("2026-11-09T19:00:00Z") } } })
    expect(prismaMock.problemFixLedger.count).toHaveBeenCalledWith({ where: { replacedAt: { gte: new Date("2026-11-08T20:00:00Z") } } })
    expect(prismaMock.problemReportSettings.upsert).toHaveBeenCalledWith({
      where: { id: "problem-reports" },
      create: { id: "problem-reports", breakerTrippedAt: NOW },
      update: { breakerTrippedAt: NOW },
    })
    expect(queueBreakerAlert).toHaveBeenCalledWith(NOW)
    expect(prismaMock.problemFixLedger.create).not.toHaveBeenCalled()
  })

  it("records a removal as replacing the file at once, and audits the file and the release it replaces", async () => {
    const removal = { ...RUN, trigger: "web" as const, actorUserId: "admin-1", action: "REMOVE_AND_SEARCH" as const, traits: { searches: true, replacesFile: true }, replaces: true, file: { id: 77, release: "Heat.1995.720p.WEB-BAD" } }

    await expect(gateAndRecord(removal, NOW)).resolves.toBeNull()
    expect(prismaMock.problemFixLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id: "report-1:2", action: "REMOVE_AND_SEARCH", startedAt: NOW, replacedAt: NOW }) })
    expect(recordAuditEvent).toHaveBeenCalledWith(
      AuditEventType.PROBLEM_FIX_RUN,
      "admin-1",
      expect.objectContaining({ action: "REMOVE_AND_SEARCH", fileId: 77, replacedRelease: "Heat.1995.720p.WEB-BAD", approvedBy: "admin-1" }),
      prismaMock
    )
  })
})

describe("gateReplace", () => {
  const SWAP = { reportId: "report-1", runToken: 2 }

  it("marks the swap's row as replacing the file, under the breaker's limits", async () => {
    prismaMock.problemFixLedger.findUnique.mockResolvedValue({ replacedAt: null } as never)

    await expect(gateReplace(SWAP, NOW)).resolves.toBeNull()
    expect(prismaMock.problemFixLedger.count).toHaveBeenCalledWith({ where: { replacedAt: { gte: new Date("2026-11-09T19:00:00Z") } } })
    expect(prismaMock.problemFixLedger.update).toHaveBeenCalledWith({ where: { id: "report-1:2" }, data: { replacedAt: NOW } })
  })

  it("does nothing a second time, so a redelivered step grabs once", async () => {
    prismaMock.problemFixLedger.findUnique.mockResolvedValue({ replacedAt: NOW } as never)

    await expect(gateReplace(SWAP, NOW)).resolves.toBe("ALREADY_REPLACED")
    expect(prismaMock.problemFixLedger.update).not.toHaveBeenCalled()
  })

  it("refuses while the breaker is tripped, trips it past the day's limit, and refuses a run with no row", async () => {
    prismaMock.problemFixLedger.findUnique.mockResolvedValue({ replacedAt: null } as never)
    prismaMock.problemReportSettings.findUnique.mockResolvedValueOnce({ breakerTrippedAt: NOW } as never)
    await expect(gateReplace(SWAP, NOW)).resolves.toBe("BREAKER")
    expect(queueBreakerAlert).not.toHaveBeenCalled()

    prismaMock.problemFixLedger.count.mockResolvedValueOnce(4).mockResolvedValueOnce(15)
    await expect(gateReplace(SWAP, NOW)).resolves.toBe("BREAKER")
    expect(queueBreakerAlert).toHaveBeenCalledWith(NOW)
    expect(prismaMock.problemFixLedger.update).not.toHaveBeenCalled()

    prismaMock.problemFixLedger.findUnique.mockResolvedValue(null)
    await expect(gateReplace(SWAP, NOW)).resolves.toBe("NO_RUN")
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

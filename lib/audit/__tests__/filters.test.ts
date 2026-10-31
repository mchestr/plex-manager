/**
 * @jest-environment node
 */

/**
 * The audit log's URL filters: what each param accepts, what it reads as unset,
 * and the Prisma `where` the filters make together.
 */

import { typesIn } from "@/lib/audit/events"
import { auditFilterParams, auditWhere, hasAuditFilters, parseAuditFilters, type AuditFilters } from "@/lib/audit/filters"

const NONE: AuditFilters = { range: null }

describe("parseAuditFilters", () => {
  it("reads every filter the URL sets", () => {
    expect(
      parseAuditFilters({
        category: "access",
        type: "MEMBER_UNSHARED",
        actor: "system",
        member: "clu1member00000000000000a",
        run: "clrun0000000000000000000a",
        from: "2026-10-01",
        to: "2026-10-31",
      })
    ).toEqual({
      category: "access",
      type: "MEMBER_UNSHARED",
      actor: "system",
      member: "clu1member00000000000000a",
      run: "clrun0000000000000000000a",
      range: { from: "2026-10-01", to: "2026-10-31" },
    })
  })

  it("reads nothing from an empty URL", () => {
    expect(parseAuditFilters({})).toEqual(NONE)
  })

  it.each([
    ["category", "secrets"],
    ["type", "TEST"],
    ["type", "constructor"],
    ["actor", "jane doe"],
    ["actor", "a".repeat(65)],
    ["member", "../users"],
    ["member", ""],
    ["run", "run;drop"],
  ])("reads %s=%j as unset", (param, value) => {
    expect(parseAuditFilters({ [param]: value })).toEqual(NONE)
  })

  it("accepts each non-user actor and the first of a repeated param", () => {
    for (const actor of ["system", "setup", "unknown"]) expect(parseAuditFilters({ actor }).actor).toBe(actor)
    expect(parseAuditFilters({ category: ["billing", "access"] }).category).toBe("billing")
  })

  it("drops a day range that is incomplete or ends before it starts", () => {
    expect(parseAuditFilters({ from: "2026-10-01" }).range).toBeNull()
    expect(parseAuditFilters({ from: "2026-10-31", to: "2026-10-01" }).range).toBeNull()
  })
})

describe("hasAuditFilters", () => {
  it("is false only with no filter at all", () => {
    expect(hasAuditFilters(NONE)).toBe(false)
    expect(hasAuditFilters({ range: null, category: undefined })).toBe(false)
    expect(hasAuditFilters({ range: null, member: "u1" })).toBe(true)
    expect(hasAuditFilters({ range: { from: "2026-10-01", to: "2026-10-02" } })).toBe(true)
  })
})

describe("auditFilterParams", () => {
  it("gives the filters as their URL params, the range as two day keys", () => {
    expect(auditFilterParams({ category: "billing", actor: "u1", range: { from: "2026-10-01", to: "2026-10-31" } })).toEqual({
      category: "billing",
      actor: "u1",
      from: "2026-10-01",
      to: "2026-10-31",
    })
    expect(auditFilterParams(NONE)).toEqual({})
  })
})

describe("auditWhere", () => {
  const where = (filters: Partial<AuditFilters>) => auditWhere({ range: null, ...filters }, "America/Chicago")

  it("matches everything with no filter", () => {
    expect(where({})).toEqual({ AND: [] })
  })

  it("matches a category by its event types", () => {
    expect(where({ category: "reads" })).toEqual({ AND: [{ type: { in: typesIn("reads") } }] })
  })

  it("ANDs a type with a category, so a type outside it matches nothing", () => {
    expect(where({ category: "billing", type: "MEMBER_UNSHARED" })).toEqual({
      AND: [{ type: { in: typesIn("billing") } }, { type: "MEMBER_UNSHARED" }],
    })
  })

  it("matches the actor, and a member on either side", () => {
    expect(where({ actor: "system" })).toEqual({ AND: [{ actorUserId: "system" }] })
    expect(where({ member: "u1" })).toEqual({ AND: [{ OR: [{ actorUserId: "u1" }, { targetUserId: "u1" }] }] })
  })

  it("matches one inactivity run's rows by the run id in their details", () => {
    expect(where({ run: "run-1" })).toEqual({
      AND: [{ type: { in: ["INACTIVITY_SWEEP_RUN", "MEMBER_UNSHARED"] }, details: { path: ["runId"], equals: "run-1" } }],
    })
  })

  it("places the day range in the server zone, the last day included", () => {
    expect(where({ range: { from: "2026-10-01", to: "2026-10-31" } })).toEqual({
      AND: [{ createdAt: { gte: new Date("2026-10-01T05:00:00Z"), lt: new Date("2026-11-01T05:00:00Z") } }],
    })
  })

  it("combines every filter", () => {
    expect(where({ category: "access", actor: "a1", member: "m1", run: "r1", range: { from: "2026-10-01", to: "2026-10-01" } }).AND).toHaveLength(5)
  })
})

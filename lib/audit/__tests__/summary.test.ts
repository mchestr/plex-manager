/**
 * @jest-environment node
 */

/**
 * One-line summaries of audit events: each summarised type in its words, null
 * for details of the wrong shape, and never a free-text value from the
 * details, since Support reads these lines but not the details.
 */

import { auditSummary } from "@/lib/audit/summary"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })
const summary = (type: string, details: unknown) => auditSummary(type, details, f)

describe("MEMBER_UNSHARED", () => {
  it.each([
    [{ status: "removed", reason: "inactivity", lastSeenAt: "2026-03-03T18:00:00.000Z" }, "Removed for inactivity, last seen Mar 3, 2026"],
    [{ status: "removed", reason: "inactivity", lastSeenAt: null }, "Removed for inactivity, never seen"],
    [{ status: "removed", reason: "inactivity" }, "Removed for inactivity"],
    [{ status: "removed", reason: "inactivity", lastSeenAt: "not a date" }, "Removed for inactivity"],
    [{ status: "removed" }, "Share removed"],
    [{ status: "already_removed" }, "Share was already gone"],
    [{ status: "already_removed", reason: "inactivity", lastSeenAt: null }, "Share was already gone"],
    [{ status: "pending" }, null],
    [{}, null],
  ])("summarises %o", (details, expected) => {
    expect(summary("MEMBER_UNSHARED", details)).toBe(expected)
  })

  it("dates the last play in the server zone", () => {
    // 03:00 UTC on 4 March is still 3 March in Chicago
    expect(summary("MEMBER_UNSHARED", { status: "removed", reason: "inactivity", lastSeenAt: "2026-03-04T03:00:00Z" })).toBe(
      "Removed for inactivity, last seen Mar 3, 2026"
    )
  })
})

describe("INACTIVITY_SWEEP_RUN", () => {
  const run = (overrides: Record<string, unknown>) => ({
    runId: "run-1",
    trigger: "scheduled",
    thresholdDays: 180,
    qualified: 3,
    removed: 2,
    failed: 0,
    blocked: null,
    ...overrides,
  })

  it.each([
    [run({}), "Removed 2 of 3 inactive members"],
    [run({ qualified: 1, removed: 1 }), "Removed 1 of 1 inactive member"],
    [run({ removed: 1, failed: 2 }), "Removed 1 of 3 inactive members, 2 failed"],
    [run({ qualified: 0, removed: 0 }), "Found no inactive members"],
    [run({ qualified: 1200, removed: 1100 }), "Removed 1,100 of 1,200 inactive members"],
    [run({ removed: 0, blocked: "disabled" }), "Removed no one: Automatic removal is off"],
    [run({ qualified: 0, removed: 0, blocked: "tautulli_stale" }), "Removed no one: Tautulli recorded no play in 14 days"],
    [run({ qualified: 40, removed: 0, blocked: "over_limit" }), "Removed no one: More members qualified than the safety limit allows"],
    [run({ removed: 1, blocked: "stopped" }), "Removed 1 of 3 inactive members, then stopped: The server shut down during the run"],
  ])("summarises %o", (details, expected) => {
    expect(summary("INACTIVITY_SWEEP_RUN", details)).toBe(expected)
  })

  it("names no reason for a block code it does not know", () => {
    expect(summary("INACTIVITY_SWEEP_RUN", run({ removed: 0, blocked: "Jane Doe <jane@example.com>" }))).toBe("Removed no one")
    expect(summary("INACTIVITY_SWEEP_RUN", run({ removed: 1, blocked: "new_reason" }))).toBe("Removed 1 of 3 inactive members, then stopped")
  })

  it.each([[{ qualified: -1 }], [{ removed: 1.5 }], [{ failed: "2" }], [{ qualified: undefined }]])("has none for counts like %o", (bad) => {
    expect(summary("INACTIVITY_SWEEP_RUN", run(bad))).toBeNull()
  })
})

describe("INACTIVITY_SETTINGS_CHANGED", () => {
  const change = (changedFields: string[], after: Record<string, unknown>) => ({
    section: "inactivity",
    changedFields,
    before: { enabled: false, thresholdDays: 180 },
    after,
  })

  it.each([
    [change(["enabled"], { enabled: true, thresholdDays: 180 }), "Turned on, 180 days"],
    [change(["enabled", "thresholdDays"], { enabled: true, thresholdDays: 90 }), "Turned on, 90 days"],
    [change(["enabled"], { enabled: true }), "Turned on"],
    [change(["enabled", "thresholdDays"], { enabled: false, thresholdDays: 90 }), "Turned off"],
    [change(["thresholdDays"], { enabled: true, thresholdDays: 90 }), "Threshold 90 days"],
    [change(["thresholdDays"], { enabled: true, thresholdDays: 1 }), "Threshold 1 day"],
    [change(["thresholdDays"], { enabled: true, thresholdDays: "ninety" }), null],
    [change([], { enabled: true, thresholdDays: 90 }), null],
    [{ section: "inactivity", changedFields: "enabled", after: { enabled: true } }, null],
    [{ section: "inactivity", changedFields: ["enabled"], after: null }, null],
  ])("summarises %o", (details, expected) => {
    expect(summary("INACTIVITY_SETTINGS_CHANGED", details)).toBe(expected)
  })
})

describe("the other inactivity events", () => {
  it("says whether the member was excluded", () => {
    expect(summary("INACTIVITY_EXCLUSION_CHANGED", { excluded: true })).toBe("Excluded from the inactivity sweep")
    expect(summary("INACTIVITY_EXCLUSION_CHANGED", { excluded: false })).toBe("Included in the inactivity sweep again")
    expect(summary("INACTIVITY_EXCLUSION_CHANGED", { excluded: "yes" })).toBeNull()
  })

  it.each([
    [{ queued: true, confirmedRemovals: 3 }, "Queued, 3 removals confirmed"],
    [{ queued: false, confirmedRemovals: 1 }, "Ran at once, 1 removal confirmed"],
    [{ queued: true, confirmedRemovals: 0 }, "Queued"],
    [{ queued: false, confirmedRemovals: null }, "Ran at once"],
    [{ confirmedRemovals: 3 }, null],
  ])("summarises a run started by hand, %o", (details, expected) => {
    expect(summary("ACTIVITY_SYNC_TRIGGERED", details)).toBe(expected)
  })
})

describe("CONFIG_CHANGED", () => {
  it.each([
    [{ section: "plex", changedFields: ["url", "token"], secretChanged: false }, "plex: url, token"],
    [{ section: "tautulli", changedFields: ["url"], secretChanged: true }, "tautulli: url, a secret"],
    [{ section: "setup.llm.chat", changedFields: [], secretChanged: true }, "setup.llm.chat: a secret"],
    [{ section: "request-tiers.member", excluded: true }, "request-tiers.member"],
    [{ section: "llm", changedFields: ["a", "b", "c", "d", "e", "f", "g"] }, "llm: a, b, c, d, e, 2 more"],
    [{ changedFields: ["url"] }, null],
  ])("summarises %o", (details, expected) => {
    expect(summary("CONFIG_CHANGED", details)).toBe(expected)
  })

  it("leaves out anything that is not a section or field name written by code", () => {
    expect(summary("CONFIG_CHANGED", { section: "plex", changedFields: ["url", "Jane Doe", "jane@example.com", 7] })).toBe("plex: url")
    expect(summary("CONFIG_CHANGED", { section: "Jane Doe", changedFields: ["url"] })).toBeNull()
  })
})

describe("SESSIONS_REVOKED and USER_ROLE_CHANGED", () => {
  it.each([
    ["unshared", "Reason: Plex access removed"],
    ["demoted", "Reason: Admin rights or role removed"],
    ["disabled", "Reason: Account disabled"],
    ["subscription_revoked", "Reason: Subscription access ended"],
    ["removed", "Reason: Member removed"],
    ["toString", null],
    ["something new", null],
  ])("gives the reason %s", (reason, expected) => {
    expect(summary("SESSIONS_REVOKED", { reason })).toBe(expected)
  })

  it.each([
    [{ previousRole: null, newRole: "support" }, "Given the Support role"],
    [{ previousRole: "support", newRole: null }, "Support role removed"],
    [{ previousRole: "retired-role", newRole: null }, "Role removed"],
    [{ previousRole: null, newRole: "owner" }, null],
    [{ previousRole: "support" }, null],
  ])("summarises the role change %o", (details, expected) => {
    expect(summary("USER_ROLE_CHANGED", details)).toBe(expected)
  })
})

describe("the admin reads", () => {
  it.each([
    ["MEMBER_CONTENT_VIEWED", { surface: "activity-timeline" }, "Activity timeline"],
    ["MEMBER_CONTENT_VIEWED", { surface: "llm-conversation" }, "LLM conversation"],
    ["MEMBER_CONTENT_LISTED", { surface: "watchlist-history", filters: { q: "Jane" } }, "Watchlist sync page"],
    ["MEMBER_CONTENT_VIEWED", { surface: "somewhere-new" }, null],
    ["MEMBER_CONTENT_LISTED", { surface: "constructor" }, null],
  ])("names the %s surface in %o", (type, details, expected) => {
    expect(summary(type, details)).toBe(expected)
  })

  it.each([
    [{ filters: {} }, "No filters"],
    [{ filters: { category: "billing", member: "u1", from: "2026-10-01", to: "2026-10-31" } }, "Filters: category, member, dates"],
    [{ filters: { type: "MEMBER_UNSHARED", actor: "system", run: "run-1" } }, "Filters: event, who did it, run"],
    [{ filters: { member: "u1" } }, "Filters: member"],
    [{ filters: { event: "evt-1" } }, "Opened one event"],
    [{ filters: "everything" }, null],
  ])("says which filters the audit log was opened with, %o", (details, expected) => {
    expect(summary("AUDIT_LOG_VIEWED", details)).toBe(expected)
  })
})

describe("auditSummary", () => {
  it("has none for a type without a summary, a type the enum does not know, or details that are not an object", () => {
    expect(summary("INVITE_CREATED", { inviteId: "i1", uses: 1 })).toBeNull()
    expect(summary("TEST", { status: "removed" })).toBeNull()
    expect(summary("MEMBER_UNSHARED", null)).toBeNull()
    expect(summary("MEMBER_UNSHARED", ["removed"])).toBeNull()
    expect(summary("MEMBER_UNSHARED", "removed")).toBeNull()
  })

  const NAME = "Jane Doe"
  const EMAIL = "jane@example.com"
  const NOTE = "Paid in cash"

  // Free text in every key each summary reads, and beside them
  it.each<[string, Record<string, unknown>]>([
    ["MEMBER_UNSHARED", { status: "removed", reason: "inactivity", lastSeenAt: NAME, name: NAME, email: EMAIL }],
    ["MEMBER_UNSHARED", { status: NAME, reason: EMAIL }],
    ["INACTIVITY_SWEEP_RUN", { qualified: 1, removed: 0, failed: 0, blocked: NAME, runId: EMAIL, trigger: NOTE }],
    ["INACTIVITY_SETTINGS_CHANGED", { changedFields: ["enabled", NAME], after: { enabled: true, thresholdDays: NOTE } }],
    ["INACTIVITY_EXCLUSION_CHANGED", { excluded: NAME }],
    ["ACTIVITY_SYNC_TRIGGERED", { queued: true, confirmedRemovals: EMAIL }],
    ["CONFIG_CHANGED", { section: "plex", changedFields: [NAME, EMAIL, NOTE], origins: { after: { url: EMAIL } } }],
    ["SESSIONS_REVOKED", { reason: NOTE }],
    ["USER_ROLE_CHANGED", { previousRole: NAME, newRole: null }],
    ["MEMBER_CONTENT_LISTED", { surface: NAME, filters: { q: EMAIL } }],
    ["AUDIT_LOG_VIEWED", { filters: { member: NAME, category: EMAIL, type: NOTE } }],
    ["SUBSCRIPTION_EXEMPT_CHANGED", { isExempt: true, exemptNote: NOTE }],
  ])("never echoes a name, an email or a note from %s details", (type, details) => {
    const line = summary(type, details) ?? ""

    for (const text of [NAME, EMAIL, NOTE]) expect(line).not.toContain(text)
  })
})

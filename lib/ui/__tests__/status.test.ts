/**
 * The status vocabulary (P3.9) against the ui-design-system 5.6 table: every
 * row's word, tone and mark, the filled sub-lines, and the settings nav
 * categories.
 */

import { icons } from "@/lib/ui/icons"
import { resolveStatus, settingsCategory, STATUS, type StatusDomain, type StatusMark, type Tone } from "@/lib/ui/status"
import { formatDate, formatRelative } from "@/lib/utils/format"

type Row = [domain: StatusDomain, value: string, label: string, tone: Tone, mark: StatusMark | undefined]

// ui-design-system 5.6, one line per row.
const TABLE: Row[] = [
  ["subscription", "ACTIVE", "Active", "success", "dot"],
  ["subscription", "PAST_DUE", "Past due", "warning", icons.warning],
  ["subscription", "UNPAID", "Past due", "warning", icons.warning],
  ["subscription", "CANCELED", "Canceled", "destructive", icons.error],
  ["subscription", "INCOMPLETE", "Incomplete", "neutral", undefined],
  ["subscription", "none", "None", "plain", undefined],
  ["exemption", "comp", "Comp", "info", undefined],
  ["exemption", "exempt", "Exempt", "neutral", undefined],
  ["exemption", "grandfathered", "Grandfathered", "plain", undefined],
  ["exemption", "notRequired", "Not required", "plain", undefined],
  ["plexAccess", "shared", "Shared", "success", "dot"],
  ["plexAccess", "notShared", "Not shared", "outline", "dot"],
  ["plexAccess", "unknown", "Unknown", "warning", "dot"],
  ["role", "owner", "Owner", "outline", icons.owner],
  ["role", "admin", "Admin", "outline", undefined],
  ["role", "user", "Member", "plain", undefined],
  ["rewind", "ready", "Ready to watch", "success", "dot"],
  ["rewind", "generating", "Generating", "info", "spinner"],
  ["rewind", "failed", "Couldn't finish", "destructive", icons.error],
  ["rewind", "opens", "Opens", "neutral", icons.scheduled],
  ["rewind", "notStarted", "Not started", "plain", undefined],
  ["rewind", "notEligible", "Not eligible yet", "plain", undefined],
  ["connection", "ok", "Connected", "success", "dot"],
  ["connection", "unreachable", "Can't connect", "destructive", icons.error],
  ["connection", "incomplete", "Needs setup", "warning", icons.warning],
  ["connection", "untested", "Not checked", "neutral", undefined],
  ["connection", "disabled", "Off", "neutral", undefined],
  ["connection", "notConfigured", "Not set up", "outline", undefined],
  ["connection", "degraded", "Template copy", "warning", icons.warning],
  ["queueJob", "active", "Running", "info", "spinner"],
  ["queueJob", "waiting", "Waiting", "neutral", undefined],
  ["queueJob", "completed", "Done", "success", icons.done],
  ["queueJob", "failed", "Failed", "destructive", undefined],
  ["queueJob", "delayed", "Paused", "warning", icons.paused],
  ["queueJob", "paused", "Paused", "warning", icons.paused],
  ["worker", "running", "Worker running", "success", "dot"],
  ["worker", "stopped", "Worker stopped", "destructive", "dot"],
  ["invite", "active", "Active", "success", "dot"],
  ["invite", "expired", "Expired", "neutral", undefined],
  ["invite", "usedUp", "Used up", "neutral", undefined],
  ["invite", "revoked", "Revoked", "neutral", undefined],
  ["request", "pending", "Waiting for approval", "neutral", undefined],
  ["request", "approved", "Requested", "info", icons.pending],
  ["request", "processing", "Requested", "info", icons.pending],
  ["request", "available", "Available", "success", icons.done],
  ["request", "declined", "Declined", "destructive", undefined],
]

describe("STATUS", () => {
  it.each(TABLE)("%s %s reads %p", (domain, value, label, tone, mark) => {
    const status = resolveStatus(domain, value as never)
    expect(status.label).toBe(label)
    expect(status.tone).toBe(tone)
    expect(status.mark).toBe(mark)
  })

  it("has exactly the rows of the table", () => {
    const rows = Object.entries(STATUS).flatMap(([domain, values]) => Object.keys(values).map((value) => `${domain}.${value}`))
    expect(rows.sort()).toEqual(TABLE.map(([domain, value]) => `${domain}.${value}`).sort())
  })

  it("gives every warning an icon or a dot, never colour alone", () => {
    const warnings = TABLE.filter(([, , , tone]) => tone === "warning")
    expect(warnings.every(([, , , , mark]) => mark !== undefined)).toBe(true)
  })
})

describe("resolveStatus sub-lines", () => {
  const berlin = { timeZone: "Europe/Berlin", locale: "en-GB" }
  const date = new Date("2026-10-20T23:30:00Z")
  const now = new Date("2026-10-20T23:32:00Z")

  it("formats {date} and {day} through lib/utils/format.ts, in the given zone and locale", () => {
    expect(resolveStatus("subscription", "ACTIVE", { date, settings: berlin }).sub).toBe(
      `Renews ${formatDate(date, "short", berlin)}`,
    )
    expect(resolveStatus("subscription", "PAST_DUE", { date, settings: berlin }).sub).toBe("Retrying 21 Oct")
    expect(resolveStatus("rewind", "opens", { date: new Date("2026-12-01T12:00:00Z") }).label).toBe("Opens Dec 1")
  })

  it("formats {ago} relative to now", () => {
    expect(resolveStatus("plexAccess", "unknown", { date, now }).sub).toBe(
      `Last checked ${formatRelative(date, { timeZone: "UTC", locale: "en-US", now })}`,
    )
    expect(resolveStatus("connection", "ok", { date, now }).sub).toBe("Checked 2 minutes ago")
  })

  it("fills the setter and the uses left", () => {
    expect(resolveStatus("exemption", "comp", { by: "Dana" }).sub).toBe("Set by Dana")
    expect(resolveStatus("invite", "active", { usesLeft: 3, usesTotal: 5 }).sub).toBe("3 of 5 uses left")
  })

  it("leaves out a sub-line it cannot fill", () => {
    expect(resolveStatus("subscription", "ACTIVE").sub).toBeUndefined()
    expect(resolveStatus("invite", "active", { usesLeft: 3 }).sub).toBeUndefined()
    expect(resolveStatus("connection", "ok", { date }).sub).toBeUndefined()
  })

  it("keeps a fixed sub-line", () => {
    expect(resolveStatus("connection", "degraded").sub).toBe("Rewind uses template copy while AI is off")
  })
})

describe("settingsCategory", () => {
  it.each([
    ["ok", "working", "Working", "success", icons.success],
    ["degraded", "attention", "Needs attention", "warning", icons.warning],
    ["incomplete", "attention", "Needs attention", "warning", icons.warning],
    ["unreachable", "broken", "Not working", "destructive", icons.error],
    ["untested", "off", "Off, not set up or not checked", "neutral", icons.notChecked],
    ["disabled", "off", "Off, not set up or not checked", "neutral", icons.notChecked],
    ["notConfigured", "off", "Off, not set up or not checked", "neutral", icons.notChecked],
  ] as const)("%s is %s", (status, category, label, tone, icon) => {
    expect(settingsCategory(status)).toEqual({ category, label, tone, icon })
  })
})

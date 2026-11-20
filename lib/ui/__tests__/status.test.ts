/**
 * The status vocabulary (P3.9) against the ui-design-system 5.6 table: every
 * row's word, tone and mark, the filled sub-lines, and the settings nav
 * categories.
 */

import { icons } from "@/lib/ui/icons"
import { discordStatus, type DiscordState, resolveStatus, settingsCategory, STATUS, type StatusDomain, type StatusMark, type Tone } from "@/lib/ui/status"
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
  ["exemption", "exempt", "Exempt", "neutral", undefined],
  ["exemption", "notRequired", "Not required", "plain", undefined],
  ["plexAccess", "shared", "Shared", "success", "dot"],
  ["plexAccess", "notShared", "Not shared", "outline", "dot"],
  ["plexAccess", "unknown", "Unknown", "warning", "dot"],
  ["role", "owner", "Owner", "outline", icons.owner],
  ["role", "support", "Support", "outline", undefined],
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
  ["connection", "degraded", "Template text", "warning", icons.warning],
  ["queueJob", "active", "Running", "info", "spinner"],
  ["queueJob", "waiting", "Waiting", "neutral", undefined],
  ["queueJob", "completed", "Done", "success", icons.done],
  ["queueJob", "failed", "Failed", "destructive", undefined],
  ["queueJob", "delayed", "Delayed", "warning", icons.scheduled],
  ["queueJob", "paused", "Paused", "warning", icons.paused],
  ["worker", "running", "Worker running", "success", "dot"],
  ["worker", "stopped", "Worker stopped", "destructive", "dot"],
  ["redis", "connected", "Redis connected", "success", "dot"],
  ["redis", "unreachable", "Redis unreachable", "destructive", "dot"],
  ["queue", "running", "Queue running", "success", "dot"],
  ["queue", "paused", "Queue paused", "warning", icons.paused],
  ["queue", "unknown", "Queue state unknown", "neutral", "dot"],
  ["invite", "active", "Active", "success", "dot"],
  ["invite", "expired", "Expired", "neutral", undefined],
  ["invite", "usedUp", "Used up", "neutral", undefined],
  ["invite", "revoked", "Revoked", "neutral", undefined],
  ["share", "active", "Active", "success", "dot"],
  ["share", "expired", "Expired", "neutral", undefined],
  ["share", "stopped", "Stopped", "neutral", undefined],
  ["request", "pending", "Waiting for approval", "neutral", undefined],
  ["request", "approved", "Requested", "info", icons.pending],
  ["request", "processing", "Requested", "info", icons.pending],
  ["request", "available", "Available", "success", icons.done],
  ["request", "declined", "Declined", "destructive", undefined],
  ["watchlistSync", "REQUESTED", "Requested", "info", icons.pending],
  ["watchlistSync", "ALREADY_AVAILABLE", "Available", "success", icons.done],
  ["watchlistSync", "ALREADY_REQUESTED", "Already requested", "neutral", undefined],
  ["watchlistSync", "NOT_PERMITTED", "Not allowed", "warning", icons.warning],
  ["watchlistSync", "SKIPPED_NO_EXTERNAL_ID", "No TMDB match", "neutral", undefined],
  ["watchlistSync", "FAILED", "Failed", "destructive", undefined],
  ["watchlistSync", "REMOVED_FROM_WATCHLIST", "Removed from watchlist", "outline", undefined],
  ["watchlistSync", "SYNCED", "Synced", "neutral", undefined],
  ["announcement", "active", "Active", "success", "dot"],
  ["announcement", "hidden", "Hidden", "neutral", undefined],
  ["announcement", "expired", "Expired", "destructive", undefined],
  ["linkedRoles", "on", "On", "success", "dot"],
  ["linkedRoles", "needsSetup", "Needs setup", "warning", icons.warning],
  ["linkedRoles", "off", "Off", "neutral", "dot"],
  ["supportBot", "online", "Online", "success", "dot"],
  ["supportBot", "offline", "Offline", "destructive", "dot"],
  ["supportBot", "needsSetup", "Waiting for a bot token", "warning", icons.warning],
  ["supportBot", "off", "Turned off", "neutral", "dot"],
  ["supportBot", "loginRejected", "Login rejected", "destructive", "dot"],
  ["supportBot", "loginRetrying", "Retrying login", "warning", icons.warning],
  ["supportBot", "loginCapped", "Login limit reached", "destructive", "dot"],
  ["discordCommand", "SUCCESS", "Succeeded", "success", "dot"],
  ["discordCommand", "FAILED", "Failed", "destructive", undefined],
  ["discordCommand", "PENDING", "Running", "info", "spinner"],
  ["discordCommand", "TIMEOUT", "Timed out", "warning", icons.warning],
  ["conversationReview", "none", "Not reviewed", "neutral", undefined],
  ["conversationReview", "queued", "Queued", "info", "spinner"],
  ["conversationReview", "running", "Reviewing", "info", "spinner"],
  ["conversationReview", "done", "Reviewed", "success", icons.done],
  ["conversationReview", "failed", "Failed", "destructive", icons.error],
  // Media cleanup, UX 4.12.6
  ["cleanupMode", "dryRun", "Dry run", "neutral", "dot"],
  ["cleanupMode", "reviewFirst", "Review first", "info", "dot"],
  ["cleanupMode", "automatic", "Automatic", "warning", "dot"],
  ["cleanupMatch", "match", "Match", "info", "dot"],
  ["cleanupMatch", "nearMiss", "Near miss", "outline", undefined],
  ["cleanupMatch", "protected", "Protected", "success", icons.keep],
  ["cleanupMatch", "missing", "Missing data", "warning", icons.warning],
  ["cleanupMatch", "cannotDelete", "Cannot delete", "neutral", icons.cannotDelete],
  ["cleanupItem", "leaving", "Leaving soon", "info", "dot"],
  ["cleanupItem", "waitsForYou", "Waits for you", "warning", icons.pending],
  ["cleanupItem", "deletesOn", "Deletes on", "destructive", "dot"],
  ["cleanupItem", "waitsForBudget", "Waits for budget", "neutral", "dot"],
  ["cleanupItem", "onHold", "On hold", "warning", icons.warning],
  ["cleanupItem", "deferred", "Deferred: playing now", "neutral", icons.playing],
  ["cleanupItem", "postponed", "Postponed", "outline", undefined],
  ["cleanupItem", "paused", "Paused", "neutral", icons.paused],
  ["cleanupItem", "deleting", "Deleting", "info", "spinner"],
  ["cleanupItem", "deleted", "Deleted", "neutral", "dot"],
  ["cleanupItem", "failed", "Failed", "destructive", icons.error],
  ["cleanupItem", "rescued", "Rescued", "success", "dot"],
  ["cleanupItem", "kept", "Kept", "success", icons.keep],
  ["cleanupItem", "excluded", "Excluded", "outline", undefined],
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

  it("fills the exemption note and the uses left", () => {
    expect(resolveStatus("exemption", "exempt", { note: "IT support" }).sub).toBe("IT support")
    expect(resolveStatus("invite", "active", { usesLeft: 3, usesTotal: 5 }).sub).toBe("3 of 5 uses left")
  })

  it("leaves out a sub-line it cannot fill", () => {
    expect(resolveStatus("subscription", "ACTIVE").sub).toBeUndefined()
    expect(resolveStatus("invite", "active", { usesLeft: 3 }).sub).toBeUndefined()
    expect(resolveStatus("connection", "ok", { date }).sub).toBeUndefined()
    expect(resolveStatus("connection", "degraded").sub).toBeUndefined()
  })

  it("keeps a fixed sub-line", () => {
    expect(resolveStatus("connection", "untested").sub).toBe("Test after saving")
  })
})

describe("cleanup statuses", () => {
  const day = new Date("2026-11-19T15:00:00Z")

  it("names the leave day in the label", () => {
    expect(resolveStatus("cleanupItem", "deletesOn", { date: day }).label).toBe("Deletes on Nov 19")
    expect(resolveStatus("cleanupItem", "deletesOn", { date: day, settings: { timeZone: "Europe/Berlin", locale: "en-GB" } }).label).toBe(
      "Deletes on 19 Nov",
    )
  })

  it("fills each sub-line from its day, date and note", () => {
    expect(resolveStatus("cleanupItem", "waitsForBudget", { date: new Date("2026-12-04T12:00:00Z") }).sub).toBe("Then Dec 4")
    expect(resolveStatus("cleanupItem", "onHold", { note: "Sonarr did not answer at 3:07 AM" }).sub).toBe("Sonarr did not answer at 3:07 AM")
    expect(resolveStatus("cleanupItem", "postponed", { date: new Date("2026-12-02T12:00:00Z"), note: "you" }).sub).toBe("To Dec 2 by you")
    expect(resolveStatus("cleanupItem", "deleted", { date: day }).sub).toBe("Nov 19, 2026")
    expect(resolveStatus("cleanupItem", "failed", { note: "Radarr refused the delete" }).sub).toBe("Radarr refused the delete")
    expect(resolveStatus("cleanupItem", "rescued", { note: "Played" }).sub).toBe("Played")
    expect(resolveStatus("cleanupItem", "kept", { date: new Date("2027-02-06T12:00:00Z") }).sub).toBe("Until Feb 6, 2027")
    expect(resolveStatus("cleanupItem", "excluded", { date: new Date("2027-06-01T12:00:00Z") }).sub).toBe("Until Jun 1, 2027")
  })

  it("leaves out a sub-line that misses its day or note", () => {
    expect(resolveStatus("cleanupItem", "postponed", { date: day }).sub).toBeUndefined()
    expect(resolveStatus("cleanupItem", "postponed", { note: "you" }).sub).toBeUndefined()
    expect(resolveStatus("cleanupItem", "onHold").sub).toBeUndefined()
    expect(resolveStatus("cleanupItem", "kept").sub).toBeUndefined()
  })

  it("has no sub-line for the states without one", () => {
    for (const value of ["leaving", "waitsForYou", "deferred", "paused", "deleting"] as const) {
      expect(resolveStatus("cleanupItem", value, { date: day, note: "x" }).sub).toBeUndefined()
    }
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

describe("discordStatus", () => {
  const now = new Date("2026-10-20T19:14:30Z")
  const chicago = { timeZone: "America/Chicago", locale: "en-US" }
  const ready: DiscordState = {
    isEnabled: true,
    hasClientCredentials: true,
    botEnabled: true,
    hasBotToken: true,
    lastRenewedAt: new Date("2026-10-20T19:14:18Z"),
  }
  const rows = (patch: Partial<DiscordState>) => discordStatus({ ...ready, ...patch }, now, chicago)

  it("reads both rows on when everything is set up and the lease is fresh", () => {
    const { linkedRoles, supportBot } = rows({})
    expect(linkedRoles.label).toBe("On")
    expect(supportBot).toMatchObject({ label: "Online", tone: "success" })
    expect(supportBot.sub).toBeUndefined()
  })

  it.each([
    [{ isEnabled: false }, "Off"],
    [{ isEnabled: false, hasClientCredentials: false }, "Off"],
    [{ hasClientCredentials: false }, "Needs setup"],
  ])("linked roles with %o read %s", (patch, label) => {
    expect(rows(patch).linkedRoles.label).toBe(label)
  })

  it.each([
    [{ botEnabled: false }, "Turned off"],
    [{ botEnabled: false, lastRenewedAt: null }, "Turned off"],
    [{ hasBotToken: false }, "Waiting for a bot token"],
    [{ lastRenewedAt: null }, "Offline"],
    [{ lastRenewedAt: new Date(now.getTime() - 90_000) }, "Online"],
    [{ lastRenewedAt: new Date(now.getTime() - 90_001) }, "Offline"],
    [{ loginBlock: "fatal" as const }, "Login rejected"],
    [{ loginBlock: "backoff" as const }, "Retrying login"],
    [{ loginBlock: "daily_cap" as const }, "Login limit reached"],
    [{ loginBlock: null }, "Online"],
  ])("the support bot with %o reads %s", (patch, label) => {
    expect(rows(patch).supportBot.label).toBe(label)
  })

  it("dates an offline bot from its last renewal in the server zone", () => {
    const stale = rows({ lastRenewedAt: new Date("2026-10-20T14:14:00Z") }).supportBot
    expect(stale).toMatchObject({ label: "Offline", tone: "destructive", sub: "Since Oct 20, 2026, 9:14 AM CDT" })
    expect(rows({ lastRenewedAt: null }).supportBot.sub).toBeUndefined()
  })

  it("names what is wrong with a login without narrating the retries", () => {
    expect(rows({ loginBlock: "backoff" }).supportBot.sub).toBeUndefined()
    expect(rows({ loginBlock: "daily_cap" }).supportBot.sub).toBe("Too many logins in 24 hours")
  })

  it("keeps linked roles on while the bot is offline", () => {
    const { linkedRoles, supportBot } = rows({ lastRenewedAt: null })
    expect(linkedRoles.label).toBe("On")
    expect(supportBot.label).toBe("Offline")
  })
})

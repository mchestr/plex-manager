/**
 * The Discord messages about problem reports: the server admin's alert about
 * new reports (one message per reporting member, naming the member, each
 * title and its problem, with a link to each report), and a member's update
 * when a report they made or follow is fixed or closed. Links sit in
 * `<...>`, so Discord shows no previews. Names and titles are someone else's
 * words, so they go through {@link plainDiscordText}; the rest is the app's
 * own.
 *
 * @module lib/problem-reports/notify
 */

import { plainDiscordText } from "@/lib/discord/plain-text"
import type { FixAction } from "@/lib/problem-reports/fixes"
import { problemLabel } from "@/lib/problem-reports/taxonomy"

const NAME_MAX = 60
const TITLE_MAX = 120
/** Reports one digest lists; the rest are counted, which keeps it far below Discord's 2,000 characters. */
const LISTED = 5

export interface AlertReport {
  id: string
  title: string
  /** The stored problem code. */
  problem: string
}

/**
 * The alert for `reports`, oldest first, all from one member.
 *
 * @param reporter - The member's name, or null for "A member"
 * @param baseUrl - The app's public URL, with no trailing slash
 */
export function adminAlertText(reporter: string | null, reports: readonly AlertReport[], baseUrl: string): string {
  const who = reporter ? plainDiscordText(reporter, NAME_MAX) : "A member"
  const link = (id: string) => `<${baseUrl}/admin/problem-reports/${encodeURIComponent(id)}>`
  const line = (report: AlertReport) => `${plainDiscordText(report.title, TITLE_MAX)}: ${problemLabel(report.problem)}`
  if (reports.length === 1) return `${who} reported a problem with ${line(reports[0])}.\n${link(reports[0].id)}`

  const listed = reports.slice(0, LISTED).map((report) => `- ${line(report)} ${link(report.id)}`)
  const more = reports.length > LISTED ? [`And ${reports.length - LISTED} more: <${baseUrl}/admin/problem-reports>`] : []
  return [`${who} reported ${reports.length} problems:`, ...listed, ...more].join("\n")
}

/** How a report ended, as a member's update tells it. */
export interface MemberUpdate {
  /** Whether the member made the report, rather than following it. */
  own: boolean
  status: "FIXED" | "CLOSED"
  /** Who ended it: a fix, the server admin, or the member who made it. */
  by: "fix" | "admin" | "reporter"
  /** The fix that ended it, when `by` is a fix. A fix closes a report only when Look for a better copy found none. */
  action?: FixAction
  title: string
  /** Whether the server admin left the member who made it a note. */
  hasNote: boolean
}

/** What a fix that worked did, about a title. */
const FIXED_BY: Partial<Record<FixAction, (title: string) => string>> = {
  SWAP: (title) => `A different copy of ${title} is on the server now.`,
  BETTER_COPY: (title) => `A better copy of ${title} is on the server now.`,
  LOOK_FOR_MISSING: (title) => `${title} has the missing episodes now.`,
  FIX_MATCH: (title) => `${title} has the right title and poster in Plex now.`,
  REFRESH: (title) => `Plex has read the details of ${title} again.`,
  REMOVE_AND_SEARCH: (title) => `A new copy of ${title} is on the server now.`,
}

/** A fix's end, in the member's words. */
function byFix(update: MemberUpdate, title: string): string {
  if (update.status === "FIXED") return (update.action && FIXED_BY[update.action]?.(title)) || `${title} is fixed.`
  const none = `We looked for a better copy of ${title}, but there isn't one right now.`
  return update.own ? `${none} If it still looks poor, you can ask the server admin from your reports.` : none
}

/** A member's update, with a link to their reports. */
export function memberUpdateText(update: MemberUpdate, baseUrl: string): string {
  const title = plainDiscordText(update.title, TITLE_MAX)
  const words =
    update.by === "fix"
      ? byFix(update, title)
      : update.status === "FIXED"
        ? `The server admin fixed ${title}.`
        : update.by === "reporter"
        ? `The report you follow about ${title} was cancelled by the member who made it.`
        : update.own
          ? `The server admin closed your report about ${title}.`
          : `The server admin closed the report you follow about ${title}.`
  const note = update.own && update.hasNote ? " The server admin left you a note." : ""
  return `${words}${note}\nYour reports: <${baseUrl}/report>`
}

/** The admins' DM when fixes that replace files trip the breaker. */
export function breakerAlertText(baseUrl: string): string {
  return `Fixes that replace files are paused: more ran in the last hour or day than the breaker allows. Check the recent swaps, then resume fixes on the problem reports page: <${baseUrl}/admin/problem-reports>`
}

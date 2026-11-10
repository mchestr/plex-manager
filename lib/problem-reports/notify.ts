/**
 * The server admin's Discord alert about new problem reports: one message
 * per reporting member, naming the member, each title and its problem, with
 * a link to each report. Links sit in `<...>`, so Discord shows no previews.
 * The member's name and the titles are someone else's words, so they go
 * through {@link plainDiscordText}; the problem's words are the app's own.
 *
 * @module lib/problem-reports/notify
 */

import { plainDiscordText } from "@/lib/discord/plain-text"
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

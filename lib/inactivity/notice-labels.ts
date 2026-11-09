/**
 * The words the admin pages use for warning emails: a stage, a status and why
 * the app cannot email a member. The codes come from `NOTICE_CODES`
 * (`lib/inactivity/notices.ts`).
 *
 * @module lib/inactivity/notice-labels
 */

import type { CannotEmailCode, NoticeSummary } from "@/lib/inactivity/notice-lists"
import type { NoticeStatus } from "@/lib/inactivity/notices"

/** Why the app cannot email a member, as a badge. */
export const CANNOT_EMAIL_LABELS: Record<CannotEmailCode, string> = {
  no_email: "No address",
  invalid_email: "Not one address",
  email_unconfirmed: "Not the plex.tv address",
  disabled: "Disabled",
  unsubscribed: "Unsubscribed",
  rejected: "Refused by the mail server",
}

const STATUS_LABELS: Record<NoticeStatus, string> = {
  pending: "Waiting to send",
  sending: "Sending",
  sent: "Sent",
  skipped: "Skipped",
  failed: "Failed",
  cancelled: "Cancelled",
}

/** "Last warning", or the lead: "30-day warning". */
export function noticeStageLabel({ leadDays, lastWarning }: Pick<NoticeSummary, "leadDays" | "lastWarning">): string {
  return lastWarning ? "Last warning" : `${leadDays}-day warning`
}

/** The status in words, with the code of a skipped, failed or cancelled row: "Skipped (no_email)". */
export function noticeStatusLabel({ status, code }: Pick<NoticeSummary, "status" | "code">): string {
  const label = (STATUS_LABELS as Record<string, string>)[status] ?? status
  return code ? `${label} (${code})` : label
}

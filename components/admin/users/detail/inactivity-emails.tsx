import type { MemberInactivityEmails } from "@/lib/data/member-inactivity"
import { noticeStageLabel, noticeStatusLabel } from "@/lib/inactivity/notice-labels"
import type { BoundFormat } from "@/lib/utils/format"

import { DetailItem } from "./detail-item"

/**
 * The member's warning emails before removal for inactivity: the newest one
 * (stage, day and status) with the removal date of the open cycle, whether
 * an address is on file, and the member's own Access reminders switch.
 */
export function InactivityEmails({ emails, f }: { emails: MemberInactivityEmails; f: BoundFormat }) {
  const { last, removalDay } = emails
  return (
    <>
      <DetailItem label="Inactivity emails" testId="admin-user-inactivity-emails">
        {last ? (
          <>
            {noticeStageLabel(last)}, {f.date(last.at)}
            <span className="block text-caption text-muted-foreground">{noticeStatusLabel(last)}</span>
          </>
        ) : (
          "None"
        )}
        {removalDay && (
          <span className="block text-caption text-muted-foreground" data-testid="admin-user-inactivity-removal-date">
            Removal on or after {f.dayKey(removalDay)}
          </span>
        )}
      </DetailItem>
      <DetailItem label="Email on file" testId="admin-user-email-on-file">
        {emails.emailOnFile ? "Yes" : "No"}
      </DetailItem>
      <DetailItem label="Access reminders" testId="admin-user-access-reminders">
        {emails.remindersOn ? "On" : "Off"}
      </DetailItem>
    </>
  )
}

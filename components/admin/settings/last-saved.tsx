import Link from "next/link"

import { Time } from "@/components/ui/time"
import { auditEvent } from "@/lib/admin/routes"
import type { LastSaved as LastSavedMeta } from "@/lib/settings/audit-meta"

/**
 * A settings footer's meta (P10.20, SEC-55): "Last saved 2 minutes ago by
 * Dana Whitfield", from the section's newest audit row, or nothing before a
 * first save. "by Dana Whitfield" opens the audit event that recorded the save.
 */
export function LastSaved({ id, meta }: { id: string; meta: LastSavedMeta | null }) {
  if (!meta) return null
  return (
    <p data-testid={`settings-${id}-last-saved`}>
      Last saved <Time value={meta.at} nowLabel="just now" />{" "}
      <Link
        href={auditEvent(meta.eventId)}
        className="text-foreground underline underline-offset-3"
        data-testid={`settings-last-saved-link-${id}`}
      >
        by {meta.by}
      </Link>
    </p>
  )
}

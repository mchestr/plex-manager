import { Time } from "@/components/ui/time"
import type { LastSaved as LastSavedMeta } from "@/lib/settings/audit-meta"

/**
 * A settings footer's meta (P10.20, SEC-55): "Last saved 2 minutes ago by
 * Dana Whitfield", from the section's newest audit row, or nothing before a
 * first save.
 */
export function LastSaved({ id, meta }: { id: string; meta: LastSavedMeta | null }) {
  if (!meta) return null
  return (
    <p data-testid={`settings-${id}-last-saved`}>
      Last saved <Time value={meta.at} nowLabel="just now" /> by {meta.by}
    </p>
  )
}

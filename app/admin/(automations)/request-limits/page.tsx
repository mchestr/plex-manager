import type { Metadata } from "next"
import { connection } from "next/server"

import { LastSaved } from "@/components/admin/settings/last-saved"
import { RequestTiersSection } from "@/components/admin/settings/sections/request-tiers-section"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { getRequestTierSettings } from "@/lib/data/community-stats"
import { getFormat } from "@/lib/settings/app-settings"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"

export const metadata: Metadata = { title: "Request limits" }

/**
 * Request limits, the Request limits tab of Automations (moved from the
 * `/admin/settings` page): the daily sync of each member's
 * Overseerr quota from their watch time, read-only until Edit, with the last
 * run and Run now. See `docs/request-limits.md`.
 */
export default async function RequestLimitsPage() {
  await assertAdmin()
  // The last run and its time are read from the database: render per request, never at build
  await connection()
  const [requestTiers, audit, f] = await Promise.all([getRequestTierSettings(), getSettingsAuditMeta(), getFormat()])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-request-limits-page">
      <PageHeader title="Request limits" data-testid="admin-request-limits-header" />
      <RequestTiersSection
        saved={requestTiers}
        startedLabel={requestTiers.lastRun ? f.dateTime(requestTiers.lastRun.startedAt, { zoneLabel: true }) : null}
        // Nothing before a first save, so the section shows no empty footer
        footerMeta={audit.requestTiers && <LastSaved id="requestTiers" meta={audit.requestTiers} />}
      />
    </div>
  )
}

import Link from "next/link"
import { connection } from "next/server"

import { PreviewSection } from "@/components/admin/inactivity/preview-section"
import { RunsTable } from "@/components/admin/inactivity/runs-table"
import { InactivitySettingsSection } from "@/components/admin/inactivity/settings-section"
import { WarningAlerts } from "@/components/admin/inactivity/warning-alerts"
import { WarningLists } from "@/components/admin/inactivity/warning-lists"
import { InactivityWarningsSection } from "@/components/admin/inactivity/warnings-section"
import { LastSaved } from "@/components/admin/settings/last-saved"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { settingsSection } from "@/lib/admin/routes"
import { getInactivityPage } from "@/lib/data/inactivity"
import { getFormat } from "@/lib/settings/app-settings"

/**
 * Inactive members, a tab of Automations: the alerts of the warning emails,
 * the sweep's settings card with the last run and Run now, the Warning
 * emails card, whom a run would remove now, the warning email lists, and the
 * newest runs. See
 * `docs/inactive-members.md`.
 */
export default async function InactivityPage() {
  await assertAdmin()
  // The preview compares last plays with the clock: render per request, never at build
  await connection()
  // One clock for the preview and its "8 months ago", so the server and the client agree
  const now = new Date()
  const [data, f] = await Promise.all([getInactivityPage(now), getFormat()])
  const { settings, preview, warnings } = data
  const saves = [data.lastSaved?.at, data.warningsLastSaved?.at].filter((at): at is Date => at !== undefined)
  const savedAt = saves.length > 0 ? new Date(Math.max(...saves.map((at) => at.getTime()))) : null

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-inactivity-page">
      <PageHeader
        title="Inactive members"
        description="Members who have not played anything on Plex for a long time, and the daily run that can remove their access. Last seen comes from Tautulli."
        data-testid="admin-inactivity-header"
      />
      {!data.tautulliConfigured && (
        <Alert
          tone="warning"
          title="Tautulli is not set up"
          action={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={settingsSection("tautulli")} />} data-testid="admin-inactivity-setup-tautulli">
              Set up Tautulli
            </Button>
          }
          data-testid="admin-inactivity-no-tautulli"
        >
          Last seen comes from Tautulli. Until it is set up, no one is removed.
        </Alert>
      )}
      <WarningAlerts
        warningsOn={warnings.warningsEnabled}
        removalOn={settings.enabled}
        mailReady={data.mail.ready}
        queued={data.redisConfigured}
        preview={preview}
        runs={data.runs}
        savedAt={savedAt}
      />
      <InactivitySettingsSection
        saved={settings}
        scheduled={data.redisConfigured}
        scheduledLimit={preview.scheduledLimit}
        removalIds={preview.rows.map((row) => row.id)}
        lastRun={data.runs[0] ?? null}
        // An inline Run now (no Redis) plans no email, so its confirm promises none
        warningsOn={warnings.warningsEnabled && data.redisConfigured}
        // Nothing before a first save, so the card shows no empty footer
        footerMeta={data.lastSaved && <LastSaved id="inactivity" meta={data.lastSaved} />}
      />
      <InactivityWarningsSection
        saved={warnings}
        thresholdDays={settings.thresholdDays}
        mail={data.mail}
        queued={data.redisConfigured}
        footerMeta={data.warningsLastSaved && <LastSaved id="inactivity-warnings" meta={data.warningsLastSaved} />}
      />
      <PreviewSection preview={preview} settings={settings} f={f} now={now.getTime()} />
      <WarningLists preview={preview} removalOn={settings.enabled} now={now.getTime()} />
      <section aria-labelledby="admin-inactivity-runs-heading" className="flex flex-col gap-3">
        <h2 id="admin-inactivity-runs-heading" className="text-h3">
          Recent runs
        </h2>
        <RunsTable runs={data.runs} />
      </section>
    </div>
  )
}

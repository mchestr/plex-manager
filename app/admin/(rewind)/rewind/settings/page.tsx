import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { LastSaved } from "@/components/admin/settings/last-saved"
import { RewindSettingsSection } from "@/components/admin/settings/rewind-settings-section"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { getAdminSettings } from "@/lib/data/admin-settings"
import { getRewindSeasonDataPreparedAt } from "@/lib/data/rewind-season"
import { getRewindSeasonSpend } from "@/lib/llm/usage-totals"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import { getFormat } from "@/lib/settings/app-settings"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"
import { getSettingsHealth } from "@/lib/settings/connection-health"
import { serverZone } from "@/lib/utils/server-zone"
import { getRewindContentRatings, getRewindLibraries } from "@/lib/wrapped/admin/settings-options"
import { rewindSettingsFromConfig } from "@/lib/wrapped/config"
import { getSeasonState } from "@/lib/wrapped/season"

export const metadata: Metadata = { title: "Rewind settings" }

/**
 * Rewind settings, the Settings tab of the Rewind section (moved from the
 * Rewind group of `/admin/settings`): every admin-facing Rewind flag in its
 * `SettingsSection`, read-only until Edit, with the season data note below it.
 */
export default async function RewindSettingsPage() {
  await assertAdmin()
  // The health checks read the clock: render per request, never at build
  await connection()
  const [settings, health, season, zone, f] = await Promise.all([
    getAdminSettings(),
    getSettingsHealth(),
    getSeasonState(),
    serverZone(),
    getFormat(),
  ])
  const [seasonDataPreparedAt, rewindInfra, libraries, ratings, spentUsd, audit] = await Promise.all([
    getRewindSeasonDataPreparedAt(season.seasonYear),
    checkRewindInfra(),
    getRewindLibraries(),
    getRewindContentRatings(),
    getRewindSeasonSpend(season.seasonYear),
    getSettingsAuditMeta(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-rewind-settings-page">
      <PageHeader title="Rewind settings" data-testid="admin-rewind-settings-header" />
      <RewindSettingsSection
        saved={rewindSettingsFromConfig(settings.config)}
        zone={zone}
        llmDisabled={settings.config.llmDisabled}
        discordBotOn={Boolean(settings.discordIntegration?.isEnabled && settings.discordIntegration.botEnabled)}
        spent={f.money(spentUsd, "prose")}
        libraries={libraries.libraries}
        ratings={ratings}
        status={{ redis: rewindInfra.ok ? null : rewindInfraMessage(rewindInfra.code, "admin"), tautulli: libraries.status }}
        health={health.rewind}
        // Nothing before a first save, so the section shows no empty footer
        footerMeta={audit.rewind && <LastSaved id="rewind" meta={audit.rewind} />}
      >
        {/* P7.8: Prepare season moved to the season console. */}
        <p className="text-ui text-muted-foreground" data-testid="rewind-season-data-prepared-at">
          {seasonDataPreparedAt ? `Season data last prepared ${f.dateTime(seasonDataPreparedAt)}. ` : "Season data not prepared yet. "}
          <Link href="/admin/rewind" className="text-foreground underline underline-offset-3" data-testid="rewind-season-console-link">
            Prepare the season on the Season page
          </Link>
        </p>
      </RewindSettingsSection>
    </div>
  )
}

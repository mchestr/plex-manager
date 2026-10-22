import Link from "next/link"

import { LastSaved } from "@/components/admin/settings/last-saved"
import { LightThemeSwitch } from "@/components/admin/settings/light-theme-switch"
import { RewindSettingsSection } from "@/components/admin/settings/rewind-settings-section"
import { AiSection } from "@/components/admin/settings/sections/ai-section"
import { DiscordSection } from "@/components/admin/settings/sections/discord-section"
import { OtherIntegrationsSection } from "@/components/admin/settings/sections/other-integrations-section"
import { ServiceSection } from "@/components/admin/settings/sections/service-section"
import { StripeSection } from "@/components/admin/settings/sections/stripe-section"
import { SystemSection } from "@/components/admin/settings/sections/system-section"
import { WatchlistSection } from "@/components/admin/settings/sections/watchlist-section"
import { SettingsLayout } from "@/components/admin/settings/settings-layout"
import type { SettingsNavItem } from "@/components/admin/settings/settings-nav"
import { SettingsPageActions } from "@/components/admin/settings/settings-page-actions"
import { PageHeader } from "@/components/ui/page-header"
import { getDiscordOverview } from "@/lib/admin/discord"
import { getAdminSettings, getStripeConfig } from "@/lib/data/admin-settings"
import { getRewindSeasonDataPreparedAt } from "@/lib/data/rewind-season"
import { plexLibraryListing } from "@/lib/admin/invites/libraries"
import { getWatchlistSyncStats } from "@/lib/admin/watchlist-stats"
import { getBaseUrl } from "@/lib/env"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import { getRewindSeasonSpend } from "@/lib/llm/usage-totals"
import { getFormat } from "@/lib/settings/app-settings"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"
import { getSettingsHealth } from "@/lib/settings/connection-health"
import { worstStatus } from "@/lib/settings/connection-status"
import { serverZone } from "@/lib/utils/server-zone"
import { getRewindContentRatings, getRewindLibraries } from "@/lib/wrapped/admin/settings-options"
import { rewindSettingsFromConfig } from "@/lib/wrapped/config"
import { getSeasonState } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

const PLATFORMS: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" }

function databaseProvider(url: string | undefined) {
  if (!url) return "Not configured"
  if (url.startsWith("postgres")) return "PostgreSQL"
  return "Unknown"
}

/**
 * Settings (ui-design-system 6.4, P10.19): a grouped section nav with tone
 * glyphs beside one column of `SettingsSection`s, each with its live health.
 */
export default async function SettingsPage() {
  // Started, not awaited: the sections stream these in (P10.7)
  const plexLibraries = plexLibraryListing()
  const watchlistStats = getWatchlistSyncStats()
  const [settings, stripeConfig, health, season, zone, f] = await Promise.all([
    getAdminSettings(),
    getStripeConfig(),
    getSettingsHealth(),
    getSeasonState(),
    serverZone(),
    getFormat(),
  ])
  const [seasonDataPreparedAt, rewindInfra, libraries, ratings, spentUsd, audit, discord] = await Promise.all([
    getRewindSeasonDataPreparedAt(season.seasonYear),
    checkRewindInfra(),
    getRewindLibraries(),
    getRewindContentRatings(),
    getRewindSeasonSpend(season.seasonYear),
    getSettingsAuditMeta(),
    getDiscordOverview(),
  ])
  const saved = (id: keyof typeof audit) => <LastSaved id={id} meta={audit[id]} />
  const baseUrl = getBaseUrl()
  const other = {
    sonarr: settings.sonarr,
    radarr: settings.radarr,
    jellyfin: settings.jellyfinServer,
    prometheus: settings.prometheus,
  }
  const otherStatus = worstStatus(
    (Object.keys(other) as (keyof typeof other)[]).filter((key) => other[key]).map((key) => health[key].status)
  )

  const nav: SettingsNavItem[] = [
    { id: "plex", label: "Plex server", group: "Media", status: health.plex.status },
    { id: "tautulli", label: "Tautulli", group: "Media", status: health.tautulli.status },
    { id: "overseerr", label: "Overseerr", group: "Media", status: health.overseerr.status },
    { id: "ai", label: "AI provider", group: "Features", status: health.ai.status },
    { id: "discord", label: "Discord", group: "Features", status: health.discord.status },
    { id: "stripe", label: "Stripe billing", group: "Features", status: health.stripe.status },
    { id: "watchlist", label: "Watchlist sync", group: "Features", status: health.watchlist.status },
    { id: "rewind", label: "Rewind", group: "Features", status: health.rewind.status },
    { id: "other", label: "Other integrations", group: "More", status: otherStatus },
    { id: "system", label: "System information", group: "More" },
  ]

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Settings"
        description="Connections and features for this server. Changes apply to everyone."
        actions={<SettingsPageActions />}
        data-testid="admin-settings-header"
      />
      <SettingsLayout items={nav}>
        <ServiceSection type="plex" server={settings.plexServer} health={health.plex} footerMeta={saved("plex")} />
        <ServiceSection type="tautulli" server={settings.tautulli} health={health.tautulli} footerMeta={saved("tautulli")} />
        <ServiceSection type="overseerr" server={settings.overseerr} health={health.overseerr} footerMeta={saved("overseerr")} />
        <AiSection
          chat={settings.chatLLMProvider}
          wrapped={settings.wrappedLLMProvider}
          llmDisabled={settings.config.llmDisabled}
          caps={{
            perUserUsd: settings.config.llmDailyCapPerUserUsd,
            adminUsd: settings.config.llmDailyCapAdminUsd,
            serverUsd: settings.config.llmDailyCapServerUsd,
          }}
          health={health.ai}
          footerMeta={saved("ai")}
        />
        <DiscordSection
          integration={settings.discordIntegration}
          linkedCount={settings.discordLinkedCount}
          portalUrl={`${baseUrl}/discord/link`}
          state={discord.state}
          now={new Date().toISOString()}
          footerMeta={saved("discord")}
        />
        <StripeSection config={stripeConfig} libraries={plexLibraries} health={health.stripe} footerMeta={saved("stripe")} />
        <WatchlistSection
          saved={{ enabled: settings.config.watchlistSyncEnabled, intervalMinutes: settings.config.watchlistSyncIntervalMinutes }}
          stats={watchlistStats}
          health={health.watchlist}
          footerMeta={saved("watchlist")}
        />
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
          footerMeta={saved("rewind")}
        >
          {/* P7.8: Prepare season moved to the season console. */}
          <p className="text-ui text-muted-foreground" data-testid="rewind-season-data-prepared-at">
            {seasonDataPreparedAt ? `Season data last prepared ${f.dateTime(seasonDataPreparedAt)}. ` : "Season data not prepared yet. "}
            <Link href="/admin/rewind" className="text-foreground underline underline-offset-3" data-testid="rewind-season-console-link">
              Prepare the season on the Season page
            </Link>
          </p>
        </RewindSettingsSection>
        <OtherIntegrationsSection
          servers={other}
          jellyfinLogin={settings.jellyfinServer?.enabledForLogin ?? null}
          health={{ sonarr: health.sonarr, radarr: health.radarr, jellyfin: health.jellyfin, prometheus: health.prometheus }}
          footerMeta={saved("other")}
        />
        <SystemSection
          appearance={<LightThemeSwitch enabled={settings.config.lightThemeEnabled} />}
          baseUrl={baseUrl}
          nodeEnv={process.env.NODE_ENV || "development"}
          nodeVersion={process.version}
          databaseProvider={databaseProvider(process.env.DATABASE_URL)}
          databaseUrl={process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@") || "Not configured"}
          platform={PLATFORMS[process.platform] ?? process.platform}
          configUpdated={settings.config.updatedAt ? f.dateTime(settings.config.updatedAt, { zoneLabel: true }) : "Never"}
          timeZone={{ configured: settings.config.timezone, effective: zone }}
          footerMeta={saved("system")}
        />
      </SettingsLayout>
    </div>
  )
}

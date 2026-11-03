import { LastSaved } from "@/components/admin/settings/last-saved"
import { ApiAccessSection } from "@/components/admin/settings/sections/api-access-section"
import { AssistantSection } from "@/components/admin/settings/sections/assistant-section"
import { AiSection } from "@/components/admin/settings/sections/ai-section"
import { ChannelStatsSection } from "@/components/admin/settings/sections/channel-stats-section"
import { DiscordSection } from "@/components/admin/settings/sections/discord-section"
import { JudgeNightlySection } from "@/components/admin/settings/sections/judge-nightly-section"
import { OtherIntegrationsSection } from "@/components/admin/settings/sections/other-integrations-section"
import { PrivacySection } from "@/components/admin/settings/sections/privacy-section"
import { RequestTiersSection } from "@/components/admin/settings/sections/request-tiers-section"
import { ServiceSection } from "@/components/admin/settings/sections/service-section"
import { StripeSection } from "@/components/admin/settings/sections/stripe-section"
import { SystemSection } from "@/components/admin/settings/sections/system-section"
import { TimeZoneSection } from "@/components/admin/settings/sections/time-zone-section"
import { settingsNavItems } from "@/components/admin/settings/settings-groups"
import { SettingsGroup, SettingsLayout } from "@/components/admin/settings/settings-layout"
import { SettingsPageActions } from "@/components/admin/settings/settings-page-actions"
import { PageHeader } from "@/components/ui/page-header"
import { getDiscordOverview } from "@/lib/admin/discord"
import { getAdminSettings, getStripeConfig } from "@/lib/data/admin-settings"
import { getChannelStatsSettings, getRequestTierSettings } from "@/lib/data/community-stats"
import { getAssistantSources } from "@/lib/data/assistant-sources"
import { listOwnApiTokens } from "@/lib/data/api-tokens"
import { getLastRetentionRun } from "@/lib/data/retention"
import { plexLibraryListing } from "@/lib/admin/invites/libraries"
import packageJson from "@/package.json"
import { getBaseUrl, getEnv } from "@/lib/env"
import { getFormat } from "@/lib/settings/app-settings"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"
import { getSettingsHealth } from "@/lib/settings/connection-health"
import { worstStatus } from "@/lib/settings/connection-status"
import { serverZone } from "@/lib/utils/server-zone"
import { connection } from "next/server"
import { assertAdmin } from "@/lib/admin"

const PLATFORMS: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" }

function appVersion() {
  const commit = getEnv().BUILD_COMMIT
  return commit && commit !== "unknown" ? `${packageJson.version} (${commit.slice(0, 7)})` : packageJson.version
}

function databaseProvider(url: string | undefined) {
  if (!url) return "Not configured"
  if (url.startsWith("postgres")) return "PostgreSQL"
  return "Unknown"
}

/**
 * Settings (ui-design-system 6.4, P10.19): a grouped section nav with tone
 * glyphs beside the active group's `SettingsSection`s, each with its live
 * health. The groups and their order are `settingsNavItems`; each
 * `SettingsGroup` below renders its sections in that order.
 */
export default async function SettingsPage() {
  await assertAdmin()
  // The health checks read the clock: render per request, never at build
  await connection()
  // Started, not awaited: the section streams it in (P10.7)
  const plexLibraries = plexLibraryListing()
  const [settings, stripeConfig, health, zone, f] = await Promise.all([
    getAdminSettings(),
    getStripeConfig(),
    getSettingsHealth(),
    serverZone(),
    getFormat(),
  ])
  const [audit, discord, lastRetentionRun, channelStats, requestTiers, assistantSources, apiTokens] = await Promise.all([
    getSettingsAuditMeta(),
    getDiscordOverview(),
    getLastRetentionRun(),
    getChannelStatsSettings(),
    getRequestTierSettings(),
    getAssistantSources(),
    listOwnApiTokens(),
  ])
  // Nothing before a first save, so a read-only section shows no empty footer
  const saved = (id: keyof typeof audit) => audit[id] && <LastSaved id={id} meta={audit[id]} />
  const baseUrl = getBaseUrl()
  const other = {
    sonarr: settings.sonarr,
    radarr: settings.radarr,
    jellyfin: settings.jellyfinServer,
  }
  const otherStatus = worstStatus(
    (Object.keys(other) as (keyof typeof other)[]).filter((key) => other[key]).map((key) => health[key].status)
  )

  const nav = settingsNavItems({
    plex: health.plex.status,
    tautulli: health.tautulli.status,
    overseerr: health.overseerr.status,
    other: otherStatus,
    stripe: health.stripe.status,
    ai: health.ai.status,
    discord: health.discord.status,
  })

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Settings"
        actions={<SettingsPageActions />}
        data-testid="admin-settings-header"
      />
      <SettingsLayout items={nav}>
        <SettingsGroup id="media">
          <ServiceSection type="plex" server={settings.plexServer} health={health.plex} footerMeta={saved("plex")} />
          <ServiceSection type="tautulli" server={settings.tautulli} health={health.tautulli} footerMeta={saved("tautulli")} />
          <ServiceSection type="overseerr" server={settings.overseerr} health={health.overseerr} footerMeta={saved("overseerr")} />
          <OtherIntegrationsSection
            servers={other}
            jellyfinLogin={settings.jellyfinServer?.enabledForLogin ?? null}
            health={{ sonarr: health.sonarr, radarr: health.radarr, jellyfin: health.jellyfin }}
            footerMeta={saved("other")}
          />
        </SettingsGroup>
        <SettingsGroup id="members">
          <StripeSection config={stripeConfig} libraries={plexLibraries} health={health.stripe} footerMeta={saved("stripe")} />
          <RequestTiersSection
            saved={requestTiers}
            startedLabel={requestTiers.lastRun ? f.dateTime(requestTiers.lastRun.startedAt, { zoneLabel: true }) : null}
            footerMeta={saved("requestTiers")}
          />
        </SettingsGroup>
        <SettingsGroup id="ai">
          <AiSection
            chat={settings.chatLLMProvider}
            wrapped={settings.wrappedLLMProvider}
            judge={settings.judgeLLMProvider}
            llmDisabled={settings.config.llmDisabled}
            caps={{
              perUserUsd: settings.config.llmDailyCapPerUserUsd,
              adminUsd: settings.config.llmDailyCapAdminUsd,
              serverUsd: settings.config.llmDailyCapServerUsd,
            }}
            health={health.ai}
            footerMeta={saved("ai")}
          />
          <JudgeNightlySection
            saved={{
              judgeNightlyEnabled: settings.config.judgeNightlyEnabled,
              judgeSampleRate: settings.config.judgeSampleRate,
              judgeMinTurns: settings.config.judgeMinTurns,
              llmDailyCapJudgeUsd: settings.config.llmDailyCapJudgeUsd,
            }}
            footerMeta={saved("judge")}
          />
          <AssistantSection sources={assistantSources} />
        </SettingsGroup>
        <SettingsGroup id="discord">
          <DiscordSection
            integration={settings.discordIntegration}
            linkedCount={settings.discordLinkedCount}
            portalUrl={`${baseUrl}/discord/link`}
            state={discord.state}
            now={new Date().toISOString()}
            footerMeta={saved("discord")}
          />
          <ChannelStatsSection saved={channelStats} footerMeta={saved("channelStats")} />
        </SettingsGroup>
        <SettingsGroup id="system">
          <TimeZoneSection timeZone={{ configured: settings.config.timezone, effective: zone }} footerMeta={saved("timeZone")} />
          <ApiAccessSection tokens={apiTokens} endpoint={`${baseUrl}/api/mcp`} />
          <PrivacySection lastRun={lastRetentionRun} />
          <SystemSection
            baseUrl={baseUrl}
            appVersion={appVersion()}
            nodeEnv={process.env.NODE_ENV || "development"}
            nodeVersion={process.version}
            databaseProvider={databaseProvider(process.env.DATABASE_URL)}
            databaseUrl={process.env.DATABASE_URL?.replace(/\/\/.*@/, "//***@") || "Not configured"}
            platform={PLATFORMS[process.platform] ?? process.platform}
            configUpdated={settings.config.updatedAt ? f.dateTime(settings.config.updatedAt, { zoneLabel: true }) : "Never"}
          />
        </SettingsGroup>
      </SettingsLayout>
    </div>
  )
}

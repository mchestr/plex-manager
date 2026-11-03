import type { Metadata } from "next"
import { connection } from "next/server"

import { LastSaved } from "@/components/admin/settings/last-saved"
import { ChannelStatsSection } from "@/components/admin/settings/sections/channel-stats-section"
import { DiscordSection } from "@/components/admin/settings/sections/discord-section"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { getDiscordOverview } from "@/lib/admin/discord"
import { getAdminSettings } from "@/lib/data/admin-settings"
import { getChannelStatsSettings } from "@/lib/data/community-stats"
import { getBaseUrl } from "@/lib/env"
import { getSettingsAuditMeta } from "@/lib/settings/audit-meta"

export const metadata: Metadata = { title: "Discord settings" }

/**
 * The Settings tab of the Discord section: the Discord integration (linked
 * roles and the support bot) and the channel stats, moved here from Settings
 * with the same sections and props.
 */
export default async function DiscordSettingsPage() {
  await assertAdmin()
  // The bot's status reads the clock: render per request, never at build
  await connection()
  const [settings, overview, channelStats, audit] = await Promise.all([
    getAdminSettings(),
    getDiscordOverview(),
    getChannelStatsSettings(),
    getSettingsAuditMeta(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-discord-settings-page">
      <PageHeader title="Discord settings" data-testid="admin-discord-settings-header" />
      <DiscordSection
        integration={settings.discordIntegration}
        linkedCount={settings.discordLinkedCount}
        portalUrl={`${getBaseUrl()}/discord/link`}
        state={overview.state}
        now={new Date().toISOString()}
        // Nothing before a first save, so a read-only section shows no empty footer
        footerMeta={audit.discord && <LastSaved id="discord" meta={audit.discord} />}
      />
      <ChannelStatsSection saved={channelStats} footerMeta={audit.channelStats && <LastSaved id="channelStats" meta={audit.channelStats} />} />
    </div>
  )
}

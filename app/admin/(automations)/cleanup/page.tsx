import { connection } from "next/server"
import type { ReactNode } from "react"
import { z } from "zod"

import { HistoryTab } from "@/components/admin/cleanup/history/history-tab"
import { KeptTab } from "@/components/admin/cleanup/kept/kept-tab"
import { LeavingTab } from "@/components/admin/cleanup/leaving/leaving-tab"
import { CleanupTabs } from "@/components/admin/cleanup/page/cleanup-tabs"
import { HeaderActions } from "@/components/admin/cleanup/page/header-actions"
import { PageAlerts } from "@/components/admin/cleanup/page/page-alerts"
import { RulesTab } from "@/components/admin/cleanup/rules/rules-tab"
import { SettingsTab } from "@/components/admin/cleanup/settings/settings-tab"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { CLEANUP_TABS, type CleanupTab } from "@/lib/admin/routes"
import { IN_LEAVING_SOON } from "@/lib/cleanup/screens/overview/library"
import { getCleanupHistory } from "@/lib/data/cleanup-history"
import { getCleanupLeavingSoon } from "@/lib/data/cleanup-leaving"
import { getCleanupOverview } from "@/lib/data/cleanup-overview"
import { getCleanupProtections } from "@/lib/data/cleanup-protections"
import { getCleanupSettings } from "@/lib/data/cleanup-settings"
import { prisma } from "@/lib/prisma"

type SearchParams = Record<string, string | string[] | undefined>

const searchSchema = z.object({ tab: z.enum(CLEANUP_TABS).catch("rules") })

/** UX 4.0 and 8.1. */
const DESCRIPTION = "Find media that nobody watches. Matches wait in Leaving soon, where members can keep them. Then Radarr or Sonarr deletes them."

/** The titles in Leaving soon, for the count on the "Leaving soon" tab of every tab (TS 12.3 item 4a). */
const countLeavingSoon = () => prisma.cleanupItem.count({ where: { state: { in: [...IN_LEAVING_SOON] } } })

/** The root of a tab other than Rules, with its own loader. Rules renders from the overview that every tab reads. */
async function otherTab(tab: Exclude<CleanupTab, "rules">, params: SearchParams, now: Date): Promise<ReactNode> {
  switch (tab) {
    case "leaving-soon":
      return <LeavingTab data={await getCleanupLeavingSoon(params, now)} />
    case "kept":
      return <KeptTab data={await getCleanupProtections(params, now)} />
    case "history":
      return <HistoryTab data={await getCleanupHistory(params, now)} />
    case "settings":
      return <SettingsTab data={await getCleanupSettings(now)} />
  }
}

/**
 * Media cleanup, the last tab of Automations (UX 4.0, TS 12.2): the page
 * header with Pause or Resume and New rule, the page alerts, and five tabs
 * from `?tab=`, an unknown one reading Rules. Like the Affiliates page, it
 * renders only the active tab.
 *
 * Every tab reads the Rules tab data beside its own loader, with one clock:
 * the header and the alerts need its feature state, safety stops, rule
 * count and recipes on every tab. On first use (no rule) the header has no
 * action, and on the Rules tab the off alert sits in the first-use state.
 * The render never starts a library read: the first-use state asks for one
 * from the browser (TS 7.10).
 */
export default async function CleanupPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await assertAdmin()
  // Rules and recipes are evaluated against the clock: render per request, never at build
  await connection()
  const now = new Date()
  const params = await searchParams
  const { tab } = searchSchema.parse({ tab: params.tab })
  const [overview, leavingCount, panel] = await Promise.all([
    getCleanupOverview(now),
    countLeavingSoon(),
    tab === "rules" ? null : otherTab(tab, params, now),
  ])
  const firstUse = overview.rules.length === 0
  const { feature } = overview

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-cleanup-page">
      <PageHeader
        title="Media cleanup"
        description={DESCRIPTION}
        actions={
          firstUse ? undefined : (
            <HeaderActions feature={feature} recipes={overview.recipes} graceDays={overview.defaults.graceDays} now={now.getTime()} />
          )
        }
        data-testid="admin-cleanup-header"
      />
      <PageAlerts
        feature={feature}
        blocks={overview.blocks}
        kometa={overview.kometa}
        reading={overview.snapshot.reading}
        now={now.getTime()}
        showOff={!(firstUse && tab === "rules")}
      />
      <CleanupTabs active={tab} leavingCount={leavingCount}>
        {panel ?? <RulesTab data={overview} />}
      </CleanupTabs>
    </div>
  )
}

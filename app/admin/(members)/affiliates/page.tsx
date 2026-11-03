import { z } from "zod"

import { AffiliateTabs } from "@/components/admin/affiliates/affiliate-tabs"
import { AffiliateSettingsSection } from "@/components/admin/affiliates/settings/affiliate-settings-section"
import { AffiliatesTable } from "@/components/admin/affiliates/affiliates-table"
import { ApplicationsTable } from "@/components/admin/affiliates/applications-table"
import { HistoryTab } from "@/components/admin/affiliates/history-tab"
import { InviteTree } from "@/components/admin/affiliates/invite-tree"
import { PageHeader } from "@/components/ui/page-header"
import { assertPermission } from "@/lib/admin"
import { plexLibraryListing } from "@/lib/admin/invites/libraries"
import { AFFILIATE_TABS, type AffiliateTab } from "@/lib/admin/routes"
import { getAffiliateHistory } from "@/lib/data/affiliate-history"
import { getAffiliateSettingsView, getPlexShareCount } from "@/lib/data/affiliate-settings"
import { getInviteTree, listAffiliateApplications, listAffiliates } from "@/lib/data/affiliates"
import { getFormat } from "@/lib/settings/app-settings"

const searchSchema = z.object({ tab: z.enum(AFFILIATE_TABS).catch("applications") })

const LABELS: Record<AffiliateTab, string> = { applications: "Applications", affiliates: "Affiliates", tree: "Invite tree", history: "History", settings: "Settings" }
const ADMIN_TABS: readonly AffiliateTab[] = ["history", "settings"]

/**
 * The admin Affiliates page: one server-rendered tab from `?tab=`. Support
 * sees the first three tabs and decides nothing; History, with the block list,
 * and Settings are for admins only. Settings streams the Plex libraries and
 * share count, so the tab never waits for Plex.
 */
export default async function AffiliatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await assertPermission("affiliates:read")
  const admin = session.user.isAdmin
  const tabs = AFFILIATE_TABS.filter((tab) => admin || !ADMIN_TABS.includes(tab)).map((value) => ({ value, label: LABELS[value] }))
  const asked = searchSchema.parse({ tab: (await searchParams).tab }).tab
  const active = tabs.some((tab) => tab.value === asked) ? asked : "applications"

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-affiliates-page">
      <PageHeader title="Affiliates" description="Members who can invite people to the server." data-testid="admin-affiliates-header" />
      <AffiliateTabs tabs={tabs} active={active}>
        {active === "applications" && <ApplicationsTable rows={await listAffiliateApplications()} admin={admin} />}
        {active === "affiliates" && <AffiliatesTable rows={await listAffiliates()} admin={admin} />}
        {active === "tree" && <InviteTree roots={await getInviteTree()} f={await getFormat()} />}
        {active === "history" && <HistoryTab {...await getAffiliateHistory()} />}
        {active === "settings" && (
          <AffiliateSettingsSection saved={await getAffiliateSettingsView()} libraries={plexLibraryListing()} shareCount={getPlexShareCount()} />
        )}
      </AffiliateTabs>
    </div>
  )
}

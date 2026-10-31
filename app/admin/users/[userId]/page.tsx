import { notFound } from "next/navigation"
import { z } from "zod"

import { BillingTab } from "@/components/admin/users/detail/billing-tab"
import { DetailTabs } from "@/components/admin/users/detail/detail-tabs"
import { OverviewTab } from "@/components/admin/users/detail/overview-tab"
import { RewindTab } from "@/components/admin/users/detail/rewind-tab"
import { UsageTab } from "@/components/admin/users/detail/usage-tab"
import { UserDetailHeader } from "@/components/admin/users/detail/user-detail-header"
import { assertAdmin } from "@/lib/admin"
import { USER_DETAIL_TABS, type UserDetailTab } from "@/lib/admin/routes"
import { billingVisible, getUserDetailHeader } from "@/lib/admin/user-detail"
import { regenerateEstimateCopy } from "@/lib/admin/user-detail-tabs"
import { getFormat } from "@/lib/settings/app-settings"
import { getStripeDashboardBaseUrl } from "@/lib/stripe/client"
import { getSeasonYear } from "@/lib/wrapped/season"

const searchSchema = z.object({ tab: z.enum(USER_DETAIL_TABS).catch("overview") })

const LABELS: Record<UserDetailTab, string> = { overview: "Overview", rewind: "Rewind", usage: "Usage", billing: "Billing", audit: "Audit" }

interface UserDetailPageProps {
  params: Promise<{ userId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** A member as an entity page (P10.6): the header, then one server-rendered tab. */
export default async function UserDetailPage({ params, searchParams }: UserDetailPageProps) {
  await assertAdmin()
  const [{ userId }, query, seasonYear, f, stripeDashboardBaseUrl] = await Promise.all([
    params,
    searchParams,
    getSeasonYear(),
    getFormat(),
    getStripeDashboardBaseUrl(),
  ])
  const header = await getUserDetailHeader(userId, seasonYear)
  if (!header) notFound()

  const now = new Date().getTime()
  const estimateCopy = await regenerateEstimateCopy(seasonYear, f)
  const tabs = USER_DETAIL_TABS.filter((tab) => tab !== "billing" || billingVisible(header)).map((value) => ({ value, label: LABELS[value] }))
  const asked = searchSchema.parse({ tab: query.tab }).tab
  const active = tabs.some((tab) => tab.value === asked) ? asked : "overview"

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <UserDetailHeader header={header} stripeDashboardBaseUrl={stripeDashboardBaseUrl} estimateCopy={estimateCopy} now={now} />
        <DetailTabs userId={header.id} tabs={tabs} active={active}>
          {active === "overview" && <OverviewTab header={header} f={f} />}
          {active === "rewind" && <RewindTab userId={header.id} name={header.name} seasonYear={seasonYear} f={f} now={now} />}
          {active === "usage" && <UsageTab userId={header.id} f={f} />}
          {active === "billing" && <BillingTab header={header} f={f} />}
        </DetailTabs>
      </div>
    </div>
  )
}

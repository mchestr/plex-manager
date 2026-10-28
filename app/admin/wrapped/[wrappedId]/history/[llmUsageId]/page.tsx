import { SearchX } from "lucide-react"

import { LlmTextRemovedNotice } from "@/components/admin/llm-usage/llm-text-removed-notice"
import { HistoricalWrappedSelectorHeader } from "@/components/admin/wrapped/historical-wrapped-selector-header"
import { ArchiveArticle } from "@/components/rewind/article/archive-article"
import { RewindScope } from "@/components/rewind/stage/rewind-scope"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { assertAdmin } from "@/lib/admin"
import { getHistoricalWrappedData, getHistoricalWrappedVersions } from "@/lib/admin/rewind-history"
import { userDetail } from "@/lib/admin/routes"
import { serverName } from "@/lib/brand"
import { rewindFontVariables } from "@/lib/rewind/fonts"
import { getAppSettings, getFormat } from "@/lib/settings/app-settings"

/** One stored generation of a legacy Rewind (P7.13's renderer), inside the admin shell (P10.6, UI-21). */
export default async function HistoricalWrappedPage({ params }: { params: Promise<{ wrappedId: string; llmUsageId: string }> }) {
  await assertAdmin()
  const { wrappedId, llmUsageId } = await params

  const [historicalData, versions, f, settings, brand] = await Promise.all([
    getHistoricalWrappedData(llmUsageId, wrappedId),
    getHistoricalWrappedVersions(wrappedId),
    getFormat(),
    getAppSettings(),
    serverName(),
  ])

  if (!historicalData) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
        <PageHeader breadcrumbs={[{ label: "Users", href: "/admin/users" }, { label: "Version not found" }]} title="Version not found" />
        <EmptyState
          kind="unavailable"
          icon={SearchX}
          title="This version can't be shown"
          description="The app can't find or read the stored version."
          data-testid="admin-wrapped-history-missing"
        />
      </div>
    )
  }

  const { llmUsage, userId, userName, year } = historicalData
  const version = `Version of ${f.dateTime(llmUsage.createdAt, { zoneLabel: true })}`

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        breadcrumbs={[
          { label: "Users", href: "/admin/users" },
          { label: userName, href: userDetail(userId) },
          { label: `Rewind ${year}`, href: userDetail(userId, { tab: "rewind" }) },
          { label: version },
        ]}
        title={`${userName}'s Rewind ${year}`}
        description={`${version}, from ${llmUsage.provider}/${llmUsage.model || "unknown"}`}
        actions={
          <HistoricalWrappedSelectorHeader
            wrappedId={wrappedId}
            userId={userId}
            year={year}
            selectedId={llmUsage.id}
            versions={versions.map((v) => ({
              id: v.id,
              label: f.dateTime(v.createdAt, { zoneLabel: true }),
              detail: `${v.provider}/${v.model || "unknown"} · ${f.money(v.cost)}`,
              isCurrent: v.isCurrent,
            }))}
          />
        }
        data-testid="admin-wrapped-history-heading"
      />
      {historicalData.removed ? (
        <LlmTextRemovedNotice title="Historical version" />
      ) : (
        <RewindScope fontClassName={rewindFontVariables}>
          <ArchiveArticle legacy={historicalData.wrappedData} year={year} brand={brand} locale={settings.locale} />
        </RewindScope>
      )}
    </div>
  )
}

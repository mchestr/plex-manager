import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"

import { ArchiveActions, ArchiveArticle } from "@/components/rewind/article/archive-article"
import { RewindIssue } from "@/components/rewind/rewind-issue"
import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { RewindSharedYearsNotice } from "@/components/rewind/shared-years-notice"
import { authOptions } from "@/lib/auth"
import { rewindName, serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { previewOwnerId, readPreview } from "@/lib/rewind/dry-run/store"
import { safeReturnPath } from "@/lib/rewind/return-to"
import { loadRewindYearView } from "@/lib/rewind/year-view"
import { getAppSettings } from "@/lib/settings/app-settings"
import { yearParamSchema } from "@/lib/validations/params"
import { listCompletedRewindYears } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

type YearPageProps = {
  params: Promise<{ year: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** "{server name} Rewind {year}", absolute: the root template would add the server name again. */
export async function generateMetadata({ params }: YearPageProps): Promise<Metadata> {
  const parsed = yearParamSchema.safeParse((await params).year)
  const robots = { index: false }
  return parsed.success ? { title: { absolute: await rewindName(parsed.data) }, robots } : { robots }
}

/** The member's own Rewind for the year in the route (FR-1, RWP-04, RWV-02, UI-02). */
export default async function RewindYearPage({ params, searchParams }: YearPageProps) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect("/")
  }

  // proxy.ts answers the same years with a 404 status (app/loading.tsx streams the page)
  const parsedYear = yearParamSchema.safeParse((await params).year)
  if (!parsedYear.success) {
    notFound()
  }
  const year = parsedYear.data
  const userId = session.user.id
  const { from, sheet, preview } = await searchParams
  const returnTo = safeReturnPath(typeof from === "string" ? from : null)

  // An admin's dry run (P7.10); members get the 404 the route gives any unknown page.
  if (preview !== undefined) {
    if (!session.user.isAdmin) notFound()
    const found = await readPreview(preview, year)
    if (!found) {
      return <RewindStatusPanel kind="not-found" code="REWIND_NOT_FOUND" year={year} returnTo={returnTo} audience="admin" />
    }
    return <RewindIssue rewindId={found.id} data={found.run.data} userId={previewOwnerId(found.run.subject)} returnTo={returnTo} preview />
  }

  const [view, sharedRows, completedYears] = await Promise.all([
    loadRewindYearView({ userId, isAdmin: session.user.isAdmin }, year),
    // Every year of the member's own with a live v2 public link, so they can
    // still be stopped: archive articles have no share controls (SEC-16).
    prisma.plexWrapped.findMany({
      where: { userId, shareToken: { not: null } },
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    listCompletedRewindYears(userId),
  ])

  const sharedNotice = <RewindSharedYearsNotice years={sharedRows.map((row) => row.year)} />

  if (view.kind === "issue") {
    return (
      <>
        {sharedNotice}
        <RewindIssue rewindId={view.id} data={view.data} userId={userId} returnTo={returnTo} initialSheet={sheet === "share" ? "share" : undefined} />
      </>
    )
  }

  if (view.kind === "legacy") {
    // A stored v1 or v2 year is an archive article: no story, cards or sharing (P7.13)
    const [brand, settings] = await Promise.all([serverName(), getAppSettings()])
    return (
      <ArchiveArticle
        legacy={view.data}
        year={year}
        brand={brand}
        locale={settings.locale}
        notice={sharedNotice}
        actions={<ArchiveActions year={year} years={completedYears} returnTo={returnTo} />}
      />
    )
  }

  return (
    <RewindStatusPanel
      kind={view.panel}
      code={view.code}
      year={year}
      returnTo={returnTo}
      audience={session.user.isAdmin ? "admin" : "member"}
      completedYears={completedYears}
    >
      {sharedNotice}
    </RewindStatusPanel>
  )
}

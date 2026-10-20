import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"

import { RewindIssue } from "@/components/rewind/rewind-issue"
import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { WrappedSharedYearsNotice } from "@/components/wrapped/wrapped-shared-years-notice"
import { WrappedViewerWrapper } from "@/components/wrapped/wrapped-viewer-wrapper"
import { WrappedYearLinks } from "@/components/wrapped/wrapped-year-links"
import { authOptions } from "@/lib/auth"
import { rewindName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { safeReturnPath } from "@/lib/rewind/return-to"
import { loadRewindYearView } from "@/lib/rewind/year-view"
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
  const from = (await searchParams).from
  const returnTo = safeReturnPath(typeof from === "string" ? from : null)

  const [view, sharedRows, completedYears] = await Promise.all([
    loadRewindYearView({ userId, isAdmin: session.user.isAdmin }, year),
    // Every year of the member's own with a live public link, so links on
    // years the viewer does not show can still be stopped (SEC-16).
    prisma.plexWrapped.findMany({
      where: { userId, shareToken: { not: null } },
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    listCompletedRewindYears(userId),
  ])

  // The legacy viewer has its own controls for the year it shows.
  const otherSharedYears = sharedRows.map((row) => row.year).filter((shared) => !(view.kind === "legacy" && shared === year))
  const sharedNotice = <WrappedSharedYearsNotice years={otherSharedYears} />

  if (view.kind === "issue") {
    return (
      <>
        {sharedNotice}
        <RewindIssue data={view.data} userId={userId} returnTo={returnTo} />
      </>
    )
  }

  if (view.kind === "legacy") {
    // v1 and v2 keep the app's font and colours until P7.13's archive article
    return (
      <div className="font-sans">
        {sharedNotice}
        <WrappedYearLinks years={completedYears} currentYear={year} />
        <WrappedViewerWrapper
          wrappedData={view.data}
          year={year}
          shareToken={view.shareToken ?? undefined}
          canManageShare
        />
      </div>
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

import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getUserPlexWrapped } from "@/actions/users"
import { WrappedSharedYearsNotice } from "@/components/wrapped/wrapped-shared-years-notice"
import { WrappedYearLinks } from "@/components/wrapped/wrapped-year-links"
import { WrappedYearView } from "@/components/wrapped/wrapped-year-view"
import { prisma } from "@/lib/prisma"
import { yearParamSchema } from "@/lib/validations/params"
import { legacyWrappedData, readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { getSeasonYear, listCompletedRewindYears } from "@/lib/wrapped/season"

export const dynamic = 'force-dynamic'

/** The member's own Rewind for the year in the route (RWP-04, RWV-02, UI-02). */
export default async function WrappedYearPage({ params }: { params: Promise<{ year: string }> }) {
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

  const [wrappedResult, sharedRows, completedYears, seasonYear] = await Promise.all([
    // Reads only the session member's row: the ownership check is inside.
    getUserPlexWrapped({ userId, year }),
    // Every year of the member's own with a live public link, so links on
    // years the viewer does not show can still be stopped (SEC-16).
    prisma.plexWrapped.findMany({
      where: { userId, shareToken: { not: null } },
      select: { year: true },
      orderBy: { year: "desc" },
    }),
    listCompletedRewindYears(userId),
    getSeasonYear(),
  ])

  const wrapped = wrappedResult.success ? wrappedResult.data : null
  const wrappedData =
    wrapped && readWrappedStatus(wrapped.status, wrapped.id) === "completed" && wrapped.data ? legacyWrappedData(wrapped) : null
  // The viewer has its own controls for the year it shows.
  const otherSharedYears = sharedRows.map((row) => row.year).filter((shared) => !(wrappedData && shared === year))

  return (
    <>
      <WrappedSharedYearsNotice years={otherSharedYears} />
      <WrappedYearLinks years={completedYears} currentYear={year} />
      <WrappedYearView
        userId={userId}
        year={year}
        wrapped={wrapped}
        wrappedData={wrappedData}
        seasonYear={seasonYear}
        latestYear={completedYears[0] ?? null}
      />
    </>
  )
}

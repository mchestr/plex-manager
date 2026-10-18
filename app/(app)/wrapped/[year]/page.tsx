import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { getUserPlexWrapped } from "@/actions/users"
import { WrappedSharedYearsNotice } from "@/components/wrapped/wrapped-shared-years-notice"
import { WrappedYearLinks } from "@/components/wrapped/wrapped-year-links"
import { WrappedYearView } from "@/components/wrapped/wrapped-year-view"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { getSeasonYear, listCompletedRewindYears } from "@/lib/wrapped/season"
import { WrappedData } from "@/types/wrapped"

export const dynamic = 'force-dynamic'

const logger = createLogger("WRAPPED_PAGE")

/** Four digits only, so `/wrapped/0x7EA` or `/wrapped/2026.0` is a 404, not a second URL for 2026. */
const yearParamSchema = z
  .string()
  .regex(/^\d{4}$/)
  .pipe(z.coerce.number<string>().int().min(2010).max(2100))

function parseWrappedData(data: string): WrappedData | null {
  try {
    return JSON.parse(data) as WrappedData
  } catch (error) {
    logger.error("Failed to parse wrapped data", error)
    return null
  }
}

/** The member's own Rewind for the year in the route (RWP-04, RWV-02, UI-02). */
export default async function WrappedYearPage({ params }: { params: Promise<{ year: string }> }) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  const parsedYear = yearParamSchema.safeParse((await params).year)
  if (!parsedYear.success) {
    notFound()
  }
  const year = parsedYear.data
  const userId = session.user.id

  const [wrapped, sharedRows, completedYears, seasonYear] = await Promise.all([
    // Reads only the session member's row: the ownership check is inside.
    getUserPlexWrapped(userId, year),
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

  const wrappedData =
    wrapped && wrapped.status === "completed" && wrapped.data ? parseWrappedData(wrapped.data) : null
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
        latestYear={completedYears[0] ?? seasonYear}
      />
    </>
  )
}

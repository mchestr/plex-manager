import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getLatestCompletedRewindYear, getSeasonYear } from "@/lib/wrapped/season"

export const dynamic = 'force-dynamic'

/**
 * Resolves `/wrapped` to a year: the member's latest completed Rewind, else
 * the season year. The year comes from data, never the calendar, so in
 * January a finished 2026 Rewind still opens (RWP-04, RWV-02, UI-02).
 */
export default async function WrappedResolverPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect("/")
  }

  const year = (await getLatestCompletedRewindYear(session.user.id)) ?? (await getSeasonYear())
  redirect(`/wrapped/${year}`)
}

import { getServerSession } from "next-auth"

import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { authOptions } from "@/lib/auth"
import { listCompletedRewindYears } from "@/lib/wrapped/season"

/**
 * A `/rewind/<year>` whose year is outside 2010 to 2100 (proxy.ts sends the
 * 404 status): the `not-found` panel with links to the member's own years.
 */
export default async function RewindYearNotFound() {
  const session = await getServerSession(authOptions)
  const completedYears = session ? await listCompletedRewindYears(session.user.id) : []

  return (
    <RewindStatusPanel
      kind="not-found"
      code="REWIND_NOT_FOUND"
      year={null}
      returnTo="/"
      audience="member"
      completedYears={completedYears}
    />
  )
}

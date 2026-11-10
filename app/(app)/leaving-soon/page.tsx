import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { LeavingSoonPage } from "@/components/leaving-soon/leaving-soon-page"
import { serverName } from "@/lib/brand"
import { getLeavingSoonForMember } from "@/lib/data/leaving-soon"
import { getSession } from "@/lib/data/session"

import { shortestGraceDays } from "./grace"

export const metadata: Metadata = { title: "Leaving soon" }

/**
 * The member's Leaving soon page (UX 9.2, TS 13.3). It renders for every
 * signed-in member: with nothing to show, the empty state, and while plex.tv
 * does not answer, the warning (UX 9.1). The data holds only titles in
 * libraries shared with the member, and no size, rule name or other member.
 */
export default async function LeavingSoonRoute() {
  const session = await getSession()
  if (!session?.user?.id) redirect("/")

  const [data, name, graceDays] = await Promise.all([getLeavingSoonForMember(session.user.id), serverName(), shortestGraceDays()])

  return <LeavingSoonPage data={data} serverName={name} graceDays={graceDays ?? undefined} />
}

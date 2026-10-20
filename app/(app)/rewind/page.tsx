import { redirect } from "next/navigation"
import { getServerSession } from "next-auth"

import { authOptions } from "@/lib/auth"
import { resolveRewindYear } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

/** The query keys `/rewind` hands on to the year it opens. */
const KEPT_PARAMS = ["from", "sheet"] as const

/**
 * Resolves `/rewind` to a year from data (FR-1, RWP-04): the season year when
 * the member has a row for it, else their latest completed Rewind, else the
 * season year. So in January the finished 2026 issue opens, not an empty 2027.
 */
export default async function RewindResolverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await getServerSession(authOptions)
  if (!session) {
    redirect("/")
  }

  const query = await searchParams
  const kept = new URLSearchParams()
  for (const key of KEPT_PARAMS) {
    const value = query[key]
    if (typeof value === "string") kept.set(key, value)
  }
  const search = kept.size > 0 ? `?${kept}` : ""

  redirect(`/rewind/${await resolveRewindYear(session.user.id)}${search}`)
}

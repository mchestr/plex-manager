import { notFound } from "next/navigation"
import { connection } from "next/server"

import { TurnOnView } from "@/components/admin/cleanup/turn-on/turn-on-view"
import { assertAdmin } from "@/lib/admin"
import { getCleanupTurnOn } from "@/lib/data/cleanup-turn-on"
import { isRedisConfigured } from "@/lib/queue/connection"

type Query = Record<string, string | string[] | undefined>

/**
 * The turn-on review of a rule, or its Change mode page when the rule is
 * live (UX 4.6, TS 12.2): `/admin/cleanup/rules/{id}/turn-on`, with
 * `?mode=automatic` to preselect Automatic. It reads the rule's review with
 * `getCleanupTurnOn()` and changes nothing: only the button on the page
 * turns the rule on. A rule that does not exist is a 404.
 */
export default async function CleanupTurnOnPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Query> }) {
  await assertAdmin()
  // The review reads the clock (`reviewedAt`, the 15-minute limit): render per request, never at build
  await connection()
  const [{ id }, query] = await Promise.all([params, searchParams])
  const data = await getCleanupTurnOn(id, query.mode === "automatic" ? "automatic" : undefined)
  if (!data) notFound()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6" data-testid="admin-cleanup-turn-on-page">
      <TurnOnView data={data} redis={isRedisConfigured()} />
    </div>
  )
}

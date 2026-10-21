import { notFound, redirect } from "next/navigation"

import { getAdminGate } from "@/lib/admin"
import { userRewind } from "@/lib/admin/routes"
import { recordIdSchema, yearParamSchema } from "@/lib/validations/params"
import { getSeasonYear, listCompletedRewindYears } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

/**
 * The old admin viewer's address (P7.9): redirects to the preview with the
 * year in the path. The year is `?year=`, else the member's latest completed
 * year, else the season year. The preview checks the admin.
 */
export default async function UserWrappedRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>
  searchParams: Promise<{ year?: string | string[] }>
}) {
  const userId = recordIdSchema.safeParse((await params).userId)
  if (!userId.success) notFound()

  const asked = yearParamSchema.safeParse((await searchParams).year)
  if (asked.success) redirect(userRewind(userId.data, asked.data))

  // Only an admin learns which years the member has; the preview denies everyone else.
  const gate = await getAdminGate()
  const latest = gate.ok ? (await listCompletedRewindYears(userId.data))[0] : undefined
  redirect(userRewind(userId.data, latest ?? (await getSeasonYear())))
}

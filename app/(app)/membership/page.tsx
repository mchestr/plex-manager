import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { notFound, redirect } from "next/navigation"

import { MembershipDetails } from "@/components/subscription/membership-details"
import { authOptions } from "@/lib/auth"
import { getMembership } from "@/lib/member/membership"
import { hasMembershipPage } from "@/lib/member/membership-page"
import { getFormatSettings } from "@/lib/settings/app-settings"

export const metadata: Metadata = { title: "Membership" }

/**
 * Membership (ui-design-system 6.1, UI-37): the plan, its renewal and Manage
 * billing, moved off home. A 404 unless Stripe is on or the member has a
 * subscription row.
 */
export default async function MembershipPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")
  const userId = session.user.id

  if (!(await hasMembershipPage(userId))) notFound()

  const [membership, settings] = await Promise.all([getMembership(userId), getFormatSettings()])

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-140 flex-col gap-6">
        <h1 className="text-h1 text-foreground">Membership</h1>
        <MembershipDetails membership={membership} settings={settings} />
      </div>
    </div>
  )
}

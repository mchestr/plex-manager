import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { InvitesView } from "@/components/invites/invites-view"
import { getSession } from "@/lib/data/session"
import { getInvitesPageData } from "@/lib/member/invites"
import { hasInvitesPage } from "@/lib/member/invites-page"

export const metadata: Metadata = { title: "Invites" }

/**
 * Invites: apply to be an affiliate, and as one make, copy and cancel invites
 * and see who joined. A 404 unless the affiliate switch reads as on and the
 * member has a Plex id. It shows stored watch hours only; Apply and Make
 * check them live.
 */
export default async function InvitesPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect("/")
  const userId = session.user.id

  if (!(await hasInvitesPage(userId))) notFound()

  const data = await getInvitesPageData(userId)

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-160 flex-col gap-8">
        <h1 className="text-h1 text-foreground">Invites</h1>
        <InvitesView data={data} />
      </div>
    </div>
  )
}

import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/**
 * The Members section's tab strip over its three pages: Users, Invites and
 * Affiliates, sibling routes this group keeps at their URLs. The tabs are the
 * nav item's `children` the signed-in user may open, so Support gets Users and
 * Affiliates. Not an authorisation boundary: each page checks for itself.
 */
export default async function MembersSectionLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const tabs = session?.user ? childrenOf("members", session.user) : []
  return (
    <>
      <SectionTabs itemId="members" label="Members" tabs={tabs} />
      {children}
    </>
  )
}

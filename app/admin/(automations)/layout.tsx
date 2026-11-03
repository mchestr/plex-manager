import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/**
 * The Automations section's tab strip over its four pages: Watchlist sync,
 * Inactive members, Request limits and Queues, sibling routes this group keeps
 * at their URLs. The tabs are the nav item's `children` the signed-in user may
 * open. Not an authorisation boundary: each page checks for itself.
 */
export default async function AutomationsSectionLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const tabs = session?.user ? childrenOf("automations", session.user) : []
  return (
    <>
      <SectionTabs itemId="automations" label="Automations" tabs={tabs} />
      {children}
    </>
  )
}

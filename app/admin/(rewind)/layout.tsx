import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/**
 * The Rewind section's tab strip over its four pages: Season (`/admin/rewind`),
 * Playground, Shares (`/admin/shares`, a sibling route kept by this group) and
 * Settings. The tabs are the nav item's `children` the signed-in user may open.
 * Not an authorisation boundary: each page checks for itself.
 */
export default async function RewindSectionLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const tabs = session?.user ? childrenOf("rewind", session.user) : []
  return (
    <>
      <SectionTabs itemId="rewind" label="Rewind" tabs={tabs} />
      {children}
    </>
  )
}

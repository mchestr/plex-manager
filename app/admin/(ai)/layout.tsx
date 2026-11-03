import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/**
 * The AI section: Activity, Cost and Settings above the pages of the `(ai)`
 * route group. The strip is for display only; each page checks `assertAdmin()`
 * itself.
 */
export default async function AiSectionLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const tabs = session?.user ? childrenOf("ai", session.user) : []

  return (
    <>
      <SectionTabs itemId="ai" label="AI" tabs={tabs} />
      {children}
    </>
  )
}

import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { ADMIN_NAV, childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/**
 * The layout of an admin section with tabs, for the `ADMIN_NAV` item
 * `itemId`: the item's `children` the signed-in user may open, drawn by
 * `SectionTabs` and named by the item's label, above the page. A section's
 * route group exports it as its layout:
 *
 * ```tsx
 * // app/admin/(rewind)/layout.tsx
 * export default sectionLayout("rewind")
 * ```
 *
 * The strip is for display only, not an authorisation boundary: each page
 * checks for itself. Without a session it draws nothing, and the page
 * renders either way.
 */
export function sectionLayout(itemId: string) {
  const item = ADMIN_NAV.find((candidate) => candidate.id === itemId)
  if (!item) throw new Error(`sectionLayout: "${itemId}" is not an ADMIN_NAV item`)

  return async function SectionLayout({ children }: { children: ReactNode }) {
    const session = await getSession()
    const tabs = session?.user ? childrenOf(itemId, session.user) : []
    return (
      <>
        <SectionTabs itemId={itemId} label={item.label} tabs={tabs} />
        {children}
      </>
    )
  }
}

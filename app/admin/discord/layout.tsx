import type { ReactNode } from "react"

import { SectionTabs } from "@/components/admin/section-tabs"
import { childrenOf } from "@/lib/admin/nav"
import { getSession } from "@/lib/data/session"

/** The Discord section's tab strip (Activity, Settings) above its pages. The tabs are display only: each page checks the admin itself. */
export default async function DiscordSectionLayout({ children }: { children: ReactNode }) {
  const session = await getSession()
  const tabs = session?.user ? childrenOf("discord", session.user) : []
  return (
    <>
      <SectionTabs itemId="discord" label="Discord" tabs={tabs} />
      {children}
    </>
  )
}

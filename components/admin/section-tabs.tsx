"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs"

export interface SectionTab {
  id: string
  label: string
  href: Route
}

/**
 * The tab strip of an admin section (Members, Rewind, ...): `Tabs` with a
 * `Link` per tab, selecting the tab whose `href` is the pathname. The pathname
 * is the only thing that selects, so there is no `onValueChange`: a click
 * follows the link and the next page renders the next selection.
 *
 * It renders nothing when no tab's `href` equals the pathname, so a page
 * below a tab (a user, an invite, a conversation) shows no strip.
 *
 * A layout renders it above `{children}` with the tabs the signed-in user may
 * open, in the gutter the pages use so it lines up with their header:
 *
 * ```tsx
 * const session = await getSession()
 * const tabs = session?.user ? childrenOf("rewind", session.user) : []
 * <div className="px-4 pt-4 sm:px-6">
 *   <SectionTabs itemId="rewind" label="Rewind" tabs={tabs} />
 * </div>
 * ```
 *
 * Test ids: `admin-section-tabs-<itemId>` on the list, `admin-section-tab-<tab.id>` on each tab.
 */
export function SectionTabs({ itemId, label, tabs }: { itemId: string; label: string; tabs: SectionTab[] }): ReactNode {
  const pathname = usePathname()
  const current = tabs.find((tab) => tab.href === pathname)
  if (!current) return null

  return (
    <Tabs value={current.id}>
      <TabsList aria-label={label} data-testid={`admin-section-tabs-${itemId}`}>
        {tabs.map((tab) => (
          <TabsTab
            key={tab.id}
            value={tab.id}
            nativeButton={false}
            render={<Link href={tab.href} />}
            data-testid={`admin-section-tab-${tab.id}`}
          >
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  )
}

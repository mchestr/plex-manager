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
 * below a tab (a user, an invite, a conversation) shows no strip and leaves
 * no empty box above its header.
 *
 * The strip draws its own container, in the width and gutters of an admin
 * page, so it lines up with the page header below it. A layout renders it
 * bare above `{children}`, with the tabs the signed-in user may open:
 *
 * ```tsx
 * const session = await getSession()
 * const tabs = session?.user ? childrenOf("rewind", session.user) : []
 * <SectionTabs itemId="rewind" label="Rewind" tabs={tabs} />
 * ```
 *
 * Test ids: `admin-section-tabs-<itemId>` on the list, `admin-section-tab-<tab.id>` on each tab.
 */
export function SectionTabs({ itemId, label, tabs }: { itemId: string; label: string; tabs: SectionTab[] }): ReactNode {
  const pathname = usePathname()
  const current = tabs.find((tab) => tab.href === pathname)
  if (!current) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6">
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
    </div>
  )
}

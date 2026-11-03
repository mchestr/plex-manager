"use client"

import type { Route } from "next"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, type ReactNode } from "react"

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
 * page, so it lines up with the page header below it. A section's layout
 * (`sectionLayout`, `components/admin/section-layout.tsx`) renders it bare
 * above `{children}`, with the tabs the signed-in user may open.
 *
 * A strip wider than the screen scrolls inside its list, so the selected tab
 * is scrolled into view on mount and whenever the selection changes.
 *
 * Test ids: `admin-section-tabs-<itemId>` on the list, `admin-section-tab-<tab.id>` on each tab.
 */
export function SectionTabs({ itemId, label, tabs }: { itemId: string; label: string; tabs: SectionTab[] }): ReactNode {
  const pathname = usePathname()
  const current = tabs.find((tab) => tab.href === pathname)
  // Typed as the primitive's button; rendered as a link, it is the anchor, and only `scrollIntoView` is used
  const selectedTab = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    selectedTab.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [current?.id])

  if (!current) return null

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-6">
      <Tabs value={current.id}>
        <TabsList aria-label={label} data-testid={`admin-section-tabs-${itemId}`}>
          {tabs.map((tab) => (
            <TabsTab
              key={tab.id}
              ref={tab.id === current.id ? selectedTab : undefined}
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

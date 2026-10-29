"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useTransition } from "react"

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { affiliates, type AffiliateTab } from "@/lib/admin/routes"
import { cn } from "@/lib/utils"

interface AffiliateTabsProps {
  tabs: { value: AffiliateTab; label: string }[]
  active: AffiliateTab
  /** The active tab's panel, rendered on the server. */
  children: ReactNode
}

/** The Affiliates page's tabs: `?tab=` is the state, and the server renders the panel. */
export function AffiliateTabs({ tabs, active, children }: AffiliateTabsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const select = (value: unknown) => {
    const tab = tabs.find((t) => t.value === value)
    if (!tab || tab.value === active) return
    startTransition(() => router.replace(affiliates({ tab: tab.value }), { scroll: false }))
  }

  return (
    <Tabs value={active} onValueChange={select}>
      <TabsList aria-label="Affiliates" data-testid="admin-affiliates-tabs">
        {tabs.map((tab) => (
          <TabsTab key={tab.value} value={tab.value} data-testid={`admin-affiliates-tab-${tab.value}`}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel value={active} aria-busy={pending || undefined} className={cn(pending && "opacity-60")} data-testid={`admin-affiliates-panel-${active}`}>
        {children}
      </TabsPanel>
    </Tabs>
  )
}

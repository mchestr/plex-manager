"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useTransition } from "react"

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { userDetail, type UserDetailTab } from "@/lib/admin/routes"
import { cn } from "@/lib/utils"

interface DetailTabsProps {
  userId: string
  tabs: { value: UserDetailTab; label: string }[]
  active: UserDetailTab
  /** The active tab's panel, rendered on the server. */
  children: ReactNode
}

/**
 * The user detail tabs (P10.6): the URL's `?tab=` is the state. Choosing a
 * tab (by click or the arrow keys) replaces the URL inside a transition, and
 * the server renders the new panel.
 */
export function DetailTabs({ userId, tabs, active, children }: DetailTabsProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const select = (value: unknown) => {
    const tab = tabs.find((t) => t.value === value)
    if (!tab || tab.value === active) return
    startTransition(() => router.replace(userDetail(userId, { tab: tab.value }), { scroll: false }))
  }

  return (
    <Tabs value={active} onValueChange={select}>
      <TabsList aria-label="Member details" data-testid="admin-user-tabs">
        {tabs.map((tab) => (
          <TabsTab key={tab.value} value={tab.value} data-testid={`admin-user-tab-${tab.value}`}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel
        value={active}
        aria-busy={pending || undefined}
        className={cn(pending && "opacity-60")}
        data-testid={`admin-user-panel-${active}`}
      >
        {children}
      </TabsPanel>
    </Tabs>
  )
}

"use client"

import { Tabs } from "@base-ui/react/tabs"
import { useRouter } from "next/navigation"
import { type ReactNode, useTransition } from "react"

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
    <Tabs.Root value={active} onValueChange={select} className="flex flex-col gap-6">
      <Tabs.List activateOnFocus aria-label="Member details" className="flex gap-1 overflow-x-auto border-b" data-testid="admin-user-tabs">
        {tabs.map((tab) => (
          <Tabs.Tab
            key={tab.value}
            value={tab.value}
            data-testid={`admin-user-tab-${tab.value}`}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-ui whitespace-nowrap text-muted-foreground outline-none",
              "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[active]:border-primary data-[active]:text-foreground"
            )}
          >
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel
        value={active}
        aria-busy={pending || undefined}
        className={cn("outline-none", pending && "opacity-60")}
        data-testid={`admin-user-panel-${active}`}
      >
        {children}
      </Tabs.Panel>
    </Tabs.Root>
  )
}

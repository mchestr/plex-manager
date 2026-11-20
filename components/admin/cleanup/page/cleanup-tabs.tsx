"use client"

import { useRouter } from "next/navigation"
import { type ReactNode, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { cleanup, CLEANUP_TABS, type CleanupTab } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import { cn } from "@/lib/utils"

/** The page tabs of UX 3.2 and 8.1. */
const CLEANUP_TAB_LABELS: Record<CleanupTab, string> = {
  rules: "Rules",
  "leaving-soon": "Leaving soon",
  kept: "Kept and excluded",
  history: "History",
  settings: "Settings",
}

interface CleanupTabsProps {
  active: CleanupTab
  /** The titles in Leaving soon (`leaving`, `approved` and `deleting`): a count badge on that tab, none at 0. */
  leavingCount: number
  /** The active tab's root, rendered on the server. */
  children: ReactNode
}

/**
 * The tabs of `/admin/cleanup` (UX 3.2): `?tab=` is the state, as on the
 * Affiliates page, and the server renders only the active tab. A tab switch
 * replaces the URL without a scroll, and the old panel dims while the next
 * one loads. "Leaving soon" carries the count of titles in Leaving soon on
 * every tab, with no badge at 0.
 */
export function CleanupTabs({ active, leavingCount, children }: CleanupTabsProps) {
  const router = useRouter()
  const f = useFormat()
  const [pending, startTransition] = useTransition()

  const select = (value: unknown) => {
    const tab = CLEANUP_TABS.find((t) => t === value)
    if (!tab || tab === active) return
    startTransition(() => router.replace(cleanup({ tab }), { scroll: false }))
  }

  return (
    <Tabs value={active} onValueChange={select}>
      <TabsList aria-label="Media cleanup" data-testid="admin-cleanup-tabs">
        {CLEANUP_TABS.map((tab) => (
          <TabsTab key={tab} value={tab} className="gap-2" data-testid={`admin-cleanup-tab-${tab}`}>
            {CLEANUP_TAB_LABELS[tab]}
            {tab === "leaving-soon" && leavingCount > 0 && (
              <Badge className="tabular-nums" data-testid="admin-cleanup-tab-leaving-soon-count">
                {f.number(leavingCount)}
              </Badge>
            )}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel value={active} aria-busy={pending || undefined} className={cn(pending && "opacity-60")}>
        {children}
      </TabsPanel>
    </Tabs>
  )
}

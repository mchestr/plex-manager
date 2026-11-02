"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { type ReactNode, useTransition } from "react"

import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs"
import { aiActivity } from "@/lib/admin/routes"
import { cn } from "@/lib/utils"

type AiActivityView = "calls" | "findings"

const TABS: Array<{ value: AiActivityView; label: string }> = [
  { value: "calls", label: "Calls" },
  { value: "findings", label: "Findings" },
]

/**
 * Calls | Findings (spec §2): `?view=findings` is the state, and the server
 * renders the panel. A switch keeps the shared date range and drops the
 * other tab's filters and page.
 */
export function AiActivityTabs({ active, children }: { active: AiActivityView; children: ReactNode }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  const select = (value: unknown) => {
    const tab = TABS.find((t) => t.value === value)
    if (!tab || tab.value === active) return
    const href = aiActivity({
      view: tab.value === "findings" ? "findings" : undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    })
    startTransition(() => router.replace(href, { scroll: false }))
  }

  return (
    <Tabs value={active} onValueChange={select}>
      <TabsList aria-label="AI activity" data-testid="ai-activity-tabs">
        {TABS.map((tab) => (
          <TabsTab key={tab.value} value={tab.value} data-testid={`ai-activity-tab-${tab.value}`}>
            {tab.label}
          </TabsTab>
        ))}
      </TabsList>
      <TabsPanel
        value={active}
        aria-busy={pending || undefined}
        className={cn("flex flex-col gap-6", pending && "opacity-60")}
        data-testid={`ai-activity-panel-${active}`}
      >
        {children}
      </TabsPanel>
    </Tabs>
  )
}

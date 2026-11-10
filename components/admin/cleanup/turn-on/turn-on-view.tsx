"use client"

import { useEffect, useId, useRef } from "react"

import { BudgetCard } from "@/components/admin/cleanup/turn-on/budget-card"
import type { CheckContext } from "@/components/admin/cleanup/turn-on/check-words"
import { DryRunsCard } from "@/components/admin/cleanup/turn-on/dry-runs-card"
import { LargestTable } from "@/components/admin/cleanup/turn-on/largest-table"
import { LeaveTimeline } from "@/components/admin/cleanup/turn-on/leave-timeline"
import { ReadyChecks, TopChecks } from "@/components/admin/cleanup/turn-on/ready-checks"
import { stoppingChecks, titleText } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { TurnOnPanel } from "@/components/admin/cleanup/turn-on/turn-on-panel"
import { useTurnOn } from "@/components/admin/cleanup/turn-on/use-turn-on"
import { WhatHappensCard } from "@/components/admin/cleanup/turn-on/what-happens-card"
import { WhoSeesCard } from "@/components/admin/cleanup/turn-on/who-sees-card"
import { PageHeader } from "@/components/ui/page-header"
import { cleanup, cleanupRule } from "@/lib/admin/routes"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"

/** UX 4.6, 8.7 "Turn-on description". @internal Exported for tests. */
export const TURN_ON_DESCRIPTION = "Read what happens before members see anything. Nothing changes until you press the button on this page."

export interface TurnOnViewProps {
  data: CleanupTurnOnData
  /** The job queue is set up. Without it "Turn on" is disabled (TS 9.5 item 4). */
  redis: boolean
}

/**
 * The turn-on and Change mode page body (UX 4.6, TS 12.6 `turn-on/`): the
 * header, six cards on the left, and "Ready to turn on" with "At the leave
 * date" in a sticky column on the right from `lg`. Below `lg` it is one
 * column, the right column moves to the end, and a check that stops the
 * press also shows at the top. Nothing changes until the button is pressed.
 *
 * Focus starts on the page title, and no button has default focus (UX 4.6
 * behaviour item 1). The state lives in `useTurnOn()`.
 */
export function TurnOnView({ data, redis }: TurnOnViewProps) {
  const f = useFormat()
  const idBase = useId()
  const header = useRef<HTMLDivElement>(null)
  const state = useTurnOn(data)

  // Also when a kept route shows again: each visit starts on the title
  useEffect(() => {
    const title = header.current?.querySelector("h1")
    if (!title) return
    title.tabIndex = -1
    title.focus({ preventScroll: true })
  }, [])

  const ctx: CheckContext = { ruleId: data.rule.id, level: data.rule.level, f, now: Date.parse(data.reviewedAt) }
  const day = f.dayKey(data.leaveAt, "day-month-short")
  return (
    <div className="flex flex-col gap-6">
      {/* The title takes focus at each visit as a starting point, not as a control: no focus ring */}
      <div ref={header} className="[&_h1]:outline-none">
        <PageHeader
          title={titleText(data)}
          description={TURN_ON_DESCRIPTION}
          breadcrumbs={[
            { label: "Media cleanup", href: cleanup() },
            { label: "Rules", href: cleanup({ tab: "rules" }) },
            { label: data.rule.name, href: cleanupRule(data.rule.id) },
            { label: "Turn on" },
          ]}
          data-testid="admin-cleanup-turn-on-header"
        />
      </div>
      <TopChecks checks={stoppingChecks(data, state.mode)} ctx={ctx} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="flex min-w-0 flex-col gap-4">
          <WhatHappensCard data={data} mode={state.mode} />
          <LeaveTimeline data={data} f={f} />
          <WhoSeesCard data={data} />
          <BudgetCard data={data} f={f} />
          <DryRunsCard data={data} f={f} />
          <LargestTable data={data} />
        </div>
        {/* Taller than the window at 900 px: the column scrolls inside itself, so the button is always reachable */}
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto" data-testid="admin-cleanup-turn-on-side">
          <ReadyChecks checks={data.checks} ctx={ctx} idBase={idBase} />
          <TurnOnPanel data={data} state={state} redis={redis} idBase={idBase} day={day} />
        </div>
      </div>
    </div>
  )
}

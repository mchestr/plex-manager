"use client"

import { Plus } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"

import { NewRuleSheet } from "@/components/admin/cleanup/new-rule/new-rule-sheet"
import { PauseDialog, ResumeDialog } from "@/components/admin/cleanup/page/pause-resume-dialogs"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import type { RecipeCardData } from "@/lib/cleanup/types/rule-parts"
import type { CleanupFeatureState } from "@/lib/cleanup/types/screens"
import { icons } from "@/lib/ui/icons"

interface HeaderActionsProps {
  feature: Pick<CleanupFeatureState, "enabled" | "pausedAt">
  /** The ten recipes of the New rule Sheet (`CleanupOverviewData.recipes`). */
  recipes: readonly RecipeCardData[]
  /** The Settings grace period, preselected in each recipe. */
  graceDays: number
  /** The page's clock: the end of the hold that Resume names, and "today" in the Sheet. */
  now: number
}

/**
 * The actions of the Media cleanup page header (UX 4.0 item 3), left to
 * right: "Pause all cleanup", or "Resume cleanup" while paused, then "New
 * rule", which opens the New rule Sheet. Pause hides while the feature is
 * off. The page leaves both out on first use, where the Rules tab is the
 * recipe gallery.
 *
 * Pause and Resume are one button whose words follow the server state, so
 * the button that the admin pressed keeps focus when the page shows the
 * other state. Its dialog closes as the router hides the page (TS 12.1
 * rule 8.2).
 */
export function HeaderActions({ feature, recipes, graceDays, now }: HeaderActionsProps) {
  const toggle = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<"pause" | "resume" | null>(null)
  const paused = feature.pausedAt !== null
  const showToggle = paused || feature.enabled

  // The router keeps a page it leaves (Activity): an open confirm closes as the page hides
  useLayoutEffect(() => () => setDialog(null), [])
  const opened = (which: "pause" | "resume") => (open: boolean) => setDialog(open ? which : null)

  return (
    <>
      {showToggle && (
        <Button
          ref={toggle}
          type="button"
          variant="secondary"
          icon={<Icon icon={paused ? icons.playing : icons.paused} />}
          onClick={() => setDialog(paused ? "resume" : "pause")}
          data-testid={paused ? "admin-cleanup-resume" : "admin-cleanup-pause"}
        >
          {paused ? "Resume cleanup" : "Pause all cleanup"}
        </Button>
      )}
      <NewRuleSheet
        recipes={recipes}
        graceDays={graceDays}
        now={now}
        trigger={
          <Button type="button" icon={<Icon icon={Plus} />} data-testid="admin-cleanup-new-rule">
            New rule
          </Button>
        }
      />
      <PauseDialog open={dialog === "pause"} onOpenChange={opened("pause")} successFocus={toggle} />
      <ResumeDialog now={now} open={dialog === "resume"} onOpenChange={opened("resume")} successFocus={toggle} />
    </>
  )
}

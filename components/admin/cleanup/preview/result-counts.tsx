import { focusResultsHeading, focusResultsTab, TAB_IDS, TAB_LABELS } from "@/components/admin/cleanup/results/view"
import { Button } from "@/components/ui/button"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import type { BoundFormat } from "@/lib/utils/format"
import { PREVIEW_TABS, type PreviewTab } from "@/lib/validations/cleanup-actions"

interface ResultCountsProps {
  tabs: PreviewResponse["tabs"]
  f: BoundFormat
  /** Selects a tab of Results. Focus then moves to that tab. */
  onSelectTab: (tab: PreviewTab) => void
}

/**
 * The count of each Results tab on the preview card (UX 4.3.6), and "See all
 * results". They act in the page, so they are buttons: each selects its tab
 * in Results and moves focus to it. "See all results" moves focus to the
 * Results heading.
 */
export function ResultCounts({ tabs, f, onSelectTab }: ResultCountsProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {PREVIEW_TABS.map((tab) => (
          <Button
            key={tab}
            variant="ghost"
            size="sm"
            className="justify-between px-2 font-normal"
            onClick={() => {
              onSelectTab(tab)
              focusResultsTab(tab)
            }}
            data-testid={`admin-cleanup-preview-tab-count-${TAB_IDS[tab]}`}
          >
            {TAB_LABELS[tab]}{" "}
            <span className="text-muted-foreground tabular-nums">{f.number(tabs[tab])}</span>
          </Button>
        ))}
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={focusResultsHeading} data-testid="admin-cleanup-preview-see-all">
        See all results
      </Button>
    </div>
  )
}

import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"

interface DataTableBulkBarProps {
  /** Selected rows: "{count} selected". */
  count: number
  /** Muted words after the count: "up to 71 GB". */
  label?: ReactNode
  /** The bulk actions, each a `Button` outline sm ("Postpone...", "Exclude..."). */
  children?: ReactNode
  /** Adds "Clear selection" after the actions (`{testId}-clear`); an X with that name on a phone. */
  onClear?: () => void
  "data-testid"?: string
}

/** Fixed while the table lays its rows out as cards on a phone, as the tab bar is: the page reserves its height and focus stops clear of it. */
const PHONE = [
  "dt-cards:max-md:fixed dt-cards:max-md:inset-x-0 dt-cards:max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))] dt-cards:max-md:z-(--z-tabbar)",
  "dt-cards:max-md:h-14 dt-cards:max-md:rounded-none dt-cards:max-md:border-x-0 dt-cards:max-md:border-b-0 dt-cards:max-md:bg-background dt-cards:max-md:py-1.5",
  "max-md:[html:has(&)]:scroll-pb-[calc(7.5rem+env(safe-area-inset-bottom))]",
].join(" ")

/**
 * The bar over a `DataTable` while rows are selected (UX 4.12.4): a region
 * named "Selection" whose count is a polite live region, then the bulk
 * actions. `DataTable` shows it above the table while its selection holds a
 * row; below the table's card width on a phone it sits fixed above the tab bar.
 *
 * ```tsx
 * <DataTableBulkBar count={2} label="up to 71 GB" onClear={clear} data-testid="admin-cleanup-leaving-bulk">
 *   <Button variant="outline" size="sm">Postpone...</Button>
 * </DataTableBulkBar>
 * ```
 */
export function DataTableBulkBar({ count, label, children, onClear, ...props }: DataTableBulkBarProps) {
  const testId = props["data-testid"]
  return (
    // The placeholder keeps the bar's height at the end of the table while the bar itself is fixed
    <div data-slot="data-table-bulk-bar-slot" className="dt-cards:max-md:order-last dt-cards:max-md:h-14">
      <section
        aria-label="Selection"
        data-slot="data-table-bulk-bar"
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-primary-indicator/60 bg-primary-indicator/5 py-2 pr-2 pl-4 dt-cards:max-md:flex-nowrap dt-cards:max-md:gap-x-2 ${PHONE}`}
        data-testid={testId}
      >
        <p aria-live="polite" aria-atomic="true" className="mr-auto min-w-0 text-ui text-muted-foreground tabular-nums" data-testid={testId && `${testId}-count`}>
          <span className="font-semibold text-foreground">{count} selected</span>
          {label ? (
            <>
              {" "}
              <span className="dt-cards:max-md:block">{label}</span>
            </>
          ) : null}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {children}
          {onClear && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClear}
              className="dt-cards:max-md:size-8 dt-cards:max-md:px-0"
              data-testid={testId && `${testId}-clear`}
            >
              <Icon icon={icons.close} className="hidden dt-cards:max-md:block" />
              <span className="dt-cards:max-md:sr-only">Clear selection</span>
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

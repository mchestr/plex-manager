import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import { u } from "./units"

export interface LedgerRow {
  key: string
  label: string
  value: ReactNode
}

/**
 * A receipt's lines (design 4.3 pages 14 and 15): label, a dotted leader
 * and the value, as a description list. The lines print from the top, 60 ms
 * apart; reduced motion shows them at once.
 */
export function Ledger({ rows, className, testId }: { rows: readonly LedgerRow[]; className?: string; testId?: string }) {
  return (
    <dl className={cn("flex flex-col", className)} style={{ gap: u(7) }} data-testid={testId}>
      {rows.map((row, i) => (
        <div key={row.key} className="rw-bill-line flex items-baseline" style={{ gap: u(6), animationDelay: `${420 + i * 60}ms` }}>
          <dt className="flex min-w-0 flex-1 items-baseline" style={{ gap: u(6) }}>
            <span className="shrink-0">{row.label}</span>
            <span aria-hidden className="min-w-[calc(var(--u)*12px)] flex-1 border-b-2 border-dotted border-current" />
          </dt>
          <dd className="shrink-0 text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

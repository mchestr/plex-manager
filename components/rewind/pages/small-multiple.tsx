import { cn } from "@/lib/utils"

import { u } from "./units"

const W = 56
const H = 16
const BAR = 3.29
const STEP = 4.79

interface SmallMultipleProps {
  /** Minutes per calendar month, January first. */
  monthly: readonly number[]
  /** The largest month across every row, so all rows share one scale. */
  max: number
  /** Months counted; a later month shows as a dashed "not yet counted" box. */
  months: number
  className?: string
}

/**
 * A row's year in months (design 4.3, page 05): one bar per counted month
 * on the page's shared scale, in the spot ink, with the months still to come
 * as one dashed box. Decorative: the row sheet and the Table hold the
 * numbers.
 */
export function SmallMultiple({ monthly, max, months, className }: SmallMultipleProps) {
  const scale = max > 0 ? H / max : 0
  return (
    <svg aria-hidden viewBox={`0 0 ${W} ${H}`} className={cn("block text-chart-2", className)} style={{ width: u(W), height: u(H) }}>
      <rect x={0} y={H - 1} width={STEP * 11 - 1.5} height={1} fill="currentColor" opacity={0.45} />
      {monthly.slice(0, Math.min(months, 11)).map((minutes, i) =>
        minutes > 0 ? <rect key={i} x={i * STEP} y={H - Math.max(1, minutes * scale)} width={BAR} height={Math.max(1, minutes * scale)} fill="currentColor" /> : null
      )}
      {months < 12 && (
        <rect x={W - 2.79} y={H - 4} width={2.29} height={3.5} fill="none" stroke="currentColor" strokeWidth={0.9} strokeDasharray="1.2 1.2" />
      )}
      {months === 12 && monthly[11] > 0 && <rect x={W - BAR} y={H - Math.max(1, monthly[11] * scale)} width={BAR} height={Math.max(1, monthly[11] * scale)} fill="currentColor" />}
    </svg>
  )
}

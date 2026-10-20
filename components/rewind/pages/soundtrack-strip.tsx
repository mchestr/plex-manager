import { soundtrack, yearDays } from "@/lib/rewind/viz/soundtrack"
import { cn } from "@/lib/utils"

import { u, ut } from "./units"

interface SoundtrackStripProps {
  minutes: readonly number[]
  /** `window.from`: the year's first day. */
  from: string
  locale: string
  width: number
  height: number
  /** Month initials under the strip (the cover); the number page omits them. */
  months?: boolean
  className?: string
}

const initial = (month: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: "narrow", timeZone: "UTC" }).format(Date.UTC(2026, month - 1, 1))

/**
 * The member's optical soundtrack in the page's ink (design 5.7): one path
 * from `lib/rewind/viz/soundtrack`, the unreached days as a dotted centre
 * line, and the month initials as text. Decorative: the page's summary and
 * Table carry the numbers.
 */
export function SoundtrackStrip({ minutes, from, locale, width, height, months = false, className }: SoundtrackStripProps) {
  const days = yearDays(from)
  const strip = soundtrack(minutes, { variant: "daily", window: { from, days }, width, height })

  return (
    <div aria-hidden className={cn("relative", className)} style={{ width: u(width) }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="rw-print block w-full" style={{ height: u(height) }} preserveAspectRatio="none">
        <path d={strip.d} fill="currentColor" />
        {strip.dotted && (
          <line x1={strip.dotted.x1} x2={strip.dotted.x2} y1={strip.centre} y2={strip.centre} stroke="currentColor" strokeWidth={1.5} strokeDasharray="1.5 3" />
        )}
      </svg>
      {months && (
        <div className="relative font-display" style={{ height: u(18), fontSize: ut(12.5) }}>
          {strip.months.map(({ month, x }) => (
            <span
              key={month}
              className="absolute top-0 border-l-[1.5px] border-current pl-[0.3em] font-semibold"
              style={{ left: `${(x / width) * 100}%`, lineHeight: 1.2 }}
            >
              {initial(month, locale)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

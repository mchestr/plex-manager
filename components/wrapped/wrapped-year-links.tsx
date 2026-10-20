import Link from "next/link"
import { cn } from "@/lib/utils"

interface WrappedYearLinksProps {
  /** The member's completed Rewind years, newest first. */
  years: number[]
  /** The year on screen, marked as the current page. */
  currentYear: number
}

/** "Your Rewinds": a link to each year the member has a completed Rewind for. */
export function WrappedYearLinks({ years, currentYear }: WrappedYearLinksProps) {
  if (years.length === 0) {
    return null
  }

  return (
    <nav
      aria-label="Your Rewinds"
      data-testid="wrapped-year-links"
      className="relative z-40 mx-auto flex max-w-4xl flex-wrap items-center gap-2 px-4 pt-4"
    >
      <span className="text-xs font-medium text-slate-400">Your Rewinds</span>
      <ul className="flex flex-wrap gap-2">
        {years.map((year) => (
          <li key={year}>
            <Link
              href={`/rewind/${year}`}
              data-testid={`wrapped-year-link-${year}`}
              aria-current={year === currentYear ? "page" : undefined}
              className={cn(
                "inline-block rounded-md border px-3 py-1 text-xs font-medium transition-colors",
                year === currentYear
                  ? "border-cyan-500/60 bg-cyan-500/15 text-cyan-200"
                  : "border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white"
              )}
            >
              {year}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

import { cn } from "@/lib/utils"

interface PageHeadingProps {
  /** The fitted lines, each set on one line. */
  lines: readonly string[]
  /** The full title when the visible lines cut it short with an ellipsis. */
  full?: string
  className?: string
}

/**
 * A page's `h2` (Rewind design 11.1): plain text, one block span per fitted
 * line, and `tabIndex={-1}` so a member-started turn can move focus to it
 * (the stage focuses the current page's first `h2`). An ellipsized title is
 * read in full from an `sr-only` span while the cut lines are `aria-hidden`;
 * nothing puts `aria-label` on a generic span (UI-09).
 */
export function PageHeading({ lines, full, className }: PageHeadingProps) {
  const visible = lines.map((line, i) => (
    <span key={i} className="block whitespace-nowrap">
      {line}
    </span>
  ))
  return (
    <h2 tabIndex={-1} dir="auto" className={cn("outline-none", className)}>
      {full === undefined ? (
        visible
      ) : (
        <>
          <span className="sr-only">{full}</span>
          <span aria-hidden="true">{visible}</span>
        </>
      )}
    </h2>
  )
}

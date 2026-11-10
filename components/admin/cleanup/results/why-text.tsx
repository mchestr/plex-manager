import { spacedParts } from "@/lib/cleanup/describe"
import type { WhyPart } from "@/lib/cleanup/engine/types"
import { cn } from "@/lib/utils"

/**
 * A sentence that the server built as parts (TS 10.5): the strong parts, the
 * deciding values, render in bold (UX 5.3 item 3). Two sentence parts get
 * one space between them (`spacedParts`). Used by the Results rows, the
 * largest matches and the Why Sheet parts.
 */
export function WhyText({ parts, className }: { parts: readonly WhyPart[]; className?: string }) {
  return (
    <span className={cn("text-muted-foreground", className)}>
      {spacedParts(parts).map((part, index) =>
        part.strong ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.text}
          </strong>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </span>
  )
}

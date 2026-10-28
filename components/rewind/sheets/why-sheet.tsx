"use client"

import type { ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

interface WhyCandidate {
  id: string
  name: string
  /** "Your archetype", "Close second", "Also in the running". */
  standing: string
  /** One plain sentence per evidence fact, rendered on the server. */
  reasons: ReactNode[]
}

interface WhySheetProps {
  open: boolean
  onClose: () => void
  name: string
  shortlist: readonly WhyCandidate[]
  /** `archetype.dedication`, rendered on the server; in-app only. */
  dedication: ReactNode
}

/**
 * "Why this?" (Rewind design 4.3 page 16): the shortlist code scored, each
 * archetype with the plain-language reasons its scorer cites, then the
 * dedication. A bottom sheet on paper, opened from
 * `rewind-archetype-why` through the player's sheet mode, so Esc closes it
 * before the story.
 */
export function WhySheet({ open, onClose, name, shortlist, dedication }: WhySheetProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" grabber data-testid="rewind-why-sheet" className="font-text">
        <SheetHeader>
          <SheetTitle className="font-display">Why {name}?</SheetTitle>
          <SheetDescription>Rewind picks it from your history. The same rules apply to every member.</SheetDescription>
        </SheetHeader>
        <ol className="flex flex-col gap-4">
          {shortlist.map((candidate) => (
            <li key={candidate.id} className="border-t border-border-strong pt-3" data-testid="rewind-why-candidate">
              <p className="font-display text-ui">
                <span className="font-semibold">{candidate.name}</span>
                <span className="text-muted-foreground">, {candidate.standing.toLowerCase()}</span>
              </p>
              <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ui">
                {candidate.reasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <p className="border-t border-border-strong pt-3 text-ui italic">{dedication}</p>
      </SheetContent>
    </Sheet>
  )
}

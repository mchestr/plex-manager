"use client"

import type { ComponentProps } from "react"

import { WhySheet } from "@/components/rewind/sheets/why-sheet"
import { useStageSheet } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"

type WhyProps = Omit<ComponentProps<typeof WhySheet>, "open" | "onClose">

/** "Why this?" and its sheet: the centrefold's one interactive island. */
export function CentrefoldWhy(props: WhyProps) {
  const sheet = useStageSheet("why")
  return (
    <div data-rw-interactive className="shrink-0">
      <Button variant="ink-outline" size="pill" aria-haspopup="dialog" data-testid="rewind-archetype-why" onClick={sheet.show}>
        Why this?
      </Button>
      <WhySheet open={sheet.open} onClose={sheet.close} {...props} />
    </div>
  )
}

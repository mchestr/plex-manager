"use client"

import type { ComponentProps } from "react"

import { WhySheet } from "@/components/rewind/sheets/why-sheet"
import { useStageSheet } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"

import { ARTBOARD_PILL, ut } from "./units"

type WhyProps = Omit<ComponentProps<typeof WhySheet>, "open" | "onClose">

/** "Why this?", drawn at artboard scale with its 44 px hit area, and its sheet: the centrefold's one interactive island. */
export function CentrefoldWhy(props: WhyProps) {
  const sheet = useStageSheet("why")
  return (
    <div data-rw-interactive className="shrink-0">
      <Button
        variant="ink-outline"
        size="pill"
        className={ARTBOARD_PILL}
        style={{ fontSize: ut(14) }}
        aria-haspopup="dialog"
        data-testid="rewind-archetype-why"
        onClick={sheet.show}
      >
        Why this?
      </Button>
      <WhySheet open={sheet.open} onClose={sheet.close} {...props} />
    </div>
  )
}

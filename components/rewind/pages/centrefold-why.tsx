"use client"

import type { ComponentProps } from "react"

import { WhySheet } from "@/components/rewind/sheets/why-sheet"
import { useStageSheet } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"

import { ut } from "./units"

type WhyProps = Omit<ComponentProps<typeof WhySheet>, "open" | "onClose">

/**
 * The pill at artboard scale (design 4.7): its visible size follows `--u`, so
 * the foot fits the artboard at every scale, and an unscaled `::before`
 * keeps the hit area 44 px tall.
 */
const ARTBOARD_PILL = "relative h-[calc(var(--u)*44px)] px-[calc(var(--u)*20px)] before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2"

/** "Why this?" and its sheet: the centrefold's one interactive island. */
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

"use client"

import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"

export interface Cut {
  label: string
  /** "10 pages, about 2 min 20 s". */
  meta: string
}

/**
 * The cover's cut choice (design 4.3): "Read the full issue" in solid ink and
 * the pocket edition in outline, or the pocket edition alone for a pocket
 * member. Either starts the story (`CHOOSE_CUT`); Enter and the forward keys
 * open the full issue. P7.3 gives the pocket cut its own page set.
 */
export function CoverCuts({ full, pocket }: { full: Cut | null; pocket: Cut }) {
  const send = usePlayerSend()
  const choose = () => send({ type: "CHOOSE_CUT" })
  const row = "w-full justify-between gap-3 px-5"

  return (
    <div className="flex flex-col gap-2" data-rw-interactive>
      {full && (
        <Button variant="ink" size="pill" className={row} data-testid="rewind-cut-full" onClick={choose}>
          <span className="font-bold">{full.label}</span>
          <span className="font-medium tabular-nums">{full.meta}</span>
        </Button>
      )}
      <Button variant={full ? "ink-outline" : "ink"} size="pill" className={row} data-testid="rewind-cut-pocket" onClick={choose}>
        <span className="font-bold">{pocket.label}</span>
        <span className="font-medium tabular-nums">{pocket.meta}</span>
      </Button>
    </div>
  )
}

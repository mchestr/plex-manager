"use client"

import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { ARTBOARD_PILL, stackGap, ut } from "./units"

const label = { fontSize: ut(14), lineHeight: 1.2 }

export interface Cut {
  label: string
  /** "10 pages, about 2 min 20 s". */
  meta: string
}

/**
 * The cover's cut choice (design 4.3): "Read the full issue" in solid ink and
 * the pocket edition in outline, or the pocket edition alone for a pocket
 * member. Either starts the story (`CHOOSE_CUT`); Enter and the forward keys
 * open the full issue. P7.3 gives the pocket cut its own page set. The pills
 * are drawn at artboard scale with 44 px hit areas that never overlap
 * (design 4.7).
 */
export function CoverCuts({ full, pocket }: { full: Cut | null; pocket: Cut }) {
  const send = usePlayerSend()
  const choose = () => send({ type: "CHOOSE_CUT" })
  // Where the 12 px text floor outgrows the pill (below the 0.8 scale floor), the running time wraps under the label
  const row = cn(ARTBOARD_PILL, "h-auto min-h-[calc(var(--u)*44px)] w-full flex-wrap justify-between gap-x-[calc(var(--u)*12px)] gap-y-0 py-[calc(var(--u)*4px)]")

  return (
    <div className="flex flex-col" style={{ gap: stackGap(8) }} data-rw-interactive>
      {full && (
        <Button variant="ink" size="pill" className={row} style={label} data-testid="rewind-cut-full" onClick={choose}>
          <span className="font-bold">{full.label}</span>
          <span className="font-medium tabular-nums">{full.meta}</span>
        </Button>
      )}
      <Button variant={full ? "ink-outline" : "ink"} size="pill" className={row} style={label} data-testid="rewind-cut-pocket" onClick={choose}>
        <span className="font-bold">{pocket.label}</span>
        <span className="font-medium tabular-nums">{pocket.meta}</span>
      </Button>
    </div>
  )
}

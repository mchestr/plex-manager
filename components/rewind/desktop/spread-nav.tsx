"use client"

import { ArrowLeft, ArrowRight, type LucideIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

interface SpreadNavProps {
  /** "04 Guess": the previous page's folio and name, or null on the first page. */
  prev: string | null
  /** "06 Top films", or null on the last page. */
  next: string | null
  onPrev: () => void
  onNext: () => void
}

function Turn({ side, label, icon, onClick }: { side: "prev" | "next"; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <div className={cn("absolute top-1/2 flex w-20 -translate-y-1/2 justify-center", side === "prev" ? "right-full" : "left-full")}>
      <Button
        variant="ghost"
        className="pointer-events-auto h-auto flex-col gap-2 px-1 py-1 font-display whitespace-normal hover:bg-transparent hover:text-foreground"
        data-testid={`rewind-spread-${side}`}
        onClick={onClick}
      >
        <span aria-hidden className="flex size-14 items-center justify-center rounded-full border-[1.5px] border-current">
          <Icon icon={icon} size={20} />
        </span>
        <span className="sr-only">{side === "prev" ? "Previous page: " : "Next page: "}</span>
        <span className="text-label font-semibold">{label}</span>
      </Button>
    </div>
  )
}

/**
 * The spread's large previous and next buttons beside the artboard, each
 * labelled with its destination ("04 Guess", "06 Top films"). They sit
 * inside the artboard's box (`SPREAD_BOX`), in the columns either side.
 */
export function SpreadNav({ prev, next, onPrev, onNext }: SpreadNavProps) {
  return (
    <>
      {prev && <Turn side="prev" label={prev} icon={ArrowLeft} onClick={onPrev} />}
      {next && <Turn side="next" label={next} icon={ArrowRight} onClick={onNext} />}
    </>
  )
}

"use client"

import { useState, type CSSProperties, type ReactNode } from "react"

import { RowSheet, type RowDetail } from "@/components/rewind/sheets/row-sheet"
import { usePlayerSend } from "@/components/rewind/stage/player-context"
import { cn } from "@/lib/utils"

/**
 * A title on a list page as a button that opens its row sheet (P7.7): the
 * No. 1 features of Top shows and Top films, and Top films' rows. Like
 * `ListRows`, the sheet pauses the story (`OPEN_SHEET`, then `CLOSE_SHEET`).
 */
export function TitleSheetButton({ detail, className, style, children }: { detail: RowDetail; className?: string; style?: CSSProperties; children: ReactNode }) {
  const send = usePlayerSend()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        data-rw-interactive
        data-testid="rewind-title-button"
        className={cn("block w-full cursor-pointer text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring", className)}
        style={style}
        onClick={() => {
          setOpen(true)
          send({ type: "OPEN_SHEET", sheet: "row" })
        }}
      >
        {children}
      </button>
      <RowSheet
        row={open ? detail : null}
        onClose={() => {
          setOpen(false)
          send({ type: "CLOSE_SHEET" })
        }}
      />
    </>
  )
}

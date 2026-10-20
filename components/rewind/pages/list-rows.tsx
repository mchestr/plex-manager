"use client"

import { useState, type CSSProperties, type ReactNode } from "react"

import { RowSheet, type RowDetail } from "@/components/rewind/sheets/row-sheet"
import { usePlayerSend } from "@/components/rewind/stage/player-context"

export interface ListRow {
  key: string
  /** The row as typeset on the server: rank, thumbnail, title, note, hours, small multiple. */
  content: ReactNode
  detail: RowDetail
}

/**
 * Top shows' rows 2 to 5 (design 4.3): each row is a button that opens its
 * sheet, which pauses the story like any sheet (`OPEN_SHEET`, then
 * `CLOSE_SHEET`). Rows stagger in at 70 ms.
 */
export function ListRows({ rows, start, label }: { rows: readonly ListRow[]; start: number; label: string }) {
  const send = usePlayerSend()
  const [open, setOpen] = useState<RowDetail | null>(null)

  return (
    <>
      <ol start={start} aria-label={label} className="border-t-[1.5px] border-current" data-rw-interactive>
        {rows.map((row, i) => (
          <li key={row.key} className="rw-row border-b border-current/40" style={{ "--rw-i": i } as CSSProperties}>
            <button
              type="button"
              data-testid="rewind-list-row"
              className="flex w-full cursor-pointer items-center gap-[calc(var(--u)*10px)] py-[calc(var(--u)*5px)] text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              onClick={() => {
                setOpen(row.detail)
                send({ type: "OPEN_SHEET", sheet: "row" })
              }}
            >
              {row.content}
            </button>
          </li>
        ))}
      </ol>
      <RowSheet
        row={open}
        onClose={() => {
          setOpen(null)
          send({ type: "CLOSE_SHEET" })
        }}
      />
    </>
  )
}

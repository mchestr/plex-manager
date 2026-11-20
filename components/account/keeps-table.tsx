"use client"

import type { ColumnDef } from "@tanstack/react-table"
import { useState } from "react"

import { removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable } from "@/components/ui/data-table/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Poster } from "@/components/ui/poster"
import { useToast } from "@/components/ui/toast"
import { endKeepWords, FALLBACK_ERROR, KEEP_TOASTS, keepErrorWords, lastDay, titleName, typeLine } from "@/lib/cleanup/actions/keeps/words"
import type { MyKeepRow } from "@/lib/cleanup/types/member"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { posterPalette } from "@/lib/ui/poster-palette"
import type { BoundFormat } from "@/lib/utils/format"

/** "Ended by you on {date}" or "Ended by the server admin on {date}" (UX 9.4 item 4). */
function endedWords(row: MyKeepRow, f: BoundFormat): string | null {
  if (!row.endedBy || !row.endedAt) return null
  return `Ended by ${row.endedBy === "self" ? "you" : "the server admin"} on ${f.date(row.endedAt, "short")}`
}

function columns(f: BoundFormat): ColumnDef<MyKeepRow>[] {
  return [
    {
      id: "title",
      header: "Title",
      cell: ({ row }) => {
        const name = titleName(row.original.item)
        return (
          <span className="flex items-center gap-3">
            <Poster
              ratingKey={row.original.item.posterKey}
              title={name}
              size="xs"
              style={{ width: 32 }}
              decorative
              // A title does not fit 32 px: the fallback keeps the palette colour only
              fallback={<span className="block size-full" style={{ background: posterPalette(row.original.item.posterKey ?? name).field }} />}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium text-foreground">{row.original.item.title}</span>
              <span className="text-label text-muted-foreground">{typeLine(row.original.item, "member")}</span>
            </span>
          </span>
        )
      },
      meta: { card: "title" },
    },
    {
      id: "until",
      header: "Until",
      cell: ({ row }) => {
        const ended = endedWords(row.original, f)
        return ended ? <span className="text-muted-foreground">{ended}</span> : <span className="whitespace-nowrap">{f.date(lastDay(row.original.until), "short")}</span>
      },
      meta: { card: "field" },
    },
    {
      id: "kept",
      header: "Kept",
      cell: ({ row }) => <span className="whitespace-nowrap">{f.date(row.original.keptAt, "short")}</span>,
      meta: { card: "field" },
    },
  ]
}

interface KeepsTableProps {
  /** The member's Keeps: active ones, and those ended in the last 30 days. */
  rows: MyKeepRow[]
  /** The most Keeps a member may hold at a time. */
  limit: number
}

/**
 * The member's Keeps on Account (UX 9.4, TS 13.5), on the pattern of
 * `marks-table.tsx`: each active Keep with "End keep...", and for 30 days
 * the Keeps that ended, with who ended them. The line above counts the
 * active Keeps, also while member Keeps are off (TS E30). End keep asks
 * first, then marks the row ended at once; a failure puts it back.
 */
export function KeepsTable({ rows, limit }: KeepsTableProps) {
  const f = useFormat()
  const toast = useToast()
  const [endedNow, setEndedNow] = useState<ReadonlyMap<string, string>>(() => new Map())
  // The row of the dialog stays set while it closes, so its words do not change
  const [ending, setEnding] = useState<MyKeepRow | null>(null)
  const [open, setOpen] = useState(false)

  const shown = rows.map((row) => {
    const at = endedNow.get(row.id)
    return at && !row.endedBy ? { ...row, endedBy: "self" as const, endedAt: at } : row
  })
  const used = shown.filter((row) => !row.endedBy).length
  const mark = (id: string, at: string | null) =>
    setEndedNow((current) => {
      const next = new Map(current)
      if (at) next.set(id, at)
      else next.delete(id)
      return next
    })

  const end = async (row: MyKeepRow) => {
    const result = await removeMyCleanupKeep({ keepId: row.id }).catch(() => ({ success: false as const, code: "INTERNAL", error: FALLBACK_ERROR }))
    if (result.success) return toast.showSuccess(KEEP_TOASTS.ended)
    mark(row.id, null)
    toast.showError(keepErrorWords(result, limit))
  }
  const words = ending ? endKeepWords(titleName(ending.item)) : null

  return (
    <div className="flex flex-col gap-3" data-testid="account-keeps">
      <p className="text-label text-muted-foreground">
        Titles you kept from Leaving soon. Each one stays until its date. You keep {used} of {limit}.
      </p>
      <DataTable
        label="Your Keeps"
        size="narrow"
        noun="Keeps"
        columns={columns(f)}
        data={shown}
        getRowId={(row) => row.id}
        getRowName={(row) => titleName(row.item)}
        rowActions={(row) =>
          row.endedBy
            ? []
            : [{ id: "end-keep", label: "End keep...", variant: "destructive", onSelect: () => {
                setEnding(row)
                setOpen(true)
              } }]
        }
        pagination={{ page: 1, pageSize: Math.max(shown.length, 1), total: shown.length }}
        pageSizes={[Math.max(shown.length, 1)]}
        empty={<EmptyState kind="first-use" icon={icons.keep} title="No Keeps" description="Titles you keep from Leaving soon show here." data-testid="account-keeps-empty" />}
        data-testid="account-keeps-table"
      />
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={words?.title ?? ""}
        description={words?.description ?? ""}
        confirmLabel="End keep"
        pendingLabel="Ending"
        tone="destructive"
        action={async () => {
          if (ending) {
            mark(ending.id, new Date().toISOString())
            void end(ending)
          }
          return {}
        }}
        data-testid="account-keeps-end-dialog"
        confirmTestId="account-keeps-end-confirm"
      />
    </div>
  )
}

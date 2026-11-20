"use client"

import { useRef, useState } from "react"

import { removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { useKeeps } from "@/components/leaving-soon/keep-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Poster } from "@/components/ui/poster"
import { useToast } from "@/components/ui/toast"
import { endKeepWords, FALLBACK_ERROR, KEEP_TOASTS, keepErrorWords, lastDay, titleName } from "@/lib/cleanup/actions/keeps/words"
import type { MyKeepRow } from "@/lib/cleanup/types/member"
import { useFormat } from "@/lib/format-context"
import { posterPalette } from "@/lib/ui/poster-palette"
import { dayKey } from "@/lib/utils/zoned-time"

const BASE = "leaving-soon-my-keeps"

interface YourKeepsProps {
  /** The member's Keeps: active ones, and those ended in the last 30 days. Ended by the member, they are not listed here. */
  rows: MyKeepRow[]
  /** The Plex server's name: "Kept titles stay on {server} until the date shown". */
  serverName: string
}

/**
 * Your Keeps on the Leaving soon page (UX 9.2, 9.2.2): each active Keep with
 * "End keep...", and for 30 days the line for a Keep that the server admin
 * ended. "End keep..." asks first, then takes the row out at once; a failure
 * puts it back with the words of its code. The heading takes focus from
 * "See your Keeps" (`tabIndex={-1}`).
 */
export function YourKeeps({ rows, serverName }: YourKeepsProps) {
  const f = useFormat()
  const toast = useToast()
  const keeps = useKeeps()
  const heading = useRef<HTMLHeadingElement>(null)
  const [now] = useState(() => Date.now())
  const [gone, setGone] = useState<ReadonlySet<string>>(() => new Set())
  // The row of the dialog stays set while it closes, so its words do not change
  const [ending, setEnding] = useState<MyKeepRow | null>(null)
  const [open, setOpen] = useState(false)

  const listed = rows.filter((row) => row.endedBy !== "self" && !gone.has(row.id))
  const hide = (id: string, hidden: boolean) =>
    setGone((current) => {
      const next = new Set(current)
      if (hidden) next.add(id)
      else next.delete(id)
      return next
    })

  const end = async (row: MyKeepRow) => {
    const result = await removeMyCleanupKeep({ keepId: row.id }).catch(() => ({ success: false as const, code: "INTERNAL", error: FALLBACK_ERROR }))
    if (result.success) return toast.showSuccess(KEEP_TOASTS.ended)
    hide(row.id, false)
    keeps?.change(1)
    toast.showError(keepErrorWords(result, keeps?.limit ?? 0))
  }

  const today = dayKey(now, f.settings.timeZone)
  const keptWords = (row: MyKeepRow) => {
    const until = f.date(lastDay(row.until), "short")
    const kept = dayKey(Date.parse(row.keptAt), f.settings.timeZone)
    if (kept === today) return `Kept today, until ${until}`
    return `Kept on ${f.date(row.keptAt, kept.slice(0, 4) === today.slice(0, 4) ? "day-month-short" : "short")}, until ${until}`
  }
  const words = ending ? endKeepWords(titleName(ending.item), keeps?.graceDays) : null

  return (
    <Card data-testid={BASE}>
      <CardHeader>
        <CardTitle as="h2" ref={heading} tabIndex={-1} id={`${BASE}-heading`} className="outline-none" data-testid={`${BASE}-heading`}>
          Your Keeps
        </CardTitle>
        <CardDescription>Kept titles stay on {serverName} until the date shown. They also show on Account, under Your data.</CardDescription>
      </CardHeader>
      <CardContent>
        {listed.length === 0 ? (
          <p className="text-ui text-muted-foreground">No Keeps yet. Titles you keep show here.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {listed.map((row) => {
              const name = titleName(row.item)
              return (
                <li key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0" data-testid={`${BASE}-${row.id}`}>
                  <Poster
                    ratingKey={row.item.posterKey}
                    title={name}
                    size="xs"
                    decorative
                    // A title does not fit 48 px: the fallback keeps the palette colour only
                    fallback={<span className="block size-full" style={{ background: posterPalette(row.item.posterKey ?? name).field }} />}
                  />
                  <div className="flex min-w-0 grow flex-col gap-0.5">
                    <span className="truncate text-ui font-medium text-foreground">{name}</span>
                    <span className="text-label text-muted-foreground" data-testid={`${BASE}-${row.id}-timestamp`}>
                      {row.endedBy === "admin" && row.endedAt
                        ? `Your Keep ended. The server admin ended it on ${f.date(row.endedAt, "short")}.`
                        : keptWords(row)}
                    </span>
                  </div>
                  {row.endedBy === undefined && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="max-md:h-11"
                      aria-label={`End keep on ${name}`}
                      onClick={() => {
                        setEnding(row)
                        setOpen(true)
                      }}
                      data-testid={`${BASE}-${row.id}-end`}
                    >
                      End keep...
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={words?.title ?? ""}
        description={words?.description ?? ""}
        confirmLabel="End keep"
        pendingLabel="Ending"
        tone="destructive"
        successFocus={heading}
        action={async () => {
          if (ending) {
            hide(ending.id, true)
            keeps?.change(-1)
            void end(ending)
          }
          return {}
        }}
        data-testid="leaving-soon-end-keep-dialog"
        confirmTestId="leaving-soon-end-keep-confirm"
      />
    </Card>
  )
}

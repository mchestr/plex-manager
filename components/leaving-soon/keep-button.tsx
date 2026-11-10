"use client"

import { createContext, type ReactNode, useContext, useId, useLayoutEffect, useRef, useState } from "react"

import { keepCleanupTitle, removeMyCleanupKeep } from "@/actions/cleanup-keeps"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { endKeepWords, FALLBACK_ERROR, KEEP_TOASTS, keepErrorWords, lastDay } from "@/lib/cleanup/actions/keeps/words"
import { keepLimitWords } from "@/lib/cleanup/constants"
import type { MemberLeavingSoonData } from "@/lib/cleanup/types/member"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

const DAY_MS = 86_400_000

type KeepsMeter = MemberLeavingSoonData["keeps"]

/** The member's Keep settings and the count of active Keeps, as this page now knows it. */
interface KeepsState extends KeepsMeter {
  atLimit: boolean
  /** The shortest grace period, for the End keep dialog. */
  graceDays?: number
  /** One more Keep (1) or one fewer (-1), at once, before the server answers. */
  change: (delta: 1 | -1) => void
}

const NO_PROVIDER: KeepsState = { enabled: true, limit: Number.POSITIVE_INFINITY, used: 0, days: 90, atLimit: false, change: () => {} }
const KeepsContext = createContext<KeepsState | null>(null)

/**
 * Holds the Keep meter of a page (UX 9.2): every `KeepButton` and Your Keeps
 * below it share the count, so at the limit every Keep button is disabled
 * at once, and an End keep enables them again. A newer server count replaces
 * the local one (TS E34).
 */
export function KeepsProvider({ keeps, graceDays, children }: { keeps: KeepsMeter; graceDays?: number; children: ReactNode }) {
  const [used, setUsed] = useState(keeps.used)
  const [seen, setSeen] = useState(keeps.used)
  if (keeps.used !== seen) {
    setSeen(keeps.used)
    setUsed(keeps.used)
  }
  const value: KeepsState = {
    ...keeps,
    used,
    atLimit: used >= keeps.limit,
    graceDays,
    change: (delta) => setUsed((count) => Math.max(0, count + delta)),
  }
  return <KeepsContext.Provider value={value}>{children}</KeepsContext.Provider>
}

/** The Keep meter of the nearest `KeepsProvider`, or null outside one. */
export function useKeeps(): KeepsState | null {
  return useContext(KeepsContext)
}

type Result<T> = { success: true; data: T } | { success: false; code: string; error: string }

/** Runs a server action; a throw (the network) reads as the fallback failure. */
async function settle<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call()
  } catch {
    return { success: false, code: "INTERNAL", error: FALLBACK_ERROR }
  }
}

type KeepState = { kind: "idle" } | { kind: "kept"; keepId: string | null; until: string }
type Focus = { to: "keep" | "end"; force: boolean } | null

interface KeepButtonProps {
  itemKey: string
  /** The title as the member reads it: "Keep {title}", "Kept {title} until {date}." */
  title: string
  /** `leaving-soon-card-{key}`, `leaving-soon-for-you-{key}` or `home-leaving-soon-item-{key}` (UX 10.3). */
  testIdBase: string
  /** The member's Keep of this title, when the page already knows one. */
  keep?: { keepId: string; until: string } | null
  /** `sm` on the Home row. Both are 44 px high below `md`. */
  size?: "default" | "sm"
  /** The base of the End keep dialog's ids: `{base}-dialog` and `{base}-confirm`. */
  endDialogTestId?: string
  className?: string
}

/**
 * Keep, with the result at once (UX 9.2.1, 7.12): the control shows "Kept
 * by you" and the end date before the server answers, and a toast with
 * Undo, which stays until it is dismissed. A failure goes back to Keep and
 * shows the words of its code. At the Keep limit the button is disabled,
 * stays focusable, and names the reason under it. Focus stays on the
 * control: "End keep..." after a Keep, "Keep" after an Undo (UX 7.9).
 * Without member Keeps, it renders nothing.
 */
export function KeepButton({ itemKey, title, testIdBase, keep, size = "default", endDialogTestId = "leaving-soon-end-keep", className }: KeepButtonProps) {
  const keeps = useKeeps() ?? NO_PROVIDER
  const f = useFormat()
  const toast = useToast()
  const limitId = useId()
  const keepButton = useRef<HTMLButtonElement>(null)
  const endButton = useRef<HTMLButtonElement>(null)
  const focus = useRef<Focus>(null)
  const [state, setState] = useState<KeepState>(keep ? { kind: "kept", ...keep } : { kind: "idle" })
  // The Keep that holds now, for the toast's Undo: after an End keep, a late Undo does nothing
  const held = useRef<string | null>(keep?.keepId ?? null)
  // The Keep of the dialog stays set while it closes
  const [ending, setEnding] = useState<{ keepId: string; until: string } | null>(null)
  const [endOpen, setEndOpen] = useState(false)

  useLayoutEffect(() => {
    const next = focus.current
    if (!next) return
    focus.current = null
    const active = document.activeElement
    if (!next.force && active !== null && active !== document.body) return
    ;(next.to === "keep" ? keepButton : endButton).current?.focus()
  })

  if (!keeps.enabled && state.kind === "idle") return null
  const dayWords = (until: string) => f.date(lastDay(until), "short")
  const fail = (failure: { code: string; error: string }) => toast.showError(keepErrorWords(failure, keeps.limit))

  /** Back to Kept by you after a failed Undo or End keep. */
  const restore = (kept: { keepId: string; until: string }, failure: { code: string; error: string }) => {
    held.current = kept.keepId
    setState({ kind: "kept", ...kept })
    keeps.change(1)
    fail(failure)
  }

  const undo = async (kept: { keepId: string; until: string }) => {
    if (held.current !== kept.keepId) return
    held.current = null
    setState({ kind: "idle" })
    keeps.change(-1)
    focus.current = { to: "keep", force: true }
    const result = await settle(() => removeMyCleanupKeep({ keepId: kept.keepId, restore: true }))
    if (!result.success) return restore(kept, result)
    toast.showSuccess(result.data.restored ? KEEP_TOASTS.undone : KEEP_TOASTS.ended)
  }

  const press = async () => {
    if (keeps.atLimit || state.kind !== "idle") return
    setState({ kind: "kept", keepId: null, until: new Date(Date.now() + keeps.days * DAY_MS).toISOString() })
    keeps.change(1)
    focus.current = { to: "end", force: false }
    const result = await settle(() => keepCleanupTitle({ itemKey }))
    if (!result.success) {
      setState({ kind: "idle" })
      keeps.change(-1)
      focus.current = { to: "keep", force: false }
      return fail(result)
    }
    const kept = { keepId: result.data.keepId, until: result.data.until }
    held.current = kept.keepId
    setState({ kind: "kept", ...kept })
    toast.toast({ title: `Kept ${title} until ${dayWords(kept.until)}.`, tone: "success", action: { label: "Undo", onClick: () => void undo(kept) } })
  }

  const end = async (kept: { keepId: string; until: string }) => {
    const result = await settle(() => removeMyCleanupKeep({ keepId: kept.keepId }))
    if (!result.success) return restore(kept, result)
    toast.showSuccess(KEEP_TOASTS.ended)
  }

  const endDialog = (
    <ConfirmDialog
      open={endOpen}
      onOpenChange={setEndOpen}
      title={endKeepWords(title, keeps.graceDays).title}
      description={endKeepWords(title, keeps.graceDays).description}
      confirmLabel="End keep"
      pendingLabel="Ending"
      tone="destructive"
      successFocus={keepButton}
      action={async () => {
        if (ending) {
          held.current = null
          setState({ kind: "idle" })
          keeps.change(-1)
          void end(ending)
        }
        return {}
      }}
      data-testid={`${endDialogTestId}-dialog`}
      confirmTestId={`${endDialogTestId}-confirm`}
    />
  )

  if (state.kind === "idle") {
    return (
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Button
          ref={keepButton}
          variant="secondary"
          size={size}
          className="w-full max-md:h-11"
          icon={<Icon icon={icons.keep} />}
          aria-label={`Keep ${title}`}
          disabled={keeps.atLimit}
          focusableWhenDisabled={keeps.atLimit}
          aria-describedby={keeps.atLimit ? limitId : undefined}
          onClick={() => void press()}
          data-testid={`${testIdBase}-keep`}
        >
          Keep
        </Button>
        {keeps.atLimit && (
          <p id={limitId} className="text-label text-muted-foreground" data-testid={`${testIdBase}-limit`}>
            {keepLimitWords(keeps.limit)}
          </p>
        )}
        {endDialog}
      </div>
    )
  }

  const { keepId, until } = state
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-col gap-0.5 rounded-md border border-success/30 bg-success-subtle px-3 py-2" role="status">
        <span className="flex items-center gap-1.5 text-ui font-medium text-success">
          <Icon icon={icons.keep} />
          Kept by you
        </span>
        <span className="text-label text-foreground">Until {dayWords(until)}</span>
      </div>
      <Button
        ref={endButton}
        variant="ghost"
        size="sm"
        className="self-start max-md:h-11"
        disabled={keepId === null}
        focusableWhenDisabled={keepId === null}
        aria-label={`End keep on ${title}`}
        onClick={() => {
          if (keepId === null) return
          setEnding({ keepId, until })
          setEndOpen(true)
        }}
        data-testid={`${testIdBase}-end-keep`}
      >
        End keep...
      </Button>
      {endDialog}
    </div>
  )
}

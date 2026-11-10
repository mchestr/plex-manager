"use client"

import { useRouter } from "next/navigation"
import { useLayoutEffect, useState } from "react"

import { turnOnCleanupRule } from "@/actions/admin/cleanup-rules"
import { isChangeMode, numbersOf, startMode, type TurnOnChoice, typedCount } from "@/components/admin/cleanup/turn-on/turn-on-words"
import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { cleanupRule } from "@/lib/admin/routes"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"

/** What the view shows above the button after a press or a change of the numbers. */
export type TurnOnNotice = { kind: "changed" } | { kind: "error"; text: string } | null

/** The values the view follows: the numbers of E28 and the preselected mode. */
interface Seen {
  numbers: string
  mode: TurnOnChoice
}

export interface TurnOnState {
  mode: TurnOnChoice
  setMode: (mode: TurnOnChoice) => void
  typed: string
  setTyped: (typed: string) => void
  notice: TurnOnNotice
  pending: boolean
  press: () => Promise<void>
}

/**
 * The state of the turn-on view (UX 4.6, TS 12.6 `turn-on/` item 1, E28,
 * E34): the mode choice, the typed count, the changed alert and the press.
 *
 * The route stays alive after the admin leaves it, so the view follows newer
 * server data. A render whose `revision`, `count` or `keysHash` differ resets
 * the mode choice and the typed count and shows the changed alert; focus
 * does not move (ux-a11y-r4-6). A new `mode` prop resets them with no alert
 * (architecture-r4-5). The render of the view's own successful press shows
 * no alert. A press always sends the `reviewedAt` of the newest render; the
 * view never stores it (ux-a11y-r5-4).
 */
export function useTurnOn(data: CleanupTurnOnData): TurnOnState {
  const router = useRouter()
  const toast = useToast()
  const [mode, setMode] = useState<TurnOnChoice>(() => startMode(data))
  const [typed, setTyped] = useState("")
  const [notice, setNotice] = useState<TurnOnNotice>(null)
  const [pending, setPending] = useState(false)
  const [seen, setSeen] = useState<Seen>({ numbers: numbersOf(data), mode: data.mode })
  // The revision that the view's own successful press wrote: its render is no change to report
  const [ownRevision, setOwnRevision] = useState<number | null>(null)

  const numbers = numbersOf(data)
  if (seen.numbers !== numbers || seen.mode !== data.mode) {
    const own = ownRevision !== null && data.revision === ownRevision
    setSeen({ numbers, mode: data.mode })
    setMode(startMode(data))
    setTyped("")
    if (own) setOwnRevision(null)
    else if (seen.numbers !== numbers) setNotice({ kind: "changed" })
  }

  // The route hides, not unmounts, when the admin leaves: a press in flight must not stay busy on the way back
  useLayoutEffect(() => () => setPending(false), [])

  const press = async () => {
    const count = typedCount(data, mode)
    setNotice(null)
    setPending(true)
    const result = await turnOnCleanupRule({
      ruleId: data.rule.id,
      mode,
      expectedRevision: data.revision,
      count: data.count,
      keysHash: data.keysHash,
      reviewedAt: data.reviewedAt,
      ...(count !== null ? { typedCount: Number(typed.trim()) } : {}),
    }).catch(() => null)
    if (result === null) {
      setPending(false)
      setNotice({ kind: "error", text: CONFIRM_FALLBACK_ERROR })
      return
    }
    if (result.success) {
      setOwnRevision(result.data.revision)
      toast.showSuccess(isChangeMode(data) ? "Mode changed" : "Rule turned on")
      router.push(cleanupRule(data.rule.id))
      return
    }
    setPending(false)
    if (result.code === "CLEANUP_REVIEW_STALE") {
      setTyped("")
      setNotice({ kind: "changed" })
      router.refresh()
      return
    }
    setNotice({ kind: "error", text: result.error })
  }

  return { mode, setMode, typed, setTyped, notice, pending, press }
}

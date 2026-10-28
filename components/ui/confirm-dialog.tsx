"use client"

import { useId, useLayoutEffect, useRef, useState, useTransition, type ReactElement, type RefObject } from "react"

import { Alert } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

/** Shown when `action` throws instead of returning `{ error }`. */
export const CONFIRM_FALLBACK_ERROR = "That didn't work. Try again."

interface ConfirmDialogProps {
  /** The element that opens the dialog; omit it when `open` is controlled. */
  trigger?: ReactElement
  /** Names the object: "Remove Plex access for Sam Rivera?" */
  title: string
  /** Names the consequence. */
  description: string
  /** "Remove access" */
  confirmLabel: string
  /** The progressive label while `action` runs: "Removing". */
  pendingLabel?: string
  cancelLabel?: string
  tone?: "default" | "destructive"
  /** Confirm stays disabled until this text is typed, ignoring case. */
  typeToConfirm?: string
  /**
   * Runs when the member confirms. The dialog stays open and pending until it
   * resolves; an `{ error }` renders inside the dialog, and success closes it.
   */
  action: () => Promise<{ error?: string }>
  /**
   * Where focus goes once the action succeeds, for an action that removes its
   * own trigger (a row's delete), unless the page has moved focus elsewhere
   * meanwhile. Cancel still returns focus to the trigger.
   */
  successFocus?: RefObject<HTMLElement | null>
  open?: boolean
  onOpenChange?: (open: boolean) => void
  "data-testid"?: string
  confirmTestId?: string
}

/**
 * A confirm step for an action (ui-design-system 5.5, UI-42). While the action
 * runs the buttons are disabled, the confirm button shows a Spinner and
 * `pendingLabel`, and Escape is ignored. Errors render inside the dialog,
 * because the page behind it is inert.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  tone = "default",
  typeToConfirm,
  action,
  successFocus,
  open: openProp,
  onOpenChange,
  "data-testid": testId,
  confirmTestId,
}: ConfirmDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = openProp ?? uncontrolledOpen
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const succeeded = useRef(false)
  const popup = useRef<HTMLDivElement>(null)
  // Where the page moved focus while the action ran; the focus trap can pull it back before the close commits
  const pageFocus = useRef<HTMLElement | null>(null)
  // The element that opened the dialog: focus going back to it is the dialog's own doing, not the page's
  const opener = useRef<Element | null>(null)
  const inputId = useId()

  const ownFocus = (element: Element) =>
    popup.current?.contains(element) || element === opener.current || element.hasAttribute("data-base-ui-focus-guard")

  // Focus the page moved itself, outside this dialog, while the dialog closed
  const focusTaken = () => {
    const active = document.activeElement
    return active !== null && active !== document.body && !ownFocus(active)
  }

  const finalFocus = () => {
    if (!succeeded.current) return true
    if (pageFocus.current?.isConnected) return pageFocus.current
    return !focusTaken() && (successFocus?.current ?? false)
  }

  // A real effect: the router keeps a page it leaves (Activity), so an open confirm closes as the page hides rather
  // than opening again over it on the way back
  useLayoutEffect(() => () => setUncontrolledOpen(false), [])

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const matches = typeToConfirm === undefined || typed.trim().toLowerCase() === typeToConfirm.toLowerCase()

  const confirm = () => {
    setError(null)
    pageFocus.current = null
    const notePageFocus = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && !ownFocus(target)) pageFocus.current = target
    }
    startTransition(async () => {
      let result: { error?: string }
      document.addEventListener("focusin", notePageFocus, true)
      try {
        result = await action()
      } catch {
        result = { error: CONFIRM_FALLBACK_ERROR }
      } finally {
        document.removeEventListener("focusin", notePageFocus, true)
      }
      const failure = result.error
      if (failure) {
        // A transition again after the await: the error then commits with the end of the pending state, never
        // beside a confirm button that still spins
        startTransition(() => setError(failure))
      } else {
        succeeded.current = true
        setOpen(false)
      }
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next, details) => {
        if (isPending) {
          details.cancel()
          return
        }
        if (next) opener.current = details.trigger ?? document.activeElement
        setOpen(next)
      }}
      onOpenChangeComplete={(isOpen) => {
        if (isOpen) {
          succeeded.current = false
          return
        }
        setError(null)
        setTyped("")
      }}
    >
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent
        ref={popup}
        data-testid={testId}
        finalFocus={successFocus && finalFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {typeToConfirm !== undefined && (
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-ui font-medium">
              Type <span className="font-mono">{typeToConfirm}</span> to confirm
            </label>
            <input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={isPending}
              data-testid={testId && `${testId}-confirm-text`}
              autoComplete="off"
              spellCheck={false}
              className="h-10 rounded-md border border-input bg-background px-3 text-base text-foreground md:h-9 md:text-ui"
            />
          </div>
        )}
        {error && <Alert tone="destructive">{error}</Alert>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={tone === "destructive" ? "destructive-solid" : "primary"}
            loading={isPending}
            loadingLabel={pendingLabel}
            disabled={!matches}
            onClick={confirm}
            data-testid={confirmTestId}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

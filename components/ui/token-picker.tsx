"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { X } from "lucide-react"
import { useId, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

/** The popup the picker opened in: a Popover from `md`, a bottom Sheet below. */
export type TokenPickerShell = "popover" | "sheet"

interface TokenPickerProps {
  open: boolean
  /**
   * Every open change the picker makes itself. `cancel` is true for Esc and
   * the Sheet's Close button, which restore the value from before it opened.
   * Every other close applies, as Done: an outside press, focus leaving the
   * Popover, a backdrop press (UX 4.4 item 2).
   */
  onOpenChange: (open: boolean, details: { cancel: boolean }) => void
  /** The pressed token (or phone box): the Popover sits under it, and focus returns to it. */
  anchor: RefObject<HTMLElement | null>
  /** "Last played" */
  title: string
  /** "Condition 2 of 3" */
  caption: string
  /** The editor body. */
  children: ReactNode
  /** The footer, sticky so Done stays on screen. A function gets the shell, since the phone footer differs. */
  footer: ReactNode | ((shell: TokenPickerShell) => ReactNode)
  /** The phone "More actions for this condition" menu, beside the Sheet's Close button. The Popover leaves it out. */
  headerActions?: ReactNode
  /** The control that takes focus on open: the part the token names (UX 4.4 item 1). */
  initialFocus?: RefObject<HTMLElement | null>
  /** Where focus goes on close, when not the anchor: the box of a moved row (UX 7.9). */
  finalFocus?: RefObject<HTMLElement | null>
  "data-testid": string
}

const WIDE = "(min-width: 48rem)"
const CANCEL_REASONS = new Set(["escape-key", "close-press", "close-watcher"])
const TABBABLE = "a[href], button, input, select, textarea, [tabindex]"

function tabbables(root: ParentNode, skip?: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled, [data-base-ui-focus-guard], [type=hidden]") &&
      !element.closest("[inert], [hidden]") &&
      !skip?.contains(element) &&
      (typeof element.checkVisibility !== "function" || element.checkVisibility())
  )
}


/**
 * A panel taller than the room under its token flips above it, or stays
 * below and scrolls (`max-h-(--available-height)`), but never moves beside
 * the token, where it would cover the page header (UX 4.4 item 4).
 */
const STAY_ON_AXIS = { side: "flip", align: "flip", fallbackAxisSide: "none" } as const

/**
 * The condition editor's popup (UX 4.4, 4.12.2). From `md` it is a non-modal
 * Popover under the pressed token, 25rem wide, as tall as the room under it,
 * scrolling with a sticky footer. Focus is not trapped: Tab from its last
 * control moves on to the stop after the token's row (the row's other parts
 * are not tab stops), and Shift Tab from the first goes back to the token.
 * Below `md` it is a bottom Sheet that traps focus, with a grabber, a Close
 * button and the optional header actions.
 *
 * `useMediaQuery` picks the shell as it opens, and it keeps it until the next
 * open. Esc and closes return focus to the anchor, unless focus already left
 * for another control. The owner of `open` closes it as its route hides
 * (TS 12.1 item 8.2).
 */
export function TokenPicker({
  open,
  onOpenChange,
  anchor,
  title,
  caption,
  children,
  footer,
  headerActions,
  initialFocus,
  finalFocus,
  "data-testid": testId,
}: TokenPickerProps) {
  const wide = useMediaQuery(WIDE)
  const [opened, setOpened] = useState<{ open: boolean; shell: TokenPickerShell }>({
    open,
    shell: wide ? "popover" : "sheet",
  })
  if (opened.open !== open) setOpened({ open, shell: open ? (wide ? "popover" : "sheet") : opened.shell })
  const shell = opened.shell

  const captionId = useId()
  const titleId = useId()

  const changeOpen = (next: boolean, details: { reason: string; event: Event; cancel: () => void }) => {
    // A press on the anchor itself keeps the editor open, rather than closing it and opening it again.
    const target = details.event.target
    if (!next && details.reason === "outside-press" && target instanceof Node && anchor.current?.contains(target)) {
      details.cancel()
      return
    }
    onOpenChange(next, { cancel: !next && CANCEL_REASONS.has(details.reason) })
  }

  const returnFocus = () => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body && !active.closest("[data-token-picker]")) return false
    return (finalFocus ?? anchor).current ?? true
  }

  const footerNode = typeof footer === "function" ? footer(shell) : footer
  const labelledBy = `${captionId} ${titleId}`
  const captionNode = (
    <p id={captionId} className="text-caption text-muted-foreground">
      {caption}
    </p>
  )
  const footerClass = "sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-popover"

  if (shell === "sheet") {
    return (
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent
          side="bottom"
          grabber
          showCloseButton={false}
          // The footer carries the bottom padding, so it sits flush with the edge.
          className="pb-0"
          data-token-picker=""
          data-shell="sheet"
          data-testid={testId}
          aria-labelledby={labelledBy}
          initialFocus={initialFocus}
          finalFocus={returnFocus}
        >
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {captionNode}
              <SheetTitle id={titleId} className="text-h3">
                {title}
              </SheetTitle>
            </div>
            <div className="-mt-2 -mr-3 flex shrink-0 items-center gap-1">
              {headerActions}
              <SheetClose
                data-testid={`${testId}-close`}
                render={<Button variant="ghost" size="icon" className="size-11 text-muted-foreground" />}
              >
                <Icon icon={X} />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
          <div className="flex flex-col gap-4">{children}</div>
          <div data-slot="token-picker-footer" className={cn(footerClass, "-mx-6 px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]")}>
            {footerNode}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const tabOut = (event: KeyboardEvent<HTMLDivElement>) => {
    const anchorElement = anchor.current
    if (event.key !== "Tab" || event.defaultPrevented || !anchorElement) return
    const inside = tabbables(event.currentTarget)
    if (event.target !== (event.shiftKey ? inside[0] : inside[inside.length - 1])) return
    const target = event.shiftKey
      ? anchorElement
      : tabbables(document, event.currentTarget).find(
          (element) =>
            !anchorElement.contains(element) && anchorElement.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
        )
    if (!target) return
    event.preventDefault()
    target.focus()
    // Focus moved by hand skips Base UI's portal guards, which would close the Popover: close it here, as Done.
    onOpenChange(false, { cancel: false })
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverContent
        anchor={anchor}
        side="bottom"
        align="start"
        collisionAvoidance={STAY_ON_AXIS}
        data-token-picker=""
        data-shell="popover"
        data-testid={testId}
        aria-labelledby={labelledBy}
        initialFocus={initialFocus}
        finalFocus={returnFocus}
        onKeyDown={tabOut}
        className="w-[25rem] max-h-(--available-height) gap-4 overflow-y-auto pb-0"
      >
        <div className="flex flex-col gap-0.5">
          {captionNode}
          <PopoverPrimitive.Title id={titleId} className="text-h3 text-foreground">
            {title}
          </PopoverPrimitive.Title>
        </div>
        <div className="flex flex-col gap-4">{children}</div>
        <div data-slot="token-picker-footer" className={cn(footerClass, "-mx-4 mt-auto px-4 py-3")}>
          {footerNode}
        </div>
      </PopoverContent>
    </Popover>
  )
}

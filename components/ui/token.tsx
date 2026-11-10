"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { ChevronDown, TriangleAlert } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

export type TokenPart = "field" | "operator" | "value" | "extra"

export type TokenState =
  | "default"
  | "open"
  | "changed"
  | "error"
  | "notApplicable"
  | "incomplete"
  | "sourceFailed"
  | "readOnly"
  | "static"

/** The looks a `static` token can borrow (UX 4.12.1 item 4). */
export type StaticTokenLook = "default" | "error" | "notApplicable" | "incomplete" | "sourceFailed"

interface TokenProps extends Omit<ButtonPrimitive.Props, "className" | "children" | "render" | "nativeButton"> {
  /** Which part of the sentence it is: it names the token and tells the editor where to put focus. */
  part: TokenPart
  state?: TokenState
  /** With `state="static"`: the look of the token it stands for. */
  look?: StaticTokenLook
  /** The spoken part word, when the part is not a condition part: "level", "library", "grace period". */
  partLabel?: string
  /** With `state="sourceFailed"`: the service that failed, "Tautulli". */
  sourceName?: string
  /** The visible text, such as "365 days". The accessible name starts with it. */
  children: string
  className?: string
  /** A static token takes the box id with the part, `{box id}-{part}`, never the desktop token's id (UX 10.1 item 7). */
  "data-testid": string
}

const PART_WORDS: Record<TokenPart, string> = {
  field: "field",
  operator: "operator",
  value: "value",
  extra: "second value",
}

/** 36px below `md`, 30px from `md`; a 6px radius, the `secondary` fill and the `border-strong` border. */
const shape = "h-9 gap-1 px-2.5 text-ui md:h-7.5"

const looks: Record<Exclude<TokenState, "readOnly" | "static">, string> = {
  default: "",
  open: "border-primary",
  changed: "",
  error: "border-destructive text-destructive hover:text-destructive",
  notApplicable: "border-dashed border-warning",
  incomplete: "border-dashed text-muted-foreground hover:text-muted-foreground",
  sourceFailed: "border-warning",
}

/**
 * "365 days, value. Change." One string in `aria-label`: a visually hidden
 * suffix would be a block box, and browsers put a space before it.
 */
function tokenName(text: string, part: TokenPart, state: TokenState, partLabel?: string, sourceName?: string): string {
  const words = [text, partLabel ?? PART_WORDS[part]]
  if (state === "changed") words.push("changed")
  if (state === "sourceFailed" && sourceName) words.push(`${sourceName} failed`)
  return `${words.join(", ")}. Change.`
}

const failedMark = <Icon icon={TriangleAlert} size={14} className="text-warning" />

/**
 * One editable word of a rule sentence (UX 4.12.1): a button with a chevron,
 * on the Button recipe. Its name starts with its visible text, then the part,
 * then "Change": "365 days, value. Change." A changed token adds "changed"
 * and a dot. Enter, Space and Down open the condition editor through
 * `onClick`; the row handles the other keys (UX 7.8).
 *
 * Two states are not buttons: `readOnly` (a live rule's level, a global
 * protection) is a muted span, and `static` is a span with the token look and
 * no chevron, for the phone condition box, which is itself the one button
 * (UX 4.3.8 item 2). Neither takes focus.
 */
export function Token({
  part,
  state = "default",
  look = "default",
  partLabel,
  sourceName,
  children,
  className,
  onKeyDown,
  "data-testid": testId,
  ...props
}: TokenProps) {
  if (state === "static") {
    return (
      <span
        data-slot="token"
        data-part={part}
        data-state="static"
        data-look={look}
        data-testid={testId}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          shape,
          // Inert inside the box: a press goes to the box button.
          "pointer-events-none",
          part === "field" && "font-semibold",
          looks[look],
          className
        )}
      >
        {children}
        {look === "sourceFailed" && failedMark}
      </span>
    )
  }

  if (state === "readOnly") {
    return (
      <span
        data-slot="token"
        data-part={part}
        data-state="readOnly"
        data-testid={testId}
        id={props.id}
        aria-describedby={props["aria-describedby"]}
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          shape,
          "cursor-default border-border bg-muted text-foreground select-text hover:bg-muted hover:text-foreground",
          part === "field" && "font-semibold",
          className
        )}
      >
        {children}
      </span>
    )
  }

  return (
    <ButtonPrimitive
      data-slot="token"
      data-part={part}
      data-state={state}
      data-testid={testId}
      aria-label={tokenName(children, part, state, partLabel, sourceName)}
      aria-haspopup="dialog"
      aria-expanded={state === "open"}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.key !== "ArrowDown" || event.altKey || event.ctrlKey || event.metaKey) return
        event.preventDefault()
        event.currentTarget.click()
      }}
      className={cn(
        buttonVariants({ variant: "secondary", size: "sm" }),
        shape,
        "relative",
        part === "field" && "font-semibold",
        looks[state],
        className
      )}
      {...props}
    >
      {children}
      {state === "sourceFailed" && failedMark}
      <Icon icon={ChevronDown} size={14} data-slot="token-chevron" className="-mr-0.5 text-muted-foreground" />
      {state === "changed" && (
        <span
          aria-hidden="true"
          data-slot="token-changed-dot"
          className="absolute -top-1 -right-1 size-2 rounded-full bg-info ring-2 ring-background"
        />
      )}
    </ButtonPrimitive>
  )
}

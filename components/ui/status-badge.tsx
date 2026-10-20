import type { LucideIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { resolveStatus, type StatusDomain, type StatusMark, type StatusValue, type Tone } from "@/lib/ui/status"

type SpanProps = Omit<ComponentProps<"span">, "children">

interface StatusProps extends SpanProps {
  tone: Tone
  /** The word for the state. Colour never carries a state alone (ui-design-system 3.1). */
  label: string
}

interface PresentationalProps extends StatusProps {
  icon?: LucideIcon
  /** A muted line under the badge, such as "Renews Oct 2". */
  sub?: string
  domain?: never
  value?: never
}

interface DomainProps<D extends StatusDomain> extends SpanProps {
  /** A row of the `STATUS` table (ui-design-system 5.6), which supplies the word, tone and mark. */
  domain: D
  value: StatusValue<D>
  /** The sub-line, usually `resolveStatus(...).sub` filled with a date. Replaces the table's fixed sub-line. */
  sub?: string
  tone?: never
  label?: never
  icon?: never
}

type StatusBadgeProps<D extends StatusDomain> = PresentationalProps | DomainProps<D>

function isDomainProps<D extends StatusDomain>(props: StatusBadgeProps<D>): props is DomainProps<D> {
  return props.domain !== undefined
}

function resolveProps<D extends StatusDomain>(props: StatusBadgeProps<D>) {
  if (!isDomainProps(props)) {
    const { tone, label, icon, sub, ...rest } = props
    const mark: StatusMark | undefined = icon ?? (tone === "neutral" || tone === "outline" ? undefined : "dot")
    return { tone, label, mark, sub, rest }
  }
  const { domain, value, sub, ...rest } = props
  const status = resolveStatus(domain, value)
  return { tone: status.tone, label: status.label, mark: status.mark, sub: sub ?? status.sub, rest }
}

/**
 * A state as a badge: the tone's colour, its mark (a dot, a spinner or an
 * icon) and always its word; `plain` renders the word as text. Pass a
 * `domain` and `value` to read the word from `lib/ui/status.ts`, or a
 * `tone` and `label` directly.
 */
export function StatusBadge<D extends StatusDomain>(props: StatusBadgeProps<D>) {
  const { tone, label, mark, sub, rest } = resolveProps(props)
  const { className, ...spanProps } = rest
  const badge =
    tone === "plain" ? (
      <span data-slot="status-badge" className="text-ui text-foreground">
        {label}
      </span>
    ) : (
      <Badge
        data-slot="status-badge"
        variant={tone}
        icon={typeof mark === "string" ? undefined : mark}
        dot={mark === "dot"}
      >
        {mark === "spinner" && <Spinner size={12} />}
        {label}
      </Badge>
    )
  if (!sub) {
    return (
      <span className={cn("inline-flex", className)} {...spanProps}>
        {badge}
      </span>
    )
  }
  return (
    <span className={cn("inline-flex flex-col items-start gap-0.5", className)} {...spanProps}>
      {badge}
      <span className="text-caption text-muted-foreground">{sub}</span>
    </span>
  )
}

const dotColour: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
  neutral: "bg-muted-foreground",
  outline: "bg-muted-foreground",
  plain: "bg-muted-foreground",
}

/** A live state as a dot and a word, such as "Online" in a health line. */
export function StatusDot({ tone, label, className, ...props }: StatusProps) {
  return (
    <span data-slot="status-dot" className={cn("inline-flex items-center gap-2 text-ui text-foreground", className)} {...props}>
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", dotColour[tone])} />
      {label}
    </span>
  )
}

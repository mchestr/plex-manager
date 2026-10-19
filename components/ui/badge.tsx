import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"
import type { ComponentProps } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-5.5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-2 text-caption",
  {
    variants: {
      variant: {
        neutral: "border-border bg-secondary text-muted-foreground",
        outline: "border-border-strong text-foreground",
        success: "border-success/30 bg-success-subtle text-success",
        warning: "border-warning/30 bg-warning-subtle text-warning",
        info: "border-info/30 bg-info-subtle text-info",
        destructive: "border-destructive/30 bg-destructive-subtle text-destructive",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>
type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger"

interface BadgeProps extends ComponentProps<"span"> {
  variant?: BadgeVariant
  /** @deprecated Use `variant`; `danger` is `destructive`. Removed in P10.11. */
  tone?: BadgeTone
  /** A 6px dot in the badge's colour before the word. */
  dot?: boolean
  /** A 12px icon before the word, in place of the dot. */
  icon?: LucideIcon
}

/**
 * A small label for a state (ui-design-system 5.4). Badges are for states;
 * categories are plain text. The colour always comes with a word.
 */
export function Badge({ variant, tone, dot, icon, className, children, ...props }: BadgeProps) {
  const resolved = variant ?? (tone === "danger" ? "destructive" : tone)
  return (
    <span data-slot="badge" className={cn(badgeVariants({ variant: resolved }), className)} {...props}>
      {icon ? (
        <Icon icon={icon} size={12} />
      ) : (
        dot && <span aria-hidden="true" data-slot="badge-dot" className="size-1.5 shrink-0 rounded-full bg-current" />
      )}
      {children}
    </span>
  )
}

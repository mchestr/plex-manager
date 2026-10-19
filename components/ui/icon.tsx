import type { LucideIcon, LucideProps } from "lucide-react"

import { cn } from "@/lib/utils"

/** The icon sizes of ui-design-system 3.10: badges, meta lines, controls, member tiles. */
type IconSize = 12 | 14 | 16 | 20

interface IconProps extends Omit<LucideProps, "size" | "strokeWidth" | "ref"> {
  icon: LucideIcon
  size?: IconSize
  /** Names the icon for screen readers. Without it the icon is decorative and hidden. */
  label?: string
}

/**
 * A lucide icon at one of the four sizes, with the design system's stroke:
 * 1.75, or 2 at 12px inside badges.
 */
export function Icon({ icon: Glyph, size = 16, label, className, ...props }: IconProps) {
  return (
    <Glyph
      data-slot="icon"
      size={size}
      strokeWidth={size === 12 ? 2 : 1.75}
      className={cn("shrink-0", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
      {...props}
    />
  )
}

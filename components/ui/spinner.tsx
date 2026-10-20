import { LoaderCircle, type LucideProps } from "lucide-react"

import { cn } from "@/lib/utils"

interface SpinnerProps extends Omit<LucideProps, "ref"> {
  /** Read by screen readers in place of the hidden glyph, e.g. "Saving". */
  label?: string
}

/**
 * The one loading glyph: lucide `loader-circle`, 16px by default.
 *
 * `data-slot="spinner"` exempts it from the reduced-motion clamp in
 * `app/globals.css`, because a spinner conveys state. The glyph is always
 * hidden from assistive technology; pass `label` for an sr-only text, or
 * announce the state on the surrounding element (`aria-busy`, a status role).
 */
export function Spinner({ label, size = 16, className, ...props }: SpinnerProps) {
  const glyph = (
    <LoaderCircle
      data-slot="spinner"
      aria-hidden="true"
      size={size}
      className={cn("shrink-0 animate-spin", className)}
      {...props}
    />
  )
  if (!label) return glyph
  return (
    <>
      {glyph}
      <span className="sr-only">{label}</span>
    </>
  )
}

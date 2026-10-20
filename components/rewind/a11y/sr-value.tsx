import type { ReactNode } from "react"

interface SrValueProps {
  /** The final value as read aloud ("1,284 hours"), in the DOM from the first render. */
  value: string
  /** The animated layer, such as an odometer; hidden from assistive technology. */
  children: ReactNode
  className?: string
}

/**
 * A number that animates on screen but is read once, as its final value
 * (Rewind design 11.1): screen readers get `value` in an `sr-only` span from
 * the first render, and never the rolling digits.
 */
export function SrValue({ value, children, className }: SrValueProps) {
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  )
}

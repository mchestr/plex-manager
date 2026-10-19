import { ArrowUpRight } from "lucide-react"
import type { AnchorHTMLAttributes } from "react"
import { safeLink } from "@/lib/ui/markdown"

type SafeLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** react-markdown passes the hast node; it must not reach the DOM. */
  node?: unknown
}

/**
 * A link that allows only http and https (SEC-57). Anything else renders as
 * plain text. An external link shows its full destination after the label,
 * opens in a new tab without an opener, and ends in an arrow icon; a link on
 * the app's own origin renders as a normal link.
 */
export function SafeLink({ href, children, node, ...props }: SafeLinkProps) {
  const link = safeLink(href)
  if (!link) return <span>{children}</span>
  if (!link.external) {
    return (
      <a {...props} href={link.href}>
        {children}
      </a>
    )
  }
  return (
    <a {...props} href={link.href} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="ml-1 font-mono text-[0.85em] font-normal break-all text-muted-foreground">
        ({link.href})
      </span>
      <ArrowUpRight aria-hidden="true" className="ml-0.5 inline size-[0.9em] align-[-0.1em]" />
    </a>
  )
}

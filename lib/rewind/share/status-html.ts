/**
 * The share page's busy and unavailable states (design 6.6, RWV-05). A page
 * cannot set a 429 or a 503, so proxy.ts answers both for `/rewind/s/*` with
 * this static page on paper, which needs no database, no session and no
 * client script. The route's `error.tsx` prints the same copy for a render
 * that throws.
 *
 * Client-safe: no server imports.
 *
 * @module lib/rewind/share/status-html
 */

import { rewindInks } from "@/lib/design/tokens"

/** The one message for every share page that could not load. */
export const SHARE_UNAVAILABLE = {
  title: "This Rewind couldn't load.",
  body: "Try again in a moment.",
  action: "Try again",
} as const

/** Seconds a 503 asks the visitor to wait. */
export const SHARE_RETRY_AFTER_S = 30

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char)

/**
 * The static page, whose Try again link reloads `path` (the request's own
 * pathname; escaped, though proxy.ts only passes a share path).
 */
export function shareStatusHtml(path: string): string {
  const paper = rewindInks.paper
  const { title, body, action } = SHARE_UNAVAILABLE
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Rewind</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${paper.field.hex};color:${paper.on.hex};font-family:Georgia,"Times New Roman",serif;padding:0 16px}
main{max-width:32rem}
h1{font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:2rem;line-height:1.1;margin:0 0 12px}
p{font-size:1.125rem;margin:0 0 24px}
a{color:inherit;font-family:Arial,Helvetica,sans-serif;font-weight:600;text-underline-offset:4px}
</style>
</head>
<body>
<main id="main" data-testid="rewind-share-unavailable">
<h1>${escape(title)}</h1>
<p>${escape(body)}</p>
<a href="${escape(path)}">${escape(action)}</a>
</main>
</body>
</html>
`
}

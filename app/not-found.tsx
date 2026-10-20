import type { Metadata } from "next"

export const metadata: Metadata = { title: "Page not found" }

/**
 * The app-wide 404, Next's built-in text inside the page's `main#main` so the
 * skip link has a target (P3.2). P10.17 redesigns it.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center gap-5 px-4 text-center outline-none"
    >
      <h1 data-testid="not-found-heading" className="border-r border-border pr-5 text-h2">
        404
      </h1>
      <p className="text-ui">This page could not be found.</p>
    </main>
  )
}

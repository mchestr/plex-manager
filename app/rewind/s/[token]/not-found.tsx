import Link from "next/link"

/**
 * A share link that is malformed, unknown, revoked or not finished. The copy
 * is the same for all of them, so it says nothing about which one it was.
 */
export default function WrappedShareNotFound() {
  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen items-center justify-center bg-slate-900 px-4 outline-none">
      <div className="max-w-md text-center">
        <h1 data-testid="wrapped-share-not-found" className="mb-2 text-2xl font-bold text-white">
          Share link not available
        </h1>
        <p className="mb-6 text-slate-400">This link may have been turned off by its owner.</p>
        <Link
          href="/"
          className="inline-block rounded-md bg-gradient-to-r from-cyan-600 to-purple-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:from-cyan-700 hover:to-purple-700"
        >
          Go to Plex Manager
        </Link>
      </div>
    </main>
  )
}

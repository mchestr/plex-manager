import Link from "next/link"

/** A `/wrapped/<year>` whose year is not a valid Rewind year (2010 to 2100). */
export default function WrappedYearNotFound() {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
      <div className="max-w-md mx-auto">
        <h2 data-testid="wrapped-year-not-found" className="text-2xl font-bold text-white mb-2">
          Page not found
        </h2>
        <p className="text-slate-400 mb-6">That isn&apos;t a Rewind year.</p>
        <Link
          href="/wrapped"
          className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"
        >
          Go to your Rewind
        </Link>
      </div>
    </div>
  )
}

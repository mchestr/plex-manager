import Link from "next/link"
import { RexDinosaur } from "@/components/shared/rex-dinosaur"

export function UnauthorizedError() {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-6"
      data-testid="unauthorized-error-page"
    >
      <div className="max-w-lg w-full text-center space-y-6">
        {/* Rex Dinosaur with playful animation */}
        <div
          className="flex justify-center mb-4"
          data-testid="rex-dinosaur"
        >
          <div className="w-32 h-32 relative animate-bounce" style={{ animationDuration: "2s" }}>
            <RexDinosaur size="w-32 h-32" />
          </div>
        </div>

        {/* Error Content */}
        <div className="space-y-4">
          <h1
            className="text-4xl font-black text-white mb-2 tracking-tight"
            data-testid="access-denied-heading"
          >
            Access Denied
          </h1>
          <p className="text-slate-300 text-lg leading-relaxed max-w-md mx-auto">
            Oops! You don&apos;t have permission to access this admin page.
            <span className="block mt-2 text-slate-400 text-base">
              Admin access is required to view this content.
            </span>
          </p>
        </div>

        {/* Home Button */}
        <div className="pt-4">
          <Link
            href="/"
            className="inline-flex items-center justify-center px-8 py-3 bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:from-cyan-600 hover:via-purple-600 hover:to-pink-600 text-white rounded-xl text-base font-semibold transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-purple-500/50"
            data-testid="go-home-button"
          >
            Go to Home
          </Link>
        </div>
      </div>
    </div>
  )
}


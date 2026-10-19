import Link from "next/link"
import { WrappedPageClient } from "@/components/wrapped/wrapped-page-client"
import { WrappedViewerWrapper } from "@/components/wrapped/wrapped-viewer-wrapper"
import { readWrappedStatus } from "@/lib/wrapped/data/parse-stored"
import { memberErrorCopy, readStoredError } from "@/lib/wrapped/generation-errors"
import type { WrappedData } from "@/types/wrapped"

interface WrappedYearViewProps {
  userId: string
  /** The year in the route. */
  year: number
  /** The member's own row for `year`, or null when there is none. */
  wrapped: { id: string; status: string; data: string | null; error: string | null; shareToken: string | null } | null
  /** The parsed `wrapped.data` of a completed row, or null when it does not parse. */
  wrappedData: WrappedData | null
  /** The season year: the dashboard card generates and retries only this year. */
  seasonYear: number
  /** The member's latest completed year, or null when they have none. */
  latestYear: number | null
}

type OtherYearProps = Pick<WrappedYearViewProps, "year" | "seasonYear" | "latestYear">

const primaryLinkClass =
  "inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md text-sm font-medium transition-colors"

/**
 * Where a year other than the season year points, since the card at `/`
 * cannot generate it: the latest completed Rewind, or generating the season
 * year when the member has none (or the latest is the year on screen).
 */
function OtherYearLink({ year, seasonYear, latestYear }: OtherYearProps) {
  if (latestYear !== null && latestYear !== year) {
    return (
      <Link href={`/wrapped/${latestYear}`} data-testid="wrapped-latest-year-link" className={primaryLinkClass}>
        Go to your {latestYear} Rewind
      </Link>
    )
  }
  return (
    <Link href="/" data-testid="wrapped-generate-season-link" className={primaryLinkClass}>
      Generate your {seasonYear} Rewind
    </Link>
  )
}

/** A failed or unreadable Rewind for another year: only an admin can regenerate it. */
function OtherYearRecovery(props: OtherYearProps) {
  return (
    <>
      <p data-testid="wrapped-ask-admin" className="text-slate-400 mb-6">
        Ask your server admin to regenerate your {props.year} Rewind.
      </p>
      <OtherYearLink {...props} />
    </>
  )
}

/**
 * The member's Rewind for one year, in whichever state its row is in:
 * completed (the viewer), generating, failed, or none.
 */
export function WrappedYearView({ userId, year, wrapped, wrappedData, seasonYear, latestYear }: WrappedYearViewProps) {
  const status = wrapped ? readWrappedStatus(wrapped.status, wrapped.id) : null

  if (wrapped && status === "completed" && wrapped.data) {
    if (wrappedData) {
      return (
        <WrappedViewerWrapper
          wrappedData={wrappedData}
          year={year}
          shareToken={wrapped.shareToken || undefined}
          canManageShare
        />
      )
    }
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-2xl font-bold text-white mb-2">Error Loading Wrapped</h2>
          {year === seasonYear ? (
            <>
              <p className="text-slate-400 mb-6">
                There was an error parsing your wrapped data. Please try generating it again.
              </p>
              <Link href="/" className={primaryLinkClass}>
                Generate Your Wrapped
              </Link>
            </>
          ) : (
            <>
              <p className="text-slate-400 mb-2">There was an error parsing your wrapped data.</p>
              <OtherYearRecovery year={year} seasonYear={seasonYear} latestYear={latestYear} />
            </>
          )}
        </div>
      </div>
    )
  }

  if (status === "generating") {
    return <WrappedPageClient userId={userId} year={year} initialStatus="generating" />
  }

  if (wrapped && status === "failed") {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-lg p-12 text-center">
        <div className="max-w-md mx-auto">
          <svg
            className="w-12 h-12 mx-auto mb-4 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-2xl font-bold text-white mb-2">Generation Failed</h2>
          <p data-testid="wrapped-failed-message" className="text-red-300 mb-6">
            {memberErrorCopy(readStoredError(wrapped.error))}
          </p>
          {year === seasonYear ? (
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-medium transition-colors"
            >
              Try Again
            </Link>
          ) : (
            <OtherYearRecovery year={year} seasonYear={seasonYear} latestYear={latestYear} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-12 text-center">
      <div className="max-w-md mx-auto">
        <svg
          className="w-16 h-16 mx-auto mb-4 text-slate-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h2 data-testid="no-wrapped-found" className="text-2xl font-bold text-white mb-2">No Wrapped Found</h2>
        {year === seasonYear ? (
          <>
            <p className="text-slate-400 mb-6">You haven&apos;t generated your {year} Plex Wrapped yet.</p>
            <Link href="/" className={primaryLinkClass}>
              Generate Your Wrapped
            </Link>
          </>
        ) : (
          <>
            <p data-testid="wrapped-year-missing" className="text-slate-400 mb-6">
              You don&apos;t have a Rewind for {year}.
            </p>
            <OtherYearLink year={year} seasonYear={seasonYear} latestYear={latestYear} />
          </>
        )}
      </div>
    </div>
  )
}

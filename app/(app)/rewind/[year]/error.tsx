"use client"

import { useParams, useSearchParams } from "next/navigation"

import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { safeReturnPath } from "@/lib/rewind/return-to"
import { readYearParam } from "@/lib/validations/year-range"

/**
 * A render that threw: the `failed` panel with fixed copy and the digest the
 * server logged, never the error's message. It parses the year without Zod,
 * which would otherwise join the story's first-page bundle (P7.15).
 */
export default function RewindYearError({ error }: { error: Error & { digest?: string } }) {
  const params = useParams<{ year: string }>()
  const searchParams = useSearchParams()

  return (
    <RewindStatusPanel
      kind="failed"
      code="INTERNAL"
      year={readYearParam(params.year)}
      returnTo={safeReturnPath(searchParams.get("from"))}
      audience="member"
    >
      {error.digest && (
        <p data-testid="rewind-error-digest" className="font-text text-caption">
          Reference: {error.digest}
        </p>
      )}
    </RewindStatusPanel>
  )
}

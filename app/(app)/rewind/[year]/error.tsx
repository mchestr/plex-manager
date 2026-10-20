"use client"

import { useParams, useSearchParams } from "next/navigation"

import { RewindStatusPanel } from "@/components/rewind/rewind-status-panel"
import { safeReturnPath } from "@/lib/rewind/return-to"
import { yearParamSchema } from "@/lib/validations/params"

/**
 * A render that threw: the `failed` panel with fixed copy and the digest the
 * server logged, never the error's message.
 */
export default function RewindYearError({ error }: { error: Error & { digest?: string } }) {
  const params = useParams<{ year: string }>()
  const searchParams = useSearchParams()
  const parsed = yearParamSchema.safeParse(params.year)

  return (
    <RewindStatusPanel
      kind="failed"
      code="INTERNAL"
      year={parsed.success ? parsed.data : null}
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

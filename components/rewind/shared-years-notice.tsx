"use client"

import { useState, useTransition } from "react"
import { disableWrappedShareLink } from "@/actions/wrapped-share-link"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"

interface RewindSharedYearsNoticeProps {
  /** Years of the member's own Rewinds that still have a public v2 link (`PlexWrapped.shareToken`). */
  years: number[]
}

/**
 * Lists the member's Rewinds that still have a public v2 share link, each
 * with "Stop sharing <year>". Those links survive from before sharing became
 * opt-in, and archive articles have no share controls (P7.13), so this is
 * where their owners stop them (SEC-16, design 6.2) until P11.18 removes them.
 */
export function RewindSharedYearsNotice({ years }: RewindSharedYearsNoticeProps) {
  const [liveYears, setLiveYears] = useState(years)
  const [stoppingYear, setStoppingYear] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const toast = useToast()

  if (liveYears.length === 0) {
    return null
  }

  const stopSharing = (year: number) => {
    setStoppingYear(year)
    startTransition(async () => {
      const result = await disableWrappedShareLink({ year })
      setStoppingYear(null)
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      setLiveYears((current) => current.filter((y) => y !== year))
      toast.showSuccess(`Sharing stopped for ${year}. The link no longer opens.`)
    })
  }

  return (
    <div className="relative z-40 mx-auto max-w-4xl px-4 pt-4" data-testid="rewind-shared-years">
      <Alert tone="info" title="Public links are still on">
        <p>Anyone with these links can open that year&apos;s Rewind.</p>
        <ul className="mt-3 flex flex-wrap gap-3">
          {liveYears.map((year) => (
            <li key={year}>
              <Button
                data-testid={`rewind-share-stop-${year}`}
                variant="secondary"
                size="sm"
                onClick={() => stopSharing(year)}
                disabled={isPending}
              >
                {stoppingYear === year ? "Stopping…" : `Stop sharing ${year}`}
              </Button>
            </li>
          ))}
        </ul>
      </Alert>
    </div>
  )
}

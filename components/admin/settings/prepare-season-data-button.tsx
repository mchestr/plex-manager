"use client"

import { prepareRewindSeasonData } from "@/actions/admin/rewind-season"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

interface PrepareSeasonDataButtonProps {
  year: number
  /** When the last server aggregate for the year was computed, as wall time in the server zone, or null. */
  preparedAt: string | null
  zone: string
}

/**
 * "Prepare season data": queues the server-wide aggregate and the metadata
 * warm for the season year (P2.6, until P7.8 folds it into Prepare season).
 */
export function PrepareSeasonDataButton({ year, preparedAt, zone }: PrepareSeasonDataButtonProps) {
  const router = useRouter()
  const toast = useToast()
  const [isPending, startTransition] = useTransition()

  const prepare = () => {
    startTransition(async () => {
      const result = await prepareRewindSeasonData({ year })
      if (!result.success) {
        toast.showError(result.error)
        return
      }
      toast.showSuccess(
        result.alreadyQueued ? "Season data is already being prepared" : "Preparing season data. This can take a few minutes."
      )
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-xs font-medium mb-1">Season data</div>
        <div className="text-sm" data-testid="rewind-season-data-prepared-at">
          {preparedAt ? `Last prepared ${preparedAt.replace("T", " ")} (${zone})` : "Not prepared yet"}
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={prepare}
        disabled={isPending}
        data-testid="rewind-prepare-season-data-button"
      >
        {isPending ? "Queuing..." : "Prepare season data"}
      </Button>
    </div>
  )
}

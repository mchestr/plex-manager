"use client"

import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { posterKey } from "@/lib/rewind/pages/title-key"

import { useHideTitles } from "./hide-context"

const HIDDEN_NOTE = "Hidden. Your pages change in about 1 minute."

/**
 * "Hide this title" in a row sheet (P7.7), with its confirm step. Renders
 * nothing outside a `HideProvider` (preview mode) or for a title without a
 * Plex rating key.
 */
export function HideTitle({ titleKey, title }: { titleKey: string; title: string }) {
  const hiding = useHideTitles()
  const ratingKey = posterKey(titleKey)
  if (!hiding || !ratingKey) return null

  if (hiding.isHidden(ratingKey)) {
    return (
      <p role="status" className="font-text text-ui" data-testid="rewind-hide-done">
        {HIDDEN_NOTE}
      </p>
    )
  }

  const kind = titleKey.startsWith("film:") ? "film" : "series"
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ink-outline" size="pill" className="self-start" data-testid="rewind-hide-title">
          Hide this title
        </Button>
      }
      title={`Hide ${title} from your Rewind?`}
      description="It still counts in your hours. Your cards and public link stop showing it immediately."
      confirmLabel="Hide"
      pendingLabel="Hiding"
      confirmTestId="rewind-hide-confirm"
      action={async () => {
        const error = await hiding.hide({ ratingKey, kind, title })
        return error ? { error } : {}
      }}
    />
  )
}

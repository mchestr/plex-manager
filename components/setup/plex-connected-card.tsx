import { Card, CardContent } from "@/components/ui/card"
import { Poster } from "@/components/ui/poster"
import { getFormat } from "@/lib/settings/app-settings"
import { getSetupPlexSummary } from "@/lib/setup/plex-summary"

/**
 * "Northfield Plex is connected" in the setup rail (design 6.5): the library
 * and title counts and six of the newest titles as palette title cards.
 * Streamed in its own Suspense boundary, so a slow server never holds up the
 * step beside it.
 */
export async function PlexConnectedCard() {
  const [summary, f] = await Promise.all([getSetupPlexSummary(), getFormat()])
  if (!summary) return null

  const counts =
    summary.libraries !== null && summary.titles !== null
      ? `${summary.libraries} ${summary.libraries === 1 ? "library" : "libraries"} and ${f.number(summary.titles)} titles.`
      : null

  return (
    <Card data-testid="setup-plex-connected">
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="flex items-center gap-2 text-ui font-medium text-foreground">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success" />
          {summary.name} is connected
        </p>
        {counts && <p className="text-label text-muted-foreground">{counts}</p>}
        {summary.recent.length > 0 && (
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-3" aria-hidden="true">
            {summary.recent.map((item) => (
              <Poster key={item.key} ratingKey={null} title={item.title} size="xs" decorative className="w-full" style={{ width: "100%" }} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

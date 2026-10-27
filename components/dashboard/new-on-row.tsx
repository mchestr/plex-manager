import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { Skeleton } from "@/components/ui/skeleton"
import { getNewOn, newOnMeta } from "@/lib/member/new-on"
import { icons } from "@/lib/ui/icons"
import { formatNumber, type FormatSettings } from "@/lib/utils/format"

interface NewOnRowProps {
  userId: string
  isAdmin: boolean
  serverName: string
  /** Watch on Plex's URL, for "Browse in Plex"; null leaves the button out. */
  browseUrl: string | null
  format: FormatSettings
}

// `relative` makes the row the containing block of each link's sr-only text, so
// the row clips it; otherwise the off-screen items' text widens the whole page
const ROW_CLASS = "relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
const ITEM_CLASS = "w-40 shrink-0 snap-start"

function weekLine(count: number | null, format: FormatSettings): string | null {
  if (!count) return null
  return count === 1 ? "1 title was added this week." : `${formatNumber(count, format)} titles were added this week.`
}

/**
 * "New on {server}" (P10.12): the newest titles in the member's own Plex
 * libraries as a poster row that scrolls sideways inside itself, each linked
 * to its Plex web page in a new tab. Renders nothing when there is nothing to
 * show or Plex can't be read; home streams it behind {@link NewOnRowSkeleton}.
 */
export async function NewOnRow({ userId, isAdmin, serverName, browseUrl, format }: NewOnRowProps) {
  const { items, addedThisWeek } = await getNewOn({ userId, isAdmin })
  if (items.length === 0) return null
  const line = weekLine(addedThisWeek, format)

  return (
    <section aria-labelledby="home-new-on-title" className="flex min-w-0 flex-col gap-3.5" data-testid="home-new-on-row">
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="home-new-on-title" className="text-lead font-semibold text-foreground wrap-anywhere">
            New on {serverName}
          </h2>
          {line && <p className="text-caption text-muted-foreground">{line}</p>}
        </div>
        {browseUrl && (
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<a href={browseUrl} target="_blank" rel="noopener noreferrer" />}
            data-testid="home-new-on-browse"
          >
            Browse in Plex
            <Icon icon={icons.externalLink} size={14} />
            <span className="sr-only">(opens Plex)</span>
          </Button>
        )}
      </div>
      <ul className={ROW_CLASS} data-testid="home-new-on-list">
        {items.map((item) => {
          const body = (
            <>
              <Poster ratingKey={item.ratingKey} title={item.title} size="md" decorative />
              <span className="flex flex-col gap-0.5">
                <span className="line-clamp-2 text-label text-foreground wrap-anywhere">{item.title}</span>
                <span className="text-caption text-muted-foreground">{newOnMeta(item)}</span>
              </span>
            </>
          )
          const testId = `home-new-on-item-${item.ratingKey}`
          return (
            <li key={item.ratingKey} className={ITEM_CLASS}>
              {item.href ? (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  data-testid={testId}
                >
                  {body}
                  <span className="sr-only">(opens Plex)</span>
                </a>
              ) : (
                <div className="flex flex-col gap-2" data-testid={testId}>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** The row while Plex answers: the heading and a few poster boxes. */
export function NewOnRowSkeleton() {
  return (
    <div role="status" className="flex min-w-0 flex-col gap-3.5" data-testid="home-new-on-skeleton">
      <span className="sr-only">Loading new titles</span>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-6 w-56 max-w-full" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="flex gap-4 overflow-hidden pb-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={`${ITEM_CLASS} flex flex-col gap-2`}>
            <Skeleton className="aspect-[2/3] w-40 rounded-sm" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  )
}

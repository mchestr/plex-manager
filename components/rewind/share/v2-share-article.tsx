import { formatCount, formatRewindDuration } from "@/lib/rewind/format"
import type { ShareSafeRewindV2 } from "@/lib/wrapped/data/share-safe-v2"

interface V2ShareArticleProps {
  share: ShareSafeRewindV2
  locale: string
}

function TopList({ title, items, locale, testId }: { title: string; items: { title: string; minutes: number }[]; locale: string; testId: string }) {
  if (items.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-2" data-testid={testId}>
      <h2 className="font-display text-h3">{title}</h2>
      <ol className="flex flex-col">
        {items.map((item, i) => (
          <li key={`${i}:${item.title}`} className="flex items-baseline justify-between gap-4 border-t border-current py-2">
            <span className="font-text text-body">
              <span className="font-display tabular-nums">{i + 1}</span> {item.title}
            </span>
            {item.minutes > 0 ? <span className="shrink-0 font-text text-ui">{formatRewindDuration(item.minutes, { locale })}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * A surviving v2 share link (until the 2026 season closes, P11.18 removes
 * it): the stripped v2 projection as a short paper article, with its totals
 * and the top-five lists and no cards. A zero total is left out (RWV-11).
 */
export function V2ShareArticle({ share, locale }: V2ShareArticleProps) {
  const settings = { locale }
  const totals = [
    share.totals.minutes > 0 ? formatRewindDuration(share.totals.minutes, settings) : null,
    share.totals.movies > 0 ? formatCount(share.totals.movies, { one: "film", other: "films" }, settings) : null,
    share.totals.shows > 0 ? formatCount(share.totals.shows, { one: "series", other: "series" }, settings) : null,
    share.totals.episodes > 0 ? formatCount(share.totals.episodes, { one: "episode", other: "episodes" }, settings) : null,
  ].filter((total): total is string => total !== null)

  return (
    <article className="mx-auto flex w-full max-w-xl flex-col gap-8" data-testid="rewind-share-v2">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-h1">
          {share.ownerName}’s Rewind {share.year}
        </h1>
        {totals.length > 0 ? (
          <p className="font-text text-body" data-testid="rewind-share-v2-totals">
            {totals.join(", ")}.
          </p>
        ) : null}
      </header>
      <TopList title="Top films" items={share.topMovies} locale={locale} testId="rewind-share-v2-films" />
      <TopList title="Top shows" items={share.topShows} locale={locale} testId="rewind-share-v2-shows" />
    </article>
  )
}

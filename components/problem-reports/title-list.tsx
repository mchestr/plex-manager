import type { Route } from "next"
import Link from "next/link"

import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import type { TitleResult } from "@/lib/member/problem-report-titles"
import { icons } from "@/lib/ui/icons"

const TYPE_WORDS = { movie: "Movie", show: "Show", episode: "Episode" } as const

interface TitleListProps {
  titles: TitleResult[]
  /** The search to keep in each link, so closing the sheet returns to it. */
  query: string
  /** Prefix of each row's test id, such as `report-result`. */
  testId: string
}

/** Titles to report, each opening its sheet (`/report?item=`), with its poster through the access-checked route. */
export function TitleList({ titles, query, testId }: TitleListProps) {
  return (
    <ul className="flex flex-col" data-testid={`${testId}s`}>
      {titles.map((title) => (
        <li key={title.ratingKey}>
          <Link
            href={`/report?${query ? `q=${encodeURIComponent(query)}&` : ""}item=${title.ratingKey}` as Route}
            scroll={false}
            className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-ui text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
            data-testid={`${testId}-${title.ratingKey}`}
          >
            <Poster ratingKey={title.posterKey} title={title.title} size="xs" w={96} decorative />
            <span className="min-w-0 flex-1 truncate">{title.title}</span>
            <span className="text-label text-muted-foreground">{TYPE_WORDS[title.type]}</span>
            <Icon icon={icons.chevronRight} className="text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

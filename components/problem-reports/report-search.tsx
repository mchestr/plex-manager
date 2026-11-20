import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import type { ReportPageData } from "@/lib/member/problem-reports"
import { icons } from "@/lib/ui/icons"

const TYPE_WORDS = { movie: "Movie", show: "Show", episode: "Episode" } as const

interface ReportSearchProps {
  query: string
  search: ReportPageData["search"]
}

/** Find a title: a `?q=` search rendered on the server, showing only titles in the member's libraries. */
export function ReportSearch({ query, search }: ReportSearchProps) {
  return (
    <section aria-labelledby="report-find-title" className="flex flex-col gap-3" data-testid="report-find">
      <h2 id="report-find-title" className="text-h2 text-foreground">
        Find a title
      </h2>
      <Form action={"/report" as Route} role="search" className="flex gap-2">
        <Input name="q" defaultValue={query} aria-label="Title" placeholder="Search for a movie or show" className="flex-1" data-testid="report-search-input" />
        <Button type="submit" variant="secondary" data-testid="report-search-submit">
          <Icon icon={icons.search} />
          Search
        </Button>
      </Form>
      {search?.error && (
        <p className="text-ui text-muted-foreground" data-testid="report-search-error">
          {search.error}
        </p>
      )}
      {search && !search.error && search.results.length === 0 && (
        <p className="text-ui text-muted-foreground" data-testid="report-search-empty">
          No titles in your libraries match "{query}".
        </p>
      )}
      {search && search.results.length > 0 && (
        <ul className="flex flex-col" data-testid="report-results">
          {search.results.map((result) => (
            <li key={result.ratingKey}>
              <Link
                href={`/report?q=${encodeURIComponent(query)}&item=${result.ratingKey}` as Route}
                scroll={false}
                className="-mx-2 flex min-h-11 items-center gap-3 rounded-md px-2 py-2 text-ui text-foreground hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring"
                data-testid={`report-result-${result.ratingKey}`}
              >
                <span className="min-w-0 flex-1 truncate">{result.title}</span>
                <span className="text-label text-muted-foreground">{TYPE_WORDS[result.type]}</span>
                <Icon icon={icons.chevronRight} className="text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

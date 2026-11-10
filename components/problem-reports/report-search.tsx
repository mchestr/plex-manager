import type { Route } from "next"
import Form from "next/form"

import { TitleList } from "@/components/problem-reports/title-list"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import type { ReportPageData } from "@/lib/member/problem-reports"
import { icons } from "@/lib/ui/icons"

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
      {search && search.results.length > 0 && <TitleList titles={search.results} query={query} testId="report-result" />}
    </section>
  )
}

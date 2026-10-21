import type { BackCoverData } from "@/lib/rewind/pages/back-cover.schema"
import type { BookendsData } from "@/lib/rewind/pages/bookends.schema"
import type { CalendarData } from "@/lib/rewind/pages/calendar.schema"
import type { CentrefoldData } from "@/lib/rewind/pages/centrefold.schema"
import type { ClockData } from "@/lib/rewind/pages/clock.schema"
import type { CoverData } from "@/lib/rewind/pages/cover.schema"
import type { GuessData } from "@/lib/rewind/pages/guess.schema"
import type { NextYearData } from "@/lib/rewind/pages/next-year.schema"
import type { NumberData } from "@/lib/rewind/pages/number.schema"
import type { PeopleData } from "@/lib/rewind/pages/people.schema"
import type { RaceData } from "@/lib/rewind/pages/race.schema"
import type { RecordsData } from "@/lib/rewind/pages/records.schema"
import type { TasteData } from "@/lib/rewind/pages/taste.schema"
import type { RequestsData } from "@/lib/rewind/pages/requests.schema"
import type { SetupData } from "@/lib/rewind/pages/setup.schema"
import type { StandingData } from "@/lib/rewind/pages/standing.schema"
import type { TopFilmsData, TopShowsData } from "@/lib/rewind/pages/top-lists.schema"
import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import type { SelectedPage } from "@/lib/rewind/select-pages"

import { BackCoverPage } from "./back-cover"
import { BookendsPage } from "./bookends"
import { CalendarPage } from "./calendar"
import { CentrefoldPage } from "./centrefold"
import { ClockPage } from "./clock"
import { CoverPage } from "./cover"
import { GuessPage } from "./guess"
import type { IssueContext } from "./issue-context"
import { NextYearPage } from "./next-year"
import { NumberPage } from "./number"
import { PeoplePage } from "./people"
import { RacePage } from "./race"
import { RecordsPage } from "./records"
import { TastePage } from "./taste"
import { RequestsPage } from "./requests"
import { SetupPage } from "./setup"
import { StandingPage } from "./standing"
import { TopFilmsPage } from "./top-films"
import { TopShowsPage } from "./top-shows"
import { u } from "./units"

/**
 * The body of one selected page. `data` has passed the page's registry
 * schema (`validatePagesOnRead`), so each branch may narrow it. Pages whose
 * steps have not landed (P5.7) print their name and summary.
 */
export function PageBody({ page, issue }: { page: SelectedPage; issue: IssueContext }) {
  switch (page.type) {
    case "cover":
      return <CoverPage data={page.data as CoverData} issue={issue} />
    case "number":
      return <NumberPage data={page.data as NumberData} issue={issue} />
    case "bookends":
      return <BookendsPage data={page.data as BookendsData} issue={issue} />
    case "guess":
      return <GuessPage data={page.data as GuessData} issue={issue} />
    case "top-shows":
      return <TopShowsPage data={page.data as TopShowsData} issue={issue} />
    case "top-films":
      return <TopFilmsPage data={page.data as TopFilmsData} issue={issue} />
    case "taste":
      return <TastePage data={page.data as TasteData} issue={issue} />
    case "people":
      return <PeoplePage data={page.data as PeopleData} issue={issue} />
    case "clock":
      return <ClockPage data={page.data as ClockData} issue={issue} />
    case "calendar":
      return <CalendarPage data={page.data as CalendarData} issue={issue} />
    case "race":
      return <RacePage data={page.data as RaceData} issue={issue} />
    case "records":
      return <RecordsPage data={page.data as RecordsData} issue={issue} />
    case "setup":
      return <SetupPage data={page.data as SetupData} issue={issue} />
    case "requests":
      return <RequestsPage data={page.data as RequestsData} issue={issue} />
    case "standing":
      return <StandingPage data={page.data as StandingData} issue={issue} />
    case "centrefold":
      return <CentrefoldPage data={page.data as CentrefoldData} issue={issue} />
    case "next-year":
      return <NextYearPage data={page.data as NextYearData} issue={issue} />
    case "back-cover":
      return <BackCoverPage data={page.data as BackCoverData} issue={issue} />
    default: {
      const entry: RegistryEntry = registry[page.type]
      return (
        <div className="flex h-full flex-col font-text" style={{ padding: `${u(4)} ${u(16)}`, gap: u(12) }}>
          <h2 tabIndex={-1} className="font-lead outline-none" style={{ fontSize: u(36) }}>
            {entry.name}
          </h2>
          <p style={{ fontSize: u(18.5) }}>{entry.srSummary(page.data, issue.facts)}</p>
        </div>
      )
    }
  }
}

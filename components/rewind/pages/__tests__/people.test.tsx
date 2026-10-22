import { render, screen } from "@testing-library/react"

import { PeoplePage } from "@/components/rewind/pages/people"
import { issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import { billedNames } from "@/lib/rewind/pages/people"
import type { PeopleData } from "@/lib/rewind/pages/people.schema"
import { registry } from "@/lib/rewind/registry"

import { hasCleanCounts, loadIssues, PAGE_FIXTURES, pageData } from "./page-copy-rules"

jest.mock("server-only", () => ({}))

let issues: Map<string, FixtureIssue>

beforeAll(async () => {
  issues = await loadIssues()
})

describe("08 People", () => {
  it.each(PAGE_FIXTURES)("%s: bills the No. 1 actor as a nameplate and every other name whole, in capitals", (id) => {
    const issue = issues.get(id)!
    const data = pageData<PeopleData>(issue, "people")
    if (!data) return expect(issue.stats.people.eligible).toBe(false)
    const { actors, directors } = billedNames(data, issue.facts)
    render(<PeoplePage data={data} issue={issueContext(issue)} />)

    const heading = screen.getByRole("heading", { level: 2 })
    expect(heading).toHaveTextContent(`Starring ${actors[0]}`)
    // the nameplate's lines join back into the whole name: no word is split
    const plate = heading.querySelector("[aria-hidden]")!
    expect(plate.textContent!.replace(/\s+/g, " ")).toBe(actors[0].toLocaleUpperCase("en-US"))
    const billed = screen.getAllByTestId("rewind-people-name").map((el) => el.textContent)
    expect(billed).toEqual([...actors.slice(1), ...directors].map((name) => name.toLocaleUpperCase("en-US")))
    expect(screen.getByTestId("rewind-figure")).toHaveAttribute("aria-label", registry.people.srSummary(data, issue.facts))
    expect(document.body).not.toHaveTextContent(/headshot/i)
    expect(document.querySelector("img")).toBeNull()
    expect(hasCleanCounts(document.body.textContent!)).toBe(true)
  })

  it("heads a director-only block with 'Directed by'", () => {
    const issue = issues.get("heavy")!
    const facts = Object.fromEntries(Object.entries(issue.facts).filter(([k]) => !k.startsWith("people.actor")))
    render(<PeoplePage data={{ actors: 0, directors: 2 }} issue={issueContext(issue, { facts })} />)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(`Directed by ${issue.facts["people.director[1].name"]!.display}`)
    expect(screen.getAllByTestId("rewind-people-name").map((el) => el.textContent)).toEqual([issue.facts["people.director[2].name"]!.display.toLocaleUpperCase("en-US")])
  })

  it("summarises the page deterministically", () => {
    expect(PAGE_FIXTURES.map((id) => {
      const data = pageData<PeopleData>(issues.get(id)!, "people")
      return data && registry.people.srSummary(data, issues.get(id)!.facts)
    })).toMatchSnapshot()
  })
})

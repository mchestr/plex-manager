import { render, screen } from "@testing-library/react"

import { PLEX_WEB_APP, PostcardPage } from "@/components/rewind/pages/postcard"
import { fixtureIssue, issueContext, type FixtureIssue } from "@/lib/rewind/__tests__/helpers/fixture-issue"
import type { PostcardData } from "@/lib/rewind/pages/postcard.schema"
import { registry } from "@/lib/rewind/registry"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

jest.mock("server-only", () => ({}))

let postcard: FixtureIssue

beforeAll(async () => {
  postcard = await fixtureIssue("postcard")
})

const TITLES: PostcardData = {
  titles: [
    { key: "series:77", title: "Severance" },
    { key: "film:9", title: "Dune: Part Two" },
    { key: "series:12", title: "The Great British Bake Off" },
  ],
}

/** The facts of a member with no plays at all: no minutes to print. */
const noMinutes = (facts: RewindFactsV3): RewindFactsV3 => ({ ...facts, "time.totalMinutes": { value: 0, display: "0 minutes", unit: "duration" } })

function renderPostcard(data: PostcardData, facts: RewindFactsV3 = postcard.facts, libraryHref?: string) {
  render(<PostcardPage data={data} issue={issueContext(postcard, { facts, edition: "postcard", libraryHref })} />)
}

describe("Postcard", () => {
  it("is a quiet year on the server, with the member's minutes and three community titles, no names", () => {
    expect(postcard.edition).toBe("postcard")
    renderPostcard(TITLES)
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("A quiet year on Chester Family Plex")
    expect(screen.getByTestId("rewind-postcard-minutes").textContent).toBe(`You pressed play for ${postcard.facts["time.totalMinutes"]!.display} this year.`)
    const titles = screen.getAllByRole("listitem").map((li) => li.textContent)
    expect(titles).toEqual(["Severance", "Dune: Part Two", "The Great British Bake Off"])
    expect(screen.getByTestId("rewind-page-postcard")).not.toHaveTextContent(/Mike|viewers/)
  })

  it("leaves the minutes line out without minutes, never printing 0 minutes", () => {
    renderPostcard({ titles: [] }, noMinutes(postcard.facts))
    expect(screen.queryByTestId("rewind-postcard-minutes")).not.toBeInTheDocument()
    expect(screen.queryByTestId("rewind-postcard-titles")).not.toBeInTheDocument()
    expect(screen.getByTestId("rewind-page-postcard")).not.toHaveTextContent(/0 minutes/)
  })

  it("opens the server's Plex web app from Browse the library", () => {
    renderPostcard(TITLES, postcard.facts, "https://plex.example.com/web/index.html")
    expect(screen.getByTestId("rewind-postcard-browse")).toHaveAttribute("href", "https://plex.example.com/web/index.html")
  })

  it("falls back to Plex's own web app without a public URL", () => {
    renderPostcard(TITLES)
    expect(screen.getByTestId("rewind-postcard-browse")).toHaveAttribute("href", PLEX_WEB_APP)
  })

  it("summarises the page with and without minutes", () => {
    expect(registry.postcard.srSummary(TITLES, postcard.facts)).toMatch(/^You watched .+\. Watched by three or more of us: Severance; Dune: Part Two; The Great British Bake Off\.$/)
    expect(registry.postcard.srSummary({ titles: [] }, noMinutes(postcard.facts))).toBe("")
  })
})

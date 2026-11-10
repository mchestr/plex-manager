import { render, screen } from "@testing-library/react"

import { WhyThen } from "@/components/admin/cleanup/why/why-then"

const text = [
  { text: "Radarr deletes the movie and its 17.1 GB file, and adds an import list exclusion." },
  { text: " Matched in Radarr by TMDB id 400001. The files are inside the Movies root folder." },
]

describe("WhyThen", () => {
  it("says what the action does to the title", () => {
    render(<WhyThen then={{ text, dryRun: false }} />)
    expect(screen.getByRole("heading", { level: 3, name: "Then" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-then")).toHaveTextContent(
      "ThenRadarr deletes the movie and its 17.1 GB file, and adds an import list exclusion. Matched in Radarr by TMDB id 400001."
    )
  })

  it("starts with the Dry run words for a rule in Dry run", () => {
    render(<WhyThen then={{ text: [{ text: "Sonarr stops monitoring the season and deletes its 4 GB of files.", strong: true }], dryRun: true }} />)
    const then = screen.getByTestId("admin-cleanup-why-then")
    expect(then).toHaveTextContent("ThenIf the rule is turned on, Sonarr stops monitoring the season and deletes its 4 GB of files.")
    expect(screen.getByText("Sonarr stops monitoring the season and deletes its 4 GB of files.").tagName).toBe("STRONG")
  })

  it("says the Dry run words once when the server already put them in the text", () => {
    render(<WhyThen then={{ text: [{ text: "If the rule is turned on, Radarr deletes the movie and its file." }], dryRun: true }} />)
    expect(screen.getByTestId("admin-cleanup-why-then")).toHaveTextContent(/^ThenIf the rule is turned on, Radarr deletes the movie and its file\.$/)
  })

  it("renders nothing for a title with no Then line", () => {
    const { container } = render(<WhyThen then={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })
})

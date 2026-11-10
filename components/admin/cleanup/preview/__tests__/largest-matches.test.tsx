import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildRef } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { LARGEST_MATCHES_HEADING_ID, LargestMatches } from "@/components/admin/cleanup/preview/largest-matches"

const items = [
  { ...buildRef(), why: [{ text: "Never played.", strong: true }, { text: " Added Feb 2023." }] },
  {
    ...buildRef({ itemKey: "season-77-2", level: "season" as const, title: "Night Ferry", year: null, seasonNumber: 2, sizeBytes: null }),
    why: [{ text: "Last played Aug 2024.", strong: true }],
  },
]

describe("LargestMatches", () => {
  it("lists each match with its title, year, Why text and size", () => {
    render(<LargestMatches items={items} onWhy={jest.fn()} />)
    const heading = screen.getByRole("heading", { level: 3, name: "Largest matches" })
    // A focus target after a Why Sheet action removes a row (ux-a11y-r8-1)
    expect(heading).toHaveAttribute("id", LARGEST_MATCHES_HEADING_ID)
    expect(heading).toHaveAttribute("tabindex", "-1")
    const rows = screen.getAllByRole("listitem")
    expect(rows[0]).toHaveTextContent("Harbor Lights (2022)Never played. Added Feb 2023.22.4 GBWhy")
    expect(rows[1]).toHaveTextContent("Night Ferry, Season 2Last played Aug 2024.UnknownWhy")
    // A hint here: the deciding words are not bold, as they are in Results
    expect(screen.getByText("Never played. Added Feb 2023.").tagName).toBe("P")
  })

  it("opens the Why Sheet of a row from its Why button", async () => {
    const user = userEvent.setup()
    const onWhy = jest.fn()
    render(<LargestMatches items={items} onWhy={onWhy} />)
    const why = screen.getByRole("button", { name: "Why: Night Ferry, Season 2" })
    expect(why).toHaveAttribute("data-testid", "admin-cleanup-preview-largest-season-77-2-why")
    await user.click(why)
    expect(onWhy).toHaveBeenCalledWith("season-77-2")
  })

  it("renders nothing without a match", () => {
    const { container } = render(<LargestMatches items={[]} onWhy={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

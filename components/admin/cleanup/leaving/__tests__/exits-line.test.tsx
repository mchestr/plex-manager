/**
 * The exits line of the Leaving soon tab (UX 4.7.2): the titles that left
 * Leaving soon in the last 7 days, and "Open history". It hides at 0.
 */

import { render, screen } from "@testing-library/react"

import { ExitsLine } from "@/components/admin/cleanup/leaving/exits-line"

describe("ExitsLine", () => {
  it("counts the exits of the last 7 days and links to History", () => {
    render(<ExitsLine exits={{ kept: 4, played: 3, other: 2 }} />)
    expect(screen.getByTestId("admin-cleanup-leaving-exits")).toHaveTextContent(
      "In the last 7 days, 9 titles left Leaving soon: 4 kept by members, 3 played, 2 for other reasons."
    )
    expect(screen.getByTestId("admin-cleanup-leaving-exits-history")).toHaveAttribute("href", "/admin/cleanup?tab=history")
    expect(screen.getByRole("link", { name: "Open history" })).toBeInTheDocument()
  })

  it("hides with no exit", () => {
    const { container } = render(<ExitsLine exits={{ kept: 0, played: 0, other: 0 }} />)
    expect(container).toBeEmptyDOMElement()
  })
})

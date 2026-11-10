/**
 * The phone title list of a deletion batch (UX 4.7.2 item 1): the first 6
 * titles with their sizes, largest first, then "and {N} more".
 */

import { render, screen, within } from "@testing-library/react"

import { batchRow, deletionBatch } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { BatchTitles, PHONE_TITLES } from "@/components/admin/cleanup/leaving/batch-titles"

const BASE = "admin-cleanup-batch-deletion-rule-1"

describe("BatchTitles", () => {
  it("lists the first 6 titles with sizes, then the rest as a count", () => {
    const rows = Array.from({ length: 8 }, (_, i) => batchRow(i + 1))
    render(<BatchTitles batch={deletionBatch(rows, { count: 52 })} base={BASE} />)
    const list = screen.getByTestId(`${BASE}-titles`)
    const items = within(list).getAllByRole("listitem")
    expect(items).toHaveLength(PHONE_TITLES)
    expect(items[0]).toHaveTextContent("Invented Movie 1")
    expect(items[0]).toHaveTextContent("99 GB")
    expect(list).toHaveTextContent("and 46 more")
    expect(list).toHaveClass("md:hidden")
  })

  it("names a season with its number and has no count line for a small batch", () => {
    render(<BatchTitles batch={deletionBatch([batchRow(1, { level: "season", title: "Invented Show", seasonNumber: 3 })])} base={BASE} />)
    expect(screen.getByRole("listitem")).toHaveTextContent("Invented Show, Season 3")
    expect(screen.queryByText(/more$/)).not.toBeInTheDocument()
  })
})

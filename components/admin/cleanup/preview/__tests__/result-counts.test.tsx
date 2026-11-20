import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildPreview } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { ResultCounts } from "@/components/admin/cleanup/preview/result-counts"
import { RESULTS_HEADING_ID } from "@/components/admin/cleanup/results/view"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

/** Stand-ins for the Results heading and tab that the counts move focus to. */
function ResultsStandIn() {
  return (
    <>
      <h2 id={RESULTS_HEADING_ID} tabIndex={-1}>
        Results
      </h2>
      <button type="button" data-cleanup-results-tab="protected">
        Protected tab
      </button>
    </>
  )
}

describe("ResultCounts", () => {
  it("shows the count of each Results tab as a button", () => {
    render(<ResultCounts tabs={buildPreview().tabs} f={f} onSelectTab={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-preview-tab-count-matches")).toHaveTextContent("Matches 197")
    expect(screen.getByTestId("admin-cleanup-preview-tab-count-near-misses")).toHaveTextContent("Near misses 41")
    expect(screen.getByTestId("admin-cleanup-preview-tab-count-protected")).toHaveTextContent("Protected 17")
    expect(screen.getByTestId("admin-cleanup-preview-tab-count-missing")).toHaveTextContent("Missing data 4")
    expect(screen.getByTestId("admin-cleanup-preview-tab-count-cannot-delete")).toHaveTextContent("Cannot delete 3")
    expect(screen.getAllByRole("button")).toHaveLength(6)
  })

  it("selects a tab of Results and moves focus to it", async () => {
    const user = userEvent.setup()
    const onSelectTab = jest.fn()
    render(
      <>
        <ResultCounts tabs={buildPreview().tabs} f={f} onSelectTab={onSelectTab} />
        <ResultsStandIn />
      </>
    )
    await user.click(screen.getByRole("button", { name: "Protected 17" }))
    expect(onSelectTab).toHaveBeenCalledWith("protected")
    expect(screen.getByRole("button", { name: "Protected tab" })).toHaveFocus()
  })

  it("moves focus to the Results heading from See all results", async () => {
    const user = userEvent.setup()
    render(
      <>
        <ResultCounts tabs={buildPreview().tabs} f={f} onSelectTab={jest.fn()} />
        <ResultsStandIn />
      </>
    )
    await user.click(screen.getByTestId("admin-cleanup-preview-see-all"))
    expect(screen.getByRole("heading", { name: "Results" })).toHaveFocus()
  })
})

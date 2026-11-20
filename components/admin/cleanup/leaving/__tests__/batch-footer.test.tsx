/**
 * The footer of a deletion batch card (UX 4.7.1, TS 12.6 `leaving/` item 9):
 * the text with the budget days, the text at 0 selected, the muted line
 * while titles are unticked, the order of the reasons, and the phone order.
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { BUDGET, GB } from "@/components/admin/cleanup/history/__tests__/fixtures"
import { BatchFooter, type BatchFooterProps, budgetDays, FOOTER_REASONS } from "@/components/admin/cleanup/leaving/batch-footer"

const BASE = "admin-cleanup-batch-deletion-rule-1"
const handlers = { onReviewEach: jest.fn(), onPostpone: jest.fn(), onExclude: jest.fn(), onApprove: jest.fn() }

const renderFooter = (props: Partial<BatchFooterProps> = {}) =>
  render(
    <BatchFooter
      base={BASE}
      level="show"
      summary={{ count: 6, action: "show.delete", exclusionCount: 0, bytes: String(1240 * GB) }}
      fallbackAction="show.delete"
      budget={BUDGET}
      notSelected={0}
      paused={false}
      checking={false}
      {...handlers}
      {...props}
    />
  )

const reasonOf = (testId: string) => {
  const id = screen.getByTestId(testId).getAttribute("aria-describedby")
  return id ? document.getElementById(id)?.textContent : null
}

beforeEach(() => jest.clearAllMocks())

describe("BatchFooter", () => {
  it("names the selection, the budget days and the action, and every button acts", async () => {
    const user = userEvent.setup()
    renderFooter()
    expect(screen.getByText(/6 selected, 1\.21 TB\./)).toBeInTheDocument()
    expect(screen.getByTestId(`${BASE}-footer`)).toHaveTextContent("The daily budget is 500 GB, so the deletions take 3 days, largest first.")
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveTextContent("Approve and delete 6 shows...")
    for (const [id, handler] of [["review-each", handlers.onReviewEach], ["postpone", handlers.onPostpone], ["exclude", handlers.onExclude],
      ["approve", handlers.onApprove]] as const) {
      await user.click(screen.getByTestId(`${BASE}-${id}`))
      expect(handler).toHaveBeenCalledTimes(1)
    }
    expect(screen.queryByTestId(`${BASE}-not-selected`)).not.toBeInTheDocument()
  })

  it("names the unmonitor action of seasons, and one day for a small selection", () => {
    renderFooter({ level: "season", summary: { count: 1, action: "season.unmonitorDeleteFiles", exclusionCount: 0, bytes: String(30 * GB) } })
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveTextContent("Approve and delete the files of 1 season...")
    expect(screen.getByTestId(`${BASE}-footer`)).toHaveTextContent("so the deletions take 1 day, largest first.")
  })

  it("reads the words for 0 selected with no budget sentence, and the three buttons wait with the reason", () => {
    renderFooter({ summary: { count: 0, action: null, exclusionCount: 0, bytes: "0" }, notSelected: 2 })
    expect(screen.getByTestId(`${BASE}-footer`)).toHaveTextContent("0 selected. Select a title to approve, postpone or exclude it.")
    expect(screen.getByTestId(`${BASE}-footer`)).not.toHaveTextContent("daily budget")
    expect(screen.getByTestId(`${BASE}-not-selected`)).toHaveTextContent(
      "2 titles not selected. This browser tab keeps your choice. To keep a title out for longer, postpone or exclude it."
    )
    for (const id of ["postpone", "exclude", "approve"]) {
      expect(screen.getByTestId(`${BASE}-${id}`)).toHaveAttribute("aria-disabled", "true")
      expect(reasonOf(`${BASE}-${id}`)).toBe(FOOTER_REASONS.none)
    }
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveTextContent("Approve and delete 0 shows...")
  })

  it("counts one unticked title in the singular", () => {
    renderFooter({ notSelected: 1 })
    expect(screen.getByTestId(`${BASE}-not-selected`)).toHaveTextContent(/^1 title not selected\./)
  })

  it("gives the reasons in the order paused, checking, 0 selected; the pause holds only the approve button", () => {
    const { rerender } = renderFooter({ paused: true, checking: true, summary: { count: 0, action: null, exclusionCount: 0, bytes: "0" } })
    expect(reasonOf(`${BASE}-approve`)).toBe(FOOTER_REASONS.paused)
    expect(reasonOf(`${BASE}-postpone`)).toBe(FOOTER_REASONS.checking)
    rerender(<BatchFooter base={BASE} level="show" summary={{ count: 0, action: null, exclusionCount: 0, bytes: "0" }} fallbackAction="show.delete"
      budget={BUDGET} notSelected={0} paused={false} checking {...handlers} />)
    expect(reasonOf(`${BASE}-approve`)).toBe(FOOTER_REASONS.checking)
    expect(reasonOf(`${BASE}-exclude`)).toBe(FOOTER_REASONS.checking)
    rerender(<BatchFooter base={BASE} level="show" summary={{ count: 2, action: "show.delete", exclusionCount: 0, bytes: "10" }} fallbackAction="show.delete"
      budget={BUDGET} notSelected={0} paused checking={false} {...handlers} />)
    expect(reasonOf(`${BASE}-approve`)).toBe(FOOTER_REASONS.paused)
    expect(screen.getByTestId(`${BASE}-postpone`)).not.toHaveAttribute("aria-disabled")
  })

  it("renders each button once, in the phone order by CSS order", () => {
    renderFooter()
    const order = ["review-each", "postpone", "exclude", "approve"].map((id) => screen.getAllByTestId(`${BASE}-${id}`))
    order.forEach((buttons, index) => {
      expect(buttons).toHaveLength(1)
      expect(buttons[0]).toHaveClass(`order-${index + 1}`)
    })
    expect(screen.getByTestId(`${BASE}-review-each`)).toHaveClass("md:hidden")
    expect(screen.getByTestId(`${BASE}-approve`)).toHaveClass("col-span-3")
  })
})

describe("budgetDays", () => {
  it("takes the larger of the item and the byte budget, at least 1 day", () => {
    expect(budgetDays({ count: 41, bytes: "0" }, { items: 20, bytes: "0" })).toBe(3)
    expect(budgetDays({ count: 1, bytes: String(1100 * GB) }, { items: 0, bytes: String(500 * GB) })).toBe(3)
    expect(budgetDays({ count: 0, bytes: "0" }, BUDGET)).toBe(1)
  })
})

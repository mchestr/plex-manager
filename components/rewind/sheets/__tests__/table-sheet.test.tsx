import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useReducedMotion } from "motion/react"

import { renderStage, stage, TABLE } from "@/components/rewind/stage/__tests__/stage-fixture"

const push = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

beforeEach(() => {
  window.localStorage.clear()
  jest.mocked(useReducedMotion).mockReturnValue(false)
})

describe("TableSheet", () => {
  it("renders the page's table with a caption, column and row headers", async () => {
    const user = userEvent.setup()
    renderStage(["cover", "number", "bookends", "back-cover"])
    await user.keyboard("{ArrowRight}")
    await user.click(screen.getByTestId("rewind-table-toggle"))

    const sheet = await screen.findByTestId("rewind-table-sheet")
    expect(sheet).toHaveAttribute("data-field", "paper")
    expect(stage()).toHaveAttribute("data-mode", "sheet")
    const table = within(sheet).getByRole("table", { name: TABLE.caption })
    expect(within(table).getAllByRole("columnheader").map((th) => th.getAttribute("scope"))).toEqual(["col", "col"])
    expect(within(table).getByRole("rowheader", { name: "January" })).toHaveAttribute("scope", "row")
    expect(within(table).getByRole("cell", { name: "42" })).toBeInTheDocument()
  })

  it("opens from T on a page with a table, and not on one without", async () => {
    const user = userEvent.setup()
    renderStage(["cover", "number", "bookends", "back-cover"])
    await user.keyboard("{ArrowRight}t")
    expect(await screen.findByTestId("rewind-table-sheet")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(stage()).toHaveAttribute("data-mode", "playing")

    stage().focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.queryByTestId("rewind-table-toggle")).not.toBeInTheDocument()
    await user.keyboard("t")
    expect(screen.queryByTestId("rewind-table-sheet")).not.toBeInTheDocument()
    expect(stage()).toHaveAttribute("data-mode", "playing")
  })
})

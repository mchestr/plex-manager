import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildPreview, LABELS } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { NearMissChips } from "@/components/admin/cleanup/results/near-miss-chips"

const clauses = [...buildPreview().clauses, { id: "c3", passAlone: 700, heldBack: 0 }, { id: "c9", passAlone: 1, heldBack: 5 }]

describe("NearMissChips", () => {
  it("offers All and each clause that holds back near misses, with its held-back count", () => {
    render(<NearMissChips total={41} clauses={clauses} labels={LABELS} value={null} onValueChange={jest.fn()} />)
    const group = screen.getByRole("radiogroup", { name: "Near misses by the condition they fail" })
    expect(group).toHaveAttribute("data-testid", "admin-cleanup-results-chips")
    const chips = screen.getAllByRole("radio")
    expect(chips.map((chip) => chip.textContent)).toEqual(["All41", "Added22", "Last played13", "Any of these6"])
    expect(screen.getByTestId("admin-cleanup-results-chip-a1")).toHaveAccessibleName("Any of these, 6 near misses")
    expect(screen.getByTestId("admin-cleanup-results-chip-all")).toHaveAttribute("aria-checked", "true")
    expect(screen.queryByTestId("admin-cleanup-results-chip-c3")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-results-chip-c9")).not.toBeInTheDocument()
  })

  it("says one near miss in the singular", () => {
    render(<NearMissChips total={1} clauses={[{ id: "c2", passAlone: 5, heldBack: 1 }]} labels={LABELS} value="c2" onValueChange={jest.fn()} />)
    expect(screen.getByTestId("admin-cleanup-results-chip-c2")).toHaveAccessibleName("Last played, 1 near miss")
    expect(screen.getByTestId("admin-cleanup-results-chip-c2")).toHaveAttribute("aria-checked", "true")
  })

  it("passes the chosen clause up, and null for All", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    render(<NearMissChips total={41} clauses={clauses} labels={LABELS} value="c1" onValueChange={onValueChange} />)
    await user.click(screen.getByTestId("admin-cleanup-results-chip-c2"))
    expect(onValueChange).toHaveBeenLastCalledWith("c2")
    await user.click(screen.getByTestId("admin-cleanup-results-chip-all"))
    expect(onValueChange).toHaveBeenLastCalledWith(null)
  })
})

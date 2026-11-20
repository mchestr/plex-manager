import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { DataTableBulkBar } from "@/components/ui/data-table/bulk-bar"

expect.extend(toHaveNoViolations)

function Bar({ count = 2, onClear = jest.fn(), onPostpone = jest.fn() }: { count?: number; onClear?: () => void; onPostpone?: () => void }) {
  return (
    <DataTableBulkBar count={count} label="up to 71 GB" onClear={onClear} data-testid="admin-cleanup-leaving-bulk">
      <Button variant="outline" size="sm" onClick={onPostpone} data-testid="admin-cleanup-leaving-bulk-postpone">
        Postpone...
      </Button>
      <Button variant="outline" size="sm" data-testid="admin-cleanup-leaving-bulk-exclude">
        Exclude...
      </Button>
    </DataTableBulkBar>
  )
}

describe("DataTableBulkBar", () => {
  it("is a region named Selection whose count is a polite live region", async () => {
    const { container } = render(<Bar />)
    const region = screen.getByRole("region", { name: "Selection" })
    expect(region).toBe(screen.getByTestId("admin-cleanup-leaving-bulk"))
    const count = screen.getByTestId("admin-cleanup-leaving-bulk-count")
    expect(count).toHaveAttribute("aria-live", "polite")
    expect(count).toHaveAttribute("aria-atomic", "true")
    expect(count).toHaveTextContent("2 selected up to 71 GB")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("speaks the new count in the same live region", () => {
    const { rerender } = render(<Bar count={2} />)
    const count = screen.getByTestId("admin-cleanup-leaving-bulk-count")
    rerender(<Bar count={3} />)
    expect(screen.getByTestId("admin-cleanup-leaving-bulk-count")).toBe(count)
    expect(count).toHaveTextContent("3 selected up to 71 GB")
  })

  it("holds the bulk actions, then Clear selection", async () => {
    const user = userEvent.setup()
    const onClear = jest.fn()
    const onPostpone = jest.fn()
    render(<Bar onClear={onClear} onPostpone={onPostpone} />)
    const region = screen.getByRole("region", { name: "Selection" })
    expect(within(region).getAllByRole("button").map((button) => button.textContent)).toEqual(["Postpone...", "Exclude...", "Clear selection"])

    await user.click(within(region).getByRole("button", { name: "Postpone..." }))
    expect(onPostpone).toHaveBeenCalledTimes(1)
    const clear = screen.getByTestId("admin-cleanup-leaving-bulk-clear")
    expect(clear).toHaveAccessibleName("Clear selection")
    clear.focus()
    await user.keyboard("{Enter}")
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it("keeps the Clear selection name on a phone, where it shows an X", () => {
    render(<Bar />)
    const clear = screen.getByTestId("admin-cleanup-leaving-bulk-clear")
    expect(clear.querySelector("svg")).toHaveClass("hidden", "dt-cards:max-md:block")
    expect(within(clear).getByText("Clear selection")).toHaveClass("dt-cards:max-md:sr-only")
  })

  it("sits fixed above the tab bar on a phone and keeps its height in the page", () => {
    render(<Bar />)
    const region = screen.getByRole("region", { name: "Selection" })
    expect(region).toHaveClass("dt-cards:max-md:fixed", "dt-cards:max-md:bottom-[calc(4rem+env(safe-area-inset-bottom))]", "dt-cards:max-md:z-(--z-tabbar)")
    expect(region.parentElement).toHaveAttribute("data-slot", "data-table-bulk-bar-slot")
    expect(region.parentElement).toHaveClass("dt-cards:max-md:order-last", "dt-cards:max-md:h-14")
  })

  it("shows the count alone, with no test ids and no Clear selection when not given", () => {
    const { container } = render(<DataTableBulkBar count={1} />)
    expect(screen.getByRole("region", { name: "Selection" })).toHaveTextContent("1 selected")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(container.querySelector("[data-testid]")).toBeNull()
  })
})

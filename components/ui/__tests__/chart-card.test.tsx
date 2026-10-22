import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChartCard } from "@/components/ui/chart-card"
import type { ChartSpec } from "@/components/ui/chart-card/chart-spec"

const daily: ChartSpec = {
  kind: "bar",
  x: { type: "day", keys: ["2026-10-16", "2026-10-17"] },
  series: [{ id: "cost", label: "Cost", values: [0.5, 1.25] }],
  format: "money",
}

describe("ChartCard", () => {
  it("names the chart with its summary and describes it with the generated text", async () => {
    render(<ChartCard title="Daily cost" summary="Cost per day, Oct 16 to Oct 17" spec={daily} data-testid="cost" />)
    expect(screen.getByRole("heading", { name: "Daily cost" })).toBeInTheDocument()
    const chart = await screen.findByRole("application", { name: "Cost per day, Oct 16 to Oct 17" })
    expect(chart).toHaveAttribute("tabindex", "0")
    const description = screen.getByTestId("cost-summary")
    expect(description).toHaveClass("sr-only")
    expect(chart).toHaveAttribute("aria-describedby", description.id)
    expect(chart).toHaveAccessibleDescription(
      "$1.75 in total from Oct 16, 2026 to Oct 17, 2026. The peak was $1.25 on Oct 17, 2026, and the last day ($1.25) was up from the first ($0.500).",
    )
  })

  it("draws one bar per day in the first chart slot", async () => {
    const { container } = render(<ChartCard title="Daily cost" summary="Cost per day" spec={daily} data-testid="cost" />)
    await screen.findByRole("application", { name: "Cost per day" })
    expect(screen.getByTestId("cost-chart").querySelector("[data-slot=chart]")).toHaveStyle({ "--color-s1": "var(--chart-1)" })
    await waitFor(() => expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2))
  })

  it("shows the same values as a table with column headers", async () => {
    const user = userEvent.setup()
    render(<ChartCard title="Daily cost" summary="Cost per day" spec={daily} />)
    await user.click(screen.getByRole("button", { name: "View as table" }))

    const table = screen.getByRole("table", { name: "Cost per day" })
    const headers = within(table).getAllByRole("columnheader")
    expect(headers.map((header) => header.textContent)).toEqual(["Day", "Cost"])
    expect(headers[0]).toHaveAttribute("scope", "col")
    const rows = within(table).getAllByRole("row").slice(1)
    expect(rows.map((row) => row.textContent)).toEqual(["Oct 16, 2026$0.500", "Oct 17, 2026$1.25"])
    expect(screen.queryByRole("application", { name: "Cost per day" })).not.toBeInTheDocument()
  })

  it("steps through the days by keyboard, with the value in the tooltip", async () => {
    const user = userEvent.setup()
    render(<ChartCard title="Daily cost" summary="Cost per day" spec={daily} data-testid="cost" />)
    const chart = await screen.findByRole("application", { name: "Cost per day" })

    await user.tab()
    await user.tab()
    expect(chart).toHaveFocus()
    // Focus shows the first day; the arrow keys move the active point.
    expect(await screen.findByTestId("cost-tooltip")).toHaveTextContent("Oct 16, 2026Cost$0.500")
    await user.keyboard("{ArrowRight}")
    await waitFor(() => expect(screen.getByTestId("cost-tooltip")).toHaveTextContent("Oct 17, 2026Cost$1.25"))
    await user.keyboard("{ArrowLeft}")
    await waitFor(() => expect(screen.getByTestId("cost-tooltip")).toHaveTextContent("Oct 16, 2026Cost$0.500"))
  })

  it("stacks several series with a legend, and the table has a column for each", async () => {
    const user = userEvent.setup()
    const spec: ChartSpec = {
      kind: "stacked-bar",
      x: { type: "day", keys: ["2026-10-16", "2026-10-17"] },
      series: [
        { id: "success", label: "Successful", values: [3, 1] },
        { id: "failed", label: "Failed", values: [0, 2] },
      ],
      format: "number",
    }
    render(<ChartCard title="Commands" summary="Commands per day" spec={spec} data-testid="commands" />)
    await screen.findByRole("application", { name: "Commands per day" })
    expect(within(screen.getByTestId("commands-chart")).getByText("Successful")).toBeInTheDocument()
    expect(screen.getByTestId("commands-chart").querySelector("[data-slot=chart]")).toHaveStyle({
      "--color-s1": "var(--chart-1)",
      "--color-s2": "var(--chart-2)",
    })

    await user.click(screen.getByRole("button", { name: "View as table" }))
    const table = screen.getByRole("table", { name: "Commands per day" })
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Day", "Successful", "Failed"])
    expect(within(table).getAllByRole("row").slice(1).map((row) => row.textContent)).toEqual(["Oct 16, 202630", "Oct 17, 202612"])
  })

  it("ranks categories largest first", async () => {
    const user = userEvent.setup()
    render(
      <ChartCard
        title="Cost by model"
        summary="Cost by model"
        spec={{
          kind: "ranked-bar",
          x: { type: "category", labels: ["small", "large"] },
          series: [{ id: "cost", label: "Cost", values: [1, 3] }],
          format: "money",
        }}
      />,
    )
    await user.click(screen.getByRole("button", { name: "View as table" }))
    const names = within(screen.getByRole("table")).getAllByRole("rowheader").map((cell) => cell.textContent)
    expect(names).toEqual(["large", "small"])
  })

  it("falls back to a tile for a single category", () => {
    render(
      <ChartCard
        title="Provider"
        summary="Cost by provider"
        spec={{
          kind: "ranked-bar",
          x: { type: "category", labels: ["openai"] },
          series: [{ id: "cost", label: "Cost", values: [2.5] }],
          format: "money",
        }}
        data-testid="provider"
      />,
    )
    const tile = screen.getByTestId("provider-tile")
    expect(tile).toHaveTextContent("openai")
    expect(tile).toHaveTextContent("$2.50")
    expect(screen.queryByRole("application")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "View as table" })).not.toBeInTheDocument()
  })

  it("shows its empty state when every value is zero", () => {
    render(
      <ChartCard
        title="Commands"
        summary="Commands per day"
        spec={{ ...daily, series: [{ id: "n", label: "Commands", values: [0, 0] }], format: "number" }}
        empty={{ title: "No commands in this period", description: "Try a longer range." }}
      />,
    )
    expect(screen.getByText("No commands in this period")).toBeInTheDocument()
  })
})

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ComponentProps } from "react"

import { ChartCard } from "@/components/ui/chart-card"
import type { ChartSpec } from "@/components/ui/chart-card/chart-spec"

jest.mock("chart.js", () => ({ Chart: { register: jest.fn() } }))
jest.mock("react-chartjs-2", () => ({
  Chart: ({ type, data, role, "aria-label": label }: { type: string; data: unknown } & ComponentProps<"canvas">) => (
    <canvas role={role} aria-label={label} data-type={type} data-chart={JSON.stringify(data)} />
  ),
}))

const daily: ChartSpec = {
  kind: "bar",
  x: { type: "day", keys: ["2026-10-16", "2026-10-17"] },
  series: [{ id: "cost", label: "Cost", values: [0.5, 1.25] }],
  format: "money",
}

describe("ChartCard", () => {
  it("names the chart with its summary", async () => {
    render(<ChartCard title="Daily cost" summary="Cost per day, Oct 16 to Oct 17" spec={daily} />)
    expect(screen.getByRole("heading", { name: "Daily cost" })).toBeInTheDocument()
    expect(await screen.findByRole("img", { name: "Cost per day, Oct 16 to Oct 17" })).toBeInTheDocument()
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
    expect(screen.queryByRole("img", { name: "Cost per day" })).not.toBeInTheDocument()
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
    expect(screen.queryByRole("img")).not.toBeInTheDocument()
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

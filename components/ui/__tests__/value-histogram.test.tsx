import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { ValueHistogram, type HistogramBucket } from "@/components/ui/value-histogram"

expect.extend(toHaveNoViolations)

const lastPlay: HistogramBucket[] = [
  { label: "Last 30 days", count: 54, passes: false },
  { label: "1 to 3 months", count: 61, passes: false },
  { label: "3 to 6 months", count: 72, passes: false },
  { label: "6 to 12 months", count: 112, passes: false },
  { label: "1 to 2 years", count: 166, passes: true },
  { label: "2 years or more", count: 1162, passes: true },
  { label: "Never", count: 0, passes: true },
]

const summary = "478 of 777 movies pass this condition: last played more than 1 year ago, or never."

const bars = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>("[data-slot=histogram-bar]"))
const fill = (bar: HTMLElement) => bar.lastElementChild as HTMLElement

describe("ValueHistogram", () => {
  it("is a group named by its visible title, whose summary carries the facts, with no axe violations", async () => {
    const { container } = render(
      <main>
        <ValueHistogram buckets={lastPlay} summary={summary} aria-label="Movies by last play" data-testid="histogram" />
      </main>
    )
    const group = screen.getByRole("group", { name: "Movies by last play" })
    expect(group).toHaveAttribute("data-testid", "histogram")
    expect(screen.getByText(summary)).toBeVisible()
    expect(group.querySelector("svg")).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("hides the bars, counts and labels from screen readers", () => {
    render(<ValueHistogram buckets={lastPlay} summary={summary} aria-label="Movies by last play" />)
    const chart = bars(screen.getByRole("group"))[0].closest("[aria-hidden=true]")
    expect(chart).not.toBeNull()
    expect(chart).toHaveTextContent("1,162")
    expect(screen.getByText("Passes").closest("[aria-hidden=true]")).toBe(chart)
    expect(screen.getByText("Last 30 days").closest("[aria-hidden=true]")).toBe(chart)
  })

  it("draws passing bars in chart-1 and the others muted, scaled to the largest bucket", () => {
    render(<ValueHistogram buckets={lastPlay} summary={summary} aria-label="Movies by last play" />)
    const all = bars(screen.getByRole("group"))
    expect(all).toHaveLength(7)
    expect(fill(all[0])).toHaveClass("bg-border-strong")
    expect(fill(all[4])).toHaveClass("bg-chart-1")
    expect(all[5]).toHaveAttribute("data-passes", "true")
    expect(all[0]).not.toHaveAttribute("data-passes")
    expect(fill(all[5]).style.height).toBe("80%")
    expect(fill(all[0]).style.minHeight).toBe("2px")
    expect(fill(all[6]).style.height).toBe("0%")
    expect(fill(all[6]).style.minHeight).toBe("0")
  })

  it("draws one threshold line labelled Passes over each passing range", () => {
    const split: HistogramBucket[] = [
      { label: "Under 1 GB", count: 5, passes: true },
      { label: "1 to 5 GB", count: 9, passes: false },
      { label: "5 to 10 GB", count: 3, passes: true },
      { label: "Over 10 GB", count: 2, passes: true },
    ]
    render(<ValueHistogram buckets={split} summary="10 of 19 movies pass this condition." aria-label="Movies by size" />)
    const lines = screen.getAllByText("Passes")
    expect(lines.map((line) => line.style.gridColumn)).toEqual(["1 / 2", "3 / 5"])
    expect(lines[0]).toHaveClass("border-t-2", "border-chart-1")
  })

  it("draws no line when nothing passes, and copes with empty buckets", () => {
    render(
      <ValueHistogram
        buckets={[
          { label: "Ended", count: 0, passes: false },
          { label: "Continuing", count: 0, passes: false },
        ]}
        summary="0 of 0 shows pass this condition."
        aria-label="Shows by status"
      />
    )
    expect(screen.queryByText("Passes")).toBeNull()
    expect(fill(bars(screen.getByRole("group"))[0]).style.height).toBe("0%")
  })

  it("lets bucket labels wrap in balanced lines, never cut off", () => {
    render(<ValueHistogram buckets={lastPlay} summary={summary} aria-label="Movies by last play" />)
    const label = screen.getByText("2 years or more")
    expect(label).toHaveClass("text-balance", "text-center")
    expect(label.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/)
  })
})

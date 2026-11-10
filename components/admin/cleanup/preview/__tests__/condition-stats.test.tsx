import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildPreview, LABELS } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { ConditionStats } from "@/components/admin/cleanup/preview/condition-stats"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

function renderStats(clauses = buildPreview().clauses) {
  return render(<ConditionStats clauses={clauses} labels={LABELS} checked={777} allConditions={214} matches={197} protectedAll={17} f={f} />)
}

describe("ConditionStats", () => {
  it("shows each clause with its sentence, held-back count and pass count, then the two totals", () => {
    renderStats()
    const c1 = screen.getByTestId("admin-cleanup-preview-stat-c1")
    expect(c1).toHaveTextContent("Added more than 365 days ago")
    expect(c1).toHaveTextContent("22 more without it")
    expect(c1).toHaveTextContent("640 pass it")
    expect(screen.getByTestId("admin-cleanup-preview-stat-a1")).toHaveTextContent(
      "Any of: requested in Overseerr: no, or requested by only former members"
    )
    expect(screen.getByTestId("admin-cleanup-preview-stat-all")).toHaveTextContent("All of these214")
    expect(screen.getByTestId("admin-cleanup-preview-stat-matches")).toHaveTextContent("Matches, after Never touch keeps 17 safe197")
  })

  it("draws each bar as its count over the checked items, hidden from screen readers", () => {
    renderStats()
    const bar = screen.getByTestId("admin-cleanup-preview-stat-c1").querySelector("[aria-hidden='true'] > div") as HTMLElement
    expect(bar.style.width).toBe(`${(640 / 777) * 100}%`)
    const matches = screen.getByTestId("admin-cleanup-preview-stat-matches").querySelector("[aria-hidden='true'] > div") as HTMLElement
    expect(matches.style.width).toBe(`${(197 / 777) * 100}%`)
  })

  it("draws empty bars with nothing checked", () => {
    render(<ConditionStats clauses={[]} labels={LABELS} checked={0} allConditions={0} matches={0} protectedAll={0} f={f} />)
    const bar = screen.getByTestId("admin-cleanup-preview-stat-all").querySelector("[aria-hidden='true'] > div") as HTMLElement
    expect(bar.style.width).toBe("0%")
  })

  it("leaves out a clause that the draft no longer holds", () => {
    renderStats([...buildPreview().clauses, { id: "c9", passAlone: 1, heldBack: 0 }])
    expect(screen.queryByTestId("admin-cleanup-preview-stat-c9")).not.toBeInTheDocument()
  })

  it("renders the list once and folds it behind a toggle below lg", async () => {
    const user = userEvent.setup()
    renderStats()
    expect(screen.getAllByRole("list")).toHaveLength(1)
    const list = screen.getByRole("list")
    const toggle = screen.getByTestId("admin-cleanup-preview-stats-toggle")
    expect(toggle).toHaveAccessibleName("What each condition does")
    expect(toggle).toHaveClass("lg:hidden")
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", list.id)
    expect(list).toHaveClass("hidden", "lg:block")
    expect(list).not.toHaveAttribute("hidden")

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(list).toHaveClass("block")
    expect(list).not.toHaveClass("hidden")
    expect(screen.getAllByRole("list")).toHaveLength(1)

    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(list).toHaveClass("hidden", "lg:block")
  })

  it("shows its heading from lg, where the toggle hides", () => {
    renderStats()
    const heading = screen.getByRole("heading", { level: 3, name: "What each condition does" })
    expect(heading).toHaveClass("hidden", "lg:block")
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(5)
  })
})

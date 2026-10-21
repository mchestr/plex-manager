/**
 * The playground's panes (P8.8) on a recorded dry run (the `hostile-titles`
 * fixture's view, kept current by `lib/rewind/playground/__tests__/view.test.ts`):
 * each renders the trail, and every highlighted token carries the fact id it shows.
 */

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { CopyPane } from "@/components/admin/rewind/playground/copy-pane"
import { CostPane } from "@/components/admin/rewind/playground/cost-pane"
import { FactsPane } from "@/components/admin/rewind/playground/facts-pane"
import { PreviewPane } from "@/components/admin/rewind/playground/preview-pane"
import type { PlaygroundView } from "@/lib/rewind/playground/view"

import recorded from "./recorded-view.json"

jest.mock("next/navigation", () => require("@/__tests__/helpers/url-router").navigationModule)

const view = recorded as PlaygroundView

describe("FactsPane", () => {
  it("lists every fact on the sheet with its display, and the page selection", () => {
    render(<FactsPane view={view} />)
    const table = screen.getByTestId("playground-fact-table")
    for (const fact of view.facts) {
      const row = within(table).getByTestId(`playground-fact-table-row-${fact.id}`)
      expect(row).toHaveTextContent(fact.id)
      expect(row.textContent).toContain(fact.display)
    }
    for (const page of view.pages) expect(screen.getByTestId(`playground-page-${page.type}`)).toHaveTextContent(page.name)
    for (const page of view.omitted) expect(screen.getByTestId(`playground-omitted-${page.type}`)).toHaveTextContent(page.reason)
  })
})

describe("CopyPane", () => {
  it("highlights each token with the fact id whose display it shows", () => {
    render(<CopyPane view={view} />)
    const facts = new Map(view.facts.map((f) => [f.id, f.display]))
    for (const slot of view.copy) {
      const row = screen.getByTestId(`playground-slot-${slot.slot}`)
      const marks = row.querySelectorAll("mark")
      const tokens = slot.segments.filter((s) => s.kind !== "text")
      expect(marks).toHaveLength(tokens.length)
      marks.forEach((mark, i) => {
        const id = mark.getAttribute("data-fact-id")!
        expect(id).toBe(tokens[i].id)
        if (facts.has(id)) expect(mark.textContent).toBe(facts.get(id))
      })
    }
  })

  it("shows the raw answer and each slot's grounding outcome", () => {
    render(<CopyPane view={view} />)
    expect(screen.getByTestId("playground-raw").textContent).toBe(view.raw)
    expect(screen.getAllByText("As written").length + screen.queryAllByText("Repaired").length + screen.queryAllByText("Template fallback").length).toBe(view.copy.length)
  })

  it("lists a slot's grounding issues", () => {
    const issue = { rule: 2, slot: view.copy[0].slot, message: "A number is not a token", hint: "Cite the fact" }
    render(<CopyPane view={{ ...view, copy: [{ ...view.copy[0], outcome: "repaired", issues: [issue] }] }} />)
    expect(screen.getByTestId("playground-issue")).toHaveTextContent("Rule 2 A number is not a token Cite the fact")
    expect(screen.getByText("Repaired")).toBeInTheDocument()
  })
})

describe("CostPane", () => {
  it("shows the cost, the calls and the copy path", () => {
    render(<CostPane usage={view.usage} />)
    expect(screen.getByTestId("playground-cost-calls")).toHaveTextContent(String(view.usage.calls))
    expect(screen.getByTestId("playground-cost-path")).toHaveTextContent("Model copy")
    expect(screen.queryByTestId("playground-diff")).not.toBeInTheDocument()
  })

  it("shows a member's diff against the stored Rewind, or that none is stored", () => {
    const { rerender } = render(
      <CostPane usage={view.usage} diff={{ pagesAdded: ["records"], pagesRemoved: [], factsChanged: true, slots: [{ slot: "deck.number", before: "Old.", after: "New." }] }} />
    )
    expect(screen.getByTestId("playground-diff")).toHaveTextContent("Pages added: records")
    expect(screen.getByTestId("playground-diff-deck.number")).toHaveTextContent("Old.New.")
    rerender(<CostPane usage={view.usage} diff={null} />)
    expect(screen.getByTestId("playground-diff-none")).toBeInTheDocument()
  })
})

describe("PreviewPane", () => {
  it("opens the story preview in a dialog and lists the run's cards", async () => {
    const user = userEvent.setup()
    render(<PreviewPane previewId={view.previewId} year={view.year} cards={["number", "top-shows"]} />)
    expect(screen.getAllByTestId("playground-card")).toHaveLength(2)
    await user.click(screen.getByTestId("playground-preview-open"))
    expect(await screen.findByTestId("playground-preview-frame")).toHaveAttribute("src", `/rewind/${view.year}?preview=${view.previewId}`)
  })
})

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WhyProtections } from "@/components/admin/cleanup/why/why-protections"
import type { WhySheetData } from "@/lib/cleanup/types/preview"

type Protection = WhySheetData["protections"][number]

const clearGlobal = (id: string, label: string): Protection => ({ id, label, verdict: "clear", value: [{ text: `${label}: no.` }] })

const globals: Protection[] = [
  clearGlobal("g1", "Kept by a member"),
  clearGlobal("g2", "Marked Keep forever"),
  clearGlobal("g3", "Excluded by an admin"),
]

const ruleProtection: Protection = { id: "p1", label: "Plays", verdict: "clear", value: [{ text: "No counted play." }] }

describe("WhyProtections", () => {
  it("lists protections that protect first, then unknown ones, then the rule's clear ones", () => {
    render(
      <WhyProtections
        protections={[
          ruleProtection,
          ...globals,
          { id: "g4", label: "Played in the last 30 days", verdict: "unknown", value: [{ text: "Tautulli did not answer." }] },
          { id: "g13", label: "In the Plex collection", verdict: "protects", value: [{ text: "In the Plex collection Winter Lights.", strong: true }] },
        ]}
      />
    )
    expect(screen.getByRole("heading", { level: 3, name: "Never touch, checked" })).toBeInTheDocument()
    const lines = within(screen.getAllByRole("list")[0]).getAllByRole("listitem")
    expect(lines.map((line) => line.getAttribute("data-testid"))).toEqual([
      "admin-cleanup-why-protection-g13",
      "admin-cleanup-why-protection-g4",
      "admin-cleanup-why-protection-p1",
    ])
    expect(lines[0]).toHaveTextContent("ProtectsIn the Plex collectionIn the Plex collection Winter Lights.")
    expect(lines[1]).toHaveTextContent(/^Unknown/)
    expect(lines[2]).toHaveTextContent("ClearPlaysNo counted play.")
    expect(screen.getByText("The other 3 global protections are clear.")).toBeInTheDocument()
  })

  it("folds clear global protections into one line, and shows each on request", async () => {
    const user = userEvent.setup()
    render(<WhyProtections protections={globals} />)
    expect(screen.getByText("All 3 global protections are clear.")).toBeInTheDocument()
    const show = screen.getByRole("button", { name: "Show each" })
    expect(show).toHaveAttribute("data-testid", "admin-cleanup-why-show-protections")
    expect(show).toHaveAttribute("aria-expanded", "false")
    const folded = document.getElementById(show.getAttribute("aria-controls") ?? "")
    expect(folded).toHaveClass("hidden")

    await user.click(show)
    expect(show).toHaveAttribute("aria-expanded", "true")
    expect(folded).not.toHaveClass("hidden")
    expect(within(folded as HTMLElement).getAllByRole("listitem")).toHaveLength(3)
    expect(screen.getByTestId("admin-cleanup-why-protection-g2")).toHaveTextContent("ClearMarked Keep foreverMarked Keep forever: no.")

    await user.click(show)
    expect(folded).toHaveClass("hidden")
  })

  it("says one clear global protection in the singular", () => {
    const { rerender } = render(<WhyProtections protections={[globals[0]]} />)
    expect(screen.getByText("The global protection is clear.")).toBeInTheDocument()
    rerender(
      <WhyProtections protections={[globals[0], { id: "g4", label: "Played in the last 30 days", verdict: "protects", value: [] }]} />
    )
    expect(screen.getByText("1 other global protection is clear.")).toBeInTheDocument()
  })

  it("has no fold line when no global protection is clear", () => {
    render(<WhyProtections protections={[ruleProtection]} />)
    expect(screen.queryByTestId("admin-cleanup-why-show-protections")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-why-protection-p1")).toBeInTheDocument()
  })

  it("renders nothing without a protection", () => {
    const { container } = render(<WhyProtections protections={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

import { render, screen, within } from "@testing-library/react"

import { WhyConditions } from "@/components/admin/cleanup/why/why-conditions"
import type { WhySheetCondition } from "@/lib/cleanup/types/preview"

const TAKEN_AT = "2026-11-08T03:07:00.000Z"

const conditions: WhySheetCondition[] = [
  {
    id: "c1",
    label: "Added",
    verdict: "pass",
    value: [{ text: "Added to Plex Mar 3, 2024.", strong: true }, { text: " Added to Radarr Mar 3, 2024." }],
    threshold: "more than 365 days ago",
    sources: [
      { service: "plex", state: "ok", readAt: TAKEN_AT, part: "server" },
      { service: "plex", state: "ok", readAt: TAKEN_AT, part: "shares" },
      { service: "radarr", state: "ok", readAt: TAKEN_AT },
    ],
  },
  {
    id: "c2",
    label: "Last played",
    verdict: "fail",
    value: [{ text: "Last played Dec 21, 2025." }],
    threshold: "Needs more than 365 days, so it is 43 days short.",
    sources: [{ service: "tautulli", state: "ok", readAt: TAKEN_AT }],
  },
  {
    id: "a1",
    label: "Any of these is true",
    verdict: "pass",
    value: [],
    threshold: "at least 1 of 2",
    sources: [],
    members: [
      { id: "c3", verdict: "fail", label: "Requested by", threshold: "former members", value: [{ text: "Requested by a member." }] },
      { id: "c4", verdict: "pass", label: "Size", threshold: "more than 10 GB", value: [{ text: "Requested only by a former member since Jul 12, 2025." }] },
    ],
  },
  {
    id: "c5",
    label: "Plays",
    verdict: "unknown",
    value: [{ text: "Tautulli did not answer at 3:07 AM." }],
    threshold: "fewer than 2 in total",
    sources: [{ service: "tautulli", state: "failed", readAt: TAKEN_AT }],
  },
]

describe("WhyConditions", () => {
  it("shows one line for each condition, with its verdict as a word", () => {
    render(<WhyConditions conditions={conditions} />)
    expect(screen.getByRole("heading", { level: 3, name: "Conditions" })).toBeInTheDocument()
    const lines = within(screen.getByTestId("admin-cleanup-why-conditions")).getAllByRole("listitem")
    expect(lines[0]).toHaveTextContent(/^PassesAdded/)
    expect(screen.getByTestId("admin-cleanup-why-condition-c2")).toHaveTextContent(/^FailsLast played/)
    expect(screen.getByTestId("admin-cleanup-why-condition-c5")).toHaveTextContent(/^UnknownPlays/)
  })

  it("tints each verdict and keeps its word", () => {
    render(<WhyConditions conditions={conditions} />)
    const tint = (id: string) => within(screen.getByTestId(`admin-cleanup-why-condition-${id}`)).getAllByText(/^(Passes|Fails|Unknown)$/)[0]
    expect(tint("c1").className).toContain("text-success")
    expect(tint("c2").className).toContain("text-destructive")
    expect(tint("c5").className).toContain("text-warning")
  })

  it("shows the real value, then the threshold with its sources", () => {
    render(<WhyConditions conditions={conditions} />)
    const added = screen.getByTestId("admin-cleanup-why-condition-c1")
    expect(added).toHaveTextContent("Added to Plex Mar 3, 2024. Added to Radarr Mar 3, 2024.")
    expect(within(added).getByText("Added to Plex Mar 3, 2024.").tagName).toBe("STRONG")
    expect(added).toHaveTextContent("Needs more than 365 days ago. From Plex and Radarr.")
    expect(screen.getByTestId("admin-cleanup-why-condition-c2")).toHaveTextContent(
      "Needs more than 365 days, so it is 43 days short. From Tautulli."
    )
    expect(screen.getByTestId("admin-cleanup-why-condition-c5")).toHaveTextContent("Needs fewer than 2 in total. Tautulli did not answer.")
  })

  it("lists the members of a group with their verdicts", () => {
    render(<WhyConditions conditions={conditions} />)
    const group = screen.getByTestId("admin-cleanup-why-condition-a1")
    expect(group).toHaveTextContent("Any of these is true")
    expect(group).toHaveTextContent("Needs at least 1 of 2.")
    const members = within(group).getAllByRole("listitem")
    expect(members).toHaveLength(2)
    // Each member names its condition and threshold before the real value (UX review UX-05)
    expect(members[0]).toHaveTextContent("FailsRequested by former members: Requested by a member.")
    expect(members[1]).toHaveTextContent("PassesSize more than 10 GB: Requested only by a former member since Jul 12, 2025.")
    expect(within(members[1]).getByText("Size more than 10 GB:").tagName).toBe("STRONG")
  })

  it("adds no line without a threshold or a source", () => {
    render(<WhyConditions conditions={[{ id: "c1", label: "Size", verdict: "pass", value: [{ text: "17.1 GB." }], threshold: " ", sources: [] }]} />)
    expect(screen.getByTestId("admin-cleanup-why-condition-c1").querySelectorAll("p.text-label")).toHaveLength(0)
  })

  it("renders nothing without a condition", () => {
    const { container } = render(<WhyConditions conditions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})

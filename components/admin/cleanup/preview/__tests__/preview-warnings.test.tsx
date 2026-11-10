import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { buildPreview, GLOBALS, LABELS } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { PreviewWarnings } from "@/components/admin/cleanup/preview/preview-warnings"
import type { PreviewResponse, PreviewWarning } from "@/lib/cleanup/types/preview"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })

function renderWarnings(warnings: PreviewWarning[], props: Partial<Parameters<typeof PreviewWarnings>[0]> = {}, data: Partial<PreviewResponse> = {}) {
  return render(<PreviewWarnings data={buildPreview({ warnings, ...data })} labels={LABELS} globals={GLOBALS} f={f} {...props} />)
}

const alert = (kind: string) => screen.getByTestId(`admin-cleanup-preview-alert-${kind}`)

describe("PreviewWarnings", () => {
  it("renders nothing without a warning", () => {
    const { container } = renderWarnings([])
    expect(container).toBeEmptyDOMElement()
  })

  it("warns about a very wide rule", () => {
    renderWarnings([{ kind: "wide", percent: 61, matches: 476, checked: 777 }])
    expect(alert("wide")).toHaveTextContent("This rule matches 61 % of Movies (476 of 777)")
    expect(alert("wide")).toHaveTextContent("Check the conditions. Turn on offers only Review first for a first batch above 10 %.")
    expect(alert("wide")).toHaveAttribute("role", "status")
  })

  it("names the parts that cancel out, in one alert", () => {
    renderWarnings([
      { kind: "cannotMatch", conditionId: "c2", otherId: "g4" },
      { kind: "cannotMatch", conditionId: "c1", otherId: "c3" },
      { kind: "cannotMatch", conditionId: "c3", otherId: "c3" },
      { kind: "cannotMatch", conditionId: "c9", otherId: "c1" },
      { kind: "cannotMatch", conditionId: "c1", otherId: "c9" },
    ])
    expect(screen.getAllByRole("status")).toHaveLength(1)
    expect(alert("cannot-match")).toHaveTextContent("This rule can never match")
    expect(alert("cannot-match")).toHaveTextContent(
      '"Last played more than 365 days ago, or never" and the global protection "Played in the last 30 days" cancel out. ' +
        '"Added more than 365 days ago" and "Size more than 80 GB" cancel out. ' +
        '"Size more than 80 GB" can never be true. You can still save it.'
    )
  })

  it("leaves out the can never match alert when its conditions are gone", () => {
    const { container } = renderWarnings([{ kind: "cannotMatch", conditionId: "c9", otherId: "g4" }], { globals: undefined })
    expect(container).toBeEmptyDOMElement()
  })

  it("explains zero matches and opens the editor of the condition that removes the most", async () => {
    const user = userEvent.setup()
    const onChangeCondition = jest.fn()
    renderWarnings([{ kind: "zero", conditionId: "c3", leaves: 0, of: 214, largestBytes: String(22.4 * 1024 ** 3), nearMisses: 9 }], {
      onChangeCondition,
    })
    expect(alert("zero")).toHaveTextContent(
      'No matches"Size more than 80 GB" leaves 0 of 214. The largest movie that passes the other conditions is 22.4 GB. Near misses shows the 9 closest.'
    )
    expect(alert("zero")).toHaveAttribute("role", "status")
    await user.click(screen.getByTestId("admin-cleanup-preview-alert-zero-action"))
    expect(onChangeCondition).toHaveBeenCalledWith("c3")
    expect(screen.getByTestId("admin-cleanup-preview-alert-zero-action")).toHaveTextContent("Change Size")
  })

  it("says less with no largest size, no near misses and no Change callback", () => {
    renderWarnings([{ kind: "zero", conditionId: "a1", leaves: 0, of: 5, largestBytes: null, nearMisses: 0 }])
    expect(alert("zero")).toHaveTextContent(/leaves 0 of 5\.$/)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("skips the zero note of a condition the draft no longer holds", () => {
    const { container } = renderWarnings([{ kind: "zero", conditionId: "c9", leaves: 0, of: 5, largestBytes: null, nearMisses: 0 }])
    expect(container).toBeEmptyDOMElement()
  })

  it("names a failed source with its missing data, and offers a refresh", async () => {
    const user = userEvent.setup()
    const onRefresh = jest.fn()
    renderWarnings(
      [
        { kind: "sourceFailed", service: "tautulli", readAt: "2026-11-08T03:07:00.000Z" },
        { kind: "stale", hours: 41 },
      ],
      { refresh: { onRefresh } },
      { tabs: { matches: 0, nearMisses: 0, protected: 0, missing: 777, cannotDelete: 0 } }
    )
    expect(alert("source-failed")).toHaveTextContent("Tautulli did not answer at 3:07 AM")
    expect(alert("source-failed")).toHaveTextContent(
      "777 movies are in Missing data. Unknown never matches, and runs change nothing until Tautulli answers."
    )
    expect(alert("source-failed")).toHaveAttribute("role", "status")
    expect(alert("source-failed")).toHaveAttribute("data-tone", "destructive")
    expect(alert("stale")).toHaveTextContent("Library data is 41 hours old")
    expect(alert("stale")).toHaveTextContent(
      "The nightly read did not finish. Runs change nothing until a fresh read. The preview still works on the old data."
    )
    // One refresh button, under the first alert that needs it
    expect(screen.getAllByRole("button", { name: "Refresh data now" })).toHaveLength(1)
    await user.click(screen.getByTestId("admin-cleanup-preview-alert-source-failed-action"))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("joins several failed sources and reads 1 title in the singular", () => {
    renderWarnings(
      [
        { kind: "sourceFailed", service: "tautulli", readAt: null },
        { kind: "sourceFailed", service: "overseerr", readAt: null },
      ],
      {},
      { tabs: { matches: 0, nearMisses: 0, protected: 0, missing: 1, cannotDelete: 0 } }
    )
    expect(alert("source-failed")).toHaveTextContent(/^Tautulli and Overseerr did not answer1 movie is in Missing data/)
    expect(alert("source-failed")).toHaveTextContent("until Tautulli and Overseerr answer.")
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("offers the refresh under stale data when no source failed", () => {
    renderWarnings([{ kind: "stale", hours: 1 }], { refresh: { onRefresh: jest.fn(), pending: true } })
    expect(alert("stale")).toHaveTextContent("Library data is 1 hour old")
    expect(screen.getByTestId("admin-cleanup-preview-alert-stale-action")).toHaveAttribute("aria-busy", "true")
  })

  it("says when the preview pauses for the rate limit, and when the library is read for the first time", () => {
    renderWarnings([], { rateLimited: true }, { snapshot: null })
    expect(alert("rate-limit")).toHaveTextContent("Too many updatesThe preview pauses for a minute.")
    expect(alert("rate-limit")).toHaveAttribute("role", "status")
    expect(alert("first-read")).toHaveTextContent("Reading your library for the first time.")
    expect(alert("first-read")).toHaveAttribute("role", "status")
  })

  it("ignores the warnings that other parts show", () => {
    const { container } = renderWarnings([
      { kind: "incomplete", conditionIds: ["c1"] },
      { kind: "notApplicable", conditionIds: ["c2"] },
    ])
    expect(container).toBeEmptyDOMElement()
  })

  it("names the level of a show rule", () => {
    renderWarnings([{ kind: "wide", percent: 55, matches: 55, checked: 100 }], {}, { level: "show" })
    expect(alert("wide")).toHaveTextContent("This rule matches 55 % of Whole shows (55 of 100)")
  })
})

/**
 * "Ready to turn on" (UX 4.6, 7.13): an icon and text for each state, fix
 * links, the Automatic-only checks left out, and the copy at the top below
 * `lg` with its own ids.
 */

import { render, screen, within } from "@testing-library/react"

import { check, F, OK_CHECKS } from "@/components/admin/cleanup/turn-on/__tests__/fixtures"
import type { CheckContext } from "@/components/admin/cleanup/turn-on/check-words"
import { checkTextId, ReadyChecks, TopChecks } from "@/components/admin/cleanup/turn-on/ready-checks"

const ctx: CheckContext = { ruleId: "rule-1", level: "movie", f: F, now: Date.parse("2026-11-08T12:00:00.000Z") }

describe("ReadyChecks", () => {
  it("lists every check but the two Automatic-only ones, each with a state icon and its text", () => {
    render(<ReadyChecks checks={OK_CHECKS} ctx={ctx} idBase="t" />)

    expect(screen.getByRole("heading", { level: 2, name: "Ready to turn on" })).toBeInTheDocument()
    expect(screen.getAllByRole("listitem")).toHaveLength(5)
    expect(screen.queryByTestId("admin-cleanup-turn-on-check-first-batch-size")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-turn-on-check-grace")).not.toBeInTheDocument()
    const feature = screen.getByTestId("admin-cleanup-turn-on-check-feature-on")
    expect(within(feature).getByRole("img", { name: "Passed" })).toBeInTheDocument()
    expect(feature).toHaveTextContent("Media cleanup is on.")
    expect(document.getElementById(checkTextId("t", OK_CHECKS[0]))).toHaveTextContent("Media cleanup is on.")
  })

  it("shows a warning, a failure and a note, each with its word, and links each fix", () => {
    const checks = [
      check("featureOn", "failed", "all"),
      check("matchedInArr", "warning", "none", { service: "radarr", cannotDelete: 3 }),
      check("dryRuns", "info", "automatic", { count: 0 }),
      check("kometa", "warning", "none"),
    ]
    render(<ReadyChecks checks={checks} ctx={ctx} idBase="t" />)

    const off = screen.getByTestId("admin-cleanup-turn-on-check-feature-on")
    expect(off).toHaveAttribute("data-state", "failed")
    expect(within(off).getByRole("img", { name: "Failed" })).toBeInTheDocument()
    expect(off).toHaveTextContent("Media cleanup is off. Turn it on in Settings first. Open settings")
    expect(screen.getByTestId("admin-cleanup-turn-on-settings-link")).toHaveAttribute(
      "href",
      "/admin/cleanup?tab=settings&section=cleanup-feature&returnTo=%2Fadmin%2Fcleanup%2Frules%2Frule-1%2Fturn-on"
    )
    expect(within(screen.getByTestId("admin-cleanup-turn-on-check-matched-in-arr")).getByRole("img", { name: "Warning" })).toBeInTheDocument()
    expect(within(screen.getByTestId("admin-cleanup-turn-on-check-dry-runs")).getByRole("img", { name: "Note" })).toBeInTheDocument()
    const kometa = screen.getByRole("link", { name: "Read the Kometa note, opens in a new tab" })
    expect(kometa).toHaveAttribute("target", "_blank")
    expect(kometa).toHaveAttribute("data-testid", "admin-cleanup-turn-on-check-kometa-fix")
  })
})

describe("TopChecks", () => {
  it("renders nothing without a stopping check", () => {
    const { container } = render(<TopChecks checks={[]} ctx={ctx} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("repeats the stopping checks below lg with their own ids", () => {
    const checks = [check("featureOn", "failed", "all"), check("notPaused", "failed", "all")]
    render(
      <>
        <TopChecks checks={checks} ctx={ctx} />
        <ReadyChecks checks={checks} ctx={ctx} idBase="t" />
      </>
    )

    expect(screen.getByTestId("admin-cleanup-turn-on-top-checks")).toHaveClass("lg:hidden")
    expect(screen.getByTestId("admin-cleanup-turn-on-top-check-feature-on")).toHaveTextContent("Media cleanup is off.")
    expect(screen.getByTestId("admin-cleanup-turn-on-top-check-feature-on-fix")).toHaveTextContent("Open settings")
    expect(screen.getByTestId("admin-cleanup-turn-on-top-check-not-paused-fix")).toHaveAttribute("href", "/admin/cleanup")
    const ids = [...document.querySelectorAll("[data-testid]")].map((el) => el.getAttribute("data-testid"))
    expect(new Set(ids).size).toBe(ids.length)
    const textIds = [...document.querySelectorAll("[id]")].map((el) => el.id)
    expect(new Set(textIds).size).toBe(textIds.length)
  })
})

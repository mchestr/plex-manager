/**
 * The home RewindCard (P6.9): each state's copy, the registry meta, Share
 * and the lapsed share copy, the strip's scope, and no generate action.
 */

import { render, screen, within } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { RewindCard } from "@/components/dashboard/rewind-card"
import { expectNoDarkInsideLight } from "@/lib/design/testing"
import type { RewindArchiveYear, RewindCardState } from "@/lib/rewind/home-card-state"

expect.extend(toHaveNoViolations)

jest.mock("next/link", () => {
  const MockLink = ({ href, ...props }: { href: string } & React.ComponentProps<"a">) => <a href={href} {...props} />
  return MockLink
})

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

jest.mock("@/hooks/use-rewind-status", () => ({
  useRewindStatus: jest.fn(() => ({ status: { state: "running" }, isSlow: false })),
}))

const SETTINGS = { timeZone: "America/Chicago", locale: "en-US" }
const NAME = "Northfield Plex Rewind 2026"
const text = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ")

const READY = {
  kind: "ready",
  year: 2026,
  pages: 18,
  readMs: 140_140,
  edition: "full",
  ink: "ultramarine",
  soundtrack: { d: "M0,40V20H10V40Z", centre: 40, dotted: { x1: 440, x2: 480 }, width: 480, height: 80 },
  share: { state: "off" },
  canShare: true,
  unread: true,
  dataThrough: "Data through November 30",
} as const satisfies RewindCardState

function renderCard(state: RewindCardState, archive: RewindArchiveYear[] = []) {
  return render(<RewindCard state={state} archive={archive} name={NAME} settings={SETTINGS} />)
}

describe("RewindCard", () => {
  it.each<[RewindCardState, string, string]>([
    [READY, "Your Northfield Plex Rewind 2026 is ready", "Your year on the server, set as an issue to page through."],
    [{ kind: "generating", year: 2026 }, "Setting your pages", "This usually takes 1 or 2 minutes. You can leave this page."],
    [{ kind: "failed", year: 2026, code: "TIMEOUT" }, "Your Rewind is not finished", "It took too long to finish. The server admin can see what happened."],
    [
      { kind: "before-season", year: 2026, opensOn: new Date("2026-12-01T06:00:00Z"), lastYear: null },
      "Your Rewind arrives on December 1",
      "Everything you watch until November 30 counts.",
    ],
    [{ kind: "not-eligible", reason: "jellyfin-only" }, "Rewind needs Plex watch history", "This server has none for your account."],
    [{ kind: "not-eligible", reason: "joined-late", firstYear: 2027 }, "Your first Rewind arrives next year", "Rewind needs a few months of watch history."],
    [
      { kind: "closed", year: 2026, closedOn: new Date("2027-02-01T06:00:00Z"), ink: "forest", soundtrack: null },
      "Your Rewind 2026",
      "The season closed on January 31.",
    ],
    [{ kind: "not-started", year: 2026 }, "Your Rewind 2026 is on its way", "The server makes every issue this month. Come back soon."],
    [{ kind: "unavailable", year: 2026, viewerIsAdmin: false, code: "REDIS_NOT_CONFIGURED" }, "Rewind is not available on this server", "Ask the server admin when it will be available."],
    [{ kind: "unavailable", year: 2026, viewerIsAdmin: true, code: "REDIS_NOT_CONFIGURED" }, "Rewind is not available on this server", "Rewind needs Redis (REDIS_URL)"],
  ])("prints the %# state's copy, with no generate action", async (state, title, lead) => {
    const { container } = renderCard(state)

    expect(screen.getByTestId("rewind-card")).toHaveAttribute("data-state", state.kind)
    expect(screen.getByTestId("rewind-card-title")).toHaveTextContent(title)
    expect(screen.getByTestId("rewind-card-lead")).toHaveTextContent(lead)
    expect(screen.queryByRole("button", { name: /generate/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /generate/i })).not.toBeInTheDocument()
    expect(container.textContent).not.toMatch(/generate|wrapped/i)
    expect(await axe(container)).toHaveNoViolations()
  })

  it("prints the registry meta, the private line, the unread pip and the data window", () => {
    renderCard(READY)

    expect(text(screen.getByTestId("rewind-card-meta"))).toBe("18 pages, about 2 min 20 s")
    expect(screen.getByTestId("rewind-card-privacy")).toHaveTextContent("Private. Server admins can view it.")
    expect(screen.getByRole("img", { name: "New" })).toBeInTheDocument()
    expect(screen.getByTestId("rewind-card-data-through")).toHaveTextContent("Data through November 30")
  })

  it("links Open to the issue and Share to its share sheet, never creating a link itself", () => {
    renderCard({ ...READY, unread: false })

    expect(screen.getByTestId("rewind-card-open")).toHaveAttribute("href", "/rewind/2026?from=/")
    expect(screen.getByTestId("rewind-card-share")).toHaveAttribute("href", "/rewind/2026?sheet=share&from=/")
    expect(screen.queryByRole("img", { name: "New" })).not.toBeInTheDocument()
  })

  it("shows a live link's expiry with the globe line", () => {
    renderCard({ ...READY, share: { state: "on", pages: 5, expiresOn: new Date("2027-01-31T12:00:00Z") } })

    expect(screen.getByTestId("rewind-card-privacy")).toHaveTextContent("Public link on until Jan 31, 2027")
    expect(screen.getByTestId("rewind-card-share")).toHaveTextContent("Manage sharing")
  })

  it("sends a lapsed member to /subscribe instead of Share (FR-51)", () => {
    renderCard({ ...READY, canShare: false })

    expect(screen.queryByTestId("rewind-card-share")).not.toBeInTheDocument()
    const lapsed = screen.getByTestId("rewind-card-share-lapsed")
    expect(lapsed).toHaveTextContent("Sharing needs an active membership")
    expect(lapsed).toHaveAttribute("href", "/subscribe")
  })

  it("reads a failure from its code, never a stored message", () => {
    renderCard({ kind: "failed", year: 2026, code: "GENERATION_FAILED" })

    expect(screen.getByTestId("rewind-card-lead")).toHaveTextContent(/^The server admin can see what happened\.$/)
  })

  it("prints the ready strip in the archetype ink with the soundtrack, hidden from assistive tech", () => {
    renderCard(READY)

    const strip = screen.getByTestId("rewind-card-strip")
    expect(strip).toHaveAttribute("data-theme", "rewind")
    expect(strip).toHaveAttribute("data-field", "ultramarine")
    const svg = within(strip).getByTestId("rewind-card-soundtrack")
    expect(svg).toHaveAttribute("aria-hidden", "true")
    expect(svg.querySelector("path")).toHaveAttribute("d", READY.soundtrack.d)
  })

  it.each<RewindCardState>([
    { kind: "before-season", year: 2026, opensOn: new Date("2026-12-01T06:00:00Z"), lastYear: 2025 },
    { kind: "generating", year: 2026 },
    { kind: "not-started", year: 2026 },
  ])("prints the $kind strip on paper, with no dark ink inside it", (state) => {
    const { container } = renderCard(state)

    const strip = screen.getByTestId("rewind-card-strip")
    expect(strip).toHaveAttribute("data-theme", "rewind")
    expect(strip).toHaveAttribute("data-field", "paper")
    expect(strip.querySelector("path")).toBeNull()
    expectNoDarkInsideLight(container)
  })

  it("offers last year's Rewind before the season", () => {
    renderCard({ kind: "before-season", year: 2026, opensOn: new Date("2026-12-01T06:00:00Z"), lastYear: 2025 })

    expect(screen.getByTestId("rewind-card-open-last")).toHaveAttribute("href", "/rewind/2025?from=/")
  })

  it("lists past years with their ink", () => {
    renderCard(READY, [
      { year: 2025, ink: "marigold", status: "watched" },
      { year: 2024, ink: "paper", status: "ready" },
    ])

    const nav = screen.getByRole("navigation", { name: "Past years" })
    expect(within(nav).getByTestId("rewind-card-archive-2025")).toHaveAttribute("href", "/rewind/2025?from=/")
    expect(within(nav).getByTestId("rewind-card-archive-2025")).toHaveTextContent("2025, watched")
    expect(within(nav).getByTestId("rewind-card-archive-2024").querySelector("[data-field]")).toHaveAttribute("data-field", "paper")
  })
})

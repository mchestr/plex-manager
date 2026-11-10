import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { buildPreview, GLOBALS, LABELS, NOW } from "@/components/admin/cleanup/preview/__tests__/fixtures"
import { PreviewCard } from "@/components/admin/cleanup/preview/preview-card"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"

expect.extend(toHaveNoViolations)

function renderCard(props: Partial<Parameters<typeof PreviewCard>[0]> = {}, data: Partial<PreviewResponse> = {}) {
  const handlers = { onWhy: jest.fn(), onSelectTab: jest.fn(), onChangeCondition: jest.fn() }
  const view = render(<PreviewCard data={buildPreview(data)} labels={LABELS} globals={GLOBALS} now={NOW} {...handlers} {...props} />)
  return { ...view, ...handlers }
}

const liveRegion = () => document.querySelector<HTMLElement>("[aria-live='polite']")

describe("PreviewCard", () => {
  it("is an aside named Preview with the head, the headline and the sources", () => {
    renderCard()
    const card = screen.getByRole("complementary", { name: "Preview" })
    expect(card).toHaveAttribute("data-testid", "admin-cleanup-preview")
    expect(card).not.toHaveAttribute("aria-busy")
    expect(within(card).getByRole("heading", { level: 2, name: "Preview" })).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-preview-read-timestamp")).toHaveTextContent("Library data from 3:07 AM today")
    expect(screen.getByTestId("admin-cleanup-preview-count")).toHaveTextContent("197")
    expect(screen.getByText("movies of 777 checked")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-preview-bytes")).toHaveTextContent("1.3 TB")
    expect(screen.getByText("up to, about 4 weeks of growth")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-preview-source-plex")).toHaveTextContent("Plex 3:07 AM")
    expect(screen.getByTestId("admin-cleanup-preview-source-overseerr")).toHaveTextContent("Overseerr 3:06 AM")
    expect(screen.queryByTestId("admin-cleanup-preview-source-sonarr")).not.toBeInTheDocument()
    expect(card.className).toContain("lg:sticky")
    expect(card.className).toContain("lg:overflow-y-auto")
  })

  it("speaks only the settled headline, with sizes as words, from lg", () => {
    const { rerender } = renderCard()
    const region = liveRegion()
    expect(region).toHaveTextContent("197 movies of 777 checked. Up to 1.3 terabytes, about 4 weeks of growth.")
    expect(region).toHaveClass("sr-only", "hidden", "lg:block")
    expect(document.querySelectorAll("[aria-live]")).toHaveLength(1)
    // The visible numbers do not speak twice
    expect(screen.getByTestId("admin-cleanup-preview-count").closest("[aria-hidden='true']")).not.toBeNull()

    rerender(<PreviewCard data={buildPreview()} labels={LABELS} now={NOW} updating onWhy={jest.fn()} onSelectTab={jest.fn()} />)
    expect(liveRegion()).toHaveTextContent("197 movies of 777 checked.")
  })

  it("keeps the old result at 55 % opacity with aria-busy while it updates", () => {
    renderCard({ updating: true })
    expect(screen.getByRole("complementary", { name: "Preview" })).toHaveAttribute("aria-busy", "true")
    expect(screen.getByTestId("admin-cleanup-preview-updating")).toHaveTextContent("Updating")
    expect(screen.getByTestId("admin-cleanup-preview-count").closest(".opacity-55")).not.toBeNull()
    expect(screen.getByTestId("admin-cleanup-preview-count")).toHaveTextContent("197")
  })

  it("shows the delta after an edit, more or fewer, and none before", () => {
    const { rerender } = renderCard({ delta: 6 })
    expect(screen.getByTestId("admin-cleanup-preview-delta")).toHaveTextContent("6 more than before your last change")
    const props = { data: buildPreview(), labels: LABELS, now: NOW, onWhy: jest.fn(), onSelectTab: jest.fn() }
    rerender(<PreviewCard {...props} delta={-6} />)
    expect(screen.getByTestId("admin-cleanup-preview-delta")).toHaveTextContent("6 fewer than before your last change")
    rerender(<PreviewCard {...props} delta={0} />)
    expect(screen.queryByTestId("admin-cleanup-preview-delta")).not.toBeInTheDocument()
    rerender(<PreviewCard {...props} />)
    expect(screen.queryByTestId("admin-cleanup-preview-delta")).not.toBeInTheDocument()
  })

  it("shows skeletons and the first read words before the first read of the library", () => {
    renderCard({}, { snapshot: null, sources: [] })
    expect(screen.queryByTestId("admin-cleanup-preview-count")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-preview-read-timestamp")).not.toBeInTheDocument()
    expect(liveRegion()).toBeNull()
    expect(screen.getByTestId("admin-cleanup-preview-alert-first-read")).toHaveTextContent(
      "Reading your library for the first time. This takes 1 to 3 minutes. You can leave this page."
    )
    expect(screen.queryByTestId("admin-cleanup-preview-stats-toggle")).not.toBeInTheDocument()
    expect(document.querySelectorAll("[data-slot='skeleton']").length).toBeGreaterThanOrEqual(3)
    expect(screen.queryByTestId("admin-cleanup-preview-sources")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-preview-largest")).not.toBeInTheDocument()
    expect(screen.queryByTestId("admin-cleanup-preview-tab-count-matches")).not.toBeInTheDocument()
  })

  it("names a failed source and the Plex share list apart", () => {
    renderCard(
      {},
      {
        sources: [
          { service: "plex", state: "ok", readAt: null, part: "server" },
          { service: "plex", state: "ok", readAt: "2026-11-08T03:05:00.000Z", part: "shares" },
          { service: "tautulli", state: "failed", readAt: "2026-11-08T03:07:00.000Z" },
        ],
      }
    )
    expect(screen.getByTestId("admin-cleanup-preview-source-plex")).toHaveTextContent(/^Plex$/)
    expect(screen.getByTestId("admin-cleanup-preview-source-plex-shares")).toHaveTextContent("Plex shares 3:05 AM")
    expect(screen.getByTestId("admin-cleanup-preview-source-tautulli")).toHaveTextContent("Tautulli failed")
  })

  it("says the date of library data from an earlier day, and the growth words", () => {
    const { rerender } = renderCard({}, { snapshot: { id: "s", takenAt: "2026-11-03T03:07:00.000Z", historyStart: null }, growthWeeks: null })
    expect(screen.getByTestId("admin-cleanup-preview-read-timestamp")).toHaveTextContent("Library data from Nov 3, 2026, 3:07 AM")
    expect(screen.getByText(/^up to$/)).toBeInTheDocument()
    const props = { labels: LABELS, now: NOW, onWhy: jest.fn(), onSelectTab: jest.fn() }
    rerender(<PreviewCard {...props} data={buildPreview({ growthWeeks: 0 })} />)
    expect(screen.getByText("up to, less than 1 week of growth")).toBeInTheDocument()
    rerender(<PreviewCard {...props} data={buildPreview({ growthWeeks: 1, matches: 1, bytes: "0" })} />)
    expect(screen.getByText("up to, about 1 week of growth")).toBeInTheDocument()
    expect(screen.getByText("movie of 777 checked")).toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-preview-bytes")).toHaveTextContent("0 GB")
    expect(liveRegion()).toHaveTextContent("1 movie of 777 checked. Up to 0 gigabytes, about 1 week of growth.")
  })

  it("refreshes the library data from the head", async () => {
    const user = userEvent.setup()
    const onRefresh = jest.fn()
    const { rerender } = renderCard({ refresh: { onRefresh } })
    await user.click(screen.getByRole("button", { name: "Refresh data now" }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    const props = { data: buildPreview(), labels: LABELS, now: NOW, onWhy: jest.fn(), onSelectTab: jest.fn() }
    rerender(<PreviewCard {...props} refresh={{ onRefresh, pending: true }} />)
    expect(screen.getByTestId("admin-cleanup-preview-refresh")).toHaveAttribute("aria-busy", "true")
    rerender(<PreviewCard {...props} />)
    expect(screen.queryByTestId("admin-cleanup-preview-refresh")).not.toBeInTheDocument()
  })

  it("holds the stats, the largest matches and the tab counts, and passes their actions up", async () => {
    const user = userEvent.setup()
    const { onWhy, onSelectTab } = renderCard()
    expect(screen.getByTestId("admin-cleanup-preview-stat-c1")).toHaveTextContent("Added more than 365 days ago")
    await user.click(screen.getByRole("button", { name: "Why: Paper Crowns" }))
    expect(onWhy).toHaveBeenCalledWith("movie-1002")
    await user.click(screen.getByTestId("admin-cleanup-preview-tab-count-near-misses"))
    expect(onSelectTab).toHaveBeenCalledWith("nearMisses")
  })

  it("leaves out the largest matches when nothing matches, and shows the zero note", async () => {
    const user = userEvent.setup()
    const { onChangeCondition } = renderCard(
      {},
      {
        matches: 0,
        bytes: "0",
        largest: [],
        warnings: [{ kind: "zero", conditionId: "c3", leaves: 0, of: 214, largestBytes: String(22.4 * 1024 ** 3), nearMisses: 9 }],
      }
    )
    expect(screen.queryByTestId("admin-cleanup-preview-largest")).not.toBeInTheDocument()
    expect(screen.getByTestId("admin-cleanup-preview-count")).toHaveTextContent("0")
    await user.click(screen.getByRole("button", { name: "Change Size" }))
    expect(onChangeCondition).toHaveBeenCalledWith("c3")
  })

  it("has no axe violations", async () => {
    const { container } = renderCard({ delta: 6, refresh: { onRefresh: jest.fn() }, rateLimited: true })
    expect(await axe(container)).toHaveNoViolations()
  })
})

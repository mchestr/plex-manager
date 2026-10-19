import { render } from "@testing-library/react"
import { useReducedMotion } from "motion/react"

import { OverseerrStatsSection } from "@/components/wrapped/wrapped-sections/overseerr-stats-section"
import { ShowsBreakdownSection } from "@/components/wrapped/wrapped-sections/shows-breakdown-section"
import type { WrappedData, WrappedSection } from "@/types/wrapped"

/**
 * The v2 sections' infinite glow, pulse and shimmer loops, and their count-ups, under
 * the OS reduced-motion setting (P2.15).
 */

const section: WrappedSection = { id: "s-1", type: "shows-breakdown", title: "Shows", content: "" }

const wrappedData = {
  statistics: {
    totalWatchTime: { total: 1000, movies: 400, shows: 600 },
    showsWatched: 1234,
    overseerrStats: {
      totalRequests: 2500,
      totalServerRequests: 9000,
      approvedRequests: 2000,
      pendingRequests: 500,
      topRequestedGenres: [],
    },
  },
} as unknown as WrappedData

function infiniteLoops(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-transition]")]
    .map((element) => ({
      animate: JSON.parse(element.dataset.animate ?? "null"),
      transition: JSON.parse(element.dataset.transition ?? "null"),
    }))
    .filter(({ animate }) => animate && Object.values(animate).some(Array.isArray))
}

function heldStill(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-transition]")].filter(
    (element) => element.dataset.transition === JSON.stringify({ duration: 0 })
  )
}

function animatedDigits(container: HTMLElement) {
  return [...container.querySelectorAll('[aria-hidden="true"]')].map((element) => element.textContent)
}

describe.each([
  ["ShowsBreakdownSection", ShowsBreakdownSection, 1, ["1,234"]],
  ["OverseerrStatsSection", OverseerrStatsSection, 6, ["2,500", "2,000", "500"]],
] as const)("%s", (_name, Section, loopCount, finalCounts) => {
  afterEach(() => jest.mocked(useReducedMotion).mockReturnValue(false))

  it("loops its glow, pulses and shimmers, and counts up from 0", () => {
    const { container } = render(<Section section={section} wrappedData={wrappedData} sectionIndex={0} />)

    expect(infiniteLoops(container)).toHaveLength(loopCount)
    expect(animatedDigits(container).every((digits) => digits === "0")).toBe(true)
  })

  it("holds still and shows the final counts under reduced motion", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<Section section={section} wrappedData={wrappedData} sectionIndex={0} />)

    expect(infiniteLoops(container)).toHaveLength(0)
    expect(heldStill(container)).toHaveLength(loopCount)
    expect(animatedDigits(container)).toEqual(finalCounts)
  })
})

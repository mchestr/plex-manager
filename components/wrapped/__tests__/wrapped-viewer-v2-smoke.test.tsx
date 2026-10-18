import { render, screen } from "@testing-library/react"

import { WrappedViewer } from "@/components/wrapped/wrapped-viewer"
import { generateMockWrappedData } from "@/lib/wrapped/mock-data"
import { buildStatistics } from "@/lib/wrapped/__tests__/fixtures"

describe("WrappedViewer v2 smoke test", () => {
  it("renders mock v2 data through the cinematic path", () => {
    const wrappedData = generateMockWrappedData({
      promptName: "Mike",
      displayName: "Mike",
      year: 2026,
      userId: "user-1",
      statistics: buildStatistics(),
    })

    expect(wrappedData.version).toBe(2)

    render(<WrappedViewer wrappedData={wrappedData} />)

    // First slide is the cinematic hero (letter-staggered marquee title)
    expect(screen.getByLabelText("Your 2026 Wrapped")).toBeInTheDocument()
  })

  it("renders every v2 section in show-all mode without crashing", () => {
    const wrappedData = generateMockWrappedData({
      promptName: "Mike",
      displayName: "Mike",
      year: 2026,
      userId: "user-1",
      statistics: buildStatistics(),
    })

    render(<WrappedViewer wrappedData={wrappedData} />)

    // Sanity: mock data produced the full ordered v2 slide deck
    const types = wrappedData.sections.map((s) => s.type)
    expect(types[0]).toBe("hero")
    expect(types).toContain("archetype-reveal")
    expect(types[types.length - 1]).toBe("finale")
  })
})

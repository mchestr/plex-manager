import { render } from "@testing-library/react"
import { useReducedMotion } from "motion/react"

import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"

function loops(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>("[data-animate]")].map((element) => ({
    animate: JSON.parse(element.dataset.animate ?? "null"),
    transition: JSON.parse(element.dataset.transition ?? "null"),
  }))
}

describe("SpaceBackground", () => {
  afterEach(() => jest.mocked(useReducedMotion).mockReturnValue(false))

  it("twinkles 50 stars and drifts 3 nebulae forever", () => {
    const { container } = render(<SpaceBackground />)
    const all = loops(container)

    expect(all).toHaveLength(53)
    for (const { animate, transition } of all) {
      expect(Object.values(animate).every(Array.isArray)).toBe(true)
      // Infinity serialises as null.
      expect(transition.repeat).toBeNull()
    }
  })

  it("holds every star and nebula still under reduced motion", () => {
    jest.mocked(useReducedMotion).mockReturnValue(true)
    const { container } = render(<SpaceBackground />)
    const all = loops(container)

    expect(all).toHaveLength(53)
    for (const { animate, transition } of all) {
      expect(Object.values(animate).some(Array.isArray)).toBe(false)
      expect(transition).toEqual({ duration: 0 })
    }
    // The nebulae rest where one drift ends: back at the origin.
    expect(all.slice(-3).map(({ animate }) => animate)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ])
  })
})

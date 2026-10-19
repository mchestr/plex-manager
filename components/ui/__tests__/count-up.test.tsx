import { act, render } from "@testing-library/react"
import { useReducedMotion } from "motion/react"

import { CountUp } from "@/components/ui/count-up"

const reducedMotion = jest.mocked(useReducedMotion)

function parts(container: HTMLElement) {
  const final = container.querySelector(".sr-only")
  const digits = container.querySelector('[aria-hidden="true"]')
  return { final, digits }
}

describe("CountUp", () => {
  beforeEach(() => reducedMotion.mockReturnValue(false))

  it("puts the final value in an sr-only span on the first render", () => {
    const { container } = render(<CountUp value={42} />)
    const { final, digits } = parts(container)

    expect(final).toHaveTextContent("42")
    // The visible digits start at 0 and count up.
    expect(digits).toHaveTextContent("0")
  })

  it("hides the animated digits from assistive technology", () => {
    const { container } = render(<CountUp value={42} />)
    const { final, digits } = parts(container)

    expect(digits).toHaveAttribute("aria-hidden", "true")
    expect(final).not.toHaveAttribute("aria-hidden")
  })

  it("shows the final value at once under reduced motion", () => {
    reducedMotion.mockReturnValue(true)
    const { container } = render(<CountUp value={1234} duration={10} delay={5} />)

    expect(parts(container).digits).toHaveTextContent("1,234")
  })

  it("reaches the final value when it animates", async () => {
    const { container } = render(<CountUp value={250} duration={0.05} />)

    await act(() => new Promise((resolve) => setTimeout(resolve, 300)))

    expect(parts(container).digits).toHaveTextContent("250")
  })

  it("formats thousands separators", () => {
    reducedMotion.mockReturnValue(true)
    const { container } = render(<CountUp value={1234567} />)
    const { final, digits } = parts(container)

    expect(final).toHaveTextContent("1,234,567")
    expect(digits).toHaveTextContent("1,234,567")
  })
})

import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Spinner } from "@/components/ui/spinner"

expect.extend(toHaveNoViolations)

describe("Spinner", () => {
  it("is a hidden, spinning loader-circle exempt from the reduced-motion clamp", () => {
    render(<Spinner data-testid="spinner" />)

    const glyph = screen.getByTestId("spinner")
    expect(glyph.tagName.toLowerCase()).toBe("svg")
    expect(glyph).toHaveAttribute("data-slot", "spinner")
    expect(glyph).toHaveAttribute("aria-hidden", "true")
    expect(glyph).toHaveClass("lucide-loader-circle", "animate-spin")
    expect(glyph).toHaveAttribute("width", "16")
  })

  it("adds an sr-only label", () => {
    render(<Spinner label="Saving" />)
    expect(screen.getByText("Saving")).toHaveClass("sr-only")
  })

  it("takes a size", () => {
    render(<Spinner size={24} data-testid="spinner" />)
    expect(screen.getByTestId("spinner")).toHaveAttribute("height", "24")
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div role="status">
        <Spinner label="Loading users" />
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { LoadingSpinner } from "@/components/ui/loading-spinner"

expect.extend(toHaveNoViolations)

const glyph = (container: HTMLElement) => container.querySelector('[data-slot="spinner"]')

describe("LoadingSpinner (deprecated adapter)", () => {
  it("is a status named by its label", () => {
    render(<LoadingSpinner />)
    expect(screen.getByRole("status", { name: "Loading..." })).toHaveAttribute("aria-busy", "true")
  })

  it("takes a custom label", () => {
    render(<LoadingSpinner label="Fetching users" />)
    expect(screen.getByRole("status", { name: "Fetching users" })).toBeInTheDocument()
  })

  it("renders the Spinner glyph, hidden from screen readers", () => {
    const { container } = render(<LoadingSpinner />)
    expect(glyph(container)).toHaveAttribute("aria-hidden", "true")
    expect(screen.getByRole("status")).not.toHaveAttribute("aria-hidden")
  })

  it.each([
    ["sm", "12"],
    ["md", "16"],
    ["lg", "20"],
    ["xl", "24"],
  ] as const)("maps size %s to %spx", (size, pixels) => {
    const { container } = render(<LoadingSpinner size={size} />)
    expect(glyph(container)).toHaveAttribute("width", pixels)
    expect(glyph(container)).toHaveAttribute("height", pixels)
  })

  it("defaults to 16px", () => {
    const { container } = render(<LoadingSpinner size={undefined} />)
    expect(glyph(container)).toHaveAttribute("width", "16")
  })

  it("passes className and other attributes to the status element", () => {
    render(<LoadingSpinner className="custom-class" data-testid="spinner" id="my-spinner" style={{ opacity: 0.5 }} />)

    const status = screen.getByTestId("spinner")
    expect(status).toHaveAttribute("role", "status")
    expect(status).toHaveClass("custom-class")
    expect(status).toHaveAttribute("id", "my-spinner")
    expect(status).toHaveStyle({ opacity: 0.5 })
  })

  it("lets aria-label override the label", () => {
    render(<LoadingSpinner aria-label="Custom loading" />)
    expect(screen.getByRole("status", { name: "Custom loading" })).toBeInTheDocument()
  })

  it("has no axe violations", async () => {
    const { container } = render(<LoadingSpinner size="lg" label="Loading users" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

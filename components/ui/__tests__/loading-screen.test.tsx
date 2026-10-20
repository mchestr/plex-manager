import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { LoadingScreen } from "@/components/ui/loading-screen"

expect.extend(toHaveNoViolations)

describe("LoadingScreen (deprecated)", () => {
  it("announces the default message as a status", () => {
    render(<LoadingScreen />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading...")
  })

  it("shows a custom message", () => {
    render(<LoadingScreen message="Please wait" />)
    expect(screen.getByRole("status")).toHaveTextContent("Please wait")
  })

  it("falls back to an sr-only label when the message is empty", () => {
    const { container } = render(<LoadingScreen message="" />)
    expect(container.querySelector("p")).not.toBeInTheDocument()
    expect(screen.getByText("Loading")).toHaveClass("sr-only")
  })

  it("keeps a whitespace-only message as given", () => {
    const { container } = render(<LoadingScreen message="   " />)
    expect(container.querySelector("p")?.textContent).toBe("   ")
  })

  it("spins a Spinner that is hidden from screen readers and does not pulse", () => {
    const { container } = render(<LoadingScreen />)
    expect(container.querySelector('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true")
    expect(container.querySelector(".animate-pulse")).not.toBeInTheDocument()
  })

  it("passes className and other attributes to the root", () => {
    render(<LoadingScreen className="custom-class" data-testid="loading-screen" id="screen" aria-label="Loading content" />)

    const root = screen.getByTestId("loading-screen")
    expect(root).toHaveClass("custom-class")
    expect(root).toHaveAttribute("id", "screen")
    expect(root).toHaveAttribute("aria-label", "Loading content")
  })

  it("rerenders with a new message", () => {
    const { rerender } = render(<LoadingScreen message="First message" />)
    rerender(<LoadingScreen message="Second message" />)
    expect(screen.getByText("Second message")).toBeInTheDocument()
    expect(screen.queryByText("First message")).not.toBeInTheDocument()
  })

  it("has no axe violations", async () => {
    const { container } = render(<LoadingScreen message="Loading your Rewind" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

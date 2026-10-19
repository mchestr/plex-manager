import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"
import { Lock } from "lucide-react"

import { Badge } from "@/components/ui/badge"

expect.extend(toHaveNoViolations)

describe("Badge", () => {
  it("renders the word with data-slot and data-testid", () => {
    render(<Badge data-testid="badge">Active</Badge>)
    const badge = screen.getByTestId("badge")
    expect(badge).toHaveTextContent("Active")
    expect(badge).toHaveAttribute("data-slot", "badge")
  })

  it.each([
    ["neutral", "neutral"],
    ["info", "info"],
    ["success", "success"],
    ["warning", "warning"],
    ["danger", "destructive"],
  ] as const)("maps the deprecated tone %s to the %s variant", (tone, variant) => {
    render(
      <>
        <Badge tone={tone}>Old</Badge>
        <Badge variant={variant}>New</Badge>
      </>
    )
    expect(screen.getByText("Old").className).toBe(screen.getByText("New").className)
  })

  it("prefers variant over tone", () => {
    render(
      <>
        <Badge variant="outline" tone="danger">
          Both
        </Badge>
        <Badge variant="outline">Outline</Badge>
      </>
    )
    expect(screen.getByText("Both").className).toBe(screen.getByText("Outline").className)
  })

  it("renders a hidden dot", () => {
    const { container } = render(<Badge dot>Live</Badge>)
    expect(container.querySelector('[data-slot="badge-dot"]')).toHaveAttribute("aria-hidden", "true")
  })

  it("renders a 12px icon in place of the dot", () => {
    const { container } = render(
      <Badge dot icon={Lock}>
        Saved
      </Badge>
    )
    const icon = container.querySelector("svg")
    expect(icon).toHaveAttribute("width", "12")
    expect(icon).toHaveAttribute("stroke-width", "2")
    expect(container.querySelector('[data-slot="badge-dot"]')).not.toBeInTheDocument()
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <Badge variant="success" dot>
          Active
        </Badge>
        <Badge variant="outline">Admin</Badge>
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

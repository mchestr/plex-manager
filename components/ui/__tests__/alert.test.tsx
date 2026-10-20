import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"

import { Alert } from "@/components/ui/alert"

expect.extend(toHaveNoViolations)

describe("Alert", () => {
  it("renders the message and title", () => {
    render(
      <Alert tone="info" title="Heads up">
        Something happened.
      </Alert>
    )

    expect(screen.getByText("Heads up")).toBeInTheDocument()
    expect(screen.getByText("Something happened.")).toBeInTheDocument()
  })

  it("treats the deprecated danger tone as destructive", () => {
    const { rerender } = render(
      <Alert tone="danger" data-testid="alert">
        Danger
      </Alert>
    )
    const danger = screen.getByTestId("alert")
    expect(danger).toHaveAttribute("data-tone", "destructive")
    const dangerClasses = danger.className

    rerender(
      <Alert tone="destructive" data-testid="alert">
        Danger
      </Alert>
    )
    expect(screen.getByTestId("alert").className).toBe(dangerClasses)
  })

  it.each([
    ["info", "lucide-info"],
    ["success", "lucide-circle-check"],
    ["warning", "lucide-triangle-alert"],
    ["destructive", "lucide-circle-x"],
  ] as const)("gives %s its own icon", (tone, iconClass) => {
    const { container } = render(<Alert tone={tone}>Message</Alert>)
    expect(container.querySelector(`svg.${iconClass}`)).toBeInTheDocument()
  })

  it('uses role="alert" for assertive tones (warning, destructive)', () => {
    const { rerender } = render(<Alert tone="warning">Warning</Alert>)
    expect(screen.getByRole("alert")).toBeInTheDocument()

    rerender(<Alert tone="danger">Danger</Alert>)
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it('uses role="status" for polite tones (info, success)', () => {
    const { rerender } = render(<Alert tone="info">Info</Alert>)
    expect(screen.getByRole("status")).toBeInTheDocument()

    rerender(<Alert tone="success">Success</Alert>)
    expect(screen.getByRole("status")).toBeInTheDocument()
  })

  it("allows overriding the role", () => {
    render(
      <Alert tone="warning" role="status" data-testid="alert">
        Custom role
      </Alert>
    )
    expect(screen.getByTestId("alert")).toHaveAttribute("role", "status")
  })

  it("renders the action slot", () => {
    render(
      <Alert tone="danger" action={<button type="button">Fix it</button>}>
        Payment failed
      </Alert>
    )
    expect(screen.getByRole("button", { name: "Fix it" })).toBeInTheDocument()
  })

  it("renders a default icon and hides it from screen readers", () => {
    const { container } = render(<Alert tone="info">Info</Alert>)
    const svg = container.querySelector("svg")
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute("aria-hidden", "true")
  })

  it("renders no icon when icon={null}", () => {
    const { container } = render(
      <Alert tone="info" icon={null}>
        No icon
      </Alert>
    )
    expect(container.querySelector("svg")).not.toBeInTheDocument()
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <Alert tone="info" title="Check your email">
          We sent a link.
        </Alert>
        <Alert tone="destructive" title="Payment failed" action={<a href="/billing">Update payment</a>}>
          Your card was declined.
        </Alert>
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

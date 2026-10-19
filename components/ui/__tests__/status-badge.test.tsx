import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"
import { CircleCheck } from "lucide-react"

import { StatusBadge, StatusDot } from "@/components/ui/status-badge"

expect.extend(toHaveNoViolations)

describe("StatusBadge", () => {
  it("renders the word and the icon", () => {
    const { container } = render(<StatusBadge tone="success" label="Active" icon={CircleCheck} data-testid="status" />)

    expect(screen.getByTestId("status")).toHaveTextContent("Active")
    expect(container.querySelector("svg.lucide-circle-check")).toHaveAttribute("aria-hidden", "true")
  })

  it("renders a hidden dot beside the word when there is no icon", () => {
    const { container } = render(<StatusBadge tone="warning" label="Past due" />)
    expect(screen.getByText("Past due")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="badge-dot"]')).toHaveAttribute("aria-hidden", "true")
  })

  it("renders the sub line", () => {
    render(<StatusBadge tone="success" label="Active" sub="Renews Oct 2" />)
    expect(screen.getByText("Renews Oct 2")).toBeInTheDocument()
  })

  it("renders plain as text, not a badge", () => {
    const { container } = render(<StatusBadge tone="plain" label="Member" />)
    expect(screen.getByText("Member")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="badge"]')).not.toBeInTheDocument()
  })
})

describe("StatusBadge with a domain", () => {
  it("reads the word, tone and icon from the STATUS table", () => {
    const { container } = render(<StatusBadge domain="subscription" value="CANCELED" data-testid="status" />)

    expect(screen.getByTestId("status")).toHaveTextContent("Canceled")
    expect(container.querySelector('[data-slot="status-badge"]')).toHaveClass("text-destructive")
    expect(container.querySelector("svg.lucide-circle-x")).toHaveAttribute("aria-hidden", "true")
  })

  it("draws a dot for a dot row", () => {
    const { container } = render(<StatusBadge domain="plexAccess" value="shared" />)
    expect(screen.getByText("Shared")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="badge-dot"]')).toBeInTheDocument()
  })

  it("draws a spinner for a running state", () => {
    const { container } = render(<StatusBadge domain="queueJob" value="active" />)
    expect(screen.getByText("Running")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="spinner"]')).toHaveAttribute("aria-hidden", "true")
    expect(container.querySelector('[data-slot="badge-dot"]')).not.toBeInTheDocument()
  })

  it("renders a plain row as text", () => {
    const { container } = render(<StatusBadge domain="role" value="user" />)
    expect(screen.getByText("Member")).toBeInTheDocument()
    expect(container.querySelector('[data-slot="badge"]')).not.toBeInTheDocument()
  })

  it("shows the table's fixed sub-line, or the caller's", () => {
    const { rerender } = render(<StatusBadge domain="connection" value="untested" />)
    expect(screen.getByText("Test after saving")).toBeInTheDocument()

    rerender(<StatusBadge domain="subscription" value="ACTIVE" sub="Renews Nov 6, 2026" />)
    expect(screen.getByText("Renews Nov 6, 2026")).toBeInTheDocument()
  })

  it("leaves out a sub-line with no date", () => {
    render(<StatusBadge domain="subscription" value="ACTIVE" data-testid="status" />)
    expect(screen.getByTestId("status")).toHaveTextContent(/^Active$/)
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <StatusBadge domain="rewind" value="generating" />
        <StatusBadge domain="role" value="owner" />
        <StatusBadge domain="connection" value="degraded" />
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

describe("StatusDot", () => {
  it("renders a hidden dot and the word", () => {
    const { container } = render(<StatusDot tone="destructive" label="Offline" data-testid="dot" />)
    expect(screen.getByTestId("dot")).toHaveTextContent("Offline")
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })
})

describe("status primitives", () => {
  it("have no axe violations", async () => {
    const { container } = render(
      <div>
        <StatusBadge tone="info" label="Pending" sub="Sent Oct 1" />
        <StatusDot tone="success" label="Online" />
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

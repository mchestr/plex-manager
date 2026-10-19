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

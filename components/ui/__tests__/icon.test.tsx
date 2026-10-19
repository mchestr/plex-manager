import { render, screen } from "@testing-library/react"
import { axe, toHaveNoViolations } from "jest-axe"
import { Settings } from "lucide-react"

import { Icon } from "@/components/ui/icon"

expect.extend(toHaveNoViolations)

describe("Icon", () => {
  it("is decorative by default: hidden, 16px, stroke 1.75", () => {
    render(<Icon icon={Settings} data-testid="icon" />)
    const icon = screen.getByTestId("icon")
    expect(icon).toHaveAttribute("aria-hidden", "true")
    expect(icon).toHaveAttribute("width", "16")
    expect(icon).toHaveAttribute("stroke-width", "1.75")
    expect(icon).toHaveAttribute("data-slot", "icon")
  })

  it.each([12, 14, 16, 20] as const)("renders at %ipx", (size) => {
    render(<Icon icon={Settings} size={size} data-testid="icon" />)
    expect(screen.getByTestId("icon")).toHaveAttribute("height", String(size))
  })

  it("uses stroke 2 at 12px", () => {
    render(<Icon icon={Settings} size={12} data-testid="icon" />)
    expect(screen.getByTestId("icon")).toHaveAttribute("stroke-width", "2")
  })

  it("is an image named by its label when labelled", () => {
    render(<Icon icon={Settings} label="Settings" />)
    const icon = screen.getByRole("img", { name: "Settings" })
    expect(icon).not.toHaveAttribute("aria-hidden")
  })

  it("has no axe violations", async () => {
    const { container } = render(
      <div>
        <Icon icon={Settings} />
        <Icon icon={Settings} label="Settings" />
      </div>
    )
    expect(await axe(container)).toHaveNoViolations()
  })
})

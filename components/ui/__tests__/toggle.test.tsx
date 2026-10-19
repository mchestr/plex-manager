import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Toggle } from "@/components/ui/toggle"

expect.extend(toHaveNoViolations)

describe("Toggle", () => {
  it("is a pressed-state button whose name never changes", async () => {
    const { container } = render(<Toggle data-testid="table-toggle">Show as table</Toggle>)
    const toggle = screen.getByRole("button", { name: "Show as table" })
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(toggle).toHaveAttribute("data-testid", "table-toggle")
    expect(toggle).toHaveAttribute("data-slot", "toggle")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("flips aria-pressed with Space and Enter", async () => {
    const user = userEvent.setup()
    const onPressedChange = jest.fn()
    render(<Toggle onPressedChange={onPressedChange}>Show as table</Toggle>)
    const toggle = screen.getByRole("button", { name: "Show as table" })

    await user.tab()
    expect(toggle).toHaveFocus()
    await user.keyboard(" ")
    expect(toggle).toHaveAttribute("aria-pressed", "true")
    await user.keyboard("{Enter}")
    expect(toggle).toHaveAttribute("aria-pressed", "false")
    expect(onPressedChange.mock.calls.map(([pressed]) => pressed)).toEqual([true, false])
  })

  it("draws the pressed state as the foreground inverse, at 36px or 32px", () => {
    render(
      <>
        <Toggle defaultPressed>Default</Toggle>
        <Toggle size="sm">Small</Toggle>
      </>
    )
    const pressed = screen.getByRole("button", { name: "Default" })
    expect(pressed).toHaveClass("h-9", "data-pressed:bg-foreground", "data-pressed:text-background")
    expect(pressed).toHaveAttribute("data-pressed")
    expect(screen.getByRole("button", { name: "Small" })).toHaveClass("h-8")
  })

  it("ignores presses when disabled", async () => {
    const user = userEvent.setup()
    render(<Toggle disabled>Show as table</Toggle>)
    const toggle = screen.getByRole("button", { name: "Show as table" })
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-pressed", "false")
  })
})

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"

expect.extend(toHaveNoViolations)

function Labelled({ disabled = false, onChange = jest.fn() }: { disabled?: boolean; onChange?: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false)
  return (
    <>
      <Checkbox
        id="sync"
        checked={checked}
        disabled={disabled}
        onCheckedChange={(next) => {
          setChecked(next)
          onChange(next)
        }}
      />
      <label htmlFor="sync">Watchlist Sync</label>
    </>
  )
}

describe("Checkbox", () => {
  it("toggles with Space", async () => {
    const user = userEvent.setup()
    render(<Labelled />)

    const checkbox = screen.getByRole("checkbox", { name: "Watchlist Sync" })
    checkbox.focus()
    await user.keyboard(" ")
    expect(checkbox).toHaveAttribute("aria-checked", "true")
    await user.keyboard(" ")
    expect(checkbox).toHaveAttribute("aria-checked", "false")
  })

  it("toggles when its label is clicked", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Labelled onChange={onChange} />)

    await user.click(screen.getByText("Watchlist Sync"))
    expect(onChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true")
  })

  it("does not toggle while disabled", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Labelled disabled onChange={onChange} />)

    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByText("Watchlist Sync"))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-disabled", "true")
  })

  it("fills with primary-indicator when checked and shows the check", () => {
    render(<Checkbox aria-label="Sync" checked data-testid="cb" />)
    const checkbox = screen.getByTestId("cb")
    expect(checkbox).toHaveClass("size-4", "rounded-sm", "border-input", "data-checked:bg-primary-indicator")
    expect(checkbox).toHaveAttribute("data-slot", "checkbox")
    expect(checkbox.querySelector("svg")).toHaveAttribute("aria-hidden", "true")
  })

  it("has no axe violations", async () => {
    const { container } = render(<Labelled />)
    expect(await axe(container)).toHaveNoViolations()
  })
})

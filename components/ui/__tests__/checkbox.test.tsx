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

  it("draws the minus glyph while indeterminate and reports the mixed state", async () => {
    const { container } = render(<Checkbox aria-label="Select Nov 19" indeterminate data-testid="cb" />)
    const checkbox = screen.getByRole("checkbox", { name: "Select Nov 19" })
    expect(checkbox).toHaveAttribute("aria-checked", "mixed")
    expect(checkbox).toHaveAttribute("data-indeterminate")
    const glyph = checkbox.querySelector('[data-slot="checkbox-indicator"] svg')
    expect(glyph).toHaveClass("lucide-minus")
    expect(glyph).toHaveAttribute("aria-hidden", "true")
    expect(checkbox.querySelector(".lucide-check")).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  it("draws the check, not the minus, once checked", () => {
    const { rerender } = render(<Checkbox aria-label="Select all" checked={false} indeterminate />)
    rerender(<Checkbox aria-label="Select all" checked />)
    const checkbox = screen.getByRole("checkbox", { name: "Select all" })
    expect(checkbox).toHaveAttribute("aria-checked", "true")
    expect(checkbox.querySelector("svg")).toHaveClass("lucide-check")
    expect(checkbox.querySelector(".lucide-minus")).toBeNull()
  })

  it("draws no glyph while unchecked", () => {
    render(<Checkbox aria-label="Select all" />)
    expect(screen.getByRole("checkbox", { name: "Select all" }).querySelector("svg")).toBeNull()
  })

  it("asks to check a mixed box with Space", async () => {
    const user = userEvent.setup()
    const onCheckedChange = jest.fn()
    render(<Checkbox aria-label="Select all" indeterminate onCheckedChange={onCheckedChange} />)
    screen.getByRole("checkbox").focus()
    await user.keyboard(" ")
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })
})

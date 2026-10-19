import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"

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

describe("StyledCheckbox (deprecated adapter)", () => {
  it("calls onChange with an event-shaped target.checked", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<StyledCheckbox label="Active" checked={false} onChange={onChange} />)

    await user.click(screen.getByRole("checkbox", { name: "Active" }))
    expect(onChange).toHaveBeenCalledWith({ target: { checked: true } })
  })

  it("keeps a generated id stable across rerenders and links the label to it", () => {
    const { rerender } = render(<StyledCheckbox label="Notify me" checked={false} onChange={() => {}} />)
    const label = screen.getByText("Notify me")
    const firstFor = label.getAttribute("for")
    expect(firstFor).toBeTruthy()

    rerender(<StyledCheckbox label="Notify me" checked onChange={() => {}} />)
    expect(screen.getByText("Notify me")).toHaveAttribute("for", firstFor)
    expect(screen.getByRole("checkbox", { name: "Notify me" })).toHaveAttribute("aria-checked", "true")
  })

  it("uses the id prop when given", () => {
    render(<StyledCheckbox id="custom-id" label="Opt in" />)
    expect(screen.getByText("Opt in")).toHaveAttribute("for", "custom-id")
    expect(screen.getByRole("checkbox", { name: "Opt in" })).toBeInTheDocument()
  })

  it("toggles when its label is clicked, and puts data-testid on the checkbox", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<StyledCheckbox label="Opt in" data-testid="cb" onChange={onChange} />)

    await user.click(screen.getByText("Opt in"))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId("cb")).toHaveAttribute("role", "checkbox")
  })

  it("describes the checkbox with its description", async () => {
    const { container } = render(
      <StyledCheckbox label="Enable Discord Bot" description="Monitors the support channels." checked onChange={() => {}} />
    )
    expect(screen.getByRole("checkbox", { name: "Enable Discord Bot" })).toHaveAccessibleDescription(
      "Monitors the support channels."
    )
    expect(await axe(container)).toHaveNoViolations()
  })

  it("blocks changes while disabled", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<StyledCheckbox label="Active" disabled onChange={onChange} />)

    await user.click(screen.getByText("Active"))
    expect(onChange).not.toHaveBeenCalled()
  })
})

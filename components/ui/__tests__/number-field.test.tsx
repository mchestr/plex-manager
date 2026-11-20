import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { NumberField } from "@/components/ui/number-field"

expect.extend(toHaveNoViolations)

function Controlled({
  initial = 365,
  onChange,
  onCommit,
  ...props
}: {
  initial?: number | null
  onChange?: (value: number | null) => void
  onCommit?: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  format?: Intl.NumberFormatOptions
  invalid?: boolean
  disabled?: boolean
}) {
  const [value, setValue] = useState<number | null>(initial)
  return (
    <NumberField
      aria-label="Days"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
      onValueCommitted={onCommit}
      data-testid="days"
      {...props}
    />
  )
}

describe("NumberField", () => {
  it("is a named number input with two named steppers that are not tab stops, with no axe violations", async () => {
    const { container } = render(<Controlled min={1} max={3650} />)
    const input = screen.getByRole("textbox", { name: "Days" })
    expect(input).toHaveAttribute("data-testid", "days")
    expect(input).toHaveValue("365")
    expect(screen.getByRole("button", { name: "Decrease" })).toHaveAttribute("data-testid", "days-decrement")
    expect(screen.getByRole("button", { name: "Increase" })).toHaveAttribute("data-testid", "days-increment")
    expect(screen.getByRole("button", { name: "Increase" })).toHaveAttribute("tabindex", "-1")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("steps with the buttons and the arrow keys, and clamps to min and max", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Controlled initial={2} min={1} max={3} onChange={onChange} />)
    const input = screen.getByRole("textbox", { name: "Days" })

    await user.click(screen.getByRole("button", { name: "Increase" }))
    expect(input).toHaveValue("3")
    await user.click(screen.getByRole("button", { name: "Increase" }))
    expect(input).toHaveValue("3")

    await user.click(input)
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}")
    expect(input).toHaveValue("1")
    expect(onChange).toHaveBeenCalledWith(3)
    expect(onChange).toHaveBeenLastCalledWith(1)
  })

  it("steps by `step` and keeps whole numbers", async () => {
    const user = userEvent.setup()
    render(<Controlled initial={20} step={5} />)
    const input = screen.getByRole("textbox", { name: "Days" })
    await user.click(screen.getByRole("button", { name: "Increase" }))
    expect(input).toHaveValue("25")

    await user.clear(input)
    await user.type(input, "7.6")
    await user.tab()
    expect(input).toHaveValue("8")
  })

  it("reports an empty input as null, and commits the typed value on blur", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    const onCommit = jest.fn()
    render(<Controlled onChange={onChange} onCommit={onCommit} />)
    const input = screen.getByRole("textbox", { name: "Days" })

    await user.clear(input)
    expect(onChange).toHaveBeenLastCalledWith(null)
    await user.type(input, "90")
    expect(onChange).toHaveBeenLastCalledWith(90)
    expect(onCommit).not.toHaveBeenCalled()
    await user.tab()
    expect(onCommit).toHaveBeenLastCalledWith(90)
  })

  it("formats with the given options in the app locale", () => {
    render(<Controlled initial={1500} format={{ useGrouping: true, maximumFractionDigits: 0 }} />)
    expect(screen.getByRole("textbox", { name: "Days" })).toHaveValue("1,500")
  })

  it("marks an invalid value and can be disabled", () => {
    const { rerender } = render(<Controlled invalid />)
    const input = screen.getByRole("textbox", { name: "Days" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input.closest("[data-slot=number-field-group]")).toHaveClass("border-destructive")

    rerender(<Controlled disabled />)
    expect(screen.getByRole("textbox", { name: "Days" })).toBeDisabled()
    expect(screen.getByRole("textbox", { name: "Days" })).not.toHaveAttribute("aria-invalid")
  })

  it("can be named by a label through its id", () => {
    render(
      <>
        <label htmlFor="grace">Grace period, in days</label>
        <NumberField id="grace" value={30} onValueChange={() => {}} data-testid="grace" />
      </>
    )
    expect(screen.getByRole("textbox", { name: "Grace period, in days" })).toHaveValue("30")
  })
})

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"

import { RadioCard, RadioGroup } from "@/components/ui/radio-group"

type Plan = "monthly" | "yearly"

function Plans({ initial, onChange }: { initial: Plan | null; onChange?: (value: Plan) => void }) {
  const [value, setValue] = useState<Plan | null>(initial)
  return (
    <>
      <p id="plan-label">Plan</p>
      <RadioGroup<Plan>
        aria-labelledby="plan-label"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onChange?.(next)
        }}
        data-testid="plans"
      >
        <RadioCard value="monthly" data-testid="plan-monthly">
          Monthly
        </RadioCard>
        <RadioCard value="yearly" data-testid="plan-yearly">
          Yearly
        </RadioCard>
      </RadioGroup>
      <button type="button" onClick={() => setValue(null)}>
        Clear
      </button>
    </>
  )
}

describe("RadioGroup", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("is a named group of cards, and a pick sends the value", async () => {
    const onChange = jest.fn()
    render(<Plans initial="monthly" onChange={onChange} />)

    expect(screen.getByRole("radiogroup", { name: "Plan" })).toBeInTheDocument()
    expect(screen.getByRole("radio", { name: "Monthly" })).toBeChecked()

    await userEvent.click(screen.getByRole("radio", { name: "Yearly" }))

    expect(onChange).toHaveBeenCalledWith("yearly")
    expect(screen.getByRole("radio", { name: "Yearly" })).toBeChecked()
  })

  it("stays controlled with null: no card is checked, and going to null and back logs nothing", async () => {
    render(<Plans initial={null} />)
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)

    await userEvent.click(screen.getByRole("radio", { name: "Yearly" }))
    expect(screen.getByRole("radio", { name: "Yearly" })).toBeChecked()

    await userEvent.click(screen.getByRole("button", { name: "Clear" }))
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it("checks nothing for null when the owner does not take the pick", async () => {
    const onChange = jest.fn()
    render(
      <>
        <p id="fixed-label">Fixed</p>
        <RadioGroup<Plan> aria-labelledby="fixed-label" value={null} onValueChange={onChange}>
          <RadioCard value="monthly">Monthly</RadioCard>
        </RadioGroup>
      </>
    )

    await userEvent.click(screen.getByRole("radio", { name: "Monthly" }))

    expect(onChange).toHaveBeenCalledWith("monthly")
    expect(screen.getByRole("radio", { name: "Monthly" })).not.toBeChecked()
  })
})

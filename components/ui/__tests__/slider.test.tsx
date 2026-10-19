import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Slider } from "@/components/ui/slider"

expect.extend(toHaveNoViolations)

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const monthName = (_: string, value: number) => MONTHS[value] ?? ""

describe("Slider", () => {
  it("speaks the value through getAriaValueText", async () => {
    const { container } = render(
      <Slider aria-label="Month" min={0} max={11} defaultValue={7} getAriaValueText={monthName} data-testid="scrubber" />
    )
    const thumb = screen.getByRole("slider", { name: "Month" })
    expect(thumb).toHaveAttribute("aria-valuetext", "August")
    expect(thumb).toHaveAttribute("aria-valuenow", "7")
    expect(screen.getByTestId("scrubber")).toHaveAttribute("data-slot", "slider")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("follows ArrowRight, Home and End", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    render(
      <Slider aria-label="Month" min={0} max={11} defaultValue={7} getAriaValueText={monthName} onValueChange={onValueChange} />
    )
    const thumb = screen.getByRole("slider", { name: "Month" })
    await user.tab()
    expect(thumb).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(thumb).toHaveAttribute("aria-valuetext", "September")
    await user.keyboard("{Home}")
    expect(thumb).toHaveAttribute("aria-valuetext", "January")
    await user.keyboard("{End}")
    expect(thumb).toHaveAttribute("aria-valuetext", "December")
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual([8, 0, 11])
  })

  it("takes its name from aria-labelledby", () => {
    render(
      <>
        <span id="scrub-label">Standings month</span>
        <Slider aria-labelledby="scrub-label" min={0} max={11} defaultValue={0} getAriaValueText={monthName} />
      </>
    )
    expect(screen.getByRole("slider", { name: "Standings month" })).toHaveAttribute("aria-valuetext", "January")
  })

  it("blocks input when disabled", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    render(
      <Slider
        aria-label="Month"
        min={0}
        max={11}
        defaultValue={3}
        disabled
        getAriaValueText={monthName}
        onValueChange={onValueChange}
      />
    )
    const thumb = screen.getByRole("slider", { name: "Month" })
    expect(thumb).toBeDisabled()
    await user.tab()
    expect(thumb).not.toHaveFocus()
    thumb.focus()
    await user.keyboard("{ArrowRight}{End}")
    expect(thumb).toHaveAttribute("aria-valuetext", "April")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it("marks the range and the thumb edge with primary-indicator", () => {
    const { container } = render(<Slider aria-label="Month" defaultValue={2} getAriaValueText={(f) => f} />)
    expect(container.querySelector("[data-slot=slider-track]")).toHaveClass("h-1", "bg-input/45")
    expect(container.querySelector("[data-slot=slider-range]")).toHaveClass("bg-primary-indicator")
    expect(container.querySelector("[data-slot=slider-thumb]")).toHaveClass("size-4.5", "border-2", "border-primary-indicator")
  })
})

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ChoiceChips, type ChoiceChipsOption } from "@/components/ui/choice-chips"

expect.extend(toHaveNoViolations)

type Days = "90" | "180" | "365" | "730"

const presets: ChoiceChipsOption<Days>[] = [
  { value: "90", label: "90 days", count: 268 },
  { value: "180", label: "180 days", count: 1 },
  { value: "365", label: "365 days", count: 1197 },
  { value: "730", label: "2 years", count: null, disabled: true },
]

function Presets({ onChange, withOther = true }: { onChange?: (value: string | number | null) => void; withOther?: boolean }) {
  const [value, setValue] = useState<Days | null>("365")
  const [otherChecked, setOtherChecked] = useState(false)
  const [otherValue, setOtherValue] = useState<number | null>(365)
  return (
    <>
      <p id="value-label">Value</p>
      <ChoiceChips<Days>
        aria-labelledby="value-label"
        value={value}
        onValueChange={(next) => {
          setValue(next)
          setOtherChecked(false)
          onChange?.(next)
        }}
        options={presets}
        other={
          withOther
            ? {
                label: "Other",
                checked: otherChecked,
                onSelect: () => setOtherChecked(true),
                unit: "days",
                value: otherValue,
                onValueChange: (next) => {
                  setOtherValue(next)
                  onChange?.(next)
                },
                min: 1,
                max: 3650,
              }
            : undefined
        }
        data-testid="admin-cleanup-recipe-value-days"
      />
      <Button>After</Button>
    </>
  )
}

describe("ChoiceChips", () => {
  it("is a named radio group whose names hold the counts, with no axe violations", async () => {
    const { container } = render(<Presets />)
    const group = screen.getByRole("radiogroup", { name: "Value" })
    expect(group).toHaveAttribute("data-testid", "admin-cleanup-recipe-value-days")
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label") ?? radio.textContent)).toEqual([
      "90 days, 268 matches",
      "180 days, 1 match",
      "365 days, 1197 matches",
      "2 years",
      "Other",
    ])
    expect(screen.getByRole("radio", { name: "365 days, 1197 matches" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "365 days, 1197 matches" })).toHaveTextContent("365 days1,197")
    expect(screen.getByRole("radio", { name: "365 days, 1197 matches" })).not.toHaveAttribute("aria-pressed")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("gives each option and Other their test ids", () => {
    render(<Presets />)
    expect(screen.getByTestId("admin-cleanup-recipe-value-days-option-90")).toHaveAccessibleName("90 days, 268 matches")
    expect(screen.getByTestId("admin-cleanup-recipe-value-days-option-730")).toHaveAccessibleName("2 years")
    expect(screen.getByTestId("admin-cleanup-recipe-value-days-other")).toHaveAccessibleName("Other")
  })

  it("draws 44px pills below md and 32px from md, the checked one the foreground inverse", () => {
    render(<Presets />)
    expect(screen.getByRole("radio", { name: "90 days, 268 matches" })).toHaveClass(
      "h-11",
      "md:h-8",
      "rounded-full",
      "data-checked:bg-foreground",
      "data-checked:text-background"
    )
  })

  it("moves the choice with the arrows, skips a disabled option, reaches Other, and Tab leaves", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Presets onChange={onChange} />)
    await user.tab()
    expect(screen.getByRole("radio", { name: "365 days, 1197 matches" })).toHaveFocus()

    await user.keyboard("{ArrowLeft}")
    expect(screen.getByRole("radio", { name: "180 days, 1 match" })).toHaveAttribute("aria-checked", "true")
    expect(onChange).toHaveBeenLastCalledWith("180")

    await user.keyboard("{ArrowRight}{ArrowRight}")
    const other = screen.getByRole("radio", { name: "Other" })
    expect(other).toHaveFocus()
    expect(other).toHaveAttribute("aria-checked", "true")

    await user.tab()
    expect(screen.getByRole("textbox", { name: "Other value, in days" })).toHaveFocus()
  })

  it("shows the Other value editor after the group while Other is checked", async () => {
    const user = userEvent.setup()
    const onChange = jest.fn()
    render(<Presets onChange={onChange} />)
    expect(screen.queryByRole("textbox")).toBeNull()

    await user.click(screen.getByRole("radio", { name: "Other" }))
    const input = screen.getByRole("textbox", { name: "Other value, in days" })
    expect(input).toHaveAttribute("data-testid", "admin-cleanup-recipe-value-days-other-input")
    expect(screen.getByRole("radiogroup")).not.toContainElement(input)
    expect(screen.getByRole("radio", { name: "365 days, 1197 matches" })).toHaveAttribute("aria-checked", "false")

    await user.clear(input)
    await user.type(input, "45")
    expect(onChange).toHaveBeenLastCalledWith(45)

    await user.click(screen.getByRole("radio", { name: "90 days, 268 matches" }))
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(onChange).toHaveBeenLastCalledWith("90")
  })

  it("takes a count word, option ids and an Other input id from the caller, with no Other chip by default", () => {
    render(
      <>
        <p id="chips-label">Near misses</p>
        <ChoiceChips<"all" | "added">
          aria-labelledby="chips-label"
          value={null}
          onValueChange={() => {}}
          countLabel={(count) => `${count} near misses`}
          options={[
            { value: "all", label: "All", count: 41, "data-testid": "admin-cleanup-results-chip-all" },
            { value: "added", label: "Added", count: 22, "data-testid": "admin-cleanup-results-chip-c1" },
          ]}
          data-testid="admin-cleanup-results-chips"
        />
      </>
    )
    expect(screen.getByTestId("admin-cleanup-results-chip-c1")).toHaveAccessibleName("Added, 22 near misses")
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    expect(screen.queryByRole("radio", { name: "Other" })).toBeNull()
  })

  it("names the Other input id given by the caller, and disables every chip and the input", () => {
    render(
      <>
        <p id="grace-label">Grace period</p>
        <ChoiceChips<"14" | "30">
          aria-labelledby="grace-label"
          value={null}
          onValueChange={() => {}}
          options={[
            { value: "14", label: "14 days" },
            { value: "30", label: "30 days" },
          ]}
          other={{
            label: "Other",
            checked: true,
            onSelect: () => {},
            unit: "days",
            value: 45,
            onValueChange: () => {},
            invalid: true,
            "data-testid": "admin-cleanup-then-grace-other-input",
          }}
          disabled
          data-testid="admin-cleanup-then-grace-chips"
        />
      </>
    )
    const input = screen.getByTestId("admin-cleanup-then-grace-other-input")
    expect(input).toHaveValue("45")
    expect(input).toBeDisabled()
    expect(screen.getByRole("radio", { name: "Other" })).toHaveAttribute("aria-checked", "true")
    expect(screen.getByRole("radio", { name: "14 days" })).toHaveAttribute("aria-disabled", "true")
  })

  it("stays controlled with null: a pick the owner does not take checks nothing, and a value going to null logs nothing", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => {})
    const onValueChange = jest.fn()
    const options: ChoiceChipsOption<"14" | "30">[] = [
      { value: "14", label: "14 days" },
      { value: "30", label: "30 days" },
    ]
    const chips = (value: "14" | "30" | null) => (
      <>
        <p id="null-label">Grace period</p>
        <ChoiceChips<"14" | "30"> aria-labelledby="null-label" value={value} onValueChange={onValueChange} options={options} data-testid="null-chips" />
      </>
    )
    const { rerender } = render(chips(null))

    await userEvent.click(screen.getByRole("radio", { name: "30 days" }))
    expect(onValueChange).toHaveBeenCalledWith("30")
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)

    rerender(chips("14"))
    expect(screen.getByRole("radio", { name: "14 days" })).toHaveAttribute("aria-checked", "true")
    rerender(chips(null))
    expect(screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false")).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

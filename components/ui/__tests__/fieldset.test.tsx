import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Button } from "@/components/ui/button"
import { Fieldset } from "@/components/ui/fieldset"

expect.extend(toHaveNoViolations)

describe("Fieldset", () => {
  it("is a group named by its visible legend and described by its note, with no axe violations", async () => {
    const { container } = render(
      <Fieldset legend="Find movies where all of these are true" note="Order does not matter." data-testid="part">
        <Button>Add condition</Button>
      </Fieldset>
    )
    const group = screen.getByRole("group", { name: "Find movies where all of these are true" })
    expect(group.tagName).toBe("FIELDSET")
    expect(group).toHaveAttribute("data-testid", "part")
    expect(group).toHaveAccessibleDescription("Order does not matter.")
    expect(screen.getByText("Find movies where all of these are true")).toHaveClass("text-h3")
    expect(screen.getByText("Order does not matter.")).toHaveClass("text-muted-foreground")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("has no description without a note", () => {
    render(
      <Fieldset legend="Then">
        <Button>Save rule</Button>
      </Fieldset>
    )
    const group = screen.getByRole("group", { name: "Then" })
    expect(group).not.toHaveAttribute("aria-describedby")
    expect(group.querySelector("[data-slot=fieldset-note]")).toBeNull()
  })

  it("disables the controls inside when disabled", async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(
      <Fieldset legend="Clean up" disabled>
        <Button onClick={onClick}>Change level</Button>
      </Fieldset>
    )
    expect(screen.getByRole("group", { name: "Clean up" })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: "Change level" }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

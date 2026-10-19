import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { axe, toHaveNoViolations } from "jest-axe"

import { Segment, SegmentedControl } from "@/components/ui/segmented-control"

expect.extend(toHaveNoViolations)

function Example({ onValueChange }: { onValueChange?: (value: string) => void }) {
  return (
    <>
      <SegmentedControl aria-label="Card format" defaultValue="story" onValueChange={onValueChange} data-testid="format">
        <Segment value="story">Story</Segment>
        <Segment value="square">Square</Segment>
        <Segment value="wide">Wide</Segment>
      </SegmentedControl>
      <button type="button">After</button>
    </>
  )
}

describe("SegmentedControl", () => {
  it("is a named radiogroup of radios, with no axe violations", async () => {
    const { container } = render(<Example />)
    const group = screen.getByRole("radiogroup", { name: "Card format" })
    expect(group).toHaveAttribute("data-testid", "format")
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Story", "Square", "Wide"])
    expect(screen.getByRole("radio", { name: "Story" })).toHaveAttribute("aria-checked", "true")
    expect(await axe(container)).toHaveNoViolations()
  })

  it("moves focus and the selection with the arrows, then Tab leaves the group", async () => {
    const user = userEvent.setup()
    const onValueChange = jest.fn()
    render(<Example onValueChange={onValueChange} />)
    const story = screen.getByRole("radio", { name: "Story" })
    const square = screen.getByRole("radio", { name: "Square" })

    await user.tab()
    expect(story).toHaveFocus()
    await user.keyboard("{ArrowRight}")
    expect(square).toHaveFocus()
    expect(square).toHaveAttribute("aria-checked", "true")
    expect(story).toHaveAttribute("aria-checked", "false")
    await user.keyboard("{ArrowLeft}")
    expect(story).toHaveFocus()
    expect(story).toHaveAttribute("aria-checked", "true")
    expect(onValueChange.mock.calls.map(([value]) => value)).toEqual(["square", "story"])

    await user.tab()
    expect(screen.getByRole("button", { name: "After" })).toHaveFocus()
  })

  it("draws the selected segment as the foreground inverse at 28px", () => {
    render(<Example />)
    expect(screen.getByRole("radio", { name: "Story" })).toHaveClass(
      "h-7",
      "text-label",
      "data-checked:bg-foreground",
      "data-checked:text-background"
    )
  })
})
